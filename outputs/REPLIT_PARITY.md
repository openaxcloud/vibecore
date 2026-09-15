# Replit parity deltas — app/ IDE chrome (live compare vs Henri's Replit)

Reuse-first (E-Code is a bolt.diy fork). Legend: 📤 not started · 💻 present/partial, needs Avi's live re-check · ✅ done+proven. Avi re-verifies each live against Replit.

## RPL-FH-001 — File History indépendant de Git — 📤 dispatché

Source : [Replit — File History](https://docs.replit.com/features/version-control/file-history), consultée le 2026-07-15.

| Point | 📤 Dispatché | 💻 Codé (commit+pushed main) | ✅ Testé live (écran+greps web/tablette/mobile) | Preuve attendue |
|---|:---:|:---:|:---:|---|
| RPL-FH-001.1 — Bouton History en bas à droite du fichier texte ouvert et panneau autonome | ✅ | ⬜ | ⬜ | Ouverture/fermeture réelle sans dépendance au panneau Git |
| RPL-FH-001.2 — Navigation par slider, boutons précédent/suivant et touches ←/→ | ✅ | ⬜ | ⬜ | Même version sélectionnée avec les trois entrées |
| RPL-FH-001.3 — Compare Latest affiche un diff inline vers la dernière version | ✅ | ⬜ | ⬜ | Ajouts/suppressions visibles sur un fichier réellement modifié |
| RPL-FH-001.4 — Restore append-only crée une nouvelle version sans effacer l'historique | ✅ | ⬜ | ⬜ | Compteur, contenu et anciennes versions vérifiés avant/après |
| RPL-FH-001.5 — Playback rejoue réellement les versions comme un film | ✅ | ⬜ | ⬜ | Play/pause/progression/vitesse vérifiés à l'écran |
| RPL-FH-001.6 — Responsive, accessible et récupérable | ✅ | ⬜ | ⬜ | Web/tablette/mobile, clavier, loading/error/retry, zéro overflow |

## RPL-SK-001 — Agent Skills ouvert + audit sécurisé — 📤 dispatché

Sources : [Agent Skills Specification](https://agentskills.io/specification), [guide d'implémentation](https://agentskills.io/client-implementation/adding-skills-support), [Replit — Agent Skills](https://docs.replit.com/references/agent/skills) et [Replit — sécurité des skills](https://docs.replit.com/learn/agent-skills), consultées le 2026-07-15.

| Point | 📤 Dispatché | 💻 Codé (commit+pushed main) | ✅ Testé live (écran+greps web/tablette/mobile) | Preuve attendue |
|---|:---:|:---:|:---:|---|
| RPL-SK-001.1 — Découverte interopérable dans `.agents/skills/<name>/SKILL.md` | ✅ | ⬜ | ⬜ | Skill standard créé et lu depuis le workspace réel |
| RPL-SK-001.2 — Validation du frontmatter standard et diagnostics exploitables | ✅ | ⬜ | ⬜ | name/description requis, contraintes et cas invalides testés |
| RPL-SK-001.3 — Catalogue name+description seulement ; corps chargé à l'activation | ✅ | ⬜ | ⬜ | Test/trace prouvant l'absence du body dans le catalogue |
| RPL-SK-001.4 — Ressources chargées à la demande et confinées au dossier du skill | ✅ | ⬜ | ⬜ | scripts/references/assets lisibles ; traversée refusée |
| RPL-SK-001.5 — Skills externes en quarantaine jusqu'à audit et approbation | ✅ | ⬜ | ⬜ | Injection/exfiltration/code, provenance/hash, approve/reject/revoke |
| RPL-SK-001.6 — Catalogue audité, états clairs et journal d'audit | ✅ | ⬜ | ⬜ | Aucun skill non approuvé activable ; événement d'audit vérifié |

## RPL-IDE-001 — Project Editor Window → Panes → Tabs + Tools dock — 📤 dispatché

Source de référence : [Replit — Editor & Tools](https://docs.replit.com/references/editor/editor-and-tools.md), variante Markdown consultée le 2026-07-15. Scope interdit : déploiement, Kubernetes, `workspace-manager` et runtime Nix.

| Point | 📤 Dispatché | 💻 Codé (commit+pushed main) | ✅ Testé live (écran+greps web/tablette/mobile) | Preuve attendue |
|---|:---:|:---:|:---:|---|
| RPL-IDE-001.1 — Une Window (onglet navigateur) contient un ou plusieurs panes et peut être ouverte dans une nouvelle window | ✅ | ⬜ | ⬜ | Action réelle depuis Options + état cohérent multi-écrans |
| RPL-IDE-001.2 — Un pane contient un ou plusieurs tabs, supporte split horizontal/vertical et redimensionnement | ✅ | ⬜ | ⬜ | Captures et interactions web/tablette/mobile |
| RPL-IDE-001.3 — Un pane peut passer en position flottante puis revenir en position fixe | ✅ | ⬜ | ⬜ | Capture du pane flottant + retour docké |
| RPL-IDE-001.4 — Un tab contient exactement un outil, se réordonne et se déplace entre panes | ✅ | ⬜ | ⬜ | Déplacement réel d'un tab d'un pane à l'autre |
| RPL-IDE-001.5 — Tools dock gauche avec raccourcis et popup All tools recherchable ouvrant l'outil dans un tab | ✅ | ⬜ | ⬜ | Recherche et ouverture d'un outil réel |
| RPL-IDE-001.6 — Menu Options (⋮) en haut à droite du tab actif pour gérer window, pane et tab | ✅ | ⬜ | ⬜ | Actions réelles visibles et accessibles au clavier |
| RPL-IDE-001.7 — Resources panel à côté du nom de l'app avec RAM, CPU et Storage réels | ✅ | ⬜ | ⬜ | Valeurs chargées, loading/error state et capture |
| RPL-IDE-001.8 — Spotlight page ouverte en cliquant le nom du projet | ✅ | ⬜ | ⬜ | Ouverture/fermeture réelle et capture |
| RPL-IDE-001.9 — Terminologie UI : « Project Editor » pour l'IDE ; « Workspace » réservé à l'espace organisationnel | ✅ | ⬜ | ⬜ | Greps de contrôle + vérification à l'écran |
| RPL-IDE-001.10 — Layout responsive et utilisable sur web, tablette et mobile | ✅ | ⬜ | ⬜ | Captures avant/après aux trois formats, sans overflow ni preview blanche |

## 1. Composer — standalone Plan toggle beside model/Power — ✅ (`ba0c51f6`)
Decision: split Plan out as a standalone toggle (Replit) instead of a dropdown mode.
- `ChatBoxModeDropdown` is now Agent/Assistant only; a visible **Plan** toggle sits beside it, sharing the SAME `projectPlanFirst` state (`planFirstEnabled`/`onPlanFirstChange` — no duplicated state). Off = neutral like the mode trigger; on = blue action-accent pressed.
- Plan-first behavior unchanged (system-prompt gate BaseChat.tsx:1740). Tests 8/8 (toggle press states + dropdown no longer has a Plan mode). Proof (composer replica, exact CSS): standalone toggle, neutral off / blue-accent on.
- ⚠️ Re-verify live: exact placement order vs Replit (model · Power · Plan).

## 2. IDE top bar — Invite + Republish — ✅ (`e9c95502`)
- **Invite**: visible outline button → existing `collaborators` panel (already hosts invite-by-email + expirable share link, F14). Dropped the redundant icon-only dropdown.
- **Republish**: Publish→Republish once ≥1 deployment (`getProject` now counts `_count.deployments`; threaded via IDE loader). Proof (desktop replica): Invite visible; 0→"Publish", ≥1→"Republish".
- ⚠️ Re-verify live: Invite placement/order vs Replit.

## 3. Files panel — keep name "Files", compact density — 💻 interim (`da750d5b`)
Kept "Files" (no rename). Compacted rows toward Replit: **28→24px** height, **14→13px** font, margin 10→8 (desktop rule only; mobile override untouched). Proof (tree replica): rowHeight=24, font=13px.
- ⚠️ **Final tuning pending Avi's Replit "Library" reference screenshot** (row height, indent per level, icon size, header padding, hover). No ref image in `outputs/` yet → this is a best-effort interim; will match to the pixel once the ref lands.

## 4. Project cards — status overlay on thumbnail — ✅ (`266d8285`)
Decision: status as a translucent overlay chip in the thumbnail corner (Replit), not a header pill.
- Dropped the header `StatusPill` (kept the ⋯ menu); render a `bg-black/55` + `backdrop-blur` chip top-right of the preview (z-2 above the P11 image), green dot for ready/running/active/live else neutral. `StatusPill` stays exported for other callers. Applies to Dashboard + Projects + Recent (shared `ProjectGridCard`).
- Real thumbnail itself = **P11** (tracked separately: `previewImageUrl` → `/api/projects/:id/homepage-preview`). Proof (card replica): chip on thumbnail corner, z-index 2.
- ⚠️ Re-verify live: chip corner/colors + real P11 image vs Replit.

---
Nothing claimed "done" globally — Avi re-verifies live. #1/#2/#4 committed+proven; #3 is a proven interim awaiting the reference image.
