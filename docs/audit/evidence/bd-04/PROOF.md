# BD-04 — factures accessibles depuis la page billing — PREUVE LIVE

Env test `app.34.163.208.161.sslip.io`, image web **`9c372ebd33`** déployée, 2026-08-13. Jamais la prod.

## Constat
La page `/invoices` existe et rend l'endpoint `GET /orgs/:id/billing/invoices` (état honnête « Aucune facture … lorsque la facturation sera active », `stripeConfigured:false`), mais **`billing.tsx` ne la liait pas** — factures non découvrables depuis la page facturation.

## Correctif
Ajout d'un bouton d'action « Invoices/Factures » (→ `/invoices`) dans l'en-tête de `/billing`, réutilisant la copie existante `invoices.page.title` (En « Invoices » / Fr « Factures »).

## Preuve live (Playwright)
1. `/billing` (user QA fraîchement enregistré, cookie `vc_session`) → lien présent : `a[href="/invoices"]`, texte **« Factures »**.
2. Clic → navigation vers **`/invoices`** (titre « Factures - E-Code »), qui rend la liste des factures depuis l'endpoint réel.

**Verdict : FAIT_PROUVE** — factures affichées depuis l'endpoint, désormais accessibles depuis la page billing, prouvé à l'écran.
