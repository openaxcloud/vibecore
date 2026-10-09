---
id: BUG-BILLING-ANNUAL-FALLBACK-001
section: "2026-10-08 — Paiement et préparation au lancement"
---

## Bug

P1 — Une demande de paiement annuel utilisait le prix mensuel si le prix annuel manquait. Sans plan annuel disponible, le formulaire omettait aussi la période et l'API revenait à monthly.

## 📤 Dispatché

📤 Pris en charge le 08/10/2026.

## 💻 Codé

☑ Fusionné sur main le 09/10/2026 par #684, commit `a11d0a1687d8edb5a3f4b38f74031d230f289383`. CI, E2E, sécurité et qualité de ce SHA réussis ; livraison en cours, pas encore attestée.

La route refuse un annuel sans prix annuel avec 503 `STRIPE_PRICE_NOT_CONFIGURED` avant tout appel Stripe. Le formulaire conserve la période et désactive les plans annuels indisponibles. Le prix mensuel historique reste accepté.

## ✅ Testé live

☐ Production responsive en attente, aucun débit réel effectué.

## Preuve

Épinglé par `services/api/src/tests/api.spec.ts` (cas `respects the checkout interval and refuses annual-to-monthly substitution` : vraie route Fastify et serveur HTTP Stripe de test, refus sans aucun appel, prix mensuel puis prix annuel configuré) et `app/routes/upgrade.i18n.spec.tsx` (annuel avec/sans autre plan annuel, mensuel et retour au mensuel). Tests ciblés, typage strict, lint et build validés ; CI du SHA de fusion réussie. Contre-épreuves : rétablir le fallback fait échouer le test API (200 au lieu de 503), retirer le disabled fait échouer les cas annuels UI, retirer le sélecteur fait échouer la récupération vers le mensuel. Preuves : `docs/deploy-evidence/2026-10-09-release-verification.md`. Le montant et la devise Stripe de production ne sont pas attestés. Point OUVERT.
