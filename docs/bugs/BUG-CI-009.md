---
id: BUG-CI-009
---

## Bug

**P2 — deuxième défaut du build desktop Windows, révélé par la correction de BUG-CI-006 : `EBUSY` sur la copie des assets.** Une fois la syntaxe d'environnement corrigée, le job va bien plus loin (`Electron smoke test` **vert**) puis casse à l'étape `Build windows` : `EBUSY: resource busy or locked, copyfile 'public\ecode-static\assets\index-*.css' -> 'build\electron\ecode-static\assets\index-*.css'` dans `prepareOutDir → copyDir` de Vite. Cause : `electron:build:main` et `electron:build:preload` tournent **en parallèle** (préfixes `[0]`/`[1]` du lanceur concurrent) et **écrivent tous deux dans `build/electron`**, chacun recopiant le `publicDir`. Sous Windows, le verrouillage de fichier rend cette course fatale — là où Linux et macOS la tolèrent, ce qui explique que seul Windows tombe ici.

## 📤 Dispatché

☑ 16/09 — instruit par cette session, sans dispatch : le correctif était déjà sur `main`.

## 💻 Codé

☑ 16/09 — **corrigé par `publicDir: false` + `emptyOutDir: false` dans `electron/main/vite.config.ts` ET `electron/preload/vite.config.ts`** (règle 23 : les deux voisins, pas le premier). Présent sur cet historique depuis #346 (`73073359`, 01/09), avec le commentaire qui explique la course en tête de chaque fichier — et rien sous `build/electron` ne consomme ces ressources, le renderer les livre déjà dans `build/client`. **Épinglé le 16/09 par `electron/build-sans-course-publicdir.spec.ts`** (6 verts) : les deux `publicDir` à `false`, les deux `emptyOutDir` à `false`, et les deux prémisses de la course tenues nommément (dossier de sortie commun `build/electron`, lancement par `concurrently`). Contre-épreuve : `publicDir` retiré du main → 1 rouge, `expected undefined to be false`.

## ✅ Testé live

☑ 16/09 — **testé en réel là où le défaut vit, la CI Windows** (constaté rouge le 16/08) : job `104680997262` (run `35060966476`, PR #433), « Electron smoke test » vert puis étape « Build windows » **success** 09:53:08 → 10:07:24, artefact `vibecore-desktop-windows` téléversé. Sept runs « Desktop Electron » consécutifs verts le 16/09 (n° 828 → 834).

## Preuve

Job `95089243508` (PR #138). **Confirme au passage que BUG-CI-006 est bien corrigé** : les logs montrent `+ cross-env 7.0.3` installé et **plus aucune** erreur `'NODE_OPTIONS' is not recognized` — le job échoue désormais 3 minutes plus loin, à l'empaquetage. Piste : sérialiser les deux builds, ou leur donner des `outDir` distincts. ⚠️ **Lot outillage de build — consigné seulement**, ne se valide que sur un runner Windows.

**Garde (règle 16)** : preuve live ci-dessus **+ épinglé par `electron/build-sans-course-publicdir.spec.ts`** ; en second rideau, le job « windows desktop build » sur toute PR touchant `electron/**`.
