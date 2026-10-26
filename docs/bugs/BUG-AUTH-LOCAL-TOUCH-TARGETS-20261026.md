---
id: BUG-AUTH-LOCAL-TOUCH-TARGETS-20261026
---

## Bug

Les contrôles locaux de révélation du mot de passe Reset et de renvoi de vérification email sont inférieurs à l’objectif44px.

Avant11999 : Reveal28px à320 et24px à1440 ; renvoi19,875px à320 et17,031px à1440. Contrepreuves DOM séparées : contrôle44px avec padding droit52px laissant2,75px/3,5px entre borne texte et bouton ; renvoi local44px et libellé repliable. Ces contrepreuves ne sont pas un build corrigé.

## 📤 Dispatché

☑ 26/10/2026 — Lot Auth P1, reproduction locale, périmètre et correction revus avec le parent.

## 💻 Codé

☐ Sur main. Correctif local consolidé : `AuthScreen.tsx` réutilise `vc-auth-input-action` et padding52px pour le type password ; `verify-email.tsx` applique les classes locales de cible44px. Aucun changement global RevealButton/CSS, délai, action ou contrat backend. Cette fiche ne déclare aucune fusion ni livraison.

## ✅ Testé live

☐ En production. Chromium local, API6199 synthétique ; aucun email réel, fournisseur, token fonctionnel, création de compte ou session production.

## Validation locale et preuves

[Baseline, contrepreuves et18tests existants](ui-authentication-2026-10-26/README.md) :80observations sur4pages,16groupes et27cas protocoles distincts ; ces nombres ne deviennent pas un nombre de pages validées. Lint/Prettier ciblés verts. Complément formulaires36POST synthétiques distinct de la recette corrigée.

[Après12199 compilé](ui-authentication-2026-10-26/after12199/README.md), arbre produit commun `fbb678704aefe10abe230620e6de47c4aec5bec9` :40observations sur Reset/Verify ×FR/EN×clair/sombre×320/390/844paysage/820/1440 ; cibles mesurées≥44px. Révélation par Tab/Space conserve le texte, padding52px maintient sa borne avant le bouton. Quatre groupes resize/brouillon puis renvoi503/cooldown virtuel61s/réactivation ;4POST fixture, zéro erreur JS.

La mesure porte sur le premier champ password, pas chaque champ ni le pixel de caret. Login/signup ont leurs propres champs ; aucune couverture transférée. Polices externes bloquées. Pas de zoom200%, WebKit, lecteur d’écran, clavierOS, contraste calculé ou appareil réel.44px est un objectif produit, pas une conclusion automatique WCAG. Main/live faux ; couverture partielle distincte de recette du correctif.
