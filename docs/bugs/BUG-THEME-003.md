---
id: BUG-THEME-003
---

## Bug

**HEADER DU PANNEAU WEBVIEW MOBILE — signalé par Avi : AUCUN défaut de thème, mesuré dans l'IDE réel en 390.**

## 📤 Dispatché

☐

## 💻 Codé

—

## ✅ Testé live

☑ **Mesuré live 18/08 — non-défaut côté thème**

## Preuve

**Mesure** (env d'audit réparé, projet `react-saas`, iPhone 13, `?panel=preview`, les 2 thèmes) : **clair** — barre `#ffffff` sur panneau `#f6f8fb`, texte à **10,35:1**, pilule d'adresse à **9,21:1** ; **sombre** — barre `#0e1525` sur panneau `#0a0f1c`, mêmes jetons. C'est exactement la relation `--vc-ide-bg-panel` au-dessus de `--vc-ide-bg-app`, **identique dans les deux thèmes** : cohérent par construction, pas un écart. **Ce qui EST anormal et que j'ai mesuré au passage** : la barre fait **166 px de haut sur 3 rangées** en 390 (38 % de la hauteur du panneau). Mais c'est un **build périmé** : l'env d'audit tourne `bd471ba054`, qui précède `6af3cd8c` (« une seule ligne sur mobile et tablette ») et `4239869b` — la classe marqueur `bolt-preview-toolbar-tools` n'existe pas dans ce build. Les deux correctifs sont sur `main` depuis `36cd49d1` (18/08 06:41) et déployés. **Donc** : si la capture d'Avi date d'avant ce matin, c'est cette barre à 3 rangées qu'il voyait, et elle est déjà corrigée. S'il voit encore un défaut sur la prod actuelle, il me faut sa capture.

