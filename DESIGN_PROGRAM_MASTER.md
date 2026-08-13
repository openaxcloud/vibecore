# DESIGN PROGRAM MASTER

Source de vérité des points design E-Code. Un point n'est terminé que lorsque les trois états sont prouvés séparément.

## Lot SOL-2026-07 — refonte des pages Solutions marketing

Spécification détaillée : `DESIGN_BATCH_SOLUTIONS_SPEC.md`. Validation live : `DESIGN_AUDIT_LIVE.md`.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| SOL-01 | App Builder — page de vente complète centrée sur une app de réservation | ✅ | ☐ | ☐ | Page et responsive vérifiés localement le 2026-07-14 (23/23 Playwright, 16 captures inspectées). Validation globale laissée ouverte : les captures IDE réelles montrent encore le violet de la première génération et le run capturé utilise un adaptateur mémoire sans DB/auth/email externe. Attente de validation Avi. |
| SOL-01-IMG | App Builder — intégrer des visuels produit utiles (réservation, agenda, clients/rappels), propriétaires, accessibles et adaptés clair/sombre | ✅ | ☐ | ✅ | Historique : quatre SVG vérifiés techniquement, puis refusés comme gabarit par Avi parce qu'ils restent des illustrations. Remplacés par SOL-01-IMG-REAL. |
| SOL-01-IMG-REAL | App Builder — remplacer les schémas par des captures navigateur réalistes distinctes en anglais et français, avec sélecteur de langue persistant | ✅ | ☐ | ✅ | Vérifié le 2026-07-13 : quatre captures produit EN + quatre FR, deux OG localisées, sélecteur persistant, données fictives signalées, dimensions/alt/lazy-loading contrôlés et 16 captures de page sans image blanche ni artefact sticky. |
| SOL-01-IDE-PROOF | App Builder — montrer un vrai workspace E-Code avec prompt soumis, travail de l'agent, fichiers créés et application active dans l'onglet Preview | ✅ | ☐ | ✅ | Vérifié localement le 2026-07-14 : vrais workspaces EN/FR, prompts exacts, historique Agent réel, 24/22 fichiers et Webview Preview active ; réparation réelle du routeur documentée, exports typecheck+build verts. Aucun composite. Limites DB/auth/email du run et données fictives signalées. |
| SOL-02 | Website Builder — page de vente complète centrée sur un site d'architecte | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-03 | Game Builder — page de vente complète centrée sur un quiz multijoueur | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-04 | Dashboard Builder — page de vente complète centrée sur un tableau de ventes connecté | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-05 | Chatbot / AI Agent Builder — page de vente complète centrée sur le support documentaire | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-06 | Internal AI Builder — page de vente complète centrée sur les procédures RH privées | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-07 | Enterprise — page de vente complète sous l'angle des équipes gouvernées | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-08 | Startups — page de vente complète sous l'angle fondateur/équipe produit | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |
| SOL-09 | Freelancers — page de vente complète sous l'angle livraison et transfert client | ☐ | ☐ | ☐ | En attente de validation du gabarit SOL-01 |

## Lot TPL-2026-07 — Gallery d'applications remixables

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| TPL-02.1 | Requalifier `/dashboard/templates` en Gallery d'applications communautaires publiées : carte riche, recherche, catégories, type d'artefact, technologies, tri, mise en avant, modération, signalement, aperçu fonctionnel et contrôle du remix | ✅ | ✅ `266fefac`/`e6afdfbf`/`c59674e8`/`3181b31f`/`d95108ae` | ✅ 24/07 (design) | Fonctionnel LIVE (17/07) **+ DESIGN validé LIVE 24/07** : matrice clair/sombre 390/768/1024/1440 (grille + détail, 16 captures) sur la prod déployée — **débordement=0 partout**, adaptation auto (grille 1→2→3 col, rail détail empilé↔latéral), **toutes cibles ≥44px** (fix `d95108ae` : recherche input/bouton 39→44, chips 36→44, CTA/liens détail). `docs/deploy-evidence/2026-07-24-gallery-responsive/`. « aperçu embarqué » = décision E-CODE de NE PAS faire (lien sortant, `UNK-GALLERY-EMBED-PREVIEW`). |
| TPL-02.2 | Remix/Fork isolé : nouveau projet/propriétaire/repo/workspace/locks, copie fichiers+config, aucun secret, données isolées, provenance source et analyse Agent post-remix | ✅ | ✅ `266fefac`/`3181b31f`/`d95108ae` | ✅ 24/07 | Core LIVE (17/07) **+ reste levé 24/07** : **(a)** clic-connecté « Remix » → **IDE réel dans le navigateur** (`e-code.ai/@qa-handoff-org/…`, IDE propre, 7 fichiers du snapshot), DB confirme clone dans l'org du remixeur, `RemixJob COMPLETED` épinglé listing+snapshot, `secrets=0`, `useCount=1`. **(b)** test secret-absent **EXHAUSTIVE** (`gallery-routes.spec.ts`) : recherche active dans **fichiers+DB+env+logs+job**, introuvable partout (balayage non-vacant), **20/20 verts**. `docs/deploy-evidence/2026-07-24-gallery-responsive/`. |
| TPL-02.3 | Hub Import avec 12 sources : GitHub (dont import express), Bitbucket, Vercel, Figma, Claude, Bolt, Lovable, Base44, ZIP, Spreadsheet, Previous Agent export et Empty | ✅ | ☐ | ☐ | Validation avant import, progression, erreurs récupérables, runtime/secrets/config détectés et aperçu avant création. Screenshot exclu des providers. |
| TPL-02.4 | Projet vide sans Agent, framework ni scaffolding pour power users | ✅ | ☐ | ☐ | Création directe réelle et IDE utilisable attendus. |
| TPL-02.5 | Convertir les 6 starters historiques en applications de démonstration publiées/remixables et/ou fixtures E2E de non-régression | ✅ | ☐ | ☐ | Aucune carte Python/Go/Rust ; runtime multilangage hors scope tant qu'il n'est pas prouvé. |
| TPL-02.PROOF | Prouver séparément prompt, import et remix : vrai projet → IDE → runtime → Preview → publication possible | ✅ | ☐ | ☐ | Captures et rapports live requis avant validation. |

## Lot TASK3-2026-07 — File History + Agent Skills ouvert

Spécification de référence : `outputs/REPLIT_PARITY.md`, documentation Replit File History et standard `agentskills.io/specification` consultés le 2026-07-15.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| RPL-FH-001.1 | Bouton History en bas à droite et panneau autonome indépendant de Git | ✅ | ☐ | ☐ | Ouverture réelle depuis un fichier texte attendue |
| RPL-FH-001.2 | Navigation versions par slider, flèches UI et clavier ←/→ | ✅ | ☐ | ☐ | Trois modes d'entrée à valider |
| RPL-FH-001.3 | Compare Latest en diff inline | ✅ | ☐ | ☐ | Ajouts/suppressions réels attendus |
| RPL-FH-001.4 | Restore append-only sans perte d'historique | ✅ | ☐ | ☐ | Nouvelle version et anciennes versions à prouver |
| RPL-FH-001.5 | Playback play/pause/progression/vitesse | ✅ | ☐ | ☐ | Lecture réelle à l'écran attendue |
| RPL-FH-001.6 | File History responsive, accessible, loading/error/retry | ✅ | ☐ | ☐ | Captures web/tablette/mobile attendues |
| RPL-SK-001.1 | Skills interopérables `.agents/skills/<name>/SKILL.md` | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Codé + testé local : `skill-manifest.ts` (parser strict frontmatter name+description, allowed-tools, metadata, body, ressources ; name==dossier) + skill réel livré `.agents/skills/commit-helper/` (SKILL.md + references/). 14 tests unitaires verts. **Reste** : merge main + captures responsive live. |
| RPL-SK-001.2 | Progressive disclosure name+description → body → ressources | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Codé + prouvé local : `skill-disclosure.ts` L1/L2/L3, callbacks appelés au plus une fois à la demande + trace ordonnée. Script `skill-audit-proof.ts` imprime la trace `L1 → L2 → L3` (ne monte qu'après demande). 4 tests. **Reste** : merge main + live. |
| RPL-SK-001.3 | Catalogue externe audité avec quarantaine, findings et approbation | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Codé + prouvé local : `skill-audit.ts` fail-closed rejected/quarantined/approved ; route d'install **refuse un malveillant (HTTP 422)**, rien persisté ; journal append-only `SkillAuditEvent` (mig 0079) ; endpoint approve. 8 tests audit + 5 tests d'intégration API (malveillant refusé end-to-end, quarantaine→approve). Pas de faux positif OWASP (test dédié). **Reste** : merge main + live. |
| RPL-SK-001.4 | UI Skills avec provenance, état d'audit, enable/disable/revoke | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Codé : panneau Skills avec provenance (origin, sha256, manifest, ressources), badge de verdict, findings, boutons Approve/**Revoke**, journal d'audit ; store fail-closed (revoked/rejected → re-enable 409, testé). Web tsc + lint verts. **Reste** : captures responsive 390/768/1024/1440 clair+sombre (desktop/tablette/mobile) + merge main. |

## Lot RPL-IDE-2026-07 — Project Editor Window → Panes → Tabs + Tools dock

Spécification de référence : `outputs/REPLIT_PARITY.md` et documentation Replit `editor-and-tools.md`. Scope interdit : déploiement, Kubernetes, `workspace-manager` et runtime Nix.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| RPL-IDE-001.1 | Une Window (onglet navigateur) contient un ou plusieurs panes et peut être ouverte dans une nouvelle window | ✅ | ☐ | ☐ | Action réelle depuis Options + état cohérent multi-écrans attendu |
| RPL-IDE-001.2 | Un pane contient un ou plusieurs tabs, supporte split horizontal/vertical et redimensionnement | ✅ | ☐ | ☐ | Captures et interactions web/tablette/mobile attendues |
| RPL-IDE-001.3 | Un pane peut passer en position flottante puis revenir en position fixe | ✅ | ☐ | ☐ | Capture du pane flottant + retour docké attendue |
| RPL-IDE-001.4 | Un tab contient exactement un outil, se réordonne et se déplace entre panes | ✅ | ☐ | ☐ | Déplacement réel d'un tab d'un pane à l'autre attendu |
| RPL-IDE-001.5 | Tools dock gauche avec raccourcis et popup All tools recherchable ouvrant l'outil dans un tab | ✅ | ☐ | ☐ | Recherche et ouverture d'un outil réel attendues |
| RPL-IDE-001.6 | Menu Options (⋮) en haut à droite du tab actif pour gérer window, pane et tab | ✅ | ☐ | ☐ | Actions réelles visibles et accessibles au clavier attendues |
| RPL-IDE-001.7 | Resources panel à côté du nom de l'app avec RAM, CPU et Storage réels | ✅ | ☐ | ☐ | Valeurs chargées, loading/error state et capture attendues |
| RPL-IDE-001.8 | Spotlight page ouverte en cliquant le nom du projet | ✅ | ☐ | ☐ | Ouverture/fermeture réelle et capture attendues |
| RPL-IDE-001.9 | Terminologie UI : « Project Editor » pour l'IDE ; « Workspace » réservé à l'espace organisationnel | ✅ | ☐ | ☐ | Greps de contrôle + vérification à l'écran attendus |
| RPL-IDE-001.10 | Layout responsive et utilisable sur web, tablette et mobile | ✅ | ☐ | ☐ | Captures avant/après aux trois formats, sans overflow ni preview blanche attendues |
