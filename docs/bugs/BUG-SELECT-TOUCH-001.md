---
id: BUG-SELECT-TOUCH-001
---

## Bug

**P2 — l'appui long sur un message bleuit toute la page** (sélection native de Safari) et pose la bulle « Copier · ⌘ · › » d'iOS par-dessus notre menu (capture 06/09 12:18).

## 📤 Dispatché

☑ 06/09

## 💻 Codé

☑ 06/09 (`main`) — **déployé run 1490 (84a913c), 10:27 UTC** — `user-select: none` sur la bulle au doigt seulement (`hover: none`), le code reste sélectionnable. Épinglé par `app/styles/ide-mobile-panels.spec.ts` (§10) + `app/components/chat/MessageContextMenu.spec.tsx` — **mais ces deux-là LISENT le SCSS**, et une règle trouvée dans un fichier ne prouve pas qu'un moteur l'applique, alors que le défaut d'Avi ÉTAIT un défaut de moteur. **10/09 — l'assertion de comportement est ajoutée** dans `tests/e2e/agent-message-density.spec.ts`, qui tourne déjà sous le projet `webkit-iphone` : après l'appui long, la bulle rend `user-select: none` ET le `code` inline rend `text` (contre-épreuve dans les deux sens, règle 6). Le fil de test porte donc un `code` INLINE — délibérément inline, un bloc clôturé passant par `CodeBlock` dont le `<pre>` n'arrive qu'après coloration asynchrone ; précondition vérifiée en jsdom sur le contenu exact semé. ⚠️ **Toujours pas exécuté sur WebKit depuis ce conteneur** : le téléchargement du moteur Playwright échoue (« Download failure ») et WebKitGTK n'a que sa bibliothèque, pas son typelib. La mesure aura lieu en CI, dans le canari `webkit-iphone`.

## ✅ Testé live

☐

## Preuve

Capture 06/09 12:18.

