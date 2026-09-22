---
id: BUG-IDE-BLANK-001
---

## Bug

**(P1) L'éditeur affiche un fichier VIDE à chaque ouverture.** Seul l'onglet restauré au MONTAGE s'affichait ; toute ouverture ultérieure (arborescence OU onglet déjà ouvert) rendait une zone d'édition totalement vide — ni texte, ni gouttière, ni numéros de ligne — jusqu'au rechargement. Fil d'Ariane, langue et « Ln 1, Col 1 » restaient corrects, ce qui faisait passer le bug pour un défaut de rendu. *(Diagnostic d'origine : PR #112, restée CONFLICTING ; corrigé ici à la racine, sans reprendre les autres changements de cette PR.)*

## 📤 Dispatché

✅ 11/08

## 💻 Codé

✅ `c0c00bea` (sur `main`)

## ✅ Testé live

☐ *(à vérifier live sur l'IDE)*

## Preuve

CAUSE : l'effet attache le modèle (`editor.setModel`) puis reconstruit l'index workspace en EXCLUANT le fichier courant, et dispose tout ce qui n'y figure plus — donc le modèle qu'il vient d'attacher (`owned={B,C}` → ouvre B → `next={A,C}` → `dispose(B)`). Aucune auto-réparation : la garde de `setModel` comparait les URI, or un modèle disposé CONSERVE son URI. Le fichier du montage n'ayant jamais transité par l'index, lui seul survivait. FIX : `workspaceModelUrisToDispose(...)` (fonction pure exportée) ne dispose JAMAIS le modèle attaché + garde `setModel` comparant l'IDENTITÉ. 4 tests ajoutés ; en retirant la seule garde `uri !== attachedUri`, **2 tests tombent** (survie du modèle attaché) tandis que les **2 tests « fichier réellement sorti du workspace » restent VERTS** — la purge n'est pas désactivée, seulement empêchée de se retourner contre le fichier ouvert. @vibecore/editor 34/34.

