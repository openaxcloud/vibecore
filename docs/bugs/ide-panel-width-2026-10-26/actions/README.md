# Actions Agent et double infobulle — diagnostic local, 26 octobre 2026

Base du worktree panel-width : main90d92ff. Aucun backend/client/IA utilisé. Aucun index/commit/publication. Sources des autres sessions préservées. 36 PR ouvertes examinées (pr-files.json) : aucune ne touche Artifact/GlobalTooltip ; FileTree chevauche PR559 et n'est pas modifié.

## Preuves et corrections locales

- ActionList exact extrait d'Artifact, JSX du toolbar exact extrait de FileTree, vrai GlobalTooltip et vrai Radix montés en React. Sass source compilé + utilitaires et reset existants. Services et callbacks métier sont stubs locaux : cette recette ne valide pas l'ouverture backend d'un fichier. Le panneau est isolé, le grand espace vide des captures n'est PAS une capture de l'IDE complet.
- `before.json` : 9 observations (viewports2048/1536/1280 × panneaux320/360/400), FR sombre. Au panneau320 le chemin long occupe202px pour508px de texte ; basename invisible. Boutons44px.
- `counterproof.json` : CSS injecté et retrait temporaire data-vc-tooltip des boutons Radix ; contrepreuve seulement, distincte du source compilé après.
- `after.json`, `after-*.png` : source réel GlobalTooltip rebundlé et Artifact.scss compilé, sans injection corrective CSS/DOM. Les seuls ajustements DOM sont largeur de fixture et enrichissement des attributs équivalent au mécanisme BaseChat. Chemin long scrollWidth202=clientWidth202, cible55.17px, chemins courts44px ; alignement gauche. Aucun handler/statut/label produit modifié.
- `double-tooltip.png` avant : DEUX infobulles personnalisées « Fichiers », Radix et GlobalTooltip. Ce n'est pas une capture de bulle native du navigateur. Après : une seule infobulle personnalisée. Labels aria conservés. Les filenames nonRadix et leur titre ne sont pas supprimés.
- `interactions.json` : focus Radix puis Tab au deuxième contrôle donne une seule infobulle ; focus fichier ordinaire conserve GlobalTooltip ; trois cibles>=44px et hit-test central vrai, textes/aria intégraux.

## Limite native explicitement reproduite

`after.json.nativeMutation` : title absent pendant hover devient « Fichiers » après ajout d'un élément sous l'IDE avec MutationObserver équivalent à syncIconTitles. Le source BaseChat réinjecte donc le title natif. Notre correctif supprime temporairement le title pendant hover/focus puis le restaure à sortie/unmount, mais ne prétend PAS résoudre ce retour lors de mutations. BaseChat appartient à une autre session ; aucun observer supplémentaire n'a été ajouté. Le retrait du title JSX FileTree seul serait insuffisant. Correction coordonnée supplémentaire à décider par le parent.

## Validation et limites

11 tests /4 suites verts (`unit-final.log`) ; lint ciblé final0 (`lint-final.log`). Aucun build application/typecheck global lancé par cette session : le parent regroupe les validations. Pas de certification globale responsive/a11y/production. InlineFileActionDiff/FilePreview lus, aucun défaut supplémentaire reproduit ni correction supposée. Captures utilisateur Library indisponibles, non vues.

Première géométrie sans reset CSS invalidée et conservée sous `initial-missing-reset-invalid-geometry.json`, exclue des conclusions. pnpm système a tenté une vérification/install automatique échouée ENOENT avant tests ; aucune installation aboutie. Les validations ont ensuite utilisé directement les binaires des dépendances existantes, sans installer.

Cleanup : navigateur fermé, serveur propre PID259910/startTicks5949210 vérifié puis SIGTERM ; PID absent et port18499 refusé (111), reçu cleanup.json. Aucun processus tiers arrêté.

## Complément hideTooltip (12:11 UTC)

GlobalTooltip respecte maintenant data-vc-tooltip-hidden : aucune nouvelle infobulle au hover/focus masqué, timer vérifiant attribut courant/connexion avant publication, masquage au pointerdown souris inclus et au click (le focus entre pointerdown et click peut sinon rouvrir la bulle). La restauration du title supprimé temporairement n'écrit pas sur une cible marquée hidden. Aucun observer ajouté. La réinjection native ultérieure par BaseChat reste une limite ; une modification programmée sans événement utilisateur sur une bulle déjà visible n'est pas observée automatiquement.

`hidden-tests-final.log` : 7 tests verts /2 suites (6 GlobalTooltip +1 IconButton.tooltip), lint ciblé0 `hidden-lint-final.log`. Les reçus navigateur after.json antérieurs ne sont pas présentés comme validation navigateur de ce dernier delta. Aucun nouveau serveur/browser/build lancé pour ce complément. Root regroupe la recette finale et les validations d'application.
