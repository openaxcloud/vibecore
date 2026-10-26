---
id: BUG-SUPPORT-REPLY-TARGET-20261026
---

## Bug

Le bouton Envoyer le message reste haut de36px car la règle globale supplante son minimum local44px.

Diagnostic compilé avant correction : bouton réel `data-vc-button=true`, `data-size=default`, classe `min-h-[44px]`, mais hauteur et minHeight calculés36px ; innerWidth320, outerWidth640, DPR2. Cause : règle plus spécifique `body button[data-vc-button='true'][data-size='default']` dans index.scss ; Button partagé possède aussi h-9.

Delta limité à `!min-h-[44px]` sur le bouton de `support_.$id.tsx`, et attente correspondante dans le test existant. Aucun changement Button partagé, CSS global, soumission, garde de brouillon ou état disabled. Correctif distinct de la perte de brouillon.

## 📤 Dispatché

☑ 26/10/2026 — Lot UI local autorisé ; périmètre coordonné et revue indépendante des preuves/correctifs.

## 💻 Codé

☐ Sur main. Correctif conservé localement dans `975db321b` ; branche intégrant origin/main `3eb70894e`, tête d’intégration `05c4e412e`. Cette fiche ne déclare ni fusion de ce lot UI ni livraison.

## ✅ Testé live

☐ En production. Tests Chromium locaux et données synthétiques seulement ; aucune recette authentifiée de production ni action client réelle.

## Validation locale et preuves

28 tests Support, lint ciblé, typage strict, build et Prettier réussis. Après11799 : matrice48 observations de zoom200% sur Support/Quota/Downgrade, dont16 Support (FR/EN×thèmes×4 tailles demandées). Bouton Support≥44px dans ces16 observations ;4 parcours conservent brouillon/focus pendant100→200% et resize puis garde/Escape. Aucune mutation tentée ni erreur JS.

[Revue de cause et mesures compilées](ui-browser-coverage-2026-10-26/support-target-review.md), [reçus zoom](ui-browser-coverage-2026-10-26/zoom/README.md). Demandes390/640/1280/1440 donnent195/320/640/720px CSS dans la matrice, mais outerWidth500 pour demande390 : pas une fenêtre physique390 confirmée. Captures Playwright initiales non exploitables visuellement conservées ; deux recaptures CDP ciblées montrent le contenu réel, sans valider48 états visuellement. Diagnostic CDP Support mesure262×44px ; Quota recapturé est250px CSS, pas195. Pas de certification WCAG, appareil iOS, lecteur d’écran ni couverture globale.

Les versions de chaque reçu restent distinctes ; l’intégration ultérieure de main ne constitue pas un replay navigateur. Aucun nouveau test produit exécuté pour rédiger cette fiche. Les états main et live restent faux jusqu’à preuves séparées.
