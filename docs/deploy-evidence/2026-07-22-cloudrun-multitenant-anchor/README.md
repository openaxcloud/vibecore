# P0-A2-14 — seuils multi-tenant Cloud Run ancrés à GCP

**evidenceId :** `docs/deploy-evidence/2026-07-22-cloudrun-multitenant-anchor/`
Refus « contrats et seuils multi-tenant nommés inexistants » levé : le contrat
`CLOUDRUN_MULTITENANT_THRESHOLDS.md` **nomme** les seuils (concurrence, vCPU, mémoire,
timeout) et les **ancre verbatim** à la doc GCP autoritative `docs.cloud.google.com/run/quotas`
(`cloudrun-quotas.html`, sha256 `1809ead6…`). `anchor-cloudrun-limits.mjs --offline`
recalcule le hash et **échoue** si un seuil cité disparaît. PROVEN_REVIEW_PENDING.
