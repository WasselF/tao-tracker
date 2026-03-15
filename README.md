# TAO Transit - Progressive Web App (PWA)

Une application moderne et légère pour le suivi des bus en temps réel à Orléans, utilisant les données officielles TAO (Keolis) GTFS et GTFS-RT.

## Fonctionnalités Principales
- **Carte Interactive** propulsée par Leaflet
- **Lecture des données GTFS** (`stops.txt`, `routes.txt`) à la volée.
- **Affichage Temps Réel** (via `GTFS-RT trip-updates`) des prochains passages pour un arrêt donné.
- **Géolocalisation** de l'utilisateur.
- **Favoris** sauvegardés localement.
- **Progressive Web App (PWA)** installable sur mobile et dotée d'un mode hors-ligne.

## Comment Lancer le Projet Localement

Puisque ce projet utilise un Service Worker et charge des données externes (GTFS/API), il **doit être exécuté via un serveur HTTP**. L'ouvrir via `file://` bloquera les requêtes CORS et l'installation de la PWA.

### Méthode 1 : Utiliser Node.js / `http-server`
Si vous avez Node.js installé, ouvrez votre terminal dans le dossier du projet et exécutez :
```bash
npx http-server -c-1
```
Accédez ensuite à l'URL locale fournie (ex: `http://localhost:8080`).

### Méthode 2 : Utiliser Python
Si vous avez Python installé :
```bash
python -m http.server 8000
```
Accédez ensuite à `http://localhost:8000`.

### Méthode 3 : Extension VSCode
Vous pouvez utiliser l'extension **Live Server** sur Visual Studio Code. Un clic droit sur `index.html` > "Open with Live Server".

## Déploiement en Ligne (Hébergement)

Ce projet ne nécessite **aucun backend**. Il peut être hébergé gratuitement sur n'importe quel service statique.

### Déploiement sur GitHub Pages (Recommandé)
1. Créez un dépôt sur GitHub et poussez vos fichiers.
2. Allez dans les paramètres du dépôt > **Pages**.
3. Sélectionnez la branche `main` ou `master` comme source.
4. Sauvegardez. Votre site sera en ligne sous quelques minutes.

### Déploiement sur Netlify / Vercel
1. Créez un compte sur Netlify ou Vercel.
2. Glissez-déposez simplement le dossier complet de ce projet dans leur interface de déploiement manuel.
3. Le site sera instantanément en ligne avec son certificat SSL (HTTPS) requis pour l'installation d'une PWA.

## Architecture & Code

- `index.html` : L'interface principale, contenant la Bottom Navigation, la carte, et les fenêtres modales (Bottom Sheet).
- `style.css` : La couche visuelle (variables CSS, transitions, animations "app-like").
- `app.js` : La logique applicative (les onglets, la carte Leaflet, la gestion des favoris avec `localStorage`).
- `gtfs.js` : Le moteur de données. Il utilise `JSZip` et `PapaParse` pour extraire les arrêts depuis `gtfs.zip`. Il utilise `protobuf.js` pour désérialiser le flux GTFS-RT lors de la consultation d'un arrêt.
- `sw.js` et `manifest.json` : Cœur de la PWA. Permettent la mise en cache des bibliothèques et l'installation native.
