---
id: BUG-CI-009
---

## Bug

**P2 — deuxième défaut du build desktop Windows, révélé par la correction de BUG-CI-006 : `EBUSY` sur la copie des assets.** Une fois la syntaxe d'environnement corrigée, le job va bien plus loin (`Electron smoke test` **vert**) puis casse à l'étape `Build windows` : `EBUSY: resource busy or locked, copyfile 'public\ecode-static\assets\index-*.css' -> 'build\electron\ecode-static\assets\index-*.css'` dans `prepareOutDir → copyDir` de Vite. Cause : `electron:build:main` et `electron:build:preload` tournent **en parallèle** (préfixes `[0]`/`[1]` du lanceur concurrent) et **écrivent tous deux dans `build/electron`**, chacun recopiant le `publicDir`. Sous Windows, le verrouillage de fichier rend cette course fatale — là où Linux et macOS la tolèrent, ce qui explique que seul Windows tombe ici.

## 📤 Dispatché

☐

## 💻 Codé

☐

## ✅ Testé live

☐ **Constaté live 16/08**

## Preuve

Job `95089243508` (PR #138). **Confirme au passage que BUG-CI-006 est bien corrigé** : les logs montrent `+ cross-env 7.0.3` installé et **plus aucune** erreur `'NODE_OPTIONS' is not recognized` — le job échoue désormais 3 minutes plus loin, à l'empaquetage. Piste : sérialiser les deux builds, ou leur donner des `outDir` distincts. ⚠️ **Lot outillage de build — consigné seulement**, ne se valide que sur un runner Windows.

