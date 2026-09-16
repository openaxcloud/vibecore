---
id: BUG-CI-003
---

## Bug

**Production CI rouge en continu depuis le 07/08 — garde i18n (`scan-source.mjs`).** 5 fichiers repassés sous « new-file-debt » : les 3 titres `sr-only` ajoutés par BUG-USR-007 étaient codés en dur en ANGLAIS ; `workspace-agent` levait un `new Error('File already exists')` brut au lieu de `workspaceAgentError(...)` ; `preview-proxy` écrivait la copie de ses refus 410/503 en dur en FRANÇAIS. Toutes les exécutions de Production CI du 07/08 au 11/08 ont échoué à cette étape exacte.

## 📤 Dispatché

✅ 11/08

## 💻 Codé

✅ `9fc8a243` (sur `main`)

## ✅ Testé live

☐ *(à vérifier live après déploiement)*

## Preuve

AVANT `pnpm run i18n:check` exit 1, résidu **23 dans 7 fichiers**, 5 régressions de baseline. APRÈS exit 0, résidu **17 dans 2 fichiers**, « baseline clean » ; catalogues en=18325/fr=18325/matching=18325. **Impact réel au-delà du lint** : sur EEXIST un utilisateur FR recevait le fallback générique « La requête vers l'espace de travail n'a pas pu aboutir. » — l'information actionnable (le nom existe déjà) était PERDUE. 3 tests de régression ajoutés, asseyant les DEUX langues, chacun vérifié rouge-avant/vert-après. Suites : preview-proxy 100/100, workspace-agent 81/81.

