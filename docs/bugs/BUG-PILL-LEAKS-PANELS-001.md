---
id: BUG-PILL-LEAKS-PANELS-001
---

## Bug

**P2 — La pastille « descendre » de l'agent apparaît par-dessus l'onglet Aperçu** (Avi, 08/09 20:53, capture iPhone entourée en rouge : « parfois je vois dans la tab preview le scroll icon de l'agent »). Sur la capture : panneau Webview (port 5173, aperçu vide), et le disque ↓ posé en bas à droite du cadre d'aperçu. La pastille n'appartient qu'au fil de l'agent — elle ne doit exister sur AUCUN autre panneau. « Parfois » : à établir — probablement quand on quitte le panneau Agent alors qu'on n'était pas en bas du fil (`isAtBottom` faux, la pastille reste montée). À MESURER avant correctif (règle 1) : le panneau Agent est-il démonté, masqué, ou seulement déplacé ; et la pastille, `position: sticky`, échappe-t-elle à ce masquage. Même classe que les fuites déjà vues d'un panneau sur l'autre — viser la RÈGLE, pas la seule occurrence (règle 7).

## 📤 Dispatché

☑ 08/09

## 💻 Codé

☑ 08/09 — **REPRODUIT ET MESURÉ** à 390 (Chromium, build de production). Sur les panneaux **Aperçu ET Déploiements**, la pastille restait `display: flex`, `visibility: visible`, `opacity: 1`, à **[324, 708]** — et `elementFromPoint` en son centre la rendait : elle se peignait bien PAR-DESSUS le contenu de l'autre panneau. Position [324, 708] et non [173, 601] parce que la règle de centrage est portée par `[data-mobile-panel='chat']` : hors du fil, la marge de base la pousse au bord droit — exactement la capture d'Avi. Ampleur relevée : sur **164 éléments** du fil, elle était la **seule** à s'échapper. Mécanisme : le panneau actif est un calque `position: absolute; inset: 0` en `z-index: auto`, la pastille est `sticky` en `z-index: 20`, et toute la chaîne jusqu'à `body` est en `z-index: auto` — vingt bat zéro. Correctif au niveau de la RÈGLE (règle 7) et non du symptôme : `isolation: isolate` sur `.bolt-project-agent-scroll` en mobile — les `z-index` du fil ne sortent plus du fil, ni celui-ci ni aucun futur enfant surélevé. Après : **0 fuite sur 164**.

## ✅ Testé live

☐ live iPhone

## Preuve

contre-épreuve dans les DEUX sens : règle retirée → rouge en nommant le coupable (`SPAN.i-ph:arrow-down` peint sur le panneau `preview`) ; pastille supprimée → la moitié « elle se peint au-dessus du fil » rouge. Épinglé par `tests/e2e/ide-mobile-chrome.spec.ts` « elle se peint sur le fil, et sur rien d'autre »

