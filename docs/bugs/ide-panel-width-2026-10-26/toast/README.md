# Notifications IDE adaptées au panneau Agent — 26 octobre 2026

Worktree : /workspace/vibecore-ui-panel-width, base90d92ff. Delta local non commité : app/components/ui/useIdeToastLayout.ts, son fichier spec.tsx et app/styles/components/toast.scss uniquement. Aucun changement AppToastContainer/root, BaseChat, Settings, queue, backend, déduplication ou action métier.

## Défaut et correction

Baseline indépendante : /tmp/ui-toast-wide-panel/receipt.json et wide2048.png. Le vrai AppToastContainer à2048 avec panneau Agent320 restait non compact : notification riche repliée de298,6px dont les enfants avaient opacity0, grande surface opaque au-dessus des panneaux voisins.

La liste est maintenant compacte sur tout IDE réellement monté, y compris quand Agent est absent/masqué. Sur desktop, les coordonnées du panneau visible sont observées ; largeur bornée à380px et à sa portion visible, marge8px. Sans portion utilisable, repli en coin du viewport. En dehors de l'IDE, comportement normal conservé. Les contrôles restent accessibles, la liste reste bornée à240px/32dvh et défilable ; les règles mobiles existantes ne sont pas remplacées.

## Preuves

`prepare.cjs` extrait le vrai AppToastContainer de root.tsx, avec le hook produit et ReactToastify réel. Le thème et la traduction du bouton fermer sont injectés comme fixtures. `toast.css` est compilé du SCSS produit ; les autres styles viennent du build existant. Le shell/panneau sont des conteneurs synthétiques de dimensions explicites, pas le shell IDE complet. Aucun backend : tous nonGET/tiers bloqués.

`check.cjs`, `receipt.json`, `browser-final.log` :6 configurations desktop2048/1536/1280 × Agent320/480, puis2 zooms natifs200% à fenêtre2048 (inner1024, DPR2, visualViewport.scale1), texte FR et thème clair. Pour chacun :3notifications présentes, enfants visibles, liste<=240px et contenue dans le panneau ; focus et IDs conservés au resize mobile390 (6cas desktop), Agent900px plafonné380, partiellement hors écran et entièrement hors écran, puis masqué/absent, sortieIDE normale.16 observations sérialisées visible/hidden ; autres étapes sont des assertions du script. Zéro erreur JS. Captures after-*.png. Ce passage précède le dernier arrondi de réparation du focus ; il n'est pas présenté comme rejoué après cet arrondi.

`actions.cjs`, `actions-exact.log`/`actions-before-rounding.json` puis `actions-exact-after.log`/`actions-measure.json` : vrai DOM, déduplication des mêmes3toastIds, bouton de détail focalisé puis resize2048→390, attente de deux requestAnimationFrame, assertion stricte de visibilité, fermeture clavier Entrée (2notifications restantes).

Le contrôle strict a révélé un reste de0,125px après resize : bottom344,125 contre bord344, scrollTop271 entier. La correction produit arrondit la demande de scroll vers le bord masqué (ceil positif/floor négatif), bornes conservées. Après : bottom343,125<=344, scrollTop272, focus conservé. Le test unitaire fractionnaire couvre les deux directions. L'essai intermédiaire tolérant±1px (`actions-tolerance-diagnostic.*`) est conservé uniquement comme diagnostic REJETÉ, pas comme validation ; le script final n'a aucune tolérance.

`unit.log` :8tests hook verts. `lint.log` :eslint ciblé code0. Build et typage intégrés appartiennent au parent et ne sont pas attestés ici. Aucune recette production ni Safari/iOS, aucun test de logique financière/agent réelle. Tests navigateur et données strictement synthétiques.

## Reproduction

Avec dépendances du worktree existantes, exécuter prepare.cjs, compiler toast.scss en toast.css et ajouter son link après les styles existants (voir index.html conservé), puis `node server.cjs` sur17899. `node check.cjs` et `node actions.cjs`. Le serveur est GET-only ; provenance dans server-origin.json, arrêt vérifié dans cleanup.json.
