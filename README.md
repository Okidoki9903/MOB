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
| Gauche | Des **socles** portant une arme, suivis de tuiles **+1** | Casse un socle pour améliorer ton lance-pierre (bois → renforcé → or → pierres de feu → calebasse tonnerre), puis passe sous les tuiles pour recruter |
| Milieu | La **horde** de fétiches, vague après vague, puis le **Grand Fétiche** | Chaque fétiche qui touche ta troupe emporte un enfant. Tu gagnes en battant le boss |
| Droite | Le **Gardien**, un masque géant, qui protège des tuiles **+30 / +100…** | Il faut une grosse puissance de feu, et il lance des rochers (cercle rouge) sur toi si tu restes dans son couloir |

Il faut sans cesse choisir entre monter en puissance (à gauche et à droite) et défendre (au milieu).
Chaque ennemi rapporte des pièces. Entre deux niveaux, tu peux les dépenser en améliorations
permanentes (**Recrues**, **Force**, **Cadence**). Les niveaux deviennent de plus en plus durs.

## Technique

- HTML, CSS et JS en modules ES, **sans étape de build**. Three.js r170 est inclus dans `vendor/`.
- Tous les modèles 3D sont procéduraux (`src/models.js`) et dessinés avec `InstancedMesh` : des centaines d'unités passent sans problème sur téléphone.
- Les sons et la musique (djembé et balafon) sont synthétisés en direct avec WebAudio (`src/audio.js`). Il n'y a aucun fichier audio.
- La résolution s'adapte automatiquement si l'appareil rame.
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
