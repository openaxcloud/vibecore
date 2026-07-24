# REPLIT PARITY

> **Fichier de suivi LIVE** (parité fonctionnelle Replit Gallery), un des 4 fichiers de suivi du `CLAUDE.md` (avec `DESIGN_PROGRAM_MASTER.md`, `BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`). NE PAS confondre avec l'**audit historique** `docs/REPLIT_PARITY_{DELIVERY,MATRIX,SPEC}.md` (snapshot 2026-06-17, figé). Ce fichier-ci est le suivi courant.

Cette mission suit la parité fonctionnelle et visuelle avec la Replit Gallery actuelle : des applications communautaires publiées à voir et remixer, pas des starters par langage/framework.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| TPL-02.1 | Gallery d'applications publiées : cartes riches, recherche, catégories, artefacts, technologies, tri, featured, modération, signalement, preview et permission de remix | ✅ | ✅ `266fefac`/`e6afdfbf`/`c59674e8`/`3181b31f`/`d95108ae` | ✅ 17/07 (fonctionnel) + 24/07 (design) | Fonctionnel LIVE (17/07). **Design responsive validé LIVE (24/07)** : matrice grille+détail × 390/768/1024/1440 × clair+sombre (16 captures), débordement=0 partout, grille 1→2→3 col, rail détail empilé↔latéral, **cibles ≥44px** (fix `d95108ae` : recherche/chips 39-36→44). `docs/deploy-evidence/2026-07-24-gallery-responsive/`. NB « preview embarquée » = décision E-CODE de NE PAS faire (View App = lien sortant, `UNK-GALLERY-EMBED-PREVIEW`). |
| TPL-02.2 | Remix/Fork complet avec isolation, provenance et analyse Agent | ✅ | ✅ `266fefac`/`3181b31f`/`d95108ae` | ✅ 24/07 | Core LIVE (17/07) + **reste levé (24/07)** : **(a) handoff clic-connecté prouvé** — session authentifiée (cookie `vc_session`), clic « Remix this app » → **redirection réelle vers l'IDE** `e-code.ai/@qa-handoff-org/…`, IDE chargé propre (arborescence = 7 fichiers du snapshot épinglé), DB : clone dans l'org du remixeur, `RemixJob COMPLETED` épinglé listing+snapshot, `secrets=0`, `useCount=1`. **(b) test secret-absent EXHAUSTIVE** dans `gallery-routes.spec.ts` : cherche activement un vrai secret+valeur d'env dans **fichiers+DB+env+logs+job** et échoue à les trouver (balayage complet non-vacant), **20/20 verts**. `docs/deploy-evidence/2026-07-24-gallery-responsive/README.md`. |
| TPL-02.3 | Hub Import à 12 sources avec validation et aperçu avant création | ✅ | ☐ | ☐ | Sources vérifiées sur la documentation Replit ; screenshot exclu des providers. |
| TPL-02.4 | Projet vide sans Agent, framework ni scaffolding | ✅ | ☐ | ☐ | Voie power-user réelle à conserver. |
| TPL-02.5 | Six starters historiques requalifiés en apps de démo/fixtures | ✅ | ☐ | ☐ | Aucune carte Python/Go/Rust. |
| TPL-02.PROOF | Prompt + import + remix → IDE → runtime → Preview → publiable | ✅ | ☐ | ☐ | Aucun push avant validation des captures par Avi. |
