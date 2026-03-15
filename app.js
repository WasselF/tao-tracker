// app.js

// --- Global Config ---
// Using a CORS proxy to bypass browser restrictions on GitHub Pages
const CORS_PROXY = "https://corsproxy.io/?";
const GTFS_ZIP_URL = CORS_PROXY + encodeURIComponent("https://chouette.enroute.mobi/api/v1/datas/keolis_orleans/gtfs.zip");
const GTFS_RT_URL = CORS_PROXY + encodeURIComponent("https://ara-api.enroute.mobi/tao/gtfs/trip-updates");

const STATE = {
    map: null,
    userMarker: null,
    stops: [],        // {id, name, lat, lon}
    routes: {},       // id -> {short_name, color}
    trips: {},        // id -> {route, dest}
    markerLayer: null,
    currentStop: null,
    favorites: JSON.parse(localStorage.getItem('tao_favorites') || '[]')
};

document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    initUI();
    initMap();
    await loadStaticGTFS();
    renderFavorites();
    registerSW();
});

// --- Theme Management ---
function initTheme() {
    const savedTheme = localStorage.getItem('tao_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    document.getElementById('themeToggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('tao_theme', next);
        updateThemeIcon(next);

        // Force valid map redraw if tiles change, though here we use same tiles
    });
}
function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle i');
    if (theme === 'dark') {
        icon.className = 'fa-solid fa-sun';
    } else {
        icon.className = 'fa-solid fa-moon';
    }
}

// --- Map Initialization ---
function initMap() {
    STATE.map = L.map('map', { zoomControl: false }).setView([47.902964, 1.909251], 13);

    // Light-weight modern map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19
    }).addTo(STATE.map);

    STATE.markerLayer = L.layerGroup().addTo(STATE.map);

    // Geolocation Setup
    const btnLocate = document.getElementById('btnLocate');
    btnLocate.addEventListener('click', () => {
        btnLocate.style.color = 'var(--brand-orange)';
        STATE.map.locate({ setView: true, maxZoom: 16 });
    });

    STATE.map.on('locationfound', (e) => {
        document.getElementById('btnLocate').style.color = 'var(--brand-blue)';
        if (!STATE.userMarker) {
            STATE.userMarker = L.circleMarker(e.latlng, {
                radius: 8, fillColor: 'var(--brand-blue)', color: '#fff', weight: 2, opacity: 1, fillOpacity: 1
            }).addTo(STATE.map);
        } else {
            STATE.userMarker.setLatLng(e.latlng);
        }
    });
    STATE.map.on('locationerror', (e) => {
        document.getElementById('btnLocate').style.color = 'var(--brand-blue)';
        alert("Géolocalisation impossible.");
    });
}

// --- Load Static GTFS Data ---
async function loadStaticGTFS() {
    const loader = document.getElementById('loader');
    try {
        const response = await fetch(GTFS_ZIP_URL);
        const buffer = await response.arrayBuffer();
        const zip = await JSZip.loadAsync(buffer);

        // 1. Routes
        if (zip.file('routes.txt')) {
            const routesCsv = await zip.file('routes.txt').async('text');
            Papa.parse(routesCsv, {
                header: true, skipEmptyLines: true,
                complete: (res) => {
                    res.data.forEach(r => {
                        STATE.routes[r.route_id] = {
                            short_name: r.route_short_name,
                            color: r.route_color || '004b87'
                        };
                    });
                }
            });
        }

        // 2. Trips
        if (zip.file('trips.txt')) {
            const tripsCsv = await zip.file('trips.txt').async('text');
            Papa.parse(tripsCsv, {
                header: true, skipEmptyLines: true,
                complete: (res) => {
                    res.data.forEach(t => {
                        STATE.trips[t.trip_id] = {
                            route: t.route_id,
                            dest: t.trip_headsign
                        };
                    });
                }
            });
        }

        // 3. Stops
        if (zip.file('stops.txt')) {
            const stopsCsv = await zip.file('stops.txt').async('text');
            Papa.parse(stopsCsv, {
                header: true, skipEmptyLines: true,
                complete: (res) => {
                    STATE.stops = res.data.filter(s => s.stop_lat && s.stop_lon).map(s => ({
                        id: s.stop_id,
                        name: s.stop_name || 'Arrêt',
                        lat: parseFloat(s.stop_lat),
                        lon: parseFloat(s.stop_lon)
                    }));
                    renderStops();
                    loader.classList.remove('active');
                }
            });
        }

    } catch (error) {
        console.error("GTFS Fetch Error:", error);
        loader.innerHTML = `
            <div style="color:red; margin-bottom:10px;"><i class="fa-solid fa-triangle-exclamation fa-2x"></i></div>
            <p>Impossible de charger les données réseau.</p>
            <small>Veuillez vérifier votre connexion ou réessayez plus tard.</small>
        `;
    }
}

function renderStops() {
    STATE.markerLayer.clearLayers();
    STATE.stops.forEach(stop => {
        const marker = L.circleMarker([stop.lat, stop.lon], {
            radius: 5,
            fillColor: "var(--bg-card)",
            color: "var(--brand-blue)",
            weight: 2,
            opacity: 1,
            fillOpacity: 1
        });
        marker.on('click', () => openBottomSheet(stop));
        marker.addTo(STATE.markerLayer);
    });
}

// --- UI Logic & Search ---
function initUI() {
    const input = document.getElementById('searchInput');
    const results = document.getElementById('searchResults');
    const list = document.getElementById('searchList');

    // Search input handling
    input.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        if (val.length < 2) {
            results.classList.add('hidden');
            return;
        }

        const matches = STATE.stops.filter(s => s.name.toLowerCase().includes(val)).slice(0, 10);
        list.innerHTML = '';

        if (matches.length === 0) {
            list.innerHTML = '<li style="color:var(--text-muted); justify-content:center;">Aucun arrêt trouvé</li>';
        } else {
            matches.forEach(m => {
                const li = document.createElement('li');
                li.innerHTML = `<i class="fa-solid fa-map-pin"></i> ${m.name}`;
                li.addEventListener('click', () => {
                    input.value = m.name;
                    results.classList.add('hidden');
                    STATE.map.setView([m.lat, m.lon], 17);
                    openBottomSheet(m);
                });
                list.appendChild(li);
            });
        }
        results.classList.remove('hidden');
    });

    // Hide search when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-bar') && !e.target.closest('.search-results')) {
            results.classList.add('hidden');
        }
    });

    // Bottom Sheet Close
    document.getElementById('btnCloseSheet').addEventListener('click', closeBottomSheet);

    // Favorites Features
    document.getElementById('btnFavorite').addEventListener('click', toggleFavorite);

    // Fav Modal Toggles
    const favModal = document.getElementById('favModal');
    document.getElementById('btnFavsMenu').addEventListener('click', () => {
        favModal.classList.add('active');
        renderFavorites();
    });
    document.getElementById('btnCloseFav').addEventListener('click', () => {
        favModal.classList.remove('active');
    });
}

// --- Bottom Sheet & Real Time Logic ---
// Protobuf Definitions
let pbRoot = null;
async function initProtobuf() {
    if (pbRoot) return pbRoot;
    const protoDef = `
        syntax = "proto2";
        package transit_realtime;
        message FeedMessage { required FeedHeader header = 1; repeated FeedEntity entity = 2; }
        message FeedHeader { required string gtfs_realtime_version = 1; }
        message FeedEntity { required string id = 1; optional TripUpdate trip_update = 2; }
        message TripUpdate { required TripDescriptor trip = 1; repeated StopTimeUpdate stop_time_update = 2; }
        message TripDescriptor { optional string trip_id = 1; optional string route_id = 5; }
        message StopTimeUpdate { optional string stop_id = 4; optional StopTimeEvent arrival = 2; optional StopTimeEvent departure = 3; }
        message StopTimeEvent { optional int64 time = 2; }
    `;
    pbRoot = protobuf.parse(protoDef).root;
    return pbRoot;
}

async function openBottomSheet(stop) {
    STATE.currentStop = stop;

    // UI Updates
    document.getElementById('sheetTitle').innerText = stop.name;
    document.getElementById('bottomSheet').classList.add('active');
    document.querySelector('.floating-controls').classList.add('lifted');

    const list = document.getElementById('arrivalsList');
    const loader = document.getElementById('sheetLoader');

    list.innerHTML = '';
    loader.classList.remove('hidden');

    updateFavBtnState();

    try {
        const root = await initProtobuf();
        const FeedMessage = root.lookupType("transit_realtime.FeedMessage");

        const res = await fetch(GTFS_RT_URL);
        const buffer = await res.arrayBuffer();
        const message = FeedMessage.decode(new Uint8Array(buffer));
        const feed = FeedMessage.toObject(message, { enums: String, longs: String });

        let arrivals = [];
        const now = Math.floor(Date.now() / 1000);

        if (feed.entity) {
            feed.entity.forEach(e => {
                if (e.tripUpdate && e.tripUpdate.stopTimeUpdate) {
                    e.tripUpdate.stopTimeUpdate.forEach(stu => {
                        // Loose matching due to TAO stop_id complexities
                        if (stu.stopId && (stu.stopId === stop.id || stu.stopId.includes(stop.id))) {
                            let aTime = stu.arrival?.time || stu.departure?.time;
                            if (aTime) {
                                aTime = parseInt(aTime, 10);
                                if (aTime > now) {
                                    const tripId = e.tripUpdate.trip.tripId;
                                    const routeId = e.tripUpdate.trip.routeId;

                                    let lineName = "?", destName = "En cours", lineColor = "004b87";

                                    if (STATE.trips[tripId]) {
                                        const t = STATE.trips[tripId];
                                        destName = t.dest || destName;
                                        if (STATE.routes[t.route]) {
                                            lineName = STATE.routes[t.route].short_name;
                                            lineColor = STATE.routes[t.route].color;
                                        }
                                    } else if (routeId && STATE.routes[routeId]) {
                                        lineName = STATE.routes[routeId].short_name;
                                        lineColor = STATE.routes[routeId].color;
                                    }

                                    arrivals.push({ lineName, lineColor, destName, time: aTime });
                                }
                            }
                        }
                    });
                }
            });
        }

        arrivals.sort((a, b) => a.time - b.time);
        renderArrivals(arrivals.slice(0, 6)); // Display top 6

    } catch (err) {
        console.error("RT Fetch error:", err);
        loader.classList.add('hidden');
        list.innerHTML = '<li class="empty-state">Données temps réel indisponibles.</li>';
    }
}

function renderArrivals(arrivals) {
    document.getElementById('sheetLoader').classList.add('hidden');
    const list = document.getElementById('arrivalsList');

    if (arrivals.length === 0) {
        list.innerHTML = '<li class="empty-state">Aucun bus prévu dans l\'immédiat.</li>';
        return;
    }

    arrivals.forEach(a => {
        const waitMins = Math.floor((a.time - Math.floor(Date.now() / 1000)) / 60);
        const etaText = waitMins <= 0 ? "Proche" : `${waitMins} min`;

        const d = new Date(a.time * 1000);
        const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        const li = document.createElement('li');
        li.className = 'arrival-item';
        li.innerHTML = `
            <div class="line-badge" style="background-color: #${a.lineColor};">${a.lineName}</div>
            <div class="arrival-info">
                <span class="arrival-dest">${a.destName}</span>
                <span class="arrival-time">${timeStr}</span>
            </div>
            <div class="arrival-eta">${etaText}</div>
        `;
        list.appendChild(li);
    });
}

function closeBottomSheet() {
    document.getElementById('bottomSheet').classList.remove('active');
    document.querySelector('.floating-controls').classList.remove('lifted');
    STATE.currentStop = null;
}

// --- Favorites ---
function updateFavBtnState() {
    const btn = document.getElementById('btnFavorite');
    const icon = btn.querySelector('i');
    const isFav = STATE.favorites.some(f => f.id === STATE.currentStop.id);

    if (isFav) {
        btn.classList.add('active');
        icon.className = 'fa-solid fa-star';
    } else {
        btn.classList.remove('active');
        icon.className = 'fa-regular fa-star';
    }
}

function toggleFavorite() {
    if (!STATE.currentStop) return;

    const idx = STATE.favorites.findIndex(f => f.id === STATE.currentStop.id);
    if (idx >= 0) {
        STATE.favorites.splice(idx, 1);
    } else {
        STATE.favorites.push({ id: STATE.currentStop.id, name: STATE.currentStop.name, lat: STATE.currentStop.lat, lon: STATE.currentStop.lon });
    }

    localStorage.setItem('tao_favorites', JSON.stringify(STATE.favorites));
    updateFavBtnState();
    renderFavorites(); // Update list in bg
}

function renderFavorites() {
    const list = document.getElementById('favList');
    list.innerHTML = '';

    if (STATE.favorites.length === 0) {
        list.innerHTML = '<li class="empty-state">Aucun favori enregistré.<br>Appuyez sur l\'étoile lors de la consultation d\'un arrêt.</li>';
        return;
    }

    STATE.favorites.forEach(f => {
        const li = document.createElement('li');
        li.className = 'fav-item';
        li.innerHTML = `
            <i class="fa-solid fa-star"></i>
            <span>${f.name}</span>
            <i class="fa-solid fa-chevron-right" style="color:var(--text-muted); font-size:0.9rem; margin-right:0;"></i>
        `;
        li.addEventListener('click', () => {
            document.getElementById('favModal').classList.remove('active');
            STATE.map.setView([f.lat, f.lon], 17);
            openBottomSheet(f);
        });
        list.appendChild(li);
    });
}

// --- Service Worker Config ---
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Registration Failed', err));
    }
}
