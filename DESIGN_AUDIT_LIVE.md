# DESIGN AUDIT LIVE

Un point ne passe dans la colonne « Testé live » qu'après vérification à l'écran, greps de contrôle et captures clair/sombre à 390, 768, 1024 et 1440 px.

| ID | Point | 📤 Dispatché | 💻 Codé | ✅ Testé live | Preuve live |
|---|---|:---:|:---:|:---:|---|
| SOL-01 | App Builder | ✅ | ☐ | ☐ | Page et responsive validés localement (23/23 Playwright, 16 captures inspectées), mais validation globale maintenue ouverte : les captures IDE authentiques montrent encore le thème violet de la première génération et le run documenté utilise un adaptateur mémoire sans DB/auth/email externe. Attente de validation Avi. |
| SOL-01-IMG | Visuels de démonstration App Builder | ✅ | ☐ | ✅ | Historique technique conservé : les SVG passaient les contrôles, mais ne répondent pas au niveau de réalisme attendu. |
| SOL-01-IMG-REAL | Captures navigateur bilingues App Builder | ✅ | ☐ | ✅ | Vérifié à l’écran et par greps le 2026-07-13 : 8 PNG produit, 2 OG, interfaces et légendes localisées, sélecteur EN/FR persistant, `loading`/dimensions/alt, zéro ancien SVG ou domaine `salon-demo.ecode.app` ; 16 captures finales sans blanc ni header dupliqué. |
| SOL-01-IDE-PROOF | Preuve réelle prompt → agent → Preview | ✅ | ☐ | ✅ | Vérifié localement le 2026-07-14 : captures EN/FR issues de vrais workspaces E-Code, prompts exacts visibles, réponse Agent, 24 fichiers EN / 22 fichiers FR, app active dans Webview Preview, réparation réelle du routeur, exports indépendants typecheck+build verts. La page divulgue que ces runs n'ont ni DB/auth/email externe. Matrice page 23/23 et 16 captures responsive inspectées. |
| SOL-02 | Website Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-03 | Game Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-04 | Dashboard Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-05 | Chatbot / AI Agent Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-06 | Internal AI Builder | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-07 | Enterprise | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-08 | Startups | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| SOL-09 | Freelancers | ☐ | ☐ | ☐ | En attente de validation SOL-01 |
| TPL-02.1 | Gallery d'applications publiées/remixables `/dashboard/templates` | ✅ | ✅ `d95108ae` | ✅ 24/07 | Matrice clair/sombre 390/768/1024/1440 (grille + détail) capturée LIVE sur prod déployée : **16 captures**, débordement horizontal=0 partout, adaptation auto (grille 1→2→3 col, rail détail empilé↔latéral), **toutes cibles ≥44px** (fix : recherche/chips 39-36→44, CTA/liens détail min-h-44). `docs/deploy-evidence/2026-07-24-gallery-responsive/shots/`. |
| TPL-02.2 | Remix/Fork isolé avec provenance | ✅ | ✅ `d95108ae` | ✅ 24/07 | Clic-connecté « Remix » → **IDE réel navigateur** (`@qa-handoff-org/…`, IDE propre 7 fichiers), clone dans l'org du remixeur, `RemixJob COMPLETED` épinglé listing+snapshot, `secrets=0`, `useCount=1` ; **test secret-absent EXHAUSTIVE** (fichiers+DB+env+logs+job) 20/20. `docs/deploy-evidence/2026-07-24-gallery-responsive/`. |
| TPL-02.3 | Hub Import — 12 sources | ✅ | ☐ | ☐ | Chaque connecteur doit exposer validation, progression, récupération d'erreur, détections et aperçu avant création ; screenshot absent. |
| TPL-02.4 | Projet vide sans Agent/scaffold | ✅ | ☐ | ☐ | Voie power-user à vérifier réellement jusqu'à l'IDE. |
| TPL-02.5 | 6 starters historiques requalifiés en démos/fixtures | ✅ | ☐ | ☐ | Aucune carte de framework Python/Go/Rust ; scénarios de non-régression à exécuter. |
| TPL-02.PROOF | Prompt, import et remix publiables | ✅ | ☐ | ☐ | Trois vrais projets distincts → IDE → runtime → Preview → publish, avec captures. |
| RPL-SK-001.1 | Skills interop `.agents/skills/<name>/SKILL.md` | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Parser + skill réel `commit-helper` prouvés local (14 tests, script `skill-audit-proof.ts`). À vérifier live après merge/deploy : chargement d'un skill workspace réel. |
| RPL-SK-001.2 | Progressive disclosure L1→L2→L3 tracée | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Trace `L1 → L2 → L3` à la demande prouvée local (4 tests + script). À rejouer live. |
| RPL-SK-001.3 | Audit + quarantaine + findings + approbation | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | Malveillant **refusé (422)** + journal prouvés local (8+5 tests). À rejouer live sur prod (install refusé à l'écran + journal d'audit). |
| RPL-SK-001.4 | UI Skills provenance / audit / enable-disable-revoke | ✅ | 🟡 `a961c1d0` PR #58 | ☐ | UI codée (badges verdict, findings, Approve/Revoke, journal). **Captures responsive 390/768/1024/1440 clair+sombre du panneau non prises** — bloquant pour ✅ Testé live. |
