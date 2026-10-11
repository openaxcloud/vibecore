---
id: BUG-QA1001-PRO-UNE-SEULE-PLACE
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Le forfait Pro (29 €/mois) n'avait qu'UNE place d'équipe — celle du propriétaire : un client qui paie ne
pouvait inviter personne.** Relevé le 2026-10-01 en mesurant l'invitation d'un collègue
(BUG-QA0930-INVITATION-SANS-PLACE) : `packages/billing` donnait `team.members` gratuit 1, **Pro 1**, Team 25.
Confirmé en production le même jour, en lecture seule : la table `Plan` porte `team.members = 1` pour `pro`.

**Décision d'Avi (2026-10-01)** : gratuit 1, **Pro 5**, Team 25.

## Cause

`billingPlans` (packages/billing/src/index.ts), forfait `pro` : `'team.members': 1`. Les limites du code
sont recopiées dans la table `Plan` à chaque démarrage de l'API (`seedBillingPlans`) : c'est ce chiffre qui
s'applique.

## 📤

☑ 01/10 branche `fix/forfait-pro-cinq-places`

## 💻

☐

## ✅

☐

## Preuve

`'team.members': 5` pour `pro`.
- Épinglé par `packages/billing/src/places-par-forfait.spec.ts` (gratuit 1, Pro 5, Team 25 ; prix Pro 2900 /
  Team 9900).
- Épinglé par `services/api/src/tests/forfait-pro-cinq-places.spec.ts` : de bout en bout, via la recopie au
  démarrage et la garde d'acceptation. Quatre collègues rejoignent une équipe Pro, le cinquième est refusé
  (429).
- Rouge avant : 429 dès le premier collègue. Contre-épreuve : Pro remis à 1 → rouge, après avoir vérifié que
  `@vibecore/billing` résout bien vers ce worktree.
- Suites : facturation 212 tests verts ; API 2 228 verts. Le seul rouge était un test sensible à la charge,
  vert seul (7/7).

**À vérifier en production après déploiement** : la ligne `Plan` `pro` doit porter `team.members = 5` (lecture
seule, même requête que le 01/10).
