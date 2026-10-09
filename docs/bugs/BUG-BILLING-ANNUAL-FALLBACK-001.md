---
id: BUG-BILLING-ANNUAL-FALLBACK-001
section: "2026-10-08 — Paiement et préparation au lancement"
---

## Bug

P1 — Une demande de paiement annuel utilisait le prix mensuel si le prix annuel manquait. Sans plan annuel disponible, le formulaire omettait aussi la période et l'API revenait à monthly.

## 📤 Dispatché

📤 Pris en charge le 08/10/2026.

## 💻 Codé

☐ Branche de correctif, fusion sur main à confirmer.

La route refuse un annuel sans prix annuel avec 503 `STRIPE_PRICE_NOT_CONFIGURED` avant tout appel Stripe. Le formulaire conserve la période et désactive les plans annuels indisponibles. Le prix mensuel historique reste accepté.

## ✅ Testé live

☐ Production responsive en attente, aucun débit réel effectué.

## Preuve

Épinglé par `services/api/src/tests/api.spec.ts` (cas `respects the checkout interval and refuses annual-to-monthly substitution` : vraie route Fastify et serveur HTTP Stripe de test, refus sans aucun appel, prix mensuel puis prix annuel configuré) et `app/routes/upgrade.i18n.spec.tsx` (annuel avec/sans autre plan annuel et mensuel). Tests ciblés, typage strict et build validés avant récupération du checkout ; contrôles ciblés à relancer sur la base intégrant #682. Contre-épreuves : rétablir le fallback fait échouer le test API (200 au lieu de 503), retirer le disabled fait échouer les deux cas annuels UI. Le montant et la devise Stripe de production ne sont pas attestés. Point OUVERT.
