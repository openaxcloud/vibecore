---
id: BUG-CI-007
---

## Bug

**P2 — le job « macos desktop build » échoue à l'empaquetage sur une incompatibilité d'outillage `electron-builder`.** Erreur : `⨯ DOMParser.parseFromString: the provided mimeType "undefined" is not valid. failedTask=build`, levée par `electron-builder` **après** un build applicatif réussi (le bundle Vite est produit intégralement, on voit la liste complète des chunks). Le job **linux passe** avec exactement le même script de build : l'écart est que **seul le chemin macOS parse des fichiers `plist`**, et c'est ce parsing qui appelle `DOMParser.parseFromString` sans argument `mimeType` — invalide sur les runtimes récents. Le workflow épingle pourtant `node-version: 20.19.0` (`.github/workflows/electron.yml:64`) alors que les logs du job montrent **`Node.js 24` et `node 25.6.0`** présents sur le runner : la version effective sous laquelle tourne `electron-builder` est à confirmer, c'est la première piste. Versions en jeu : `electron ^42.0.0`, `electron-builder ^26.8.1`.

## 📤 Dispatché

☑ 16/09 — instruit par cette session, sans dispatch : le défaut ne se reproduit plus.

## 💻 Codé

☑ 16/09 — **plus reproduit, sous l'outillage épinglé par le lockfile** : `electron-builder` **26.8.1** / `app-builder-lib` 26.8.1 / `plist` 3.1.0 / `@xmldom/xmldom` 0.8.14 et 0.9.10, `setup-node` 20.19.0. Aucun commit correctif attribuable : l'arbre `electron/` et le lockfile sont arrivés d'un bloc sur cet historique avec #346 (`73073359`, 01/09) — l'historique de PR #138 n'y est pas. Lecture des mentions « Node 24 » du 15/08, confirmée sur les journaux du 16/09 : elles concernent le **moteur des actions** (`actions/checkout`, `setup-node`… forcées sur Node 24 par GitHub), pas le processus de build, qui tourne bien sous 20.19.0 — ce n'était donc pas la piste.

## ✅ Testé live

☑ 16/09 — **testé en réel là où le défaut vit, la CI macOS** (constaté rouge le 15/08) : job `104680997149` (run `35060966476`, PR #433), étape « Build macos » **success** 09:51:54 → 10:05:22, artefact `vibecore-desktop-macos` finalisé (833 818 492 octets). Sept runs « Desktop Electron » consécutifs verts le 16/09 (n° 828 → 834), les trois plateformes.

## Preuve

Job `95084913378` (PR #138). Défaut **préexistant et sans rapport avec le lot QA** : la branche ne touche ni `package.json` côté electron, ni `electron-builder.yml`, ni le workflow ; et `linux desktop build` est **vert** sur le même commit. À distinguer de **BUG-CI-006** (Windows, syntaxe d'env POSIX), qui est corrigé. ⚠️ **Lot outillage de build — consigné seulement** : un changement de version de Node ou d'`electron-builder` ne se valide que sur un vrai runner macOS, non corrigé à l'aveugle ici.

**Garde (règle 16)** : le job « macos desktop build » de `.github/workflows/electron.yml`, déclenché sur toute PR touchant `electron/**`, `app/**`, `package.json`, `pnpm-lock.yaml`, `electron-builder.yml` ou le workflow — c'est-à-dire tout ce qui peut réveiller ce défaut. **Aucun spec local ne peut l'épingler** : le parsing `plist` qui appelait `DOMParser.parseFromString` ne s'exécute que sur le chemin d'empaquetage macOS, dans `electron-builder`. Dit explicitement, plutôt qu'un test qui ferait semblant.
