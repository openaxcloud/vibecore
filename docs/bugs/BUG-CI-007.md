---
id: BUG-CI-007
---

## Bug

**P2 — le job « macos desktop build » échoue à l'empaquetage sur une incompatibilité d'outillage `electron-builder`.** Erreur : `⨯ DOMParser.parseFromString: the provided mimeType "undefined" is not valid. failedTask=build`, levée par `electron-builder` **après** un build applicatif réussi (le bundle Vite est produit intégralement, on voit la liste complète des chunks). Le job **linux passe** avec exactement le même script de build : l'écart est que **seul le chemin macOS parse des fichiers `plist`**, et c'est ce parsing qui appelle `DOMParser.parseFromString` sans argument `mimeType` — invalide sur les runtimes récents. Le workflow épingle pourtant `node-version: 20.19.0` (`.github/workflows/electron.yml:64`) alors que les logs du job montrent **`Node.js 24` et `node 25.6.0`** présents sur le runner : la version effective sous laquelle tourne `electron-builder` est à confirmer, c'est la première piste. Versions en jeu : `electron ^42.0.0`, `electron-builder ^26.8.1`.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 15/08**

## Preuve

Job `95084913378` (PR #138). Défaut **préexistant et sans rapport avec le lot QA** : la branche ne touche ni `package.json` côté electron, ni `electron-builder.yml`, ni le workflow ; et `linux desktop build` est **vert** sur le même commit. À distinguer de **BUG-CI-006** (Windows, syntaxe d'env POSIX), qui est corrigé. ⚠️ **Lot outillage de build — consigné seulement** : un changement de version de Node ou d'`electron-builder` ne se valide que sur un vrai runner macOS, non corrigé à l'aveugle ici.

