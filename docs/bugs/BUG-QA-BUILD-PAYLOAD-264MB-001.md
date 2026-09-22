---
id: BUG-QA-BUILD-PAYLOAD-264MB-001
---

## Bug

**Chaque build Cloud Build téléverse ~264 Mo d'artefacts de preuve qui ne servent à aucun Dockerfile.** Sur un export propre de `origin/main` (`git archive`), le contexte de build pèse **358 Mo**, dont **`docs/` = 264 Mo** : `docs/parity` **163 Mo**, `docs/deploy-evidence` **94 Mo**, `docs/ui-ux-evidence` 4,9 Mo, `docs/images` 892 Ko — des captures, HAR et attestations. Le `.gcloudignore` ignore `*.md` puis **ré-inclut** `!docs/*.md` et `!docs/**/*.md` ; les fichiers **binaires** de `docs/` ne sont couverts par aucune règle et partent donc dans le tarball. **Aucun des 4 Dockerfiles** (`Dockerfile`, `infra/docker/deps.Dockerfile`, `node-service.Dockerfile`, `screenshotter.Dockerfile`) ne référence `docs/`. Effet mesuré : l'upload du contexte a dépassé **38 minutes** sur une liaison domestique avant d'être interrompu ; une soumission antérieure du même contexte s'est soldée par un **`INTERNAL_ERROR`** côté Cloud Build après une phase d'upload comparable. Exclure `docs/parity`, `docs/deploy-evidence`, `docs/ui-ux-evidence` et `docs/images` ramène le contexte à **~94 Mo (−74 %)**. Impact : allonge tout `gcloud builds submit` (CD de `main` compris) et fragilise la soumission, sans rien apporter à l'image.

## 📤

☐

## 💻

☐

## ✅

✅ **27/08** mesuré (tailles + absence de référence dans les Dockerfiles) ; **gain de temps non encore chronométré de bout en bout**

## Preuve

`du -sh` sur `/tmp/qa-sweep/src-040dd2976d` (export `git archive origin/main`, SHA `040dd2976d`) : total **358M**, `docs` **264M**, `docs/parity` **163M**, `docs/deploy-evidence` **94M**, `public` 38M, `app` 23M, `packages` 22M. `grep -rn 'docs' Dockerfile infra/docker/*.Dockerfile` → **aucune correspondance**. Règles en cause : `.gcloudignore` lignes `*.md` / `!docs/*.md` / `!docs/**/*.md`. **Correctif proposé** : ajouter `docs/parity/**`, `docs/deploy-evidence/**`, `docs/ui-ux-evidence/**`, `docs/images/**` au `.gcloudignore` du repo.

