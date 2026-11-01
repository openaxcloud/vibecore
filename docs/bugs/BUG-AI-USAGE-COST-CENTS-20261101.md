---
id: BUG-AI-USAGE-COST-CENTS-20261101
---

# Estimation IA artificiellement à zéro

## 📤 Dispatché

☑ 01/11 — observation parent : 294781 jetons entrants, 696641 sortants, estimation $0.0000. Aucun nouveau prompt ni paiement effectué.

## 💻 Codé

☐ Non fusionné. Correctif sur branche audit/launch-evidence-20261101 : lire costCents, convertir en USD, distinguer estimation absente/incomplète de zéro explicite. Périmètre organisation/tous projets/30 jours indiqué. Aucun crédit modifié.

## ✅ Testé live

☐ Pas de recette production après correction. Contrat API et défaut UI reproduits localement ; 11 tests de calcul, 2 tests i18n réussis. Voir docs/qa/ai-usage-cost-units-20261101.md et matrice docs/qa/launch-20261101/README.md.
