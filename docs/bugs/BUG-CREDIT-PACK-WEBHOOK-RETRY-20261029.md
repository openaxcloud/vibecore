---
id: BUG-CREDIT-PACK-WEBHOOK-RETRY-20261029
section: "Facturation"
---

# Un retry webhook peut attribuer deux fois un pack de crédits

## 📤 Dispatché

☑ 29/10 — contre-épreuve isolée sur le code de main fe790924.

## 💻 Codé

☐ — non fusionnée ni livrée. Correction locale validée et relue le 29/10 ; voir les preuves ci-dessous.

## ✅ Testé live

☐ — aucun paiement Stripe ou webhook fournisseur réel exécuté.

## Défaut démontré

L'événement Stripe est dédupliqué avant les effets. Le pack est créé, puis l'audit
peut échouer ; le catch retire alors le marqueur d'événement pour permettre un
retry. Celui-ci recrée un pack. Contre-épreuve route réelle/signature synthétique :
500 avec un pack puis 200 avec deux packs, pour un seul achat. Autre fenêtre :
crash après marqueur et avant octroi, puis retry court-circuité sans pack.

## Correction et preuves

Reçu durable lié à l'achat et octroi dans une transaction PostgreSQL ; reprise
du pack avant le court-circuit de déduplication générique. Les identités, tenant,
SKU et valeur doivent rester cohérents. Reprise après consommation/expiration ne
réinitialise jamais le solde. Les anciennes attributions ambiguës sont refusées,
pas compensées ni effacées automatiquement. Aucune nouvelle migration nécessaire.

Six tests PostgreSQL réels passent après le dernier correctif, sans omission :
connexions concurrentes, coupure effective de connexion avant commit, reprise
avec un nouveau client après commit, conflits, héritage et coupons sans paiement.
La base jetable a été supprimée. Quatorze tests HTTP indépendants passent ; la
revue n'identifie aucun P1. Typecheck/build API et contrôles i18n passent.
La suite PostgreSQL exige `CREDIT_PACK_POSTGRES_PROOF=1` ; la CI ordinaire peut
l'ignorer et ne doit pas être présentée comme ayant exécuté ces six scénarios.
Les tests fournisseur sont synthétiques, pas des achats réels. Voir la
[matrice opérationnelle](../qa/operational-readiness-20261029.md) pour les limites
du catalogue, des quotas et de la restauration.
