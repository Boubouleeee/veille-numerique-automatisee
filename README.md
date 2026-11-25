# Survivants d'Arène

Jeu d'action coopératif en français, jouable directement dans un navigateur moderne. Aucun build ni compte n'est nécessaire.

## Jouer

- **Solo :** ouvrez `index.html` ou démarrez un serveur HTTP statique (`python -m http.server 8000`).
- **Multijoueur :** créez une salle, puis partagez le lien ou le code. Jusqu'à 16 joueurs, hôte compris, peuvent rejoindre la même partie.
- **Commandes :** déplacement `WASD` ou flèches, visée à la souris/au trackpad, tir automatique. Les touches `1` à `8` activent les pouvoirs. Sur écran tactile, faites glisser à gauche pour bouger et à droite pour viser. Les flèches ne font pas défiler la page en partie.

## Progression

Les ressources lumineuses donnent de l'EXP à la collecte ; les ennemis et adversaires éliminés, ainsi que les cibles violettes destructibles, en donnent aussi. Le coût d'EXP augmente à chaque niveau, jusqu'au niveau maximum 30. Chaque niveau rapporte un point à investir dans l'une des neuf caractéristiques : vitesse, vie maximale, régénération, dégâts, vitesse des projectiles, cadence, résistance, pénétration ou portée. Chaque caractéristique est plafonnée à 10 points.

Les choix de classe apparaissent aux niveaux 5, 10, 15, 20, 25 et 30. Les classes proposées dépendent des choix précédents : canons double, inversé, sniper ou mitrailleuse ouvrent des branches offensives, défensives, de mobilité ou polyvalentes, puis des évolutions avancées. Les canons visibles correspondent aux projectiles tirés. Huit pouvoirs activables avec recharge sont indiqués à l'écran et utilisables avec les touches `1–8`.

Les paramètres de progression, caractéristiques, classes, pouvoirs et équilibrage se trouvent dans `game-config.js`.

## Architecture et limites du multijoueur

Le site est statique et peut être hébergé gratuitement sur GitHub Pages. PeerJS utilise son service public de signalisation pour négocier une connexion WebRTC ; ensuite, l'état, les entrées, la progression et les combats sont synchronisés directement entre navigateurs. Le navigateur de la personne qui crée la salle fait autorité sur la simulation. Les identifiants de salles ne sont pas publiés dans un répertoire.

Cette architecture n'apporte ni serveur indépendant ni anti-triche : un hôte peut modifier la partie, et fermer son onglet arrête la salle. Aucun serveur TURN n'est fourni ; certains NAT, pare-feux ou réseaux d'entreprise bloquent les connexions directes. Il n'y a pas de garantie de disponibilité du service tiers, de reprise après disparition de l'hôte ni de sauvegarde du match. La limite de 16 est contrôlée par l'hôte et n'est pas appliquée par un serveur de confiance.

## Déploiement et vérifications

Le workflow `.github/workflows/pages.yml` déploie le site lors des pushes sur les branches configurées et peut être lancé manuellement. Activez GitHub Pages avec **Settings → Pages → Build and deployment → GitHub Actions**. Vérifiez le succès du workflow et l'URL Pages dans l'onglet **Actions** avant de partager le site.

Pour les tests locaux, lancez `python -m http.server 8000`, ouvrez `http://localhost:8000`, puis vérifiez le mode solo, les flèches sans défilement, le tir, les ressources et objets, les neuf statistiques, les choix d'évolution, les huit pouvoirs et les cooldowns. Pour le réseau, ouvrez la page dans deux navigateurs avec Internet, créez une salle depuis l'un et rejoignez-la depuis l'autre ; vérifiez les mouvements, dégâts, progression, sortie d'un joueur et la limite de 16.
