---
id: BUG-GENERATION-FINAL-FILE-20261029
section: "Agent et messages"
---

# Finalisation du dernier fichier et validation syntaxique des propositions

## 📤 Dispatché

☑ 29/10 — génération interrompue et source invalide observées ; reproduction isolée sans appel fournisseur.

## 💻 Codé

☐ — correctif sur branche séparée, non fusionné.

## ✅ Testé live

☐ — aucune recette production du correctif ; aucun fichier client modifié.

## Preuves et causes établies

- Le nettoyage immédiat de `onFinish` pouvait annuler une action fichier avant que
  l'effet échantillonné à 50 ms ait consommé sa véritable balise fermante. Le test
  du parseur et du moteur réels échoue avant correction : action `aborted` au lieu
  de `complete` malgré un fragment final complet.
- Le validateur de propositions avalait les erreurs grammaticales Babel comme
  s'il s'agissait toujours d'une syntaxe non supportée. La reproduction avec
  `{errors.message && {errors.message}}` échoue avant correction.
- Le build rapporté de la recette production échoue dans `tsc -b`, avant Vite :
  une erreur TS1005 dans App.tsx et cinq TS2580 (`process`) dans vite.config.ts.
  Cela établit un projet non compilable, pas la cause terminale du transport.

## Correction

La finalisation utilise le snapshot de l'effet courant : les fermetures réelles
sont parsées avant le nettoyage en file, puis le filet EOF reste distinct. Un
échantillon invalidé par navigation/démontage ou Stop ne crée aucune action.
Le nettoyage est limité au message et ses lanes, et abandonné si le runtime ou
la liaison projet change avant son exécution. Aucun callback ne réinjecte un
message absent dans un autre transcript.

Les erreurs grammaticales Babel deviennent `GeneratedFileSyntaxError`, avec
localisation. Un plugin explicitement manquant reste distinct. Le vrai pipeline
de propositions conserve le brouillon invalide et l'original, refuse son
acceptation et n'écrit pas dans le runtime.

## Validation isolée

Tests du parseur et ActionRunner réels avec runtime mémoire ; tests du vrai
WorkbenchStore pour ordre de file et changements de runtime/projet ; tests de
navigation et Stop avec le sampler réel ; validation Babel réelle et pipeline
d'acceptation réel. Aucun fournisseur, donnée client ou ressource payante.

## Limites ouvertes

- Le finishReason serveur, le dernier delta et l'identifiant du run de production
  ne sont pas disponibles : limite de sortie, EOF, timeout et interruption ne
  sont pas départagés pour cette exécution.
- Le texte « response completion is not confirmed » décrit une preuve textuelle,
  et n'établit pas à lui seul une interruption. Le coût affiché n'établit pas la
  facturation ; une réservation conservatrice n'est pas une dépense facturée.
- `{error && {error}}` est syntaxiquement valide mais peut échouer au rendu React.
  Les types Node absents ne sont pas réparés par ce contrôle grammatical.
- Le chemin direct ActionRunner possède encore son mécanisme de réparation et
  de déduplication ; ce lot ne prétend pas garantir toutes ses écritures. Les
  plugins non supportés ne constituent pas non plus une validation complète.
- Aucun retry fournisseur, aucune augmentation de budget, aucun changement des
  limites de commande ou des garanties d'arrêt.
