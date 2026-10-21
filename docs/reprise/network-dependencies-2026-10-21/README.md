# Dépendances réseau — lot isolé

Base : main 883af053f7c1b85bb472fa53c7fa87b4c8051c9b. Ce lot est indépendant de #761 : il conserve donc les critiques de cette base jusqu'à intégration coordonnée de #761. Ne pas confondre ses compteurs avec ceux du candidat #761.

## Correction et exposition

- `ws` 8.18.0/8.20.0 → 8.22.0 résolu, minimum 8.21.0. L'override couvre aussi Fastify websocket et les clients transitifs, tous auparavant en branche majeure 8. API `services/api/src/app.ts` configure maxPayload 8 MiB : cette limite ne borne pas les allocations par fragment. Les contrôles d'accès existants ne sont pas modifiés. [Advisory](https://github.com/advisories/GHSA-96hv-2xvq-fx4p), [release 8.22](https://github.com/websockets/ws/releases/tag/8.22.0).
- `compression` 1.8.1 → 1.8.2, utilisé globalement dans `server.mjs:47`, avant les routes. Un abandon de réponse compressée laisse le flux natif ouvert. [Advisory](https://github.com/advisories/GHSA-vc2v-76pw-4v95).

Le lock ne change que ces versions, la dépendance `destroy` requise par compression et trois métadonnées de dépréciation déjà existantes dans #761. Aucun faux fournisseur, mock de socket, scan affaibli, timeout augmenté ou nouvel accès.

## Preuves

`ws-fragment-security.checks.mjs` utilise deux vrais pairs loopback : message de 16 385 octets réparti en fragments, en dessous de maxPayload. Ancien : accepté (assertion rouge), nouveau : WS_ERR_TOO_MANY_BUFFERED_PARTS. Une fragmentation normale reste acceptée. Essai borné, pas de reproduction OOM ni preuve d'une attaque anonyme sur l'API.

`compression-close-security.checks.mjs` appelle les vraies factories zlib via des wrappers d'observation. Trois abandons HTTP (gzip/deflate/br) vérifient destroyed et le champ privé `_handle` ; trois réponses normales sont décompressées et comparées. Ancien : 3 échecs d'abandon / 3 succès normaux ; nouveau : 6/6. Cette observation dépend des internals Node et doit passer la CI Node 22. Aucune réponse ni compression simulée.

Deux tests existants API de ticket collaboration et proxy terminal sont également exécutés : transport réel mais stockage de test en mémoire, donc ils ne certifient pas PostgreSQL, persistance ou isolation inter-organisations. Les autres tests de ce fichier sont non sélectionnés, explicitement comptés dans le reçu. Les huit scénarios de régression des dépendances ne comportent aucun saut.

Les preuves restent rattachées par empreintes aux sources ; CI du SHA publié requise. Les réponses de requêtes et tickets synthétiques ne sont pas publiés dans les reçus anonymisés.

## Inventaire high de production restant

Audit du candidat #761 : 73 findings, 67 enregistrements, 66 GHSA distincts, 31 packages, 998 chemins. Les six findings supplémentaires viennent de deux versions ws, deux avis vite et trois avis nanoid ; protobufjs porte le même GHSA dans deux branches. Cela ne signifie ni 73 failles indépendantes ni 998 instances exploitées.

| Priorité | Groupe                                      | Enregistrements high | Motif / étape suivante                                                                                                                                                                                                                                                                                  |
| -------- | ------------------------------------------- | -------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | ws / compression                            |                    2 | Corrigés ici, trois findings ; sockets et compression réellement utilisés.                                                                                                                                                                                                                              |
| 2        | xmldom                                      |                   11 | SAML ACS `/auth/saml/:orgId/acs`, DOMParser avant signature (app.ts:6731,11712), SSO activé requis. Le rate-limit et catch401 ne bornent pas le coût de parsing. Reproduire les avis parsing et monter 0.9.10→0.9.12 ; ne pas attribuer automatiquement les avis de création de noms XML à ce parcours. |
| 3        | Fastify / fast-uri / find-my-way            |                   12 | Services exposés ; conditions particulières des avis d'auth et schémas à vérifier. Pas de garde SSRF via fast-uri démontrée. Correctifs minima respectifs 5.12.2, 3.1.7, 9.7.0.                                                                                                                         |
| 3        | MCP / hono / ip-address                     |                    5 | Client HTTP avec headers confirmé ; serveur, taskStore et authProvider non retrouvés. SDK1.32.0 corrige les high mais leur exploitation locale reste non établie. La moderate de fuite de headers sur redirection est également pertinente.                                                             |
| 3        | Clients réseau undici / mysql2 / form-data  |                    4 | Résolution exacte mysql2 de l'import API à vérifier (finding via Prisma). Mise à jour npm undici ne corrige pas la copie embarquée dans Node.                                                                                                                                                           |
| 3        | Desktop js-yaml / builder-util-runtime      |                    4 | autoUpdater réellement utilisé ; flux de métadonnées et redirections à tester, pas des pods web.                                                                                                                                                                                                        |
| 4        | Télémétrie protobufjs / Jaeger / grpc       |                    4 | NodeSDK activé ; modes et fonctions vulnérables non démontrés.                                                                                                                                                                                                                                          |
| 4        | Routage React Router / Remix / turbo-stream |                    4 | SSR classique, aucun RSC établi ; anciens handlers Remix transitifs pas automatiquement servis.                                                                                                                                                                                                         |
| 4        | jsondiffpatch                               |                    1 | Transitif AI ; format de réponse et entrée contrôlable à qualifier.                                                                                                                                                                                                                                     |
| 4        | Outils et construction                      |                   20 | Vite, brace-expansion, nanoid, postcss, deepmerge-ts, browserslist, immutable, source-map-js, sharp : présents dans graphe prod ne signifie pas servis au réseau ; préciser fonctions et images avant mise à jour.                                                                                      |

L'inventaire machine joint conserve chaque GHSA, version corrigée, version trouvée et chemin. Les nombres de l'audit sont consultatifs, pas une preuve d'exploitation. Les images réellement déployées doivent être contrôlées séparément.

## Audit candidat de ce lot

`pnpm 9.14.4 audit --prod --json` termine exit 1 : 70 high, 2 critical, 108 moderate, 28 low. Aucune entrée ws/compression restante. Les deux critiques sont Capacitor, conservées de main et traitées dans #761 séparée. Aucun résultat de ce lot ne prouve que #761 est intégrée ni que les applications mobiles installées sont corrigées.
