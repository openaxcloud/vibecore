---
id: BUG-PUBLISH-STICKY-OVERLAP-001
---

## Bug

**P2 — la barre « Republier » collante RECOUVRE le contenu** (capture 09/09 10:32) : elle masque les boutons « Réparer avec l'agent » et « Afficher les journaux » du bloc d'échec, dont on ne voit plus que le bas des libellés.

## 📤 Dispatché

☑ 09/09

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐

## Preuve

MESURÉ : la barre porte un fond en DÉGRADÉ dont le haut est transparent — le contenu se voyait au travers, à moitié lisible, ce qui se lit comme un défaut d'affichage. Fond plein, filet supérieur et `z-index`. ÉCARTÉ en chemin, et c'est ce que j'ai failli faire : réserver une hauteur en bas du contenu. La barre est le DERNIER enfant du flux — elle occupe déjà sa place en fin de défilement, et la réserve n'aurait ajouté que du vide. épinglé par `tests/e2e/ide-mobile-chrome.spec.ts`

