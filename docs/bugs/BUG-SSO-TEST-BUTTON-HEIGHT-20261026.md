---
id: BUG-SSO-TEST-BUTTON-HEIGHT-20261026
---

## Bug

Les deux boutons « Tester la connexion » OIDC/SAML mesurent32px malgré un minimum44px prévu localement.

Sur `/enterprise-sso-settings`, règle globale `body button[data-vc-button][data-size=sm]` plus spécifique que la classe min-h44. Vingt observations sur cinq formats ×FR/EN ×clair/sombre ; contrepreuve calculée FR/EN320/1440 : huit mesures32→44px. Objectif produit44px, sans prétendre une violation WCAG automatique.

## 📤 Dispatché

☑ 26/10/2026 — Défaut reproduit,31 PR relues sans chevauchement, revue root indépendante du patch et des mesures favorable.

## 💻 Codé

☐ Sur main. Deux classes locales deviennent `!min-h-[44px]`. Button partagé, CSS global, h-auto, wrapping, labels, disabled et actions conservés.

## ✅ Testé live

☐ En production. Aucun test de connexion IdP, secret ou enregistrement SSO exécuté.

## Validation locale

21 tests SSO existants sur trois fichiers et lint ciblé réussis. Contrepreuve DOM distincte du code compilé ; build local vert puis20 contextes SSO compilés, cinq formats FR/EN clair/sombre, deux boutons mesurés au moins44px. Les petits toggles ne sont pas inclus dans la promesse de ces deux boutons.

## Preuves et limites

[Audit, contrepreuves et avis](ui-organization-access-2026-10-26/README.md). Aucun backend SSO, activation d’enforcement, permission, clavierOS ou matériel physique validé. Pas de conclusion globale sur tous les contrôles de la page.
