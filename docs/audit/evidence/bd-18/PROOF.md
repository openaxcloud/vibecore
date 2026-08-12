# BD-18 — nav marketing publicMarketingMenus — PREUVE

Env test `app.34.163.208.161.sslip.io`, base origin/main `722a224c`, 2026-08-12.

Constat: registry périmé. `publicMarketingMenus` (SaaSLayout.tsx:156) EST rendu dans `PublicShell` (dropdowns lignes 693-708), utilisé par les routes marketing.

Preuve live (Playwright, home `/`):
- Les 4 groupes de nav rendent : **Produit, Solutions, Ressources, Entreprise**.
- Le dropdown « Produit » expose les liens réels de `publicMarketingMenus.product` : `/ai-agent, /mobile, /desktop, /collaboration, /mcp, /polyglot, /marketplace`.

Verdict: FAIT_PROUVE — menu rendu (pas de code mort).
