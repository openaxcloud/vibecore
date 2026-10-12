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
