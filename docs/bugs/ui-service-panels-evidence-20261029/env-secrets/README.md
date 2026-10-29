# Env / Secrets — audit local borné29octobre2026

Build local47b1e2e922 (arbre identiquef978), Chromium390/820/1280, fixtures API/runtime synthétiques isolées. Aucun secret réel lu/révélé/copié/créé/modifié/supprimé, aucune sauvegarde, permission ou redémarrage. Aucun fichier produit modifié, aucune publication. Les valeurs Env utilisées sont du texte synthétiqueexample.test ; seules recherches et champs non soumis sont saisis. Secrets n'exerce que liste de clés, filtre et menu.

## Couverture et limites de préparation

- Env vide :3/3vert.503→Retry :390/820verts,1280timeout initial AVANT toute requête de panneau ; recette1280isolée ensuiteverte. Longues clés/valeurs, filtre et Diff scopes masqué :390/820verts,1280même timeout initial puis recetteisoléeverte. Aucune révélation/copie de valeur.
- Secrets vide :3/3vert.503→Retry :390/820verts,1280timeoutinitialavantrequête puis recetteisoléeverte. Cléslongues : menus clavier ouverts et fermés aux3formats, mais défautfocus décritci-dessous.
- Ces timeouts1280 de5000ms sont conservés : screenshot affiche skeleton dechargement ; cause nonétablie, pas supprimée par les recettesisolées. Aucun timeout/assertion du dépôt changé.
- Premier harnaisEnvlong échouait parce que son locatornomméDiff scopes changeait enExit diff ; corrigé en sélecteurstable, ce n'est pas un défaut produit.

## Défauts reproduits

1. Filtres perdus lors remplacementréel de coque : env-draft etsecrets-draft,3/3rougeschacun.390/820→1280 et1280→390 ; attendreclasse mobile/desktop réelle, ancieninputdétaché confirmé, nouvelinputvaleurvide au lieu de synthetic-filter-draft. Env a aussi un brouillon clé/valeur synthétique non soumis, mais cette première recette échoue avant assertiondeschamps : ne pas conclure à leur validation. Aucun champdevaleur/secret n'est proposé pour persistance.
2. MenuSecrets Escape ferme mais laissefocusBODY, au lieu dudéclencheur : secrets-long,3/3rouges. MenuFlottant(ProjectSecretsPanel.tsx) ne restaurepasl'ancre dans sonhandlerEscape. Contrepreuveisolée restaurefocus3formats. focus-escape.patch est proposé NONappliqué, limitéàEscape/ancreconnectée ; ne pas restaurerfocus surcleanup/pointeur extérieur/actionpournepas volerfocus.
3. Tooltipdesktopclélongue : quandfocusestconservé/restauré, panneau588px→scroll2298. Secrets-focus-counterproof1280capture deuxbulles. index.scss4259rendpseudo::afterdata-vc-tooltip sansoverflow-wrap, GlobalTooltip.tsxrend aussiune bulle. Clé est conformeaucontratAPI(projectKeyValueSchema regexA-Z0-9_, pasmax). C'est distinct de l'ellipse volontaireduchip ; aucune valeur secrète révélée. Focuscontrepreuve3/3fonctionnelle, mais la recette complète1280reste rougegéométrie. Ne pas comptercontrepreuvecommevalidationcompilée.

## Proposition de portée pour filtres, en attente accord parent

Nouveau IdePanelFilterState.tsx+spec : provideréphémère limité auxqueries env/secrets, indexpaneId+panel, vieprojet/fenêtre au-dessuscoques (ScopedPaletteProvider dansIdePaletteState déjàkeyprojet/fenêtre). Aucun champclé/valeur/révélé, aucunlocalStorage/sessionStorage/réseau. BaseChat transmet projectId/paneId depuisProjectIdePanelContent ; ProjectEnvPanel etProjectSecretsPanelconsommentquerypartagée. AppelslegacyTerminalsanspaneIdgardentstatelocal. Testsavant/aprèsremount,séparationprojet/fenêtre/panneau et absence stockage, plus recettecompilée. Aucun changementroute/navigationpalette/permissions.

Sourcepatches restentinappliqués. PreuvesJSON/capturesdefautsdans sous-dossiers ; pasSafari/appareilphysique/zoom200%/claviervirtuel/backendréel/production. Touslesnavigateurs sontfermés viafinally ; serveursduparent inchangés.

## Implémentation locale autorisée par parent

Le parent a autorisé la réutilisationduproviderexistant useIdeSettingsFormDraft, pasnouveauprovider : sesfieldsenv.filter/secrets.filter sontajoutés parroot. Mes sources sont BaseChat ProjectEnvPanel+invocationsdirectes, ProjectSecretsPanel et deuxnouveauxtests. Terminalgelé laisséinchangé(sanspane→local). Seulsfiltrespartagés ; champsclé/valeur/révélé demeurentlocaux et ne surviventpasremount.

18testsréussis (10nouveaux,8câblageexistants), avantcorrection7échecs/3réussites surlesnouveaux. TestsréelsEnvAST+Secretsimport couvrentremount,différentsprojets/fenêtres/panneaux,legacyproviderprésent sanspane,absenceécrituresStorage/soumission etfocusEscape/outside. Lintciblé3fichiers réussi. Build/typage/revue/recettecompilée attendentroot, pasdepublication.

Recettes aprèsbuild : DRAFT=1 MODE=empty PANEL=env|secrets (assertionanciennœuddétaché+filtrepersisté, Envclé/valeur vidés intentionnellement). Focusindépendantlongtooltip : PANEL=secrets MODE=long SHORT_KEY=1 sansFOCUS_COUNTERPROOF/SKIP_FOCUS. Leslongstooltipsdesktoprestentincidentdistinct, ne pas prétendrecorrigés. Cas1280isolé estdisponible viaCASES ; préservertimeoutsinitiauxdansbilan.

### Revue Escape et état final des sources
La revue indépendante a ajouté le cas focus déjà déplacé hors menu avant Escape. Les deux nouveaux tests ont échoué avant garde (2 rouges, 3 verts), puis les trois suites finales sont vertes : **20/20 tests**, zéro ignoré (`unit-final.log`). La restauration ne s'effectue que si le focus actif est encore dans le menu ou son ancre connectée. Tab est simulé en jsdom puis le focus extérieur est explicite : une recette native navigateur reste nécessaire. Lint des trois fichiers possédés et `git diff --check` verts. Aucun build ni restart effectué par cet agent. Les invocations du Terminal gelé restent inchangées et utilisent le fallback local sans paneId. La recette compilée après correctif est confiée au parent.

### Recette du build assemblé (serveur parent ui841-compiled)
Neuf cas Chromium compilés réussis dès le premier passage, zéro reprise :
- `compiled-env-filter/receipt.json` : 390×844, 820×1180, 1280×900 ; filtre conservé après remplacement réel de coque (ancien input détaché), retour au format initial ; clé/valeur synthétiques non conservées volontairement.
- `compiled-secrets-filter/receipt.json` : mêmes trois formats et aller-retour responsive, filtre conservé.
- `compiled-secrets-focus/receipt.json` : mêmes trois formats, ouverture clavier du menu ligne puis Escape, menu fermé et focus rendu au déclencheur, assertion géométrie stricte conservée. SHORT_KEY limite ce scénario au focus ; cela ne valide pas le défaut global de tooltip à clé longue.
Aucun counterproof ni SKIP_FOCUS utilisé. Zéro erreur page collectée. Chaque navigateur est fermé dans finally. Aucun build, redémarrage, modification source ou mutation réelle effectué pour cette recette. API/runtime synthétiques isolés, navigateur Chromium local seulement : pas de Safari physique, backend réel, zoom200% ou certification générale. Le cas Escape après Tab extérieur est couvert par les tests jsdom explicites, pas par ces neuf parcours compilés.
