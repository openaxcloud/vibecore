---
id: BUG-IDE-MONACO-CONTENU-INITIAL-001
---

## Bug

Sur une ouverture à froid, cliquer `audit.txt` dès que la bibliothèque est visible peut laisser Monaco afficher le contenu du README alors que l'onglet et le chemin actif indiquent `audit.txt`. Mesuré une fois sur trois répétitions locales le 12 octobre 2026, après le correctif local des onglets, base main `30fb463710f2c75429e29cae8aefb76bfc5194d0`. Aucune conséquence d'écriture de ce contenu sous un mauvais chemin n'a été testée ni affirmée.

## 📤 Dispatché

☑ — détecté et relu indépendamment pendant l'audit local du 12 octobre 2026.

## 💻 Codé

☐ — aucun correctif de ce défaut dans cette tâche, bornée au premier défaut confirmé des onglets.

## ✅ Testé live

☐ — reproduction locale uniquement, production non testée.

## Preuve et piste

`/tmp/files-audit-evidence/tab-after-first/ide-file-tab-identity-open-eec93--tab-without-duplicating-it-repeat1/` contient capture, contexte et trace. L'assertion attend `PERSISTENCE-ORIGINAL-20261012` mais reçoit `# File tab identity audit`. La capture a été inspectée.

La relecture de la trace distingue ce défaut d'une sélection écrasée : le GET `ide-state` s'achève avant le clic avec `ui={}` ; le PUT suivant conserve `selectedFile=/home/project/audit.txt` et un onglet lié à ce même fichier, alors que Monaco affiche encore le README.

Piste source non corrigée : `DesktopCodeEditor` dans `packages/editor/src/index.ts` initialise Monaco après un import asynchrone, avec les props capturées au montage. L'effet synchronisant valeur/chemin rend la main si l'éditeur n'existe pas encore. Une contre-épreuve contrôlant ce chargement reste à écrire avant d'affirmer une cause définitive.

Le test borné de duplication attend maintenant que le README initial soit effectivement affiché avant son premier clic. Cette précondition isole les onglets ; **elle ne corrige pas ce défaut à froid**. Voir le [rapport local](../reprise/2026-10-12-audit-local-fichiers.md).
