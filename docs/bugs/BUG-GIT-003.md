---
id: BUG-GIT-003
---

## Bug

**P0 — PANNEAU GIT : une modification enregistrée dans l'IDE est INVISIBLE pour Git, et le commit est définitivement impossible.** Après une édition réelle tapée dans l'éditeur et enregistrée, le panneau affiche toujours « **0 modification** » et les boutons « **Committer les modifications** » et « **Commit & push** » restent **désactivés**. Le panneau affiche pourtant une branche (`main`), des compteurs et un historique — un état de dépôt que rien ne rafraîchit.

## 📤 Dispatché

☑

## 💻 Codé

☑ 09/09

## ✅ Testé live

☐ **Constaté live 17/08 ; correctif non revérifié à l’écran**

## Preuve

**Repro live (chemin produit, pas de contournement)** — projet réel, IDE ouvert, `src/App.tsx` ouvert dans Monaco, texte tapé (contenu de l'éditeur vérifié : `// QA edit real editor`), enregistrement déclenché → requêtes observées : `200 PUT /api/workspaces/ws-…/ide-state` **et** `204 PUT /api/runtime/workspaces/ws-…/files/write`. Puis panneau `?panel=git` : « 0 modification », commit désactivé. **Cause racine** : l'enregistrement de l'IDE écrit dans le **pod** (`/files/write`) et dans **ide-state** ; or `GitCliProvider.status()` (`services/api/src/project-storage.ts:960`) exécute `git status --porcelain` sur l'arbre de travail **côté API** (`workspacePath(projectId, workspaceId)`), que **rien ne met à jour depuis ces deux sources** — il ne peut donc jamais signaler de changement. Et `GitCliProvider.commit()` (ligne 1016) reçoit la liste matérialisée `files: await listProjectFilesIncludingIdeState(...)` (`app.ts:30571`) mais **n'utilise jamais `input.files`** : il fait `git add --all` sur un arbre inchangé, donc `git diff --cached` est vide et le commit lèverait `GIT_NOTHING_TO_COMMIT`. **Correctif visé** : matérialiser les fichiers courants (stockage projet + ide-state) dans l'arbre de travail avant `status` et avant le `git add` du `commit` — c'est exactement ce à quoi sert le paramètre `files` aujourd'hui ignoré. **Observation annexe** : le pod de l'espace de travail n'est pas un dépôt Git (`fatal: not a git repository`) — le dépôt vit côté API, ce qui est cohérent avec l'architecture mais rend la désynchronisation ci-dessus structurelle. ⚠️ **Observation live 19/08 par la voie NATIVE (terminal du workspace, pas l'API)** : dans le pod, `git status` répond `fatal: not a git repository (or any parent up to mount point /)` — **`/workspace` n'est pas un dépôt git**. Le panneau Git regarde donc un autre emplacement que le terminal (cohérent avec « git sur le pod API, pas le pod workspace »). Cela explique qu'un fichier créé dans le terminal ne fasse pas bouger le panneau, et que le panneau affiche « 0 modification ». Je NE requalifie pas l'entrée : je ne sais pas si cette séparation est le défaut ou l'architecture voulue. Piste à trancher avec `BUG-RUNTIME-DIVERGENCE`. **✅ CORRIGÉ DEPUIS, et la ligne était restée à ☐ par oubli — relevé le 09/09 en relisant le code, pas en le supposant.** `GitCliProvider` porte maintenant `materializeWorkingTree(projectId, files, workspaceId)`, dont le commentaire décrit MOT POUR MOT le défaut relevé ici : « the IDE saves an edit to the workspace pod and to `ide-state`; neither of those is the git working tree… That is why `commit()` is handed `listProjectFilesIncludingIdeState(...)`, a parameter it then ignored ». Les DEUX points d'entrée — `status()` et `commit()` — matérialisent désormais les fichiers de l'appelant, et seul le contenu MODIFIÉ est écrit (sans quoi interroger `status` ferait paraître tout le dépôt fraîchement modifié). épinglé par `services/api/src/tests/git-editor-save-visible.spec.ts` (5 tests : le fichier édité ressort comme modifié, le chemin n'est pas amputé de son premier caractère, un fichier CRÉÉ dans l'éditeur est vu, le commit porte les fichiers de l'appelant au lieu de mourir sur un arbre inchangé, et un contenu identique n'écrit rien). ⚠️ **Ce qui reste ouvert et n'est PAS ce défaut** : `/workspace` dans le pod n'est toujours pas un dépôt git — le dépôt vit côté API. Un fichier créé au TERMINAL ne fait donc toujours pas bouger le panneau. C'est une question d'architecture, à trancher avec `BUG-RUNTIME-DIVERGENCE`, pas un bug de câblage.

