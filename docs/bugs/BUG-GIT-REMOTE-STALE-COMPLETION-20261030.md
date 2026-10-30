---
id: BUG-GIT-REMOTE-STALE-COMPLETION-20261030
---

# BUG-GIT-REMOTE-STALE-COMPLETION-20261030

Une réponse de configuration de l'origine Git terminée après changement de contexte
peut rappeler le chargement de l'ancien contexte depuis les paramètres Git.

## 📤 Dispatché

☑ Audit navigation A→B→A du 30 octobre 2026, base `bd5e0f5ea`.

## 💻 Codé

☐ main — correction locale en validation ; pas encore fusionnée.

## ✅ Testé live

☐ production — composants locaux avec réponses synthétiques et recette navigateur locale seulement.

## Reproduction et portée

Le test exécute `GitTab` et `GitSettingsPanel`, retient le POST de configuration
de A, change le contexte, puis termine le POST. Avant correction, le callback
ancien relance des requêtes supplémentaires vers A. La garde de chargement de
GitTab ne protège pas contre un nouveau chargement lancé par ce callback ancien.

Trois témoins rouges établissent le contenu périmé dans le DOM : commits A après
passage à B, puis commits de l'espace w1 après passage à w2 pour la sauvegarde
et pour le retrait. Un autre témoin rouge montre un brouillon d'URL de A conservé
dans B lorsque les deux configurations ont la même URL initiale.

Ce constat ne démontre pas une écriture entre projets dans le navigateur déployé.
Le shell peut remonter le panneau lors d'un changement de projet ; les tests
distinguent changement de props, changement de workspace et fermeture du panneau.
Il ne constitue pas une explication de l'échec historique README B→A de #834.

## Correction en validation

Les mutations de l'origine possèdent une génération par projet/workspace,
invalidée au démontage. Une réponse ancienne ne met plus à jour le panneau,
n'affiche plus de toast et ne rappelle plus le chargement ancien. Un verrou
synchrone commun bloque les soumissions simultanées et les opérations concurrentes
de sauvegarde et retrait de l'origine. Il ne prétend pas annuler un POST déjà envoyé.
Les brouillons d'URL et de branche sont réinitialisés aux valeurs du nouveau
projet/espace ; une actualisation des métadonnées dans le même contexte conserve
la branche en cours d'édition.

Les preuves finales et les limites de navigation seront consignées dans le compte
rendu QA de ce lot. Aucun OAuth, domaine, dépôt client ou déploiement fournisseur
n'est utilisé pour ces tests.
