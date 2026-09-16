---
id: BUG-FH-001
---

## Bug

**P3 — `Escape` ne ferme pas le panneau « Historique du fichier », qui est pourtant `aria-modal="true"`.** Mesuré live le 20/08 sur `e-code.ai` (prod `924cc9c6`), projet réel, 1440 px : le panneau `[data-testid="file-history-panel"]` porte `role="dialog"` et `aria-modal="true"`, mais `Escape` le laisse ouvert — Playwright a ensuite refusé un clic sur l'éditeur, la surface du panneau interceptant les événements (`subtree intercepts pointer events`). Un modal doit se fermer à `Escape` : c'est la convention ARIA, et sans elle l'utilisateur au clavier reste piégé. Le bouton `aria-label="Fermer l'historique du fichier"` existe et fonctionne, donc le défaut est le raccourci, pas la sortie.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

**Revérifié le 09/09** : `Escape` est géré (`FileHistoryPanel.tsx`) et le cas est couvert.

## Preuve

☐ live iPhone

