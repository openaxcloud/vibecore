# PR #730 — diagnostic local de l’échec CI, sans correctif établi

État de départ : `8eb85bc32dc681a2536369f1bb218b8384382902`, branche `codex/audit-local-files-20261012`. Aucun changement produit, assertion, dérogation ou workflow dans ce diagnostic. Aucun push ni relancement CI.

## Éléments transmis par la session parent

Run `38299133926`, job `114977593477`, artefact `11770585195` : le test `ide-file-tab-identity.spec.ts` échoue au clic de l’onglet nommé exactement `Pinned tab: /audit.txt, unsaved changes` (tentative 0, budget global 30 s), à l’initialisation Monaco (retry 1, attente de texte de 5 s) et à la présence de ce nom exact (retry 2). Les tentatives 0 et 2 ont déjà vérifié le retour de `UNSAVED-A-UNIQUE` et l’absence de GET de contenu. Ces éléments ne démontrent pas une perte du brouillon. Le test flottant passe en 11,7 s. Les logs distants n’ont pas été retéléchargés ici.

## Comparaison exécutée

Même HEAD, pnpm 9.14.4, lockfile inchangé, pile locale unique PostgreSQL/Redis/Mailpit déjà préparée. Mémoire cgroup avant pile : 6 145 896 448 / 17 179 869 184 octets. Aucun appel modèle, génération, publication ou workspace distant ; comptes de test synthétiques seulement.

- Build distant existant : test commis inchangé, Chromium système 154, un worker, zéro retry, timeout global 30 s, attentes 5 s. **3/3 passent**, en **10,6 / 9,4 / 9,7 s**. Le harnais local bloque les service workers ; Node 24 et Chromium 154 diffèrent de Node 22 / Chromium Playwright 147 de CI.
- Build de production sans `RUNTIME_MODE`, `VITE_RUNTIME_MODE` ni `VITE_SAAS_COMMERCIAL`, comme l’action CI : `pnpm run build` réussit. Le bundle obtenu contient effectivement le choix par défaut `webcontainer`. La CI sert elle aussi un build de production (`PLAYWRIGHT_SKIP_WEB_SERVER=1`), pas le serveur de développement.
- Ce build passe **1/1 en 17,8 s**, avec les mêmes assertions strictes. Une copie temporaire du test ajoute uniquement l’observation des mutations des onglets et des requêtes échouées. L’attente initiale de contenu Monaco prend **3,89 s** dans la trace. Cette mesure ne démontre pas que 5 s suffisent dans CI ni que l’échec CI est causé par cette attente.
- Refus réseau réel : `stackblitz.com`, chemin `/headless`, `net::ERR_TUNNEL_CONNECTION_FAILED`. Ce chemin est arrêté ; aucun changement réseau ni contournement. L’autosauvegarde WebContainer réussie n’est donc pas comparable à CI dans cet environnement. Un refus de police vers `fonts.googleapis.com` est également observé.

## Observations réelles sur le build par défaut

Temps relatifs au début du test : A devient sale à 12 337 ms ; B s’ouvre à 12 537 ms ; A revient sale à 12 753 ms ; à 13 218 ms, le même `data-tab-id=tab-editor-default` a `data-pinned=true`, `data-dirty=true` et le nom exact attendu. Après ouverture de B à 13 837 ms, A garde ces trois valeurs et B possède une autre identité. Le clic final puis l’assertion `UNSAVED-A-UNIQUE` passent. La capture réelle finale a été inspectée : brouillon visible dans A, indicateur sale et onglet B distinct.

Le code source lie le nom accessible à deux contrats : épinglage et présence dans `unsavedFiles`. L’autosauvegarde est programmée après 800 ms ; les interceptions HTTP du test n’interceptent pas `WebContainerRuntimeAdapter.writeFile`. Cette différence est une hypothèse explicative, **pas une cause démontrée du rouge CI**. La lecture indépendante confirme cette limite et l’absence de préférence publique permettant de désactiver l’autosauvegarde dans ce parcours.

## Limite et suite

Aucun défaut supplémentaire n’est reproduit ; aucun correctif produit ou assouplissement du test n’est justifié par ces résultats. Il faut observer les attributs réels et l’état de sauvegarde au moment du rouge CI, ainsi que l’état/actionnabilité du bouton lors du timeout de clic, avant de choisir une correction. L’initialisation Monaco doit rester analysée séparément. Aucun succès local ci-dessus ne lève le rouge de la PR.

Preuves temporaires dans cette session : `/tmp/ci730-evidence/e2e-after-results.json`, `default-observed.log`, `default-observed-results.json`, `build-default.log`, et `default-observed/identity-opening-a-stored--259ee--tab-without-duplicating-it/trace.zip` avec les captures. Harnais : `/tmp/files-audit-harness/ci730.config.ts`, `ci730-observe.config.ts`, `/tmp/ci730-tests/identity.spec.ts`. Ces chemins ne sont pas des artefacts GitHub et ne sont pas garantis après destruction de l’environnement.

Relecture indépendante par `/root/review_pastille` : rapport, JSON, trace et log concordants ; aucune correction demandée. Serveurs locaux et trois conteneurs arrêtés à l’issue du diagnostic, volumes conservés.

## Instrumentation proposée après demande du parent

Nouvelle recherche dans les composants et stores : aucun réglage produit pour désactiver l’autosauvegarde n’a été trouvé. `BaseChat` appelle `scheduleFileAutosave` après l’édition ; le délai interne est 800 ms. Après succès de `FilesStore.saveFile`, `Workbench.saveFile` retire le chemin de `unsavedFiles`. Un échec conserve le brouillon. Une sauvegarde WebContainer réussie reste donc une hypothèse pertinente, sans reproduction ici ; aucun nouvel accès à `stackblitz.com`.

Le delta est limité au test et à sa fixture de diagnostic :

- les **21 lignes d’assertion**, les clics métier et les budgets **30 s / 5 s** restent identiques ; aucune manipulation du store ni faux résultat de sauvegarde ;
- des jalons nomment navigation IDE, attente et contenu initial Monaco, édition, épinglage et retour au brouillon ;
- en cas d’échec uniquement, `file-tab-failure-diagnostic` joint au maximum **128 événements**, **12 onglets** et **2 éditeurs** par état. L’ancien export de mémoire locale est retiré ;
- DOM de la page principale : IDs, libellés connus exacts, `pinned`/`dirty`/`active`, visibilité, géométrie et hit-test central ; le contenu est réduit à quatre booléens de présence des sentinelles synthétiques ;
- événements réseau : catégories runtime/écriture, méthode, statut ou échec, sans URL, query, en-tête ni corps ; console : événements classifiés uniquement, jamais le message brut. `File updated` ne donnant pas le chemin, son fichier est explicitement `unknown` ;
- les trois entrées de configuration de build sont filtrées, et distinguées des observations navigateur. Elles ne sont pas présentées comme une lecture certaine de la configuration embarquée ;
- le teardown conserve le dernier état DOM à l’échec puis effectue deux clics à blanc `trial`, limités chacun à **500 ms**. Ils peuvent faire défiler la page : ils décrivent l’actionnabilité **après** l’échec, sans prouver celle de l’instant initial. Ils n’augmentent pas le budget du test métier.

Vérification de l’instrumentation dans Chromium réel sur une petite page HTML synthétique servie uniquement en loopback, sans pile applicative ni accès externe : succès sans pièce jointe ; échec d’assertion et timeout global avec pièce jointe ; page fermée avec dernier état conservé ; état synthétique épinglé/non-sale avec sentinelle intacte correctement distingué du sélecteur exact absent. Les échecs de ces sondes sont provoqués pour vérifier le teardown, **pas des échecs produit ni une reproduction de la cause CI**. Une fausse valeur secrète placée dans le DOM et les messages console est absente de toutes les pièces jointes. Les sorties JSON mesurent environ 3,6 Ko par échec simple. Preuves temporaires : `/tmp/ci730-diagnostic-check/{results,extra-results}.json` et harnais voisin.

La revue indépendante a demandé puis vérifié la prise en compte des deux chemins synthétiques `/audit.txt` et `/home/project/audit.txt` pour les échecs d’autosauvegarde. L’instrumentation reste destinée à une exécution CI diagnostique à autoriser après relecture du delta ; elle ne corrige pas le rouge connu et n’a pas été poussée.

Validation finale du delta : lint des deux fichiers TypeScript et `pnpm run typecheck` global réussis ; découverte Playwright canonique réussie (le test reste dans un seul fichier de spec). Revue indépendante finale favorable, avec vérification des JSON des sondes. Pas de reconstruction applicative : aucun code produit modifié. Pas de relance E2E produit dans le mode WebContainer bloqué. Le serveur HTTP de la sonde a été arrêté.

### Protection du teardown avant publication

À la demande de vérification avant publication, les rejets de la collecte (y compris lecture de configuration et attachement) sont absorbés pour ne pas ajouter d’erreur au test. L’attente asynchrone du diagnostic est limitée à 2 s par `Promise.race` ; aucun nouvel essai ou attachement ne commence après expiration constatée. Ce timer n’interrompt pas une opération synchrone ni une écriture d’attachement déjà engagée : ce n’est pas une garantie d’annulation des E/S. Les budgets métier restent inchangés.

Sondes supplémentaires, uniquement sur la page locale synthétique : attachement rejeté → seule assertion initiale conservée, durée 648 ms ; attachement volontairement suspendu → seule assertion initiale conservée, durée 2 368 ms. Dans ces deux cas, aucune pièce jointe diagnostique n’est disponible, et ce manque de diagnostic ne remplace pas la panne initiale. Succès, échec d’assertion et timeout global revérifiés après cette protection ; les deux derniers produisent toujours leur JSON sans la fausse valeur secrète. Lint et typage ciblés réussis. Le typecheck global avait déjà réussi avant ce seul ajout de garde.

Portée de la confidentialité : le nouveau JSON ne contient aucun corps de requête/réponse, cookie, token, URL complète/signée, texte arbitraire de fichier ou localStorage. **Cela ne constitue pas une garantie sur les traces Playwright existantes**, configurées `on-first-retry`, ni sur leurs captures et contextes d’erreur ; ce collecteur ne les filtre pas. La prochaine CI demeure diagnostique, sans correction produit revendiquée.

## Signal CI reçu et correction du contrat du test

Après publication diagnostique sur `00ac3e5cad5a3d317e45d6d8dd0d02639e6961e6`, la session parent a récupéré les diagnostics du run `38303876030`. Ces éléments sont fournis par elle, sans nouveau téléchargement ici. Essais 0 et 2 : `tab-editor-default` reste présent, épinglé, visible et reçoit le pointeur. `dirty` devient faux ; le nom exact devient `Pinned tab: /audit.txt`. Le clic à blanc sur le nom incluant `unsaved changes` échoue alors que l’onglet du même fichier reste actionnable. `files-store-write-completed` apparaît à 8 916 / 7 909 ms, `dirty=false` à 8 950 / 7 942 ms, le retour demandé à 8 980 / 8 049 ms. Le journal ne fournit pas le chemin de cette écriture : **aucune attribution certaine à `audit.txt`**. Ces observations établissent un sélecteur devenu inadapté à l’état réel, pas une disparition d’identité.

Retry 1 : Monaco apparaît à 8 987 ms, après le début de l’attente à 4 453 ms ; le contenu initial n’est pas prêt sous les 5 s imparties. L’attente initiale porte désormais sur le même contenu prêt, bornée à 10 s, en cohérence avec les contrôles UI IDE existants à 10 s (`ide-onglet-actif-visible`, `ide-panel-smoke`). Aucun sleep dans le test et budget global inchangé à 30 s.

Le test capture `data-tab-id` avant l’édition. Avant puis après l’ouverture de B, il exige que l’onglet nommé `audit.txt` conserve cette identité et que l’onglet identifié soit explicitement épinglé. Le clic final utilise `data-testid` dérivé de cette identité et vérifie la sélection. Les trois contrôles du texte modifié utilisent désormais `toHaveText`, au lieu de `toContainText` : texte rendu exact après normalisation des espaces Playwright, pas une assertion byte-à-byte du fichier sauvegardé.

L’état dirty reste une exigence distincte : un observateur DOM est armé **avant** la frappe. Il enregistre la transition réelle vers `data-dirty=true`, y compris si elle est déjà terminée au prochain échange Playwright. `attributeOldValue` permet de constater la transition même si true puis false surviennent dans le même lot de mutations. L’observateur se déconnecte dès observation puis est nettoyé en `finally`. Aucun store modifié et aucune réponse de sauvegarde simulée.

La réussite d’une sauvegarde WebContainer reste inaccessible localement en raison du refus déjà constaté ; ce chemin n’est pas retenté. Le libellé sentinelle historique `UNSAVED-A-UNIQUE` ne promet pas que le contenu demeure non enregistré. Aucun code produit supplémentaire.

### Contre-épreuves et validation du contrat corrigé

Pile locale existante remise en route sans téléchargement d’image ; mémoire avant pile : 6 487 973 888 / 17 179 869 184 octets. Build `VITE_RUNTIME_MODE=remote-kubernetes` réussi avec pnpm 9.14.4 et lockfile inchangé. Chromium système 154 / Node 24 restent différents de CI. Un seul worker, zéro retry, aucune suite complète parallèle.

| Contrôle | Résultat observé |
| --- | --- |
| Test corrigé du dépôt, trois répétitions sans injection | **3/3 passent**, 18,101 / 15,062 / 18,035 s, global 30 s inchangé. |
| Copie avec échec d’autosauvegarde distante observé explicitement pour `audit.txt` | Passe en 14,243 s ; toast réel inspecté, brouillon exact et A épinglé conservés. Aucun succès/échec de réponse substitué. |
| Bundle Monaco retenu puis libéré 6 s après le début de l’attente | Ancienne attente 5 s : rouge à 5,008 s. Nouvelle attente 10 s : contenu prêt à 7,188 s, parcours complet vert en 15,967 s. Le retard est une injection du harnais temporaire, pas un sleep du test commis. |
| Import Monaco interrompu | Reste rouge à l’attente de contenu, 10,155 s ; capture réelle d’éditeur non initialisé inspectée. |
| Ajout réel de `UNEXPECTED-EXTRA` au clavier après retour final à A | Rouge sur le contenu exact. Capture inspectée : sentinelle plus ligne ajoutée ; l’ancien contrôle de sous-chaîne aurait accepté cette addition. |
| Édition puis retour manuel au contenu original via le clavier | L’attribut dirty devient faux. L’assertion exigeant qu’il soit encore vrai échoue ; l’observateur préarmé conserve la transition observée, puis la réédition et tout le parcours passent en 17,125 s. C’est une transition utilisateur réelle, **pas une sauvegarde réussie**. |

Deux sondes sont exclues des résultats probants : la première copie nommée « ancienne attente » était accidentellement restée à 10 s après formatage ; la copie effectivement à 5 s a été vérifiée dans la trace et rejouée. Une tentative Undo n’a pas restauré le contenu et n’a donc pas démontré la transition attendue ; elle a été remplacée par la saisie réelle du contenu original, sans correction produit supplémentaire ni attribution causale sur Undo.

Preuves temporaires : `/tmp/ci730-contract-evidence/` (`repeat-results.json`, `results-results.json`, `counterproof-results.json`, `transient-restore-results.json`, traces et captures dans les répertoires correspondants). Les variantes avec injection sont dans `/tmp/ci730-contract-tests/`, le test du dépôt est celui répété sans injection. Lint ciblé, typage ciblé et `git diff --check` réussis. Relecture indépendante favorable de l’identité, des exigences de contenu/épinglage et de l’observateur. Le delta attend la revue parent avant push ; aucun verdict CI vert revendiqué.
