---
id: BUG-SNAPSHOT-AGENT-ENCODING-001
section: "Reprise commerciale du 2026-10-18 — preuves de sauvegarde et restauration"
---

## Bug

**Une restauration de projet corrompait les fichiers binaires du workspace actif.** Sur `main` `c6439da55bebf180fe43dce65dbc5c32e6a9fa0a`, `syncRestoredFilesToWorkspace` envoyait seulement `path` et `content` à `POST /files/write`. Les fichiers issus de l’archive et du stockage API portaient pourtant `encoding: base64`. L’agent interprétait le contenu comme du texte UTF-8 : les sept octets `89 50 4e 47 00 ff 80` devenaient les douze octets ASCII de `iVBORwD/gA==`, avec une réponse API `200`.

## 📤 Dispatché

2026-10-18 — tranche supplémentaire autorisée sur `codex/snapshot-restore-contract-20261018`, après le commit publié `6f766f76e199aaabeb370e97d8d0f190a0900d4d`. Aucun amendement de ce commit, aucun changement des PR #735/#736 ni de la restauration SQL.

## 💻 Codé

Candidat local rebasé sur `main` `b827b12255d423ffb96143c39c1d2a3917ffc5e2`, non fusionné et non déployé. Les deux correctifs restent dans deux commits distincts. Le helper accepte désormais le champ `encoding` typé depuis `ProjectFile` et le transmet avec `path` et `content` à l’agent. La valeur absente conserve le contrat texte historique ; `utf8` et `base64` restent explicites lorsqu’ils sont présents. Aucun changement de la politique d’erreurs existante.

## ✅ Testé live

Non en production. Vérification locale sur trois vrais serveurs HTTP : API, gestionnaire de jetons et agent, avec deux arbres de fichiers temporaires distincts. Aucun Pod, PVC, client SQL, secret de production ou ressource cloud n’est utilisé.

## Preuve

- `services/api/src/tests/project-snapshot-agent-encoding.spec.ts` crée une vraie archive de projet par HTTP, modifie indépendamment les fichiers du stockage API et de l’agent, appelle la route de restauration puis compare les octets originaux aux deux disques. Les réponses de restauration et d’écriture ne sont pas simulées.
- Le gestionnaire signe réellement les jetons depuis un `JsonWorkspaceStore` temporaire. Les métadonnées/authentification API utilisent explicitement `TestApiStore` en mémoire. Tous les appels du port Kubernetes et du bus d’événements lèvent une erreur et le test vérifie qu’aucun n’a été effectué.
- Contre-épreuve : substitution temporaire de `app.ts` par le fichier exact de `main c6439da`, exécution du même test, puis remise byte-identique du candidat dans un `finally`. Le cas binaire échoue sur les octets de l’agent ; le témoin UTF-8 couvre le comportement texte conservé. Journal local : `/tmp/vibecore-snapshot-encoding-main-red.log`.
- Contre-épreuve complémentaire : retrait temporaire de la boucle d’écriture vers l’agent, sans changer l’archive ou le stockage API ; les deux cas échouent sur les octets de l’agent. Le test ne peut donc pas se satisfaire du seul `200` API ou du seul disque API. Après remise byte-identique du candidat, **2/2 cas verts**. Journaux : `/tmp/vibecore-snapshot-encoding-without-agent-writes-red.log`, `/tmp/vibecore-snapshot-encoding-final-green.log`.
- Validation : **27/27 tests API** (`project-snapshot-agent-encoding`, `runtime-snapshot-contract`, `runtime-readiness`), **6/6 tests d’index** et contrôle complet `tsc --noEmit -p services/api/tsconfig.json` sans diagnostic. Journaux : `/tmp/vibecore-snapshot-encoding-green.log`, `/tmp/vibecore-snapshot-encoding-index.log`, `/tmp/vibecore-snapshot-encoding-api-typecheck.log`. Mémoire mesurée avant les suites : 1,4 Gio utilisés, 16 Gio disponibles sur 17 Gio. Aucun build d’image ni test en navigateur exécuté dans cette tranche locale sans Docker.
- ESLint : zéro diagnostic dans les deux tests concernés. Comparaison de `app.ts` au commit publié `6f766f76` : mêmes 324 erreurs et 14 avertissements préexistants, aucun ajout (`/tmp/vibecore-snapshot-encoding-lint-comparison.json`). Le lint global n’est donc pas présenté comme vert. Les fixtures isolent les noms réellement lus par #735 : `WORKSPACE_ADMISSION_V2_ENABLED` et `WORKSPACE_ADMISSION_V2_QUOTA_ENABLED`.
- Commande API depuis `services/api` : `node ../../node_modules/vitest/vitest.mjs run src/tests/project-snapshot-agent-encoding.spec.ts src/tests/runtime-snapshot-contract.spec.ts src/tests/runtime-readiness.spec.ts --maxWorkers=1 --minWorkers=1`. Index régénéré officiellement avec `node scripts/migrer-inventaire-bugs.mjs --index` (431 entrées), sans fusion manuelle.
- Rebase final sur `b827b122` : deux commits conservés sans conflit. Comparaison des lignes ajoutées/supprimées dans chaque fichier de production, commit par commit : identiques. Le nouveau test, l’ancien test de contrat et les fichiers agent/catalogue restent identiques par SHA256 (`/tmp/vibecore-snapshot-b827-rebase-comparison.json`). Index régénéré à **432 entrées** ; **27/27 tests API et 6/6 tests d’index** relancés et verts, respectivement en 15,40 s et 1,20 s (`/tmp/vibecore-snapshot-b827-api.log`, `/tmp/vibecore-snapshot-b827-index.log`). Mémoire avant ces suites : 1,5 Gio utilisés, 16 Gio disponibles. Aucun changement du correctif nécessitant de répéter le typecheck déjà vert.

## Limites conservées

| Niveau | Preuve de cette tranche | Limite |
| --- | --- | --- |
| Archive et stockage API | ZIP réel, restauration réelle sur disque local | Métadonnées en mémoire ; aucun exercice de reprise PostgreSQL |
| API → gestionnaire → agent | HTTP réel et jeton signé, écriture binaire/texte sur disque de l’agent | Aucun réseau Kubernetes, PVC ou déploiement testé |
| Fusion / déploiement | Deux commits locaux distincts au-dessus de `b827b122`, issus des candidats `6f766f76` et `d1fa9c99` | Pas de fusion, de push ni de déploiement effectué par cette tranche |
| Production | Aucune | Aucun verdict de restauration commerciale complète |

La synchronisation vers le workspace reste **best-effort** : les échecs de lecture, écriture et suppression sont absorbés par `syncRestoredFilesToWorkspace`. Un `200` de la route de restauration ne prouve donc toujours pas la convergence d’un agent indisponible. Le correctif préserve les octets lorsque l’écriture réussit ; il n’ajoute pas de rapport de convergence, de gel des écrivains, d’atomicité fichiers/DB, d’archive durable du runtime ou de PITR. Les autres blocages de sauvegarde sont consignés dans `BUG-RUNTIME-SNAPSHOT-FALSE-SUCCESS-001.md`.
