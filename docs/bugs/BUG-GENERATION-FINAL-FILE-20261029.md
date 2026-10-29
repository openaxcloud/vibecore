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

## Revue de l'assemblage avec #853 et #855

La revue indépendante a détecté que le mode Babel `module` rejetait un retour
de premier niveau dans un fichier `.cjs` pourtant accepté par le vrai contrôle
syntaxique de Node. Le mode `commonjs` est désormais réservé aux fichiers `.cjs`.
Les modules explicites et JSX gardent leurs exigences ; un export ESM dans un
fichier CommonJS reste refusé. Deux contre-épreuves étaient rouges avant ce
correctif (retour CommonJS valide refusé, export ESM illégal accepté).
Le refus conserve le chemin et la position dans `GeneratedFileSyntaxError`,
afin de ne pas attribuer l'erreur aux autres propositions du même lot.
Cette preuve reste locale : elle n'établit ni la fin effective du flux de la
recette Aster, ni une réussite de son prochain parcours en production.

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
