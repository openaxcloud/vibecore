---
id: BUG-QA1011-AVERTISSEMENT-SANS-SUPPRESSION
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**La tâche quotidienne d'inactivité envoie aux comptes gratuits inactifs l'e-mail « votre compte sera supprimé »,
alors que la suppression est coupée en production. C'est une alarme mensongère : rien ne supprime le compte, et le
client pourrait exporter son travail dans la précipitation.**

- `POST /internal/inactivity-gc` (CronJob `inactivity-gc`, tous les jours à 04:00 UTC, succès les 09, 10 et 11/10).
- La suppression dépend de `enabled` (`INACTIVITY_GC_ENABLED`), absent en production : elle tourne À BLANC. Mais
  l'étape « avertissement » (335 et 358 jours d'inactivité) envoyait l'e-mail sans regarder `enabled`.
- Ce mécanisme n'envoie aucun autre e-mail : couper l'avertissement ne coupe aucun message légitime.

## Combien de clients l'ont reçu (production, 2026-10-11, lecture seule)

**Aucun.** 0 compte marqué (`preferences.inactivityWarnings`), 0 ligne d'audit `account.inactivity_warning` ; témoin :
400 utilisateurs lus. Le plus ancien compte date du 2026-05-20 : personne n'a encore atteint 335 jours d'inactivité.
**Premier avertissement possible le 2027-04-25.** L'alarme était armée, elle n'a jamais sonné.

## Correctif (branche `fix/pas-d-avertissement-sans-suppression`)

L'e-mail d'avertissement ne part que si la suppression est active (`threshold != null && enabled`). La ligne d'audit
interne et le compteur `warned` restent. Le jour où la vraie suppression sera branchée, l'avertissement revient avec
elle, pas avant. **Touche `services/api/src/app.ts` (7 lignes).**

Épinglé par `services/api/src/tests/avertissement-sans-suppression.spec.ts` : suppression coupée, 1 e-mail envoyé
avant (rouge), 0 après ; contre-épreuve, suppression active, l'avertissement part (vert dans les deux cas). Tests voisins
(inactivité, cycle de vie du compte, session) : 22 sur 22.

## 📤

☑ décision du 2026-10-11

## 💻

☑ codé, non fusionné — branche `fix/pas-d-avertissement-sans-suppression`

## ✅

☐

## Preuve

Épinglé par `services/api/src/tests/avertissement-sans-suppression.spec.ts`.
