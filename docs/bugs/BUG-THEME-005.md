---
id: BUG-THEME-005
---

## Bug

**P2 — le CTA principal « Créer maintenant » est sous WCAG AA : blanc sur la marque `#F26207` = 3,22:1 (seuil 4,5).** Mesuré live le 20/08 sur `e-code.ai` (prod `93ed3c70`) par balayage complet du DOM de la page d'accueil, aux **3 formats (390 / 768 / 1440)** et dans les **2 thèmes** : c'est la seule paire fautive du balayage, et elle est identique partout — `rgb(255,255,255)` sur `rgb(242,98,7)` à 16 px. À distinguer de BUG-THEME-004 (bascule de langue), qui portait sur un `orange-500` Tailwind égaré et **est corrigé** : ici c'est la **marque elle-même**. L'assombrir est une décision de marque, pas un correctif mécanique — elle appartient à Avi. Rattaché à SCR-007.

## 📤 Dispatché

☑

## 💻 Codé

✅ PR #188

## ✅ Testé live

⏳ en attente du déploiement

## Preuve

**Ce n'était PAS un arbitrage de marque — je l'avais mal qualifié.** Le jeton `--vc-action-primary-strong: #c2410c` (**5,16:1** sur blanc) existait déjà et avait été créé pour ce cas exact : le commit `6b16806c` note lui-même que la marque « plafonne à 3,22 », soit précisément le ratio mesuré sur le CTA. Il n'y avait donc rien à arbitrer, juste un endroit oublié. Les **7 aplats** de marque portant du texte blanc passent au ton renforcé (CTA d'accueil, pastille du parcours, boutons Mobile ×3, filtre Blog, CTA Accessibilité). ⚠️ Défaut supplémentaire trouvé au passage : les survols pointaient vers `--ecode-accent-hover` (`#ff7a2b`), **plus clair** donc pire que l'état au repos — passés à `brightness-90`, qui ne peut qu'augmenter le contraste.

