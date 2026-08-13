# Audit des 96 WebP importés — Solutions

Date : 12 août 2026
Périmètre : Website EN, Game EN/FR, Dashboard FR sous `public/assets/solutions`.

## Verdict

**NON admissibles comme preuve finale.** Les 96 fichiers passent l’intégrité binaire, mais 28 chemins échouent à l’inspection visuelle et aucun des quatre lots ne possède un manifeste de capture réussi. Chaque répertoire historique possède au contraire un `capture-failure.txt`. Les fichiers ont été conservés tels quels.

| Contrôle                                            |                                         Résultat |
| --------------------------------------------------- | -----------------------------------------------: |
| WebP décodables                                     |                                            96/96 |
| Dimensions                                          |                      48 × 1440×900; 48 × 720×450 |
| Poids                                               |    19 566–110 022 octets; total 5 880 334 octets |
| Entropie Sharp                                      | 2,764786–6,058706; 0 sous le seuil non-blanc 0,5 |
| SHA-256 uniques                                     |                                 96/96; 0 doublon |
| Correspondance avec le commit historique `5c75f9b9` |                                      96/96 blobs |
| Paires light/dark réellement différentes            |                      48/48; MAE 90.3751–219.6051 |
| Dérivés 720/1440 cohérents                          |                          48/48; MAE moyen 3.1285 |
| Manifeste/provenance de succès                      |                                          **0/4** |
| Lots avec échec de capture historique               |                                          **4/4** |

## Correspondance projet/langue

| Lot                  | Visuel observé                         | Langue   | Verdict visuel                                                                               | Verdict preuve finale                                       |
| -------------------- | -------------------------------------- | -------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Website Builder EN   | Meridian Studio, site d’architecture   | anglais  | PASS                                                                                         | REJETÉ — Webview historique vide, aucun manifeste de succès |
| Game Builder EN      | TriviaClash, quiz interactif           | anglais  | PASS                                                                                         | REJETÉ — erreur console HTTP 412, aucun manifeste de succès |
| Game Builder FR      | TriviaClash, quiz interactif           | français | **FAIL** — statut `Reconnecting` sur le lot; écran de démarrage dans `light/ide-agent-files` | REJETÉ                                                      |
| Dashboard Builder FR | PipelineIQ, tableau de bord commercial | français | **FAIL** — quatre variantes `ide-agent-files` montrent un éditeur vide                       | REJETÉ — Webview historique vide                            |

Les 48 sources 1440 ont été inspectées visuellement; les 48 fichiers 720 ont été contrôlés comme dérivés cohérents de leurs sources 1440.

## Provenance historique

Source retrouvée : worktree `/Users/hb/dev/vibecore-solutions-real-proof-20260802`, commit `5c75f9b9c1c0067071747b06ecdb458248b339a5`. Les 96 blobs importés correspondent exactement au commit. Aucun manifeste de succès ni fichier de provenance n’a été trouvé à côté des lots. Quatre fichiers de session existent, mais contiennent des secrets : seul le `projectId` a été repris dans le JSON d’audit.

- Website EN — projet `cmsh6simb04gb0oeltvt0wf3r`, workspace `ws-1a9a3d5fa5f7b995` : `The native Webview stayed empty after refresh and official runtime URL recovery`.
- Game EN — projet `cmsh63sae043q0oelnyzt2j6a` : erreur console, `ide-state` HTTP 412.
- Game FR — projet `cmsh8alpr04y00ndj2th4ak4q`, workspace `ws-7ad42964fda58a1a` : `Dependency sync skipped before preview: Remote runtime request failed: 404`.
- Dashboard FR — projet `cmsh63r6q043p0oelk3pgn9ql`, workspace `ws-a65a0017fc695e7b` : `The native Webview stayed empty after refresh and official runtime URL recovery`.

## Chemins échouant visuellement

- `public/assets/solutions/dashboard-builder/fr/dark/ide-agent-files-1440.webp` — Selected vite.config.ts editor/work area is blank; this slot is not meaningful project evidence.
- `public/assets/solutions/dashboard-builder/fr/dark/ide-agent-files-720.webp` — Selected vite.config.ts editor/work area is blank; this slot is not meaningful project evidence.
- `public/assets/solutions/dashboard-builder/fr/light/ide-agent-files-1440.webp` — Selected vite.config.ts editor/work area is blank; this slot is not meaningful project evidence.
- `public/assets/solutions/dashboard-builder/fr/light/ide-agent-files-720.webp` — Selected vite.config.ts editor/work area is blank; this slot is not meaningful project evidence.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-files-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-files-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-iteration-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-iteration-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-preview-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-preview-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-prompt-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-agent-prompt-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-webview-iteration-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-webview-iteration-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-webview-overview-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/dark/ide-webview-overview-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-files-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state; Webview startup/loading panel captured instead of the project.
- `public/assets/solutions/game-builder/fr/light/ide-agent-files-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state; Webview startup/loading panel captured instead of the project.
- `public/assets/solutions/game-builder/fr/light/ide-agent-iteration-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-iteration-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-preview-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-preview-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-prompt-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-agent-prompt-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-webview-iteration-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-webview-iteration-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-webview-overview-1440.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.
- `public/assets/solutions/game-builder/fr/light/ide-webview-overview-720.webp` — IDE status visibly shows Reconnecting; not a stable final-proof state.

## Tous les chemins rejetés par la provenance

Les 96 chemins exacts sont énumérés dans `assets-imported-audit.json`, sous `provenance.rejectedAssetPaths`. Aucun fichier n’a été supprimé ou remplacé.
