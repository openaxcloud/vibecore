---
id: BUG-IDE-ONGLET-GENERIQUE-DOUBLON-001
---

## Bug

Un clic sur un fichier de la bibliothèque laisse l'onglet éditeur générique initial ouvert et ajoute un onglet lié au fichier. Le premier emprunte le nom du document courant : deux onglets affichent alors `audit.txt` pour un seul fichier ouvert. Reproduit le 12 octobre sur le main `30fb463710f2c75429e29cae8aefb76bfc5194d0`, avec API, PostgreSQL et navigateur locaux réels, sans runtime fonctionnel ni génération.

## 📤 Dispatché

☑ — audit local ciblé du 12 octobre 2026, branche `codex/audit-local-files-20261012`.

## 💻 Codé

☐ — correctif local validé sur son périmètre ; ni poussé ni fusionné sur main.

## ✅ Testé live

☐ — production non testée ; les mesures locales ne valent pas validation production.

## Cause et correctif

`BaseChat.openWorkspacePanel` maintenait sa propre logique d'ouverture, sans réutiliser l'éditeur initial sans chemin. L'étiquette de cet onglet générique suit `currentDocument`, d'où le doublon visible. La fonction passe désormais par `openTabInPane`, le moteur d'identité documentaire déjà présent et testé : première ouverture liée à l'éditeur initial, activation d'un fichier existant, réutilisation des previews, conservation des onglets permanents et de leur épinglage.

## Preuves

Contre-épreuve Playwright avant correction : `tests/e2e/ide-file-tab-identity.spec.ts` échoue sur le compte d'onglets, attendu 1, obtenu 2. Capture réelle inspectée et trace conservées sous `/tmp/files-audit-evidence/tab-before/`. La mémoire jointe à cette première exécution reflète l'état initial, trop tôt pour prouver l'état après clic ; elle n'est pas présentée comme cette preuve.

Voir le [rapport du parcours local](../reprise/2026-10-12-audit-local-fichiers.md) pour les résultats de validation, la matrice fonctionnelle et les limites de l'environnement.

Après correction : 37 tests unitaires du moteur, build, typecheck web et lint ciblé réussis ; E2E 3/3 verts après initialisation observable de Monaco, sans retry. Un défaut distinct à froid reste ouvert et empêche de valider le parcours complet ; voir le rapport.
