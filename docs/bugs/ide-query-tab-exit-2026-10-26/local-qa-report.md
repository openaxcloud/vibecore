# Recette locale complémentaire — query et sortie clavier Monaco

Build corrigé local depuis fd8a37e9011c15989dfc1fff4a45fbd7b578208c, sources non committées gelées par les propriétaires. Manifeste final-build-manifest.json et final-prebuild-sources.json. Dépendance @vibecore/editor résolue dans le worktree followup, sans modifier les dépendances partagées.

- Baseline6f : recherche perdue (390px open), CtrlM puis Tab reste dans Monaco : 2 rouges comportementaux attendus.
- Corrigé : 8 régressions recherche/focus390/820/1180 vertes ; Monaco1440 entièrement clavier vert ; recherche320 verte ; recherche zoom Chromium natif200% verte ; 2 états synthétiques403/503 et reprise clavier vers GET200 verts.
- 21 panneaux ci-dessous : contrôles atteints au clavier ou absence de contrôle attendue dans état vide/indisponible. Aucune activation fournisseur, scanner, workflow, installation ou restauration. 4 états sans contrôle ne valident pas une fonctionnalité absente.
- Monaco zoom200% : 1 échec initial conservé AVANT CtrlM, remplacement instance context2 focalisée par context3 non focalisée prouvé par trace ; scénario instrumenté ensuite vert, ne prouve pas la stabilité au démarrage. Preuve native-startup-focus-replacement-evidence.json. Le diagnostic causal du remount exact reste ouvert.
- Premiers essais conservés : helper de module incompatible avec export Rollup, puis géométrie2880×1000 donnant hauteurCSS456 et éditeur compact. Aucun de ces deux essais ne démontre un défaut du raccourci Monaco.

| Panneau | Clavier1440 | Contrôle / état |
|---|---|---|
| agent | Atteint | Agent prompt |
| search | Atteint | Search files |
| locks | Atteint | Search locked items |
| overview | Sans contrôle | État vide/indisponible, sans interaction |
| studio | Sans contrôle | État vide/indisponible, sans interaction |
| object-storage | Sans contrôle | État vide/indisponible, sans interaction |
| packages | Atteint | Install from lockfile |
| skills | Atteint | Project4 |
| monitoring | Atteint | 15m |
| ports | Sans contrôle | État vide/indisponible, sans interaction |
| extensions | Atteint | Name, author, tag or capability... |
| workflows | Atteint | New Workflow |
| debugger | Atteint | Refresh runtime |
| security | Atteint | Run full scan |
| env | Atteint | Development |
| activity | Atteint | Refresh now |
| logs | Atteint | Show Console |
| collaborators | Atteint | email or username |
| domains | Atteint | Overview |
| snapshots | Atteint | Manual checkpoint |
| settings | Atteint | Export project |

Agent : CtrlM permet la sortie de Monaco ; 128 Tab depuis le début du document avant le prompt, donc pas une mesure de simplicité satisfaisante à elle seule. Domaines rejoint le parcours Deploy. Shell reste sans runtime : aucune validation d’exécution ; preview statique précédemment validée sur fixture HTML locale3cas, non rejouée inutilement. Ancienne matrice4largeurs reste preuve de la version6f, pas une nouvelle validation complète de toutes les fonctions. Aucun Safari matériel ni production authentifiée testé.

## Validation ciblée après readiness observable

Test final SHA256 `4e244777d47911d03918aa32171d2803d80c25dc49f8312083633396729c32ef` : transcript synthétique et bulle ChatImpl attendue avant modèle puis unique focus initial. Monaco1440 vert8.1s ; Chromium natif200% (2880×1800 physique,1440×856 CSS) vert9.5s, zéro retry. Tab indente par défaut, CtrlM→Tab sort, ShiftTab revient puis sort en arrière, Tab revient et CtrlM rétablit indentation. Ces deux résultats valident le raccourci après disponibilité observable, pas la conservation du focus pendant le remount de démarrage établi plus haut. Aucun nouveau build.

## Conservation des preuves

Les rapports JSON complets, traces et manifestes source/build restent dans `/tmp/ide-followup-qa/`. Le reçu versionné en conserve les empreintes ; ces chemins désignent des preuves locales, pas des artefacts GitHub publiés. Stack isolée arrêtée ; reçu de nettoyage joint.
