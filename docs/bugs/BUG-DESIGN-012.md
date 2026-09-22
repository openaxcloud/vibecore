---
id: BUG-DESIGN-012
---

## Bug

**P3 (décision design — POUR AVI) — l'orange de marque `#f26207` donne 3,22:1, sous le seuil AA du texte courant, sur TOUTES les pages publiques et dans les 2 thèmes.** Concerné : « EN » (sélecteur de langue), « Build now », « Get Core », « Monthly », « RECOMMENDED », « Start building today », « View page » ×6, le badge « E-Code », l'en-tête « Core » du tableau tarifaire.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Mesuré live 18/08 — NON corrigé, volontairement**

## Preuve

Blanc sur `#f26207` = **3,22:1** ; `#f26207` en texte sur blanc = **3,22:1** ; blanc sur `#f97316` (login sombre) = **2,80:1**. AA demande 4,5 pour le texte courant (3,0 seulement pour le grand texte et les composants d'interface) : ce n'est donc pas « illisible », c'est un **écart de conformité**. **Précédent interne** : la page d'auth a déjà résolu exactement ce point en clair avec un orange plus foncé (`--vc-auth-accent: #c2410c`, 5,9:1 sur blanc) ; le marketing utilise `--ecode-orange` brut. **Non corrigé sans arbitrage** : changer la couleur de TOUS les CTA de marque est une décision design, pas un correctif de bug.

