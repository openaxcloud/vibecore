# Notifications et Usage — preuves synthétiques locales

Recette initiale : sources `234f801f1`, serveur6299. Recette après correctifs : build compilé servi6699, empreintes de sources et artefact dans `after/source-sha256.txt`. Le build final ultérieur Paiement n'est pas celui de cette recette ; les sources Notifications/Usage n'ont pas changé. Aucun compte réel, achat, publication, DNS ou backend de production. Les données et adresses `example.test` sont synthétiques. Les requêtes tierces du navigateur sont bloquées ; l'API3299 refuse toutes les mutations avec HTTP503.

## Matrice et résultats

| Surface | Couverture | Résultat mesuré |
| --- | --- | --- |
| Notifications |320×740,390×844,820×1180,1440×900 ; FR/EN ×clair/sombre |16cas. Titre et corps longs contenus après correction, aucun chiffre/caractère retiré |
| Usage |Mêmes4dimensions/langues/thèmes |16cas. Motif long et valeurs de quotas contenus ; libellé mobile sur sa propre ligne, deux colonnes numériques |
| Récupération |FR/EN, mobile |Feed503→Retry clavier ; lien notification→Usage→Retour ; PATCH préférences503→rollback et alerte ; breakdown/limits503→Retry |
| Erreur limite membre |FR/EN, resize320→820→320 ; deux échecs consécutifs |Brouillon123 conservé. À hauteur400, alerte déjà visible : focus reste au champ. À hauteur200, alerte hors écran : focus rejoint l'alerte visible |
| Réponse retardée |FR/EN, POST `.data` retardé350ms puis scroll en haut avant réponse |Deux503 par langue ; focus rejoint l'alerte, texte et brouillon conservés |

À320FR : Notifications avant titre1509px/corps scroll1442px dans220px ; après220px/scroll220px. Usage motif avant1442px, après255px/scroll255px. Valeurs987654321 et1000000000 auparavant scroll77/87px dans63px ; après colonnes131px, scroll131px. Aucun débordement du document dans les32cas, aucune erreur JavaScript observée.

`baseline/matrix.json` conserve les mesures brutes initiales. Ses candidats « overflow » incluent aussi `sr-only`, troncatures intentionnelles et Switch : ils ne constituent pas tous des défauts. `after/matrix.json` ajoute des assertions ciblées pour titres/corps/motifs/nombres. Les captures avant/après sont complémentaires aux mesures, pas une certification globale.

## Reçus et limites

`unit/` conserve le rouge initial2tests puis6verts (2Usage et4Notifications existants), ainsi que le lint. L'erreur intermédiaire de sonde jsdom (`toJSON` indisponible) est conservée distinctement. `diagnostics/` conserve l'assertion de focus trop stricte : alerte visible, champ actif, comportement correct. Les reçus `interactions-visible`, `interactions-offscreen` et `interactions-delayed` distinguent ces cas. Aucun échec transformé en skip.

Les PATCH/POST recensés sont exclusivement locaux et volontairement refusés par la fixture. Aucune réussite backend ou modification de donnée réelle revendiquée. Les tests unitaires simulent la géométrie pour vérifier le comportement ; les reçus Chromium154.0.8037.57 vérifient la géométrie réelle du navigateur local.

Non couverts dans ce lot : Safari/Firefox, clavier OS réel, encoche/safeareas, zoom natif, lecteur écran réel, tous états/contrastes, production et version déployée. Le tableau de préférences Notifications conserve son défilement horizontal explicite à320 ; ce lot ne le certifie pas entièrement. Les surfaces réservées Git/Publish/Deploy/Domains/intégrations ne sont pas modifiées.

## Reproduction

Depuis la racine du dépôt disposant des dépendances et de `/usr/bin/chromium`, créer `/tmp/ui-other/after`, copier `fixtures/extra.json` dans `/tmp/ui-other/extra.json`, créer `/tmp/ui-other/errors.json` contenant `[]`, puis démarrer `node docs/bugs/user-area-2026-10-25/notifications-usage/fixtures/fixture.cjs` (localhost3299). Servir le build depuis la racine qui contient `build/client`, avec `HOST=127.0.0.1 PORT=6699 SAAS_API_URL=http://127.0.0.1:3299` et `node node_modules/@react-router/serve/bin.js build/server/index.js`.

Lancer les scripts après séquentiellement : `scripts/matrix.cjs`, `scripts/interactions-visible.cjs`, `scripts/interactions-offscreen.cjs`, `scripts/interactions-delayed.cjs`. Ne pas paralléliser avec des scripts qui modifient `errors.json`, ni reconstruire les assets pendant la recette. Le script baseline cible6299 ; il mesure le produit initial et n'impose pas les assertions après. Les imports Playwright archivés sont relatifs au dépôt ; les chemins de sortie `/tmp/ui-other` sont ceux des sondes. Les scripts après réutilisent certains noms de sortie : préserver les reçus entre exécutions, comme ici.

`logs.txt` liste commandes et résultats. Les validations consolidées build/typage/lint sont suivies par la session principale, sans prétendre qu'elles ont été exécutées par ces scripts.

## Complément de formats — build final palette, port6999

56 observations supplémentaires, toutes assertions ciblées vertes : Notifications et Usage ×360×800,844×390(paysage),768×1024,1024×768,1280×800,1920×1080,2560×1440 ×FR/EN ×clair/sombre. Aucune erreur JavaScript. Containment vérifié pour les titres/corps de notification, motifs et chiffres de quotas, ainsi que largeur du document. Les captures archivées couvrent360, paysage844,1024 et2560 en FR/clair.

Cela porte la matrice géométrique cumulée à **88 observations sur11formats**, avec les32observations initiales conservées dans `after/`. Ce ne sont pas88parcours fonctionnels : les interactions Retry/Retour/erreurs restent celles documentées plus haut. Les dimensions changent dans la même page ; la saisie pendant resize est couverte séparément par les reçus d'interactions.

Le serveur6999 utilise le build final palette (même artefact que6899) avec notre API isolée3299. `extended/source-sha256.txt` démontre que les deux routes et leur test sont identiques à ceux de6699 ; l'empreinte du build diffère. `extended/matrix.json` et `matrix.log` conservent les résultats. Reproduction : même setup de fixture, app sur6999, créer `/tmp/ui-other/extended`, lancer `scripts/matrix-extended.cjs` séquentiellement. Aucune mutation n'est effectuée par cette matrice. Aucune preuve de production ni certification globale n'est ajoutée.
