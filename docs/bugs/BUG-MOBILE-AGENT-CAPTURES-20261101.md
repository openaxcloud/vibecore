---
id: BUG-MOBILE-AGENT-CAPTURES-20261101
---

## Bug

P1 — captures IMG_0939–0942 : compteurs rognés, cartes spécialistes inutilement hautes, texte système anglais, notification volumineuse et chevauchement de la flèche.

## 📤 Dispatché

☑ 01/11 — correction mobile, menu inférieur conservé. Aucun changement de routage IA.

## 💻 Codé

☐ — branche fix/mobile-agent-captures-20261101 ; correctifs et preuves locales prêts ; pas encore intégré sur main.

## ✅ Testé live

☐ — aucune validation de production. Reproduction locale synthétique Chromium 393 px : métadonnées hautes de 28 px pour 40 px de contenu (line-height 19,88 px), seconde ligne rognée. Métadonnées absentes réservant encore 28 px. Corrigé et vérifié localement : 52 tests ciblés, 8 tests de géométrie Chromium/WebKit, 6 parcours compilés et 2 vérifications de défilement. Détails : [preuves](mobile-agent-captures-20261101/README.md).
