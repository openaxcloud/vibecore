# Skills — audit local 28 octobre 2026

Panneau auparavant non exercé dans cette passe. Chromium local sur build e85bb2813, API/runtime synthétiques, aucune installation/toggle/génération ni requête extérieure. Aucun fichier source ni serveur modifié.

## Défaut reproduit

La description d’une compétence intégrée contenant une URL longue non sécable déborde horizontalement à travers le panneau. `BaseChat.tsx` vers18363 : span description `block text-xs...`, sans `overflow-wrap`. Donnée isolée : `https://example.invalid/` +60segments. Ce n’est pas une donnée cliente.

Contre-preuve navigateur : ajout temporaire `overflow-wrap:anywhere` uniquement sur ce span, sans masquer/tronquer le texte ni retirer le bouton. Largeur panneau inchangée, scrollWidth revient à clientWidth. Ce n’est PAS une recette du correctif compilé : aucun correctif source appliqué.

- 390 px : 3123 → 358, clientWidth 358, assertions True.
- 820 px : 3123 → 771, clientWidth 771, assertions True.
- 1280 px : 2680 → 588, clientWidth 588, assertions True.
- 1536 px : 3176 → 815, clientWidth 815, assertions True.

Proposition minimale : `style={{ overflowWrap: 'anywhere' }}` ou classe utilitaire équivalente sur la description Built-in, avec test de composant et recette compilée aux mêmes dimensions, puis vérification des descriptions Installed/Community si contrats analogues. Ne pas modifier actions/contrat backend.

## Contre-hypothèse écartée

Le champ Community n’a pas de label explicite, mais Chromium lui donne correctement le nom accessible du placeholder : absence de nom NON reproduite. État vide et saisie Community passent géométrie sur4formats. Ne pas le compter comme bug.

## Limites

Le premier essai long-description a capturé deux nœuds desktop détachés (largeur0). Ces deux mesures sont invalides ; seuls les reçus `long-description-counterproof` avec assertion connected/width et stabilité sont utilisés. La pause700ms est une fenêtre de diagnostic, aucun test de dépôt modifié. Pas de Safari, zoom200%, lecteur écran ou backend réel. Les mutations sont interceptées/empêchées. Tous les navigateurs de recette se ferment normalement.

## Delta source appliqué (sans commit)

Après autorisation parent, seul span Built-in dans BaseChat.tsx reçoit style overflowWrap:anywhere. Aucun hash modifié : avant/après c2081c577b3d95357da31797ed9ca7e36ccb1aac8c16677377f89444683914ec. Les14tests existants AST/Problems passent (`guards.log`). Aucun test miroir de propriété CSS ajouté.

`compiled-regression.cjs` utilise les vrais composants et assertions scrollWidth <= clientWidth+1, sans overrideDOM et sans pause700ms. Test rouge sur ancien build390 :3123 >359 (`compiled-red/receipt.json`). Root prend en charge rebuild et recette verte quatreformats ; ne pas présenter contre-preuveDOM comme buildvert. Le script consigne les échecs dans receipt.json, à inspecter indépendamment du code de sortie.

## Correctif compilé final

4/4 recettes sans override passent390/820/1280/1536, scrollWidth=clientWidth358/771/588/815. Build réussi ; lint initial a relevé un formatage JSX uniquement, corrigé ensuite (aucun changement sémantique). Lint final vert. Revue indépendante favorable et14gardes passées. Source et captures limitées aux descriptions Built-in, pas aux actions backend.
