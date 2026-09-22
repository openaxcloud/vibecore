---
id: BUG-MKT-010
---

## Bug

**P2 — contraste insuffisant du CTA principal (WCAG AA).** Le texte blanc `#F5F9FC` sur l'accent de marque `#F26207` mesure **3,04:1**, sous le seuil AA de **4,5:1** pour du texte de 14–16 px en graisse 500. Touche les CTA « Get started for free », « Send Message », « Apply », « Get in touch », et les puces de filtre. Mesuré sur 60 combinaisons page × largeur × thème, sonde validée par contrôle négatif. Second foyer : les badges `rounded-full` en thème CLAIR à **3,02:1** (« Our story », « 6 open roles », « Remote-first »).

## 📤 Dispatché

✅ 06/08

## 💻 Codé

☐ **non corrigé — décision de marque**

## ✅ Testé live

☐

## Preuve

**NON CORRIGÉ VOLONTAIREMENT.** Atteindre 4,5:1 avec du texte blanc impose de descendre l'accent à ≈ `#C24C03` (mesuré 4,65:1) — soit repeindre l'orange de marque sur TOUS les CTA du site. Cela dépasse une correction de bug et relève d'un arbitrage d'Avi. Options chiffrées : (a) `#C24C03` sur les surfaces portant du texte, `#F26207` conservé en décoratif ; (b) monter le texte des CTA à ≥ 18,66 px gras, seuil AA large = 3:1, déjà atteint ; (c) accepter l'écart et le documenter.

