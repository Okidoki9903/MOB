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


### Animation de tir et hordes renforcées

Chaque personnage arme réellement son lance-pierre : le bras tire la poche et les deux branches de l’élastique, puis la main poursuit son mouvement au relâchement. Le cycle est synchronisé avec les tirs et fonctionne sur les cinq armes.

Toutes les vagues contiennent désormais **4 fois plus d’ennemis que la précédente version renforcée** : le niveau 1 comporte 5 340 ennemis, plus le boss (20 fois le volume initial). Des renforts en file attendent une place dans les groupes actifs ; aucun ennemi prévu n’est abandonné lorsque la limite est atteinte. En mission de percée, la victoire attend également la fin des renforts.

La résistance progresse désormais par vague pour suivre les nouvelles armes. Les buffles apparaissent dès la première mission et résistent aux explosions ; les dégâts de zone ont une limite de cibles. Les assauts alternent avec de courtes respirations, les derniers renforts ne restent plus bloqués derrière les premières vagues. Les projectiles expirent après 14 mètres et le recul est plafonné. Le premier niveau garde une résistance réduite pour permettre le recrutement initial.

Les armes avancées restent enfouies jusqu’aux vagues 2, 3 et 4 (avec délais minimums de 12, 28 et 44 secondes), puis sortent du sol à proximité avec de la poussière. Elles ne captent aucun projectile tant qu’elles sont cachées.

La simulation déterministe (`node tests/balance-sim.mjs`) utilise les règles réelles sans rendu et mesure la pression par tranches de 15 secondes. Les trois graines contrôlées au niveau 1 sans améliorations gagnent en 96–100 secondes, avec des éliminations tardives à 8–10 mètres et des ennemis qui approchent encore à la fin. Ce contrôle ne remplace pas un essai humain sur téléphone.

### Campagne et styles de combat

Les niveaux alternent cinq objectifs : éliminer la horde, tenir jusqu’à l’évacuation, vaincre trois champions successifs, recruter 120 enfants et tenir jusqu’à l’extraction, puis détruire le Gardien et le chef. Le briefing et le HUD donnent l’objectif exact. Les missions de survie, de chasse et de sauvetage peuvent terminer sans éliminer tous les renforts.

Dès le niveau 2, un style gratuit peut être choisi avant une expédition : **Onde** (repoussement et cadence), **Bastion** (8 pertes absorbées pendant 4 secondes, onde affaiblie), **Assaut** (cadence +140 % pendant 2,5 secondes, aucune onde). Le choix est sauvegardé et ne peut pas changer pendant un combat.

Sur mobile, le rendu limite les corps et particules, garde les ombres des personnages et boss mais retire celles des hordes, et plafonne la résolution initiale. Les buffers graphiques ne transfèrent que leurs instances actives et le HUD est actualisé à 10 Hz. Aucun débit d’images sur téléphone physique ni capacité de millions de joueurs n’a été mesuré.

### Classement mondial et amis

Le panneau partagé, les codes amis, l’identité anonyme et la soumission volontaire des résultats sont intégrés. Ils restent **désactivés sans projet Supabase configuré**. Voir [la procédure d’activation](docs/LEADERBOARD.md) et `src/leaderboard-config.js`.

La base calcule le score et contrôle les tickets, l’identité, les délais et les bornes ; elle ne rejoue pas la partie pour prouver les résultats. Le classement est donc présenté comme une bêta de résultats déclarés. Avant une compétition publique importante, ajouter une validation de partie autoritaire et réaliser les tests de charge. La migration a passé 17 contrôles sur PostgreSQL isolé en mémoire ; l’authentification hébergée et le parcours multiappareils restent à valider dans le projet Supabase.
