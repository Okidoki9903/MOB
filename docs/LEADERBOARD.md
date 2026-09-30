# Classement partagé Supabase — activation facultative

Le jeu fonctionne sans serveur. `src/leaderboard-config.js` reste désactivé tant que l’URL et la clé publique sont vides. Cette migration prépare un classement partagé ; elle ne déploie aucun service et ne fournit pas une validation autoritaire des parties.

## Installation dans un projet Supabase de test

1. Appliquer `supabase/migrations/202609300001_leaderboard.sql` avec le rôle administrateur des migrations, une seule fois, via le workflow Supabase ou l’éditeur SQL du projet. PostgreSQL 13+ et les rôles Supabase `anon`, `authenticated`, ainsi que `auth.users`/`auth.uid()`, sont requis.
2. Activer la connexion anonyme dans Supabase Auth. Un visiteur authentifié anonymement reçoit le rôle `authenticated` ; le rôle API `anon` seul ne peut ni démarrer ni soumettre une partie.
3. Configurer uniquement l’URL HTTPS du projet et sa **publishable key** dans `src/leaderboard-config.js`. Ne jamais publier une clé `sb_secret_`, `service_role`, mot de passe SQL ou autre secret dans les fichiers du jeu.
4. Garder la saison `savane-2026-2`, précréée par la migration, ou ajouter explicitement une nouvelle ligne à `public.plp_seasons` avant de modifier la configuration. Les clients ne peuvent créer aucune saison.
5. Valider le parcours complet sur un projet de test avant activation publique : autoriser le partage, lancer une nouvelle expédition, terminer, choisir un pseudo, soumettre, vérifier le classement depuis un second appareil.

L’identité anonyme persiste via la session du navigateur, pas via le pseudo. Effacer le stockage ou changer d’appareil crée une autre identité et un autre code ami. Le pseudo n’est publié qu’à la soumission volontaire d’un résultat. Ne pas utiliser de vrai nom ou d’information personnelle. Un changement de pseudo met à jour le nom visible des anciennes saisons de cette identité. Le tableau public ne renvoie ni identifiant utilisateur, ni code ami, ni jeton.

## Contrat RPC exact

| RPC | Paramètres | Résultat |
| --- | --- | --- |
| `plp_start_run` | `p_level integer`, `p_upgrades jsonb`, `p_mission text`, `p_season text` | Objet `{run_id, friend_code}` |
| `plp_finish_run` | **`p_run uuid`**, `p_name text`, `p_kills integer`, `p_duration integer`, `p_won boolean` | Objet `{score, best_score, level, season}` |
| `plp_leaderboard` | `p_season text`, `p_codes text[]` ou `null` | Tableau `{rank, name, score, level}`, au plus 100 lignes |

`p_duration` est la durée jouée entière en secondes. Les missions autorisées sont `campaign` (compatibilité), `breakthrough`, `survival`, `hunt`, `rescue`, `sanctuary`. Les améliorations reconnues sont `recruits`, `power`, `rate`, chacune entière entre 0 et 40 ; un objet vide est accepté.

Les codes amis comportent dix caractères majuscules/chiffres. Le générateur utilise dix caractères hexadécimaux aléatoires et réessaie en cas de collision. Ils servent à retrouver des entrées publiques, jamais à authentifier. `null` demande le monde, `[]` ne renvoie personne. Le filtre accepte au plus 50 codes au total, soi compris, sans valeurs nulles, tableau multidimensionnel ni syntaxe libre. Le rang ami est relatif au groupe filtré. Les égalités sont départagées par date du record puis identifiant interne ; les rangs sont consécutifs.

## Contrôles réellement fournis

- RLS active sur les quatre tables, aucune policy client et aucun privilège direct pour `PUBLIC`, `anon` ou `authenticated`.
- RPC `SECURITY DEFINER` avec `search_path = ''`, noms de tables qualifiés, aucune construction SQL dynamique. Exécution start/finish uniquement pour `authenticated` ; lecture pour `anon` et `authenticated`.
- Identité extraite de `auth.uid()`, jamais d’un paramètre utilisateur. Profil et ticket verrouillés dans le même ordre pour sérialiser les requêtes concurrentes.
- Un ticket actif par identité. Un nouveau départ invalide l’ancien ticket. Un ticket validé ne peut être soumis deux fois ou par une autre identité.
- Départs espacés d’au moins 5 secondes et résultats d’au moins 15 secondes **par identité**. Ces limites ne constituent pas une protection globale contre les bots ou créations massives de comptes.
- Niveaux 1–99, noms nettoyés de 3–20 caractères alphanumériques/espaces/tirets/underscores, contrôles interdits. Le classement ne stocke aucune adresse IP.
- Durée déclarée 1–3600 secondes, ne dépassant pas le temps écoulé serveur de plus de 2 secondes ; ticket expiré après 2 heures, victoire refusée avant 30 secondes déclarées. La marge couvre l’arrondi ; une longue pause peut faire expirer le ticket.
- Éliminations entre 0 et `20 × (203 + 64 × niveau) + 5`. Score calculé uniquement côté serveur : `10 × éliminations + (victoire ? 1000 × niveau : 0)`.
- Un meilleur score par saison/identité avec index d’ordre pour le top 100. Un résultat inférieur ne remplace pas le record.

**Limite essentielle :** les éliminations, la victoire, le niveau et les améliorations restent des déclarations du client. Un programme peut attendre puis inventer un résultat plausible. Le niveau n’est volontairement pas limité par une progression serveur pour préserver les anciennes sauvegardes locales ; un client modifié peut donc déclarer le niveau 99. Le temps serveur, les bornes et les tickets réduisent les erreurs et les relectures, mais ne prouvent pas qu’une partie a été jouée. Ce classement convient à un prototype social, pas encore à une compétition avec enjeux.

Avant un lancement classé : simulation/rejeu vérifiable côté serveur avec version et seed de règles, validation des objectifs et progression, politique de migration des anciennes sauvegardes, protection CAPTCHA adaptée à Auth, limites fournisseur et quotas/coûts, contrôle d’abus à l’entrée, procédure de suppression/modération, supervision et essais de charge sur les requêtes réelles sont nécessaires. Ne pas présenter cette implémentation comme prête pour des millions de joueurs.

## Vérifications avant activation

La migration a été exécutée dans un PostgreSQL isolé en mémoire (PGlite), avec une simulation des rôles et de `auth.uid()`. **17 contrôles d’intégration passent** : permissions, identité, bornes, délai, usage unique, score serveur et filtrage amis. Le client possède aussi des tests de requêtes simulées. Aucun projet Supabase réel n’a été configuré : les jetons, le réseau, la locale et la concurrence du service hébergé restent à vérifier avant activation.

Pour reproduire le contrôle local : `npm install --no-save @electric-sql/pglite`, puis `node scripts/check-leaderboard-db.mjs`. Ce script ne contacte aucune base externe. Les contrôles suivants restent à faire dans Supabase de test :

- Un appel non authentifié à start/finish est refusé ; une lecture anonyme est permise.
- Toute lecture/écriture directe des tables avec les jetons frontend est refusée.
- Départ puis soumission après un délai cohérent : un seul record apparaît ; une seconde soumission du ticket et une soumission depuis une autre identité échouent.
- Deux soumissions concurrentes du même ticket ne créditent qu’un résultat ; deux départs concurrents ne créent qu’un ticket actif.
- Valeurs nulles, niveaux hors bornes, clés d’amélioration inconnues, améliorations fractionnaires, faux noms, durée future et kills au-delà du maximum sont refusés.
- `p_codes = null` renvoie le top monde ; `[]` renvoie zéro ligne ; code connu retrouve le même score ; 51 codes, valeur nulle et tableau multidimensionnel sont refusés.
- Record amélioré mis à jour, record inférieur conservé, noms de 3 et 20 caractères acceptés, caractères accentués validés selon la locale PostgreSQL.
- Mesurer `EXPLAIN (ANALYZE, BUFFERS)` des lectures monde/amis sur un volume représentatif. Ne pas extrapoler la capacité d’un index sans essai de charge.

## Exploitation et conservation

Une saison fermée (`accepting_runs = false`) refuse les nouveaux départs ; les tickets déjà créés restent soumissibles jusqu’à leur expiration. Les classements des anciennes saisons restent lisibles. Aucune tâche de nettoyage n’est déployée automatiquement. Prévoir une tâche administrative bornée pour supprimer les anciens tickets terminés/abandonnés et marquer les tickets actifs expirés ; les scores sont indépendants des tickets et restent conservés. Ne pas supprimer des profils pour nettoyer les tickets : la suppression du profil ou du compte Auth supprime ses résultats par cascade.

La migration ne collecte que l’identité Auth, le pseudo choisi, les paramètres et résultats déclarés d’une partie, ses dates et le code ami. Définir la durée de conservation, un moyen de retrait/suppression et la politique de confidentialité avant activation publique. L’identité anonyme n’est pas récupérable par pseudo ou code ami après perte de session.
