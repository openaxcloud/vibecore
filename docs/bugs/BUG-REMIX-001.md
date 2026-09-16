---
id: BUG-REMIX-001
---

## Bug

**P0 fuite PII** — le masquage PII du remix Gallery laissait le **dernier groupe de l'IBAN en clair**. Un IBAN « masqué » restituait donc encore ses derniers caractères significatifs dans les fichiers clonés chez le remixeur, alors que la politique P0-V3-05 exige un masquage complet.

## 📤 Dispatché

✅

## 💻 Codé

✅ `022f23fc` (PR #89, merge `7aa677ff`)

## ✅ Testé live

☐

## Preuve

Verdict expert : **SIGNED, aucune réserve**. Correctif + observabilité : `maskPiiInFiles` expose `observations`, le checksum MOD-97 **étiquette** le masquage sans le conditionner, et un code pays hors registre ISO 13616 n'est **PAS** masqué mais **compté + journalisé** (log échantillonné 1/pays/fenêtre, **aucun fragment du candidat**, jamais l'IBAN en clair) pour que la table `IBAN_LENGTH_BY_COUNTRY` soit mise à jour plutôt que la fuite passe inaperçue — `services/api/src/remix-pii-metrics.ts`. Conflit de merge sur `app.ts` résolu **par merge et non rebase**, afin que le SHA signé reste ancêtre littéral de `main` (`git merge-base --is-ancestor 022f23fc origin/main` = vrai). Tests **73/73** (`remix-pipeline.spec.ts` + `gallery-routes.spec.ts`). ⚠️ Non rejoué en prod : ✅ à ne cocher qu'après vérification live post-déploiement.

