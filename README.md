# Survivants d'Arène

Jeu d'action coopératif en français, jouable directement dans un navigateur moderne. Aucun build ni compte n'est nécessaire pour jouer en solo.

## Jouer

- **Solo :** ouvrez `index.html` dans un navigateur ou publiez le dépôt sur GitHub Pages.
- **Multijoueur :** cliquez sur **Créer une salle**, puis partagez le code ou le lien généré. Les autres joueurs peuvent ouvrir le lien ou saisir le code. Une salle accepte jusqu'à 16 joueurs, hôte compris.
- **Commandes :** déplacement avec `WASD` ou les flèches, visée à la souris/au trackpad. Sur écran tactile, faites glisser à gauche pour bouger et à droite pour viser. Le tir est automatique. À chaque niveau, choisissez une amélioration.

## Lancer localement

Pour tester les liens avec paramètres et le chargement des scripts de manière cohérente, servez le dossier avec un serveur HTTP statique (par exemple `python -m http.server 8000`), puis ouvrez `http://localhost:8000`. Les connexions multijoueur nécessitent Internet et un navigateur compatible WebRTC. Aucun secret ou fichier de configuration n'est requis.

## Architecture et limites du multijoueur

Le site est statique (HTML, CSS et JavaScript) et peut être hébergé gratuitement sur GitHub Pages. PeerJS utilise son service public de signalisation pour échanger les informations nécessaires à l'établissement d'une connexion WebRTC ; après la connexion, états, entrées et simulation passent directement entre les navigateurs. La personne qui crée la salle est l'hôte et son navigateur fait autorité sur la simulation. Les codes privés correspondent à des identifiants de pair ; il n'y a pas de répertoire public de salles, et l'hôte doit rester en ligne.

Cette architecture sans serveur applicatif n'apporte ni autorité indépendante ni anti-triche : un hôte peut modifier la partie, et fermer son onglet arrête la salle. Le service public de signalisation et la connexion WebRTC dépendent d'Internet. Aucun serveur TURN n'est fourni : certains NAT, pare-feux ou réseaux d'entreprise bloquent les connexions directes, auquel cas la partie ne pourra pas se connecter. Il n'y a pas de garantie de disponibilité du service tiers, de reprise après disparition de l'hôte ni de sauvegarde du match. La limite de 16 est appliquée par le navigateur hôte, pas par un serveur de confiance.

## Déploiement GitHub Pages

Le workflow `.github/workflows/pages.yml` publie automatiquement le contenu du dépôt sur GitHub Pages à chaque push sur `main` (et peut être lancé manuellement). Dans les paramètres du dépôt, sélectionnez **Settings → Pages → Build and deployment → GitHub Actions**. Une fois le workflow réussi, l'adresse sera `https://<propriétaire>.github.io/<nom-du-dépôt>/`. Ce dépôt ne peut pas annoncer une URL publique tant qu'un déploiement réel n'a pas été effectué et vérifié.

## Vérifications

- Ouvrir la page et tester le mode solo, les déplacements, les tirs, dégâts ennemis, progression et améliorations.
- Ouvrir la page dans deux navigateurs/appareils connectés à Internet, créer une salle depuis l'un et rejoindre son lien depuis l'autre.
- Tester une reconnexion après interruption brève, la sortie d'un joueur et l'accueil à 16 joueurs.
- Pour le déploiement, vérifier le résultat de **Actions → Deploy to GitHub Pages**, puis ouvrir l'URL de Pages du dépôt.
