# Certification réelle — Field Service Inspector (`field-service-inspector`)

**Date** : 2026-07-24
**Stack** : Expo SDK 54 · React Native 0.81 · react-native-web · Metro web export
**Méthode** : build web réel (`expo export --platform web` → `dist/`) servi par `server.mjs` sur `http://127.0.0.1:44120/`, piloté par un navigateur Chromium réel (Playwright `@playwright/test`, `$WT/node_modules`). Viewport desktop 1280×900 (deux panneaux, `width ≥ 900`).
**Harnais** : `certification/field-service-inspector/run-cert.mjs` (22 contrôles, captures + logs).
**État persisté** : RÉEL — AsyncStorage-sur-web = `localStorage` clés `fsi.jobs.v1` / `fsi.queue.v1` (lues directement pour prouver la file).

## Tableau contrôle → résultat → preuve

| # | Contrôle exercé | Résultat | Preuve | Détail mesuré |
|---|---|---|---|---|
| 1 | Boot / premier paint | **OK** | `01-load.png` | titre="Field Service Inspector" ; **0 pageerror** au boot ; 2 requêtes JS |
| 2 | expo-camera absent au boot (piège connu) | **OK** | `01-load.png` | 0 requête réseau matchant camera → module bien derrière import dynamique |
| 3 | Liste des jobs rendue | **OK** | `01-load.png` | 5 jobs (WO-4821…4825) |
| 4 | Sélection d'un job (WO-4822) | **OK** | `02-job-selected.png` | détail affiche « Harbour Point Apartments » |
| 5 | Checklist rendue | **OK** | `02-job-selected.png` | 4 items, boutons Pass×4 / Fail×4 |
| 6 | Pass coche + file « N queued » incrémente | **OK** | `03-checklist-pass.png` | file persistée `0 → 1` |
| 7 | Fail révèle le commentaire + saisie | **OK** | `05-fail-comment.png` | champ « Describe the defect » apparaît, texte saisi, file → 3 |
| 8 | Champ Notes éditable | **OK** | `05-fail-comment.png` | 59 car. saisis |
| 9 | « Take photo » (fallback fichier web) → vignette | **OK** | `06-photo-added.png` | boutons Remove `0 → 1` |
| 10 | Vignette = vraie image data-URI | **OK** | `06-photo-added.png` | `src=data:image/jpeg;base64,/9j/4AA…` (downscale JPEG appliqué) |
| 11 | Bouton « Remove » retire la photo | **OK** | `07-photo-removed.png` | boutons Remove `1 → 0` |
| 12 | Pad signature — dessin souris (polyline SVG) | **OK** | `08-signature-drawn.png` | `<path>` SVG `0 → 1` |
| 13 | « Clear » efface l'encre | **OK** | `09-signature-cleared.png` | `<path>` SVG `1 → 0` |
| 14 | « Save signature » persiste (nom + horodatage) | **OK** | `10-signature-saved.png` | « Signed by Dana Whitfield · … » affiché |
| 15 | « Sync now » sans `EXPO_PUBLIC_SYNC_URL` = **honnête** | **OK** | `11-sync-honest.png` / `12-offline.png` | message « Configure EXPO_PUBLIC_SYNC_URL to sync to your backend » ; bouton `aria-disabled=true` ; **aucune fausse réussite** |
| 16 | Simuler offline → badge **OFFLINE** | **OK** | `12-offline.png` | libellé « Offline » + point rouge |
| 17 | Simuler 4G → badge **ONLINE** | **OK** | `13-online.png` | libellé « Online » + point vert |
| 18 | Badge « N changes queued » | **OK** | `12-offline.png` | pastille jaune « 7 » à côté des boutons sync |
| 19 | Persistance après reload — file | **OK** | `14-after-reload.png` | file `pre=7 → post=7` (clés `fsi.jobs.v1`,`fsi.queue.v1`) |
| 20 | Persistance après reload — notes | **OK** | `14-after-reload.png` | notes restaurées (59 car.) |
| 21 | Persistance après reload — signature | **OK** | `14-after-reload.png` | « Signed by Dana Whitfield » toujours présent |
| 22 | Navigation liste↔détail (changement de job) | **OK** | `14-after-reload.png` | bascule vers WO-4823 « Fenwick Distribution » |
| — | **Zéro pageerror sur toute la session** | **OK** | — | total pageerrors=0 ; consoleErrors=0 |

## Confirmations exigées

- **Aucune vue vide** — chaque écran (liste, détail, sections checklist / photos / notes / signature) rend du contenu réel (cf. `01-load.png`, `10-signature-saved.png`).
- **Aucun bouton inerte** — chaque bouton exercé produit un effet observable (toggle, file, vignette, encre, badge). Le seul bouton « désactivé » (Sync now) l'est **à dessein** faute de backend configuré, et l'affiche via `aria-disabled`.
- **Sync honnête, jamais fausse** — sans `EXPO_PUBLIC_SYNC_URL`, l'app ne prétend jamais avoir synchronisé : message « Configure EXPO_PUBLIC_SYNC_URL… » + bouton désactivé + file conservée sur l'appareil.
- **Persistance vérifiée en réel** — après un vrai `reload`, la file (7), les notes et la signature survivent (`localStorage`).
- **Piège expo-camera** — écarté : 0 requête caméra au boot, module chargé uniquement derrière `import('expo-camera')` sur tap (path web = `<input type=file capture>`).

## Corrections / régénération

Aucune correction nécessaire : **22/22 contrôles OK, 0 CASSÉ, 0 pageerror**. Le code source (`apps/field-service-inspector.ts`) n'a donc **pas** été modifié et aucune régénération/re-validation officielle n'était requise (déclenchée uniquement « SI CASSÉ »).

Note harnais : le message de la barre de sync devient « Configure EXPO_PUBLIC_SYNC_URL… » dès qu'il y a des changements en file et pas de backend ; le décompte réel de la file se lit donc sur la pastille badge + la clé `fsi.queue.v1` (et non dans le texte du message) — c'est ce que fait `queuedCount()`.

## VERDICT : **COMPLET**

Field Service Inspector est certifié : tous les contrôles fonctionnent à 100 % en réel, l'état est réellement persisté, la synchronisation est honnête, et il n'y a aucun pageerror ni vue vide.
