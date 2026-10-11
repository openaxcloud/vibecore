---
id: BUG-QA0930-OFFRE-PERDUE-TARIFS
section: "2026-09-30 — Balayage QA avant lancement, parcours qui décident d'un client"
---

## Bug

**BLOQUANT (paiement) — « Choisir Core » et « Choisir Pro » sur la page tarifs mènent à une inscription
qui oublie l'offre choisie : le visiteur n'atteint jamais le paiement.**

Relevé en production le 2026-09-30, sans compte, sur `https://e-code.ai/pricing` et
`https://app.e-code.ai/pricing` (même résultat) : les deux boutons payants pointent vers `/register`,
sans offre ni période. Après l'inscription, `/register` mène au tableau de bord, en offre gratuite.

## Cause

`app/components/marketing/EcodeProductMarketingPages.tsx`, `EcodePricingPage` :
`to={plan.enterprise ? '/contact-sales' : '/register'}`. La page servie sur `/pricing` n'est pas
`app/components/marketing/ecode-exact/pages/Pricing.tsx`, dont le `handleSelectPlan` fait déjà ce
qu'il faut (`/subscribe?plan=…&interval=…`, avec `returnTo` par la connexion).

## Repro

Production, sans compte : sonde des boutons de `/pricing` (liens relevés : « Choisir Core » → `/register`,
« Choisir Pro » → `/register`). Parcours complet reproduit en local : voir le test qui l'épingle.

## 📤

☐

## 💻

☐

## ✅

☐

## Preuve

Aucun test — point OUVERT.
