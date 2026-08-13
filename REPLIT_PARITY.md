# REPLIT PARITY

> **Fichier de suivi LIVE** (parité fonctionnelle Replit Gallery), un des 4 fichiers de suivi du `CLAUDE.md` (avec `DESIGN_PROGRAM_MASTER.md`, `BUG_INVENTORY_LIVE.md`, `PLAN_REMAINING_UNIFIED.md`). NE PAS confondre avec l'**audit historique** `docs/REPLIT_PARITY_{DELIVERY,MATRIX,SPEC}.md` (snapshot 2026-06-17, figé). Ce fichier-ci est le suivi courant.

Cette mission suit la parité fonctionnelle et visuelle avec la Replit Gallery actuelle : des applications communautaires publiées à voir et remixer, pas des starters par langage/framework.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve |
|---|---|:---:|:---:|:---:|---|
| TPL-02.1 | Gallery d'applications publiées : cartes riches, recherche, catégories, artefacts, technologies, tri, featured, modération, signalement, preview et permission de remix | ✅ | ✅ `266fefac`/`e6afdfbf`/`c59674e8`/`3181b31f` | ✅ 17/07 | Prouvé LIVE prod : curation admin 201 → browse anonyme (`GET /gallery`=200, total=1) → détail (vues 0→3) → grille+détail UI rendus. `docs/deploy-evidence/2026-07-17-gallery/README.md` + `GALLERY_COMMUNITY_CONTRACT.md §C`. NB « preview embarquée » = décision E-CODE de NE PAS faire (View App = lien sortant, fidèle à Replit, `UNK-GALLERY-EMBED-PREVIEW`). |
| TPL-02.2 | Remix/Fork complet avec isolation, provenance et analyse Agent | ✅ | ✅ `266fefac`/`3181b31f` | 🟡 core prouvé | Prouvé LIVE : remix par un AUTRE user → clone dans l'org du remixeur, `RemixJob COMPLETED` épinglé `sourceSnapshotId`+`sourceListingId`, clone=7 fichiers du snapshot, `secrets:[]` (DB live), `useCount=1`. **Reste** : le clic-connecté « Remix » → IDE en navigateur (handoff Chrome d'Avi, comme PUBLISH-UI-01) ; secret-absent exhaustif fichiers+DB+job = test `gallery-routes.spec.ts`. |
| TPL-02.3 | Hub Import à 12 sources avec validation et aperçu avant création | ✅ | ☐ | ☐ | Sources vérifiées sur la documentation Replit ; screenshot exclu des providers. |
| TPL-02.4 | Projet vide sans Agent, framework ni scaffolding | ✅ | ☐ | ☐ | Voie power-user réelle à conserver. |
| TPL-02.5 | Six starters historiques requalifiés en apps de démo/fixtures | ✅ | ☐ | ☐ | Aucune carte Python/Go/Rust. |
| TPL-02.PROOF | Prompt + import + remix → IDE → runtime → Preview → publiable | ✅ | ☐ | ☐ | Aucun push avant validation des captures par Avi. |
