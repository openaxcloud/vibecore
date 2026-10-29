# LazyWorkbench : reprise locale après échec import — 29 octobre 2026

Base source fe7909242, serveur local21999 possédé par root. Aucun restart ni modification produit. Chromium/API/runtime synthétiques ; aucune connexion production, nouvelle autorisation réseau, secret ou mutation cliente. Le hash asset localBG-JaXm5 diffère de productionBcdxDg4X, ce n’est pas une preuve de cache périmé.

## Reproduction déterministe

`probe.cjs` intercepte uniquement GET /assets/Workbench.client-*.js, attend200ms puis abort failed UNE seule fois. CSS et autres assets inchangés. Le réseau serait disponible dès la prochaine requête.

-390×844 : erreur PanelBoundary visible ; après auto-reprise1s et clic Reload panel, compteur reste1, erreur restevisible. Reloadpage local : compteur2, éditeurvisible, erreurinvisible.
-1180×757 : même résultat1→1→2. Ce viewport utilise le workbench mobile/tablette.
-1280×900 : éditeurdesktop visible sans requête Workbench.client ; tentative nonreproductrice et noncomptée comme bug.

Preuves : asset-diagnostic/receipt.json et tablet-1180/receipt.json avec captures avant/après. Les textes d’écran sont synthétiques.

## Deux couches de cache

`module-cache.cjs` ajoute deux contrôles avant reloadpage :
1. import direct du même URL dans la même page rejette immédiatement sans GET additionnel (1).
2. import direct du même chunk avec ?local-diagnostic=1 résout, GET2.
3. Reloadpage local récupère, GET3.

Donc le const LazyWorkbench React.lazy au niveau module conserve son rejet et la module map Chromium conserve également l’échec du même URL. La simple clé de remount de PanelBoundary ou une nouvelle identité React.lazy réutilisant le même URL ne suffirait pas. Le bouton actuel ne relance aucune requête.

## Proposition à confirmer par tests d’implémentation

Isoler un chargeur Workbench récupérable : identité lazy renouvelable lors d’une reprise explicite et import de secours borné sur une nouvelle URL de CE chunk connu, même origine /assets/Workbench.client-*.js, sans exécuter une URL arbitraire tirée d’un message d’erreur. Limiter le nombre de tentatives et préserver erreur accessible si échec. Pas de reloadpage automatique, afin de ne pas perdre brouillons. Pas de reprise des erreurs de rendu/métier par ce mécanisme. Le câblage BaseChat doit être coordonné avec l’autre agent (modales/focus).

La manière fiable de fournir au chargeur l’URL Vite doit être vérifiée : un parseur d’erreur non borné ou l’ajout d’un paramètre à une chaîne quelconque serait incorrect. Une dépendance du chunk également échouée peut rester cachée ; une URL réellement supprimée restera404. Les tests doivent couvrir ces limites sans boucle infinie ni faux succès.

## Limites

Cause de l’échec initial production CDN/cache/déploiement non établie. La reproduction injecte un échec réseau local, pas un503 backend. Ne prouve aucune réparation production. Aucun fichier source/test du dépôt modifié. Tous les navigateurs créés par ces scripts sont fermés ; serveur root laissé actif.

## Implémentation bornée autorisée — état historique avant build

`app/components/workbench/load-workbench.ts` récupère le rejet initial AVANT qu’il atteigne React.lazy. Il ne recrée donc pas la lazy identity : sa première promesse reste pending pendant la seule tentative de secours. Une nouvelle URL queryfixe `vibecore-retry=1` contourne le cache négatif modulemap local sans nonceinfini. Seuls TypeError et message Chromium exact sont reconnus ; URL canonique HTTP(S), originecourante, pathname strict /assets/Workbench.client-HASH.js, sans credentials/query/hash/normalisation sont acceptés. Autresnavigateurs/formatsrejetés restent erreuraccessible. Aucune causalité CDN présumée.

CâblageBaseChat uniquement déclarationLazyWorkbench/importhelper ; modificationsfocus d’autreagent préservées. AucunPanelBoundarymodifié.

Tests : passthroughrouge initial4échecs/15réussites ; implémentationfinale25/25 (21helper+4Boundary). VraiReact.lazy et vraiPanelBoundary, doublefail et boutonsmanual/auto conservent1importinitial+1secours sansboucle. Exportmodule conservé. TestsURLexterne/autrechunk/credentials/prefix/traversal/percent/newline/query/hash/erreurmetier/invalide. Lintdeuxfichiers0erreur.

`recovery-proof.cjs` prêt pour buildroot : CASES390/1180, normalrequiert2GET+éditeurvisible ; DOUBLE_FAIL=1 requiert2GET+erreurvisibleaprèsauto/manual. Au moment de cette note, la recette compilée était encore en attente ; les reçus compiled-green et compiled-double-failure ajoutés depuis confirment4/4. Aucuncommit/publication/restart/buildeffectué.

## État final

La validation compilée est maintenant acquise ; résultats exacts et limites dans [le rapport commun](../README.md). Les observations rouges précédentes restent historiques et ne sont pas effacées. Publication et production non validées.
