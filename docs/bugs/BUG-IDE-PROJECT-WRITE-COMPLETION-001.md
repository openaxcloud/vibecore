---
id: BUG-IDE-PROJECT-WRITE-COMPLETION-001
---

# Une création ou suppression terminée après navigation modifie le mauvais cache

## 📤 Dispatché

22 octobre 2026 : suivi séparé de #770, branche fix/project-file-write-completion-20261022. La revue a identifié une limite préexistante hors du correctif de lecture/documents : une création ou suppression du projet A terminée après passage à B peut modifier les fichiers/tombstones de B. Les wrappers du workbench peuvent aussi modifier sa sélection ou ses brouillons.

## 💻 Codé

Correction committée localement `26f7441685ebea6bc8cb666a1fdda8e648ce4872` dans une branche distincte, non intégrée à main. Préserver le résultat backend de A et ses droits ; empêcher uniquement la publication tardive dans l’état courant de B. Ne pas présenter l’isolation des lectures de #770 comme une isolation complète des opérations.

## ✅ Testé live

Contre-épreuve unitaire différée : sept nouveaux cas échouent sur la base, tandis que les 34 contrôles existants passent ; les mêmes 41 tests passent ensuite, puis 50 contrôles ciblés passent après ajout des contre-cas. Le banc UI local dispose des vraies API projets et du stockage synthétique, mais le gestionnaire runtime local par défaut 127.0.0.1:3010 refuse la connexion (sonde GET /health, curl7/HTTP000) : POST/DELETE des fichiers runtime ne peuvent pas y réussir. Les tests unitaires ne valent pas validation réelle de création/suppression dans l’UI. Aucun import ZIP substitué à ces routes, aucune mutation production ni nouvel accès demandé.

Les enchaînements multi-opérations de renommage, duplication et upload peuvent initier une seconde opération après navigation ; ils sont hors de cette correction de complétion et ne sont pas certifiés.

[Preuves et limites](project-write-completion-2026-10-22/README.md).

Build, typage, lint et gitleaks verts. Suite complète : 10 039 tests réussis et sept omissions existantes, aucun échec au premier passage. Cela ne lève pas le blocage de recette runtime réelle.

Complément URL avant rebascule du store : défaut tombstone et sélection reproduit, garde canonique ajoutée ; 57 tests ciblés verts, revalidation complète terminée sur dd773094 : build/hooks verts, 10 046 tests réussis et sept omissions existantes, sans échec. Les compteurs précédents restent ceux du commit 26f74416.
