---
id: BUG-MKT-011
---

## Bug

**P2 (SEO) — chaque page publique émet `twitter:title` et `twitter:description` EN DOUBLE, et plusieurs émettent `og:type` en double.** Les deux copies sont **strictement identiques**, donc les agrégateurs sociaux reçoivent une balise ambiguë sur tout le domaine public. C'est aussi ce qui maintient le workflow **« French i18n live audit » ROUGE sur CHAQUE PR** (`tests/e2e/i18n-french-live.spec.ts:566/567`, `expected length 1, received 2`) — sur les 4 viewports.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Revérifié le 09/09 : corrigé.** La racine n'émet plus une balise que la route feuille possède déjà (`leafSeoMetaKeys`), ce qui supprime les doublons `twitter:title` / `twitter:description`.

## Preuve

☐ live iPhone

