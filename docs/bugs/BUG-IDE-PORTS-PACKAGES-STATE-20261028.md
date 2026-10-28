---
id: BUG-IDE-PORTS-PACKAGES-STATE-20261028
---

## Bug

Ports utilise le libellé traduit « publique » comme valeur fonctionnelle lorsque la visibilité du port n’est pas enregistrée. En français, le bouton propose alors « Rendre public » et prépare `public` ; en anglais il propose correctement « Make private » et prépare `private` pour la même donnée. Packages indique le gestionnaire sélectionné uniquement par sa couleur/classe, sans état accessible.

## 📤 Dispatché

☑ Reproduction et correction locale ciblée autorisées le 28/10/2026.

## 💻 Codé

☐ main — trois changements locaux dans les fonctions Ports/Packages de BaseChat : valeur canonique distincte du libellé existant ; `aria-pressed` sur les quatre gestionnaires. Aucun changement d’API, d’envoi ni d’Editor.

## ✅ Testé live

☐ Production non testée. Avant correction : quatre contextes Chromium sur route compilée locale, FR/EN à1280×900, API GET synthétique ; aucun backend réel. Régression AST : trois échecs avant, huit tests verts après. Après build assemblé4537 : quatre contextes compilés FR/EN1280 verts pour action Ports et sélection accessible Packages ; aucune opération backend. Validations globales coordonnées par le parent.

## Preuves et limites

[Reçus et périmètre](ui-ide-ports-packages-2026-10-28/README.md).
