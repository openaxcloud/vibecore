---
id: BUG-GIT-REMOTE-PENDING-DRAFT-20261030
---

# BUG-GIT-REMOTE-PENDING-DRAFT-20261030

Une réponse de sauvegarde ou de retrait de l'origine Git peut effacer le texte
saisi dans le champ URL après l'envoi, alors que les paramètres restent ouverts.

## 📤 Dispatché

☑ Audit du 30 octobre 2026, lot local séparé de #858, base locale `9e69bcee7`.

## 💻 Codé

☐ main — correctif local en validation, non publié ni fusionné.

## ✅ Testé live

☐ production — preuve locale sur composants réels avec réponses synthétiques.

## Reproduction et portée

Le test monte les vrais `GitTab` et `GitSettingsPanel`. Le POST conserve l'URL
présente au moment de l'envoi ; le GET suivant reflète cette même valeur, comme
le backend pour un workspace primaire. Le champ n'est ni désactivé ni en lecture
seule pendant le POST. Le texte saisi après l'envoi est visible avant la réponse,
puis l'effet de synchronisation des métadonnées le remplace par l'URL enregistrée.
Le même nœud DOM reste monté. Aucun second POST n'est effectué automatiquement.

Trois témoins rouges avant correction : édition pendant le POST de sauvegarde,
édition entre son succès et la réponse GET, édition pendant le retrait de l'origine.
Trois contre-témoins passent déjà : champ intact après sauvegarde et actualisation,
échec puis nouvelle soumission du brouillon, champ intact après retrait.

Il s'agit de perte de saisie locale. Ces tests ne démontrent ni perte de données
serveur, ni écriture vers un autre projet, ni cause de l'échec historique #834.
Aucun fournisseur Git, OAuth, dépôt client ou service de publication n'est appelé.

## Correction proposée

Une révision et un indicateur de modification du brouillon appartiennent à la
génération projet/workspace existante. Le succès n'acquitte que la révision
effectivement envoyée. Les métadonnées serveur peuvent rafraîchir un champ intact,
mais ne remplacent plus une édition ultérieure. Le retrait respecte la même règle.
Le changement de contexte réinitialise toujours les champs ; les gardes de réponse
obsolète et de soumission concurrente de #858 restent en place.

## Validations locales

- Avant correctif : 3 échecs ciblés et 3 contre-témoins passants dans le test nouveau.
- Après correctif : 158 tests Git sur 25 fichiers passent directement, sans reprise
  ni test ignoré ; ces résultats incluent les six nouveaux témoins.
- Revue indépendante favorable du blob produit
  `b38050584dedac36aabd518235c6c02292217cad` ; 22 tests voisins exécutés par le relecteur.
  Ils recouvrent les résultats précédents et ne s'additionnent pas.
- Typecheck web, lint des fichiers modifiés, diff-check et 16 tests du générateur
  d'inventaire passent. L'inventaire dérivé contient 593 entrées.
- Build client et SSR réussi (1 min 41 s puis 20,94 s). La recette navigateur
  reste suivie séparément avant toute publication.

Les preuves locales rouges et vertes sont conservées dans
`/tmp/git-remote-edit-audit/` de l'environnement de validation. Aucun de ces
résultats ne valide un fournisseur Git réel ni la production authentifiée.
