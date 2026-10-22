# Corrections après CI de e3244fb

Le scanner effectif reproduit localement les six nouveaux résidus du premier commit : quatre titres traduits embarqués dans le composant et deux messages d’erreur de chargement. Le rouge d’origine est conservé. Les traductions passent désormais par les catalogues centraux `root.startup*` des quatre langues. Le serveur rend déjà ces libellés ; le contrôleur DOM de reprise les utilise avant toute hydratation, puis React ne reprend qu’après le chargement de ses catalogues. Les diagnostics de chargement emploient des codes structurés et conservent la surface et le statut HTTP. Ni scanner, baseline, allowlist, assertion ni CI ne sont assouplis.

La CI signalait aussi que le titre `h1` de l’alerte cachée devenait le premier titre du document, devant celui de la page. L’alerte utilise un `h2` étiquetant toujours sa section via `aria-labelledby`. Le test existant `platform-typography.spec.ts` est exécuté sans modification avec la recette de connexion ; les scénarios d’erreur vérifient aussi le titre accessible de niveau2.

Le téléchargement des journaux GitHub depuis cet exécuteur a répondu403 ; aucune nouvelle tentative ni autre route n’a été utilisée. Le scanner local fournit la contre-épreuve reproductible. L’échec de préparation Docker de la tranche4 signalé par la coordination n’est pas attribué au produit et aucune relance de cette CI n’est faite ici.

Les nouvelles empreintes de sources et les résultats sont joints dans ce dossier. L’incident de connexion production reste non expliqué ; ces validations injectent des pannes de catalogue dans un navigateur local, sans authentification ni fournisseur réel.

## Résultats de cette revalidation

- Scanner source effectif et validate-catalogs : verts ; aucun résidu dans le lot, aucune modification de baseline/allowlist.
- 34 tests de logique/surfaces/scanner : verts.
- Build de production avec heap8GiB et typecheck officiel complet : verts.
- Lint des fichiers corrigés : zéro erreur et zéro warning.
- 13 cas navigateur sur le nouveau bundle : les12cas de connexion et le test typography existant sur accueil/pricing, zéro retry, zéro échec.
- Reprise503 en français sur les trois formats Chromium : clic réel, formulaire visible, aucun débordement ni erreur React.

Serveur de cette recette :127.0.0.1:5197, mêmes versions et paramètres que la première série, avec `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5197`. La configuration `playwright.startup-recovery.config.ts` inclut maintenant le test typography.
