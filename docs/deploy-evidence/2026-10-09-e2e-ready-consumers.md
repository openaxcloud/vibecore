# Préconditions des deux parcours IDE bloquants

Base : main `01b72f6a5c5fe7a1b783dc27730f092922196c6e`, arbre propre après
récupération du dépôt. CI Chromium, run `37890108457`. Artefacts de résultats :
tranche 1 `11599706368`, tranche 2 `11598861606`.

L'ouverture de palette échoue sur le témoin d'ouverture, avant le clic externe.
Le parcours de réparation revient bien sur Agent, mais le message attendu ne
paraît pas, sur les trois tentatives. Cela ne prouve pas une panne de fermeture
de palette ni un défaut de routage de panneau.

Le chemin source distingue `PendingComposerShell` de `ChatImpl`. La coque peut
afficher les outils et reçoit les événements dans `BaseChat`, mais n'a pas de
callback `sendMessage`. Le simple témoin `button-add-tab`, ou le chargement de
la page, ne prouve donc pas la présence du consommateur définitif. L'hydratation
reste une hypothèse de ces échecs : aucune trace navigateur exploitable ne la
certifie dans les artefacts récupérés.

Les tests attendent désormais un message de la conversation persistée avant
leurs actions. La palette utilise le déclencheur nommé du projet, sans sélecteur
anglais ambigu ; la fixture passe par les vraies routes API de conversation et
vérifie leurs réponses. Les quatre comportements de fermeture/ouverture restent
assertés ; la réparation doit toujours apparaître comme message envoyé et vider
le composeur. Aucun skip, waiver, retry supplémentaire ou timeout de verdict
n'est ajouté. Cette précondition ne certifie pas le comportement d'une action
utilisateur pendant le chargement provisoire, qui reste à vérifier séparément.

La CI du nouveau head doit valider ces deux tests et l'ensemble des tranches.
Ces modifications de tests ne sont pas présentées comme un correctif produit
déjà démontré ni comme une vérification responsive de production.
