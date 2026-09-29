# Les P'tits Lance-Pierres

Un jeu de horde en 3D pour le navigateur (Three.js), pensé d'abord pour le mobile et tout aussi jouable sur PC.
Toute une troupe de petits guerriers armés de lance-pierres défend son village contre les fétiches rouges.

## Jouer

- **Mobile** : glisse le doigt à gauche / à droite.
- **PC** : souris (cliquer-glisser) ou flèches ← → / A-D / Q-D. `Échap` ou `P` pour mettre en pause.

## La boucle de jeu

Le terrain est divisé en trois couloirs. Ta troupe tire toute seule, droit devant elle.

| Couloir | Contenu | Intérêt |
|---|---|---|
| Gauche | Des **socles** portant une arme, suivis de longues files de tuiles **+1** | Casse un socle pour améliorer ton lance-pierre (bois → renforcé → or → pierres de feu → calebasse tonnerre), puis passe sous les tuiles pour recruter |
| Milieu | Une **horde** mixte (fétiches, hyènes rapides, buffles costauds, vautours volants), vague après vague, puis un **boss** (Grand Fétiche, Buffle Géant ou Reine Hyène) | Chaque monstre qui touche ta troupe emporte des enfants. Tu gagnes en battant le boss |
| Droite | Le **Gardien**, un masque géant, qui protège 40 tuiles dorées **+3, +4…** | Il faut une grosse puissance de feu, et il lance des rochers (cercle rouge) sur toi si tu restes dans son couloir |

Il faut sans cesse choisir entre monter en puissance (à gauche et à droite) et défendre (au milieu).
Chaque ennemi rapporte des pièces. Entre deux niveaux, tu peux les dépenser en améliorations
permanentes (**Recrues**, **Force**, **Cadence**). Les niveaux deviennent de plus en plus durs.

## Technique

- HTML, CSS et JS en modules ES, **sans étape de build**. Three.js r170 est inclus dans `vendor/`.
- Tous les modèles 3D sont procéduraux et lisses (`src/models.js`) et dessinés avec `InstancedMesh`. Les jambes, les bras et les ailes sont animés sur la carte graphique : des centaines d'unités passent sans problème sur téléphone.
- Ombres en temps réel, ciel dégradé, herbe qui ondule au vent, oiseaux, nuages, torches et poussière. Physique de foule : ressorts de formation, bousculade entre monstres, recul à l'impact, chutes.
- Les sons et la musique (djembé et balafon) sont synthétisés en direct avec WebAudio (`src/audio.js`). Il n'y a aucun fichier audio.
- La qualité s'adapte automatiquement si l'appareil rame : les ombres sont coupées d'abord, puis la résolution baisse.
- La progression est sauvegardée en `localStorage`. Le jeu est installable (manifest + service worker), ce qui facilitera un futur emballage pour les stores (Capacitor, par exemple).

### Lancer en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

### Paramètres de test

- `?level=5` : commencer au niveau 5
- `?bot&speed=4` : un bot joue tout seul, en accéléré (sert à vérifier l'équilibrage)
- `?autostart` : lancer directement la partie

### Publier sur GitHub Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source : "Deploy from a branch"**.
Choisis la branche et le dossier `/ (root)`, puis enregistre. Le jeu sera en ligne à l'adresse
`https://<ton-pseudo>.github.io/MOB/`.

## Édition « Les Gardiens de la Savane »

- Interface ivoire, or et nuit : menu d’expédition, atelier, aide, HUD de combat et bilan de partie.
- **Onde des ancêtres** : bouton tactile ou **Espace**. Repousse et blesse les ennemis proches (rayon 12), puis augmente la cadence de 60 % pendant 4 secondes. Recharge : 16 secondes.
- **Combos** : enchaîne les éliminations à moins de 3,5 secondes d’intervalle ; subir une perte remet la série à zéro. Le bilan affiche les éliminations, la meilleure série, et la durée.
- Tuiles émaillées, détails des huttes et nuances des modèles ; musique qui suit l’intensité du combat, effets de boss et limiteur sonore.
- Les sauvegardes existantes sont conservées et les valeurs invalides sont corrigées à la lecture. Le cache hors ligne précharge les fichiers du jeu après une première visite connectée.

### Vérifier les règles de jeu

Avec Node.js 22.15+ (Node.js 24 recommandé), sans dépendances à installer :

```bash
npm test
```

Les tests couvrent la portée et la recharge de la capacité, son blocage hors combat, l’attribution unique des récompenses du boss, les combos, l’arrêt de simulation en fin de partie et les sauvegardes invalides. Pour vérifier le rendu WebGL et les commandes, lancer le serveur local puis jouer une partie ; les tests de règles ne remplacent pas les essais sur téléphone.
