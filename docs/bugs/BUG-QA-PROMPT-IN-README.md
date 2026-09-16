---
id: BUG-QA-PROMPT-IN-README
section: "2026-08-12 — Lot Avi « les bases » (5 bugs, priorité ABSOLUE)"
---

## Bug

**Le prompt de l'utilisateur est écrit verbatim dans `README.md`, un fichier de projet.** `starterFiles()` (`services/api/src/app.ts:6046`) interpole `input.prompt` dans le README pour tout projet créé depuis un prompt. Or les utilisateurs collent régulièrement des secrets dans un prompt. Ce README est ensuite **exporté** (ZIP), **committable** dans Git, embarqué dans un **artefact de déploiement**, et visible de tout **collaborateur** du projet.

## 📤

✅ 12/08

## 💻

☑ 09/09

## ✅

✅ **12/08** fuite prouvée live

## Preuve

Repro API réelle avec un prompt piégé : projet `cmsq9ejje…`, puis `GET /projects/:id/export/zip` → le `README.md` extrait de l'archive contient **`sk-corp-A1B2C3D4E5F6`** et **`postgres://admin:MotDePasse42@10.0.0.5/prod`** — vérifié programmatiquement (`True`/`True`). **Pourquoi je n'ai PAS corrigé à l'aveugle** : le README n'est pas décoratif, c'est le **transport** du prompt. `app/lib/runtime/pending-generation.ts` le re-parse (`lastIndexOf('Prompt:')`) pour alimenter l'agent au premier ouvrage de l'IDE, et le prompt n'est persisté **nulle part ailleurs** (vérifié en base : 0 `AiConversation`, 0 `AiMessage` pour ce projet). Le supprimer sans déplacer le transport casserait le flux prompt→app, c'est-à-dire exactement le cœur du produit. **Forme du correctif proposée** : déplacer le prompt vers un stockage non-fichier (métadonnée projet ou `ide-state`), faire lire le client depuis cette source, et ne laisser dans le README qu'une mention sans le texte. Exige une re-preuve live du flux complet prompt→app (donc une clé LLM). **LOT SENSIBLE (secrets/PII).** **Revérifié le 09/09** : la colonne Codé était restée à ☐ alors que le correctif ET sa garde existent. Contrôlé en exécutant les gardes, pas en les lisant — épinglé par `services/api/src/prompt-not-in-readme.spec.ts`, `services/api/src/tests/api.spec.ts` (vertes ce jour). ⚠️ « Testé live » reste ☐ : j'ai vérifié des GARDES, pas un écran.

