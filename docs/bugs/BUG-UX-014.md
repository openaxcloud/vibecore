---
id: BUG-UX-014
---

## Bug

**P2 — l'écran de démarrage de la Webview affiche « Prêt » et coche ses 4 étapes alors qu'il indique juste en dessous « Le serveur d'aperçu démarre encore ; nouvelle tentative… ».** Les deux messages se contredisent dans le même panneau, et l'état est resté figé ainsi (aucun serveur ne tournait réellement — cf. BUG-AGENT-001). Le journal affiché ajoute « Le point de contrôle de l'IA a été ignoré après l'acceptation du patch » ×2, qui se lit comme une erreur pour un utilisateur.

## 📤 Dispatché

☐

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Capture du panneau Webview, desktop 1440 : titre « DÉMARRAGE DE LA WEBVIEW », sous-titre « **Prêt** », corps « Le serveur d'aperçu démarre encore ; nouvelle tentative… », 4 étapes (Compilation de…, Compilation en…, Démarrage du…, Prêt) toutes cochées. **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `app/components/workbench/Preview.boot-progress.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

