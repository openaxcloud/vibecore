---
id: BUG-PROVIDER-QUOTA-CLASSIFICATION-20261026
section: "Génération et orchestration"
---

# Une limite de débit ne prouve pas un crédit fournisseur épuisé

## 📤 Dispatché

☑ 26/10 — diagnostic sur main `90d92ff12`.
## 💻 Codé

☐ — correctif local testé ; non fusionné et non déployé.
## ✅ Testé live

☐ — aucune invocation fournisseur ni lecture de solde.

## Reproduction isolée

La fonction réelle `classifyProviderFailure` classe une erreur HTTP 429 portant
`RESOURCE_EXHAUSTED: quota exceeded for requests per minute` comme `credit`.
Les expressions génériques `quota exceeded` et `resource_exhausted` sont
évaluées avant le statut 429. Cette classification alimente le motif du repli
affiché ; elle ne constitue pas une mesure de crédit.

Les captures utilisateur signalent également un modèle de secours différent
du libellé du bouton d'arrêt. L'affichage est coordonné séparément avec la
session UI. Aucun lien causal avec un solde réel n'est établi par ces captures.

## Limites

Le correctif doit préserver les vrais signaux financiers explicites, les
abandons utilisateur et le repli déclaré par la carte de routage. Aucun appel
payant, changement de credential ou modification de projet client n'est requis.

## Validation locale

Cinq cas échouent avant correction ; 67 tests ciblés passent ensuite. Les
quotas génériques deviennent `rate-limit`, les signaux financiers explicites
restent `credit`, et les abandons et refus de clé gardent leur classification.
Aucun fournisseur réel n’a été invoqué.
