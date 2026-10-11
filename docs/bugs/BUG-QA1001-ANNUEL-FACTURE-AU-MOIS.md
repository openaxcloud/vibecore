---
id: BUG-QA1001-ANNUEL-FACTURE-AU-MOIS
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**Paiement : un client qui choisit la facturation ANNUELLE est abonné au prix MENSUEL quand le prix annuel
manque ; et une valeur qui n'est pas un prix (une adresse e-mail) part chez Stripe comme identifiant de prix.**

Mesuré le 2026-10-01, en production, en lecture seule (base, depuis un pod api) :
- forfait `pro` : aucun `stripePriceAnnualId` ;
- forfait `team` : `stripePriceAnnualId` contient une ADRESSE E-MAIL.

Code du paiement (`POST /orgs/:orgId/billing/checkout`) :
`stripePriceAnnualId ?? stripePriceMonthlyId ?? stripePriceId`.
- Pour Pro, un client qui avait choisi « annuel » (et lu 278,40 €/an sur la page) était abonné au mois.
- Pour Team, l'adresse e-mail partait chez Stripe.
- La recopie au démarrage (`seedBillingPlans`) conservait cette valeur comme « édition d'admin ».

S'y ajoutent les défauts de la grille publique, mesurés en production le même jour :
- la page /pricing affichait Core 25 € / Pro 100 €, alors que le paiement facture Pro 29 € / Team 99 € ;
- elle promettait « jusqu'à 15 collaborateurs » à des forfaits qui en avaient 1 ;
- ses boutons payants menaient à /register, ce qui perdait l'offre choisie (BUG-QA0930-OFFRE-PERDUE-TARIFS) ;
- les prix étaient arrondis sans centimes : 278,40 € s'affichait « 278 € ».

Côté /upgrade :
- l'option annuelle s'affichait dès que `stripePriceAnnualId` était non vide (donc pour l'adresse e-mail) ;
- le montant affiché restait le mensuel en mode annuel.

**Décision d'Avi (2026-10-01)** : Pro 29 €/mois, Team 99 €/mois, Core sur mesure (devis), 20 % de réduction en
annuel (278,40 € et 950,40 €/an) ; places gratuit 1, Pro 5, Team 25.

## 📤

☑ 01/10 branche `fix/grille-tarifaire` (contient `fix/forfait-pro-cinq-places`)

## 💻

☐

## ✅

☐

## Preuve

**Paiement**
- L'annuel n'utilise QUE le prix annuel. Seul un vrai identifiant `price_…` part chez Stripe ; sinon 503
  `STRIPE_PRICE_NOT_CONFIGURED`, sans aucun appel.
- La recopie au démarrage écarte une valeur qui n'est pas un prix.
- Épinglé par `services/api/src/tests/paiement-annuel.spec.ts` (vraie API, faux Stripe HTTP local qui enregistre
  ce qu'il reçoit). Rouge avant : 200 sur `price_pro_mensuel`.
- Contre-épreuves : garde du paiement retirée → rouge ; garde de la recopie retirée → rouge.

**Règle des 20 %**
- `REMISE_ANNUELLE` et `montantAnnuelCents` dans packages/billing.
- Épinglé par `packages/billing/src/grille-annuelle.spec.ts` (27 840 et 95 040 centimes, en clair).

**Page /pricing (celle que la production sert)**
- Pro 29 € / Team 99 € / Core sur devis ; annuel avec centimes.
- Boutons vers `/subscribe?plan=…&interval=…`, qui emmène l'offre et la période jusqu'au paiement.
- Les avantages Pro/Team et le tableau de comparaison sont ÉCRITS à partir des limites appliquées
  (`app/lib/forfaits-publics.ts`).
- `app/lib/forfaits-publics.spec.ts` rougit si la page et la facturation divergent.
- La carte gratuite (Starter, 5 avantages) n'est PAS modifiée : c'est une décision antérieure, tenue par son test.
- Épinglé par `PricingPage.i18n.spec.tsx` : 278,40 € et 950,40 €, liens annuels Pro/Team. Contre-épreuve :
  bouton remis sur /register → rouge.

**/upgrade**
- Annuel proposé seulement avec un vrai prix (`estUnPrixStripe`, testé).
- Montant annuel affiché en mode annuel.
- Sans prix annuel, le bouton de la formule est désactivé, avec le texte « choisissez la facturation
  mensuelle ».
- Épinglé par `upgrade.i18n.spec.tsx`. Contre-épreuve : `disabled` retiré → rouge.

**Reste à relire par Avi** : la FAQ « How do credits work? » décrit encore le modèle à crédits.

**Dépend de la clé Stripe** (expirée) : la devise réelle, l'existence des prix annuels, les montants côté
Stripe. Tout cela se vérifie en une passe avec `scripts/verifier-prix-stripe.cjs`.
