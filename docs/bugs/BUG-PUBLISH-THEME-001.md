---
id: BUG-PUBLISH-THEME-001
---

## Bug

**P2 — « la police et les boutons sont trop gros ou pas comme le thème »** (Avi, 09/09). La moitié « police » était BUG-PUBLISH-SIZES-001 ; la moitié « thème » est ici, et elle se chiffre.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

**MESURÉ dans la feuille servie** : le panneau reprenait la palette de Replit LITTÉRALEMENT — **20 déclarations de couleur en dur**, dont le bleu `#0079f2` sur le bouton principal « Republier », sur « Réparer avec l'agent », sur l'étape en cours et sur le gabarit courant, plus des pastels clairs (`#e6f4ea`, `#fbe4e4`, `#e6f0fb`) dessinés pour un fond BLANC. Or l'IDE est sombre par défaut (`:root { color-scheme: dark; --vc-ide-bg-card: #1a2030 }`) et notre action primaire est ORANGE (`--vc-action-primary: #f97316` en sombre, `#c2410c` en clair). Des pastilles presque blanches sur fond sombre, et le CTA peint dans la couleur d'un concurrent : c'est littéralement « pas comme le thème ». **Un littéral ne bascule pas** — c'est la définition du défaut, et c'est pourquoi le correctif est de brancher sur les jetons `--status-success/error/info-*` et `--vc-action-primary(-foreground)`, tous déjà déclarés dans les DEUX thèmes. Même traitement pour le séparateur `rgb(255 255 255 / 35%)` (dérivé de l'encre d'accent) et l'ombre du menu (`--vc-ui-shadow-lg`, géométrie identique). **CE QUE LA GARDE EXISTANTE NE VOYAIT PAS** : `accent-residual-blue.spec.ts` ne lit que `variables.scss` — tout ce bloc lui échappait. La nouvelle ne fige AUCUNE couleur : elle refuse qu'une VALEUR de couleur soit écrite en dur dans les règles `.bolt-publication*`, avec contrôle positif (>30 règles lues, sélecteurs témoins présents) pour qu'un « zéro faute » ne puisse pas venir d'une extraction vide (règle 14). Contre-épreuve : bleu remis sur « Republier » → 2 rouges ; état corrigé → 4 verts. épinglé par `app/styles/publication-jetons-de-theme.spec.ts`

