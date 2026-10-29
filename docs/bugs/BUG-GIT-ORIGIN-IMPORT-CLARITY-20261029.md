---
id: BUG-GIT-ORIGIN-IMPORT-CLARITY-20261029
---

# Distinguer la configuration de l’origine Git et l’import des fichiers

## Constat

Sur le lot assemblé `5ac435a35`, le sélecteur affiche « Connecter » et le toast
confirme une origine configurée, sans expliquer que le contenu du dépôt n’a pas
été importé. Le panneau ne propose pas l’entrée d’import existante. Le contrat
réel `configure-remote` appelle `git remote add/set-url` : il ne clone pas,
ne tire pas de fichiers et ne change pas de branche.

## Correction locale

FR/EN : le choix de dépôt indique « Utiliser comme origine Git ». Une explication
visible avant sélection et le toast de succès précisent que les fichiers ne sont
pas importés. Un lien vers `/import-github` propose explicitement l’import dans un
nouveau projet. Il ouvre le parcours existant, sans soumission implicite ni
modification du projet courant. Les messages d’erreur restent inchangés et visibles.
Aucun changement OAuth, API, permission ou backend.

## Preuves et limites

Les six nouveaux cas de composants exécutent réellement le composant avec réponses
HTTP isolées : quatre échouent avant correction, deux témoins d’erreur passent.
Après correction, 37/37 tests passent (six nouveaux, 31 existants) : FR/EN,
explication, libellé de sélection, lien exact, toast succès, erreur, contrat du
seul POST configure-remote. Les tests clavier et concurrence existants sont conservés.
Ils ne prouvent ni OAuth réel, ni clone/import fournisseur, ni DNS/publication.
Le lint initial a signalé cinq espacements dans le nouveau test, corrigés sans
changement d’assertion. Build/typecheck et recette navigateur de l’assemblage
restent à valider par le coordinateur avant publication.

| État | Résultat |
| --- | --- |
| Dispatché | Oui — lot local Git du 29 octobre |
| Codé sur main | Non — commit local uniquement |
| Testé live | Non — composants isolés, aucune production authentifiée |
