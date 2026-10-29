# Preview / Debugger — audit visuel local du29octobre2026

Build réel47b1e2e922 (arbre identique au lot f9788f5f5), Chromium390/820/1280, anglais. API et transport runtime synthétiques isolés. Aucun start/stop/run/attach/step/save/delete, aucune édition de fichier ou action client. Les appels automatiques boot/workspace sont interceptés par le harnais de transport, jamais exécutés sur un runtime réel. Les WebSockets sont fermés volontairement par le harnais. Aucun nouveau secret/accès/permission. Tous les navigateurs se ferment via finally ; aucun serveur parent arrêté/redémarré par cette session.

## Preview : portée limitée,3/3

`preview-startup-readonly/receipt.json` : le vrai panneau montre overlay de démarrage, étapes et logs, avec message WebSocket artificiellement indisponible ; géométrie dans le viewport, ouverture des logs au clavier. Les3formats passent, zéro erreurJS. Aucune iframe applicative fonctionnelle, aucun démarrage/reprise runtime, aucun étatready ou backend réel validé. Aucun défaut visuel supplémentaire démontré dans cette portée.

Le premier script `preview-passive` cherchait le toolbar complet DevTools/WindowOptions alors que le rendu de démarrage ne l'affiche pas : échec de harnais, pas défaut produit. Le script final utilise uniquement Viewlogs effectivement présent pendant le démarrage.

## Debugger : défaut visuel reproduit

`debugger-empty-final` et `debugger-recovery-final` :6/6recettes vide/chargement/503→Retry lecture seule,390/820/1280. Focus placé sur Refresh runtime sans l'activer, aucun contrôle de session utilisé.

`debugger-long-body` :3/3rouges, scrollWidth du corps3194/3203/2976px pour client390/820/612. Le panneau extérieur restait à la bonne largeur et masquait ce débordement interne. Conditions de breakpoint longues sans repli, valeurs/stack PanelRows cachées par leur overflowhidden, pistes grid min-content et colonnes xl/lg basées sur viewport au lieu du panneau sont les causes corroborées. Le desktop1280 avait seulement588px de contenu disponible avec Agent+Library.

`debugger-counterproof-grid` :3/3verts, texte intégral des valeurs conservé et chaque titre/détail PanelRows tient dans sa largeur. La contrepreuve ajoute min-width0 aux enfants de grid, repli du texte et grilles auto-fit à320/240px dans le périmètre Debugger. Les métriques conservent leurs colonnes existantes. Les deux captures ciblées se trouvent dans debugger-before-capture/390-breakpoint.png et debugger-counterproof-capture/390-breakpoint.png. Elles constituent avant/contrepreuve DOM, pas encore un build produit corrigé.

## Correctif appliqué sur autorisation du parent

Le patch `debugger-layout-proposal.patch` a été lu puis appliqué proprement sur branchelocale fix/ide-service-panel-drafts-20261029 : exactement3classes dans ProjectDebuggerPanel de BaseChat.tsx et22lignes CSSscopées dans index.scss. Aucun état, handler, moteur, contrat ou composant hors Debugger modifié. Les autres travaux concurrents préservés ; aucun commit/push/build par cette session.

Validationlocale :78gardesCSS/étatsvides +8tests existants Debugger controls/persistence =86réussis, aucun ignoré. Lint ciblé BaseChat et gitdiffcheck réussis. Le parent doit exécuter le build commun et la recette compilée sans injection :

`PANEL=debugger MODE=long LABEL=compiled-debugger node /workspace/ui841-preview-debugger/debugger.cjs`

Le script final exige aussi la largeur complète de chaque titre/détail, sans dépendre de COUNTERPROOF. Ne PAS passer COUNTERPROOF pour valider le build.

## Limites / premiers essais conservés

Les premières recettes parallèles debugger-empty/long ont eu3timeouts avant le premierGET (attente5s), alors qu'une capture montrait le bon loader. Les recettes finales séquentielles/isolées passent ; cause du délai initial non établie, pas défaut déclaré réparé. La première mesure de l'outerpanel ignorait le scroll du corps : remplacée par une mesure du vrai scroller, assertion plus forte ; ne pas compter les premiers verts comme preuve de géométrie interne.

Pas de test production/backend réel, Safari/appareil physique, FR, zoom200%, clavier virtuel, safearea ou exécution debugger. Pas de certification globale de panneau. Le correctif visuel attend sa validation compilée parent ; aucun déploiement.

## Compiled assembled validation (follow-up)

Command: `PANEL=debugger MODE=long LABEL=compiled-debugger node /workspace/ui841-preview-debugger/debugger.cjs`, without COUNTERPROOF. Exit 0, 3/3 first attempts pass at 390/820/1280. Body client/scroll widths respectively 390/390, 820/820, 612/612. Full variable text and row-title/detail geometry checked, Refresh runtime focus checked, no runtime action activated. All browser pages/browser closed in finally. Receipt: `compiled-debugger/receipt.json`.

Remaining visual limitation: detailed geometry at 1280 reports breakpoint Remove form clientWidth 5 / scrollWidth 31 and local flex overflow (242/268). This is not caught by the passing outer-body assertion and must not be presented as all actions readable. Session names/commands retain existing truncate behavior. No source changes, restart, retry, Tooltip certification or production/runtime test during this follow-up.

## Remove action follow-up

Strict recipe added before source edit: button/form scroll containment, button rectangle within form, trial-only click (no activation), focus. `remove-red/receipt.json`: 390 and 820 pass;1280 fails, form5.46875px vs scroll31px; failure screenshot preserved. Note recipe exit status remains0 even on recorded case failure; inspect receipt pass flags.

Minimal source fix: `className="shrink-0"` on delete-breakpoint form only. ESLint BaseChat and git diff --check pass; debugger controls/persistence8/8 pass, no skips. Parent shared rebuild and strict `LABEL=remove-compiled` recipe pending. No engine action, mutation, restart, commit or publication.

## Final compiled Remove proof

Parent final shared build served on21999. Command `PANEL=debugger MODE=long LABEL=remove-compiled node /workspace/ui841-preview-debugger/debugger.cjs`, without COUNTERPROOF. Receipt inspected:3/3 pass at390/820/1280, zero page errors, no retry. Strict Remove geometry/containment, trial-only click and focus pass; long PanelRows text/width and body overflow checks pass. No actual Remove/Start/Step action, no runtime verification, source edit, build or server restart. Browser closed by finally after completed recipe. Source remains parent-owned. Evidence: `remove-compiled/receipt.json`.
