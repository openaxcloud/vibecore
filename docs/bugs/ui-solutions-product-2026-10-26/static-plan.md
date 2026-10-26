# Préparation statique — Solutions11 et Présentations produit19

**30 IDs cartographiés, zéro route testée par ce travail.** Aucun serveur, navigateur, build, fixture ou test produit démarré. Résultats dans /tmp uniquement ; aucune modification produit/index/commit. Source de lecture : worktree priority, HEAD exact et64 empreintes de routes/dépendances dans routes-plan.json. L’allocation reste disjointe des15éditorial,15légal et6admin ; les composants partagés ne deviennent pas notre propriété.

## Familles et identités

Solutions11 : index1 ; résolveur dynamique1 ; neuf routes statiques. Huit utilisent `makeSolutionRoute` → `SolutionSalesPage` + `solution-sales.css` + catalogues individuels ; AppBuilder utilise `AppBuilderSolutionPage` + `app-builder.css` et son propre loader langue/meta. L’index utilise `MarketingIndexPage/solutionPages`.

Les neuf clés connues du catalogue solutionPages ont chacune une route statique plus spécifique. Visiter `/solutions/app-builder` ne prouve donc pas `routes/solutions.$slug`. Pour le dynamique : `/solutions/synthetic-unknown` doit réellement matcher ce module et produire404 ; `/solutions/internal-ai` doit produire308 vers `/solutions/internal-ai-builder`. Le 308 est vérifié sans suivre la destination ; la route statique internal-ai-builder dispose de sa propre observation. Ne pas inventer une branche200 du résolveur si toutes ses clés sont masquées par les routes statiques.

Produits19 :8 wrappers MarketingStaticPage (ai-docs, ai-documentation, customers, demo, mcp, polyglot, product, theme-validation),4 pages EcodeProductMarketingPages (ai, deployments, mobile, team),5 pages exactes (collaboration, desktop, marketing.bounties, marketing.deployments, marketing.teams),1 wrapper Bounties transitif,1 alias301 ai-agent.studio.

- ai-docs/ai-documentation rendent exactement `marketingPages['ai-documentation']` ; deux URLs et métadonnées de chemin à contrôler, pas une redirection HTTP.
- bounties → EcodeExactProductMarketingPages.EcodeBountiesPage → `ecode-exact/pages/Bounties` ; marketing.bounties importe directement **ce même composant**. Cette équivalence de corps est prouvée transitivement, sans prétendre loaders/meta identiques.
- deployments et marketing.deployments, team et marketing.teams utilisent des implémentations de corps différentes. Ne pas assimiler marketing Deployments au panneau IDE/Deploy réservé.
- ai-agent.studio est un loader301 vers/ai-agent ; preuve de contrat sans lancer le moteur Agent et sans transférer une couverture à la destination.

## Dépendances partagées et coordination

`EcodeExactShell`, `SaaSLayout/PublicShell`, `EcodeMarketingPages`, `EcodeProductMarketingPages`, `EcodeExactProductMarketingPages`, composants UI et styles globaux sont partagés : aucune édition sans accord root/propriétaire. Collaboration partage son catalogue avec CaseStudies (éditorial), Desktop avec Status (éditorial), MarketingBounties avec Partners (éditorial), MarketingTeams avec CommercialAgreement (légal). Une modification d’un de ces catalogues ne serait pas un fichier local isolé de ce lot.

Les huit copies Solutions sont distinctes, mais `SolutionSalesPage`, `solution-route`, `solution-copy`, `solution-sales.css` et showcases sont communs aux huit. AppBuilder a son CSS/composant propre tout en partageant la coque. Le JSON détaille les fichiers de route et imports directs, plus les dépendances transitives critiques inspectées ; il ne prétend pas être un graphe transitif exhaustif.

## Constat source et hypothèses à mesurer

Aucun nouveau défaut UI confirmé sans rendu. Les CSS Solutions contiennent déjà des reflows479/520/680/768/1024/1120 et des max-width/min-width ; la présence de nowrap/overflow hidden ne prouve pas seule un défaut.

Faits de source à vérifier comme contrats : les alias studio301 et internal-ai308 ne recopient pas la query `lang` ; il faudra distinguer perte de query et langue conservée par préférence locale. Cela n’est pas déclaré comme défaut visuel reproduit. Les commentaires anciens de marketing.* parlent encore d’un ancien bundle catch-all ; la source actuelle marketing.$slug réexporte$404. Ce commentaire périmé ne change pas l’exécution et ne constitue pas une correction produit dans ce lot.

Zones ciblées : longues traductions des héros et CTA ; miniatures/chrome de showcases et labels ellipsés ; actions Solutions empilées au petit écran ; footer partagé ; contenu après changement de fonctionnalité AI/Mobile. Source montre des boutons de sélection locale via useState surAI etMobile : seules ces actions de panneau sont autorisées dans le harness, pas une création réelle.

## Harness préparé, non exécuté

`audit.cjs`, `fixture.cjs`, `fetch-guard.cjs`, `routes-plan.json` ; syntaxe vérifiée par node --check seulement, aucun test produit. Aucune écoute réseau lancée. Ports/cwd de serveur restent à fournir par le parent après le build commun et la libération mémoire.

Le harness exige explicitement UI_BASE_URL localhost et UI_BUILD_SOURCE_ROOT. Avant Chromium, il compare64empreintes source préparées aux sources du build fourni ; une divergence arrête la recette pour revue, sans modification automatique. Le hash du build et les PID/startTicks/arguments du futur serveur devront être consignés lors du GO. Les seules empreintes source ne prouvent pas à elles seules l’identité d’un build : conserver aussi la provenance du build fourni par root.

Prévu :29 états rendus (28 URLs de contenu +404 du résolveur dynamique),11formats320×900/360×800/390×844/844×390/768×1024/820×1180/1024×768/1280×800/1440×900/1920×1080/2560×1440 ×FR/EN×clair/sombre =1276 observations **prévues, zéro exécutée**. Les deux alias HTTP301/308 sont des contrats distincts, pas des pages rendues supplémentaires. Le doublon de corps ai-docs reste visité à sa propre URL pour la langue et les métadonnées. Chaque état vérifie l’ID réellement matché via router.state.matches.

Redimensionnements successifs sur chaque page ; mesures document et éléments sélectionnés (dimensions intrinsèques enregistrées pour repérer clipping interne).16captures seulement :8 représentants de famille ×320/paysage844, FRclair. Les mesures dans les autres modes ne seront pas présentées comme inspection visuelle exhaustive. Aucune capture pour chaque breakpoint inutilement répétée.

32 groupes représentatifs prévus : huit représentants ×quatre modes, Tab/Escape/Back ; AI/Mobile ajoutent sélection de la dernière fonctionnalité puis resize844→320→1440 et conservation du texte de panneau. Pas de saisie produit sur ces écrans statiques : ne pas en inventer. Footer newsletter non soumis. Navigation Back vers une404sentinelle locale ; actions CTA vers création/achat et téléchargements bloquées.

## Réseau et limites prévues

Visiteur anonyme synthétique. Fixture dédiée GET avec auth/me401 et préférences/notifications vides ; GET inconnu404, toute mutation405, aucune transmission réelle. Précharge Node borne fetch serveur au seul origin localhost de fixture et GET. Navigateur bloque tiers, WebSocket, fichiers /download/desktop, checkout/portal, création projets et OAuth. Les liens téléchargements Desktop sont inspectés seulement ; jamais téléchargés ni exécutés. Liens showcases `/gallery-apps/.../preview/` : inspecter href, ne pas lancer de création/runtime ni considérer une miniature comme preuve fonctionnelle de l’app. Pas de nouveau mock dans le produit.

Pas de panne métier503 inventée pour une page dont le loader ne consulte aucun backend. Les404 du résolveur sont de vraies branches ; les catalogues/copies embarqués n’offrent pas un contratGET métier à faire échouer. Si une requête imprévue apparaît au navigateur/serveur, elle reste bloquée et le cas est diagnostiqué avant extension de fixture.

Pas de coverage promotion, code, index ou commit avant reçus. Le futur lot ne vaudra ni Safari/WebKit, lecteur d’écran, contraste calculé, clavierOS, safeareas physiques, zoom200%, backend réel ni toutes les valeurs de paramètres. Les routes des autres propriétaires restent exclues, même lorsqu’un lien y mène.

## Liste exacte des30 IDs

| ID | Fichier propriétaire de route | Famille | URL(s) prévues |
| --- | --- | --- | --- |
| `routes/ai` | `app/routes/ai.tsx` | product-interactive-or-static | /ai |
| `routes/ai-agent.studio` | `app/routes/ai-agent.studio.tsx` | studio-redirect | /ai-agent/studio |
| `routes/ai-docs` | `app/routes/ai-docs.tsx` | marketing-static-catalog | /ai-docs |
| `routes/ai-documentation` | `app/routes/ai-documentation.tsx` | marketing-static-catalog | /ai-documentation |
| `routes/bounties` | `app/routes/bounties.tsx` | bounties-transitive-wrapper | /bounties |
| `routes/collaboration` | `app/routes/collaboration.tsx` | exact-page | /collaboration |
| `routes/customers` | `app/routes/customers.tsx` | marketing-static-catalog | /customers |
| `routes/demo` | `app/routes/demo.tsx` | marketing-static-catalog | /demo |
| `routes/deployments` | `app/routes/deployments.tsx` | product-interactive-or-static | /deployments |
| `routes/desktop` | `app/routes/desktop.tsx` | exact-page | /desktop |
| `routes/marketing.bounties` | `app/routes/marketing.bounties.tsx` | exact-page | /marketing/bounties |
| `routes/marketing.deployments` | `app/routes/marketing.deployments.tsx` | exact-page | /marketing/deployments |
| `routes/marketing.teams` | `app/routes/marketing.teams.tsx` | exact-page | /marketing/teams |
| `routes/mcp` | `app/routes/mcp.tsx` | marketing-static-catalog | /mcp |
| `routes/mobile` | `app/routes/mobile.tsx` | product-interactive-or-static | /mobile |
| `routes/polyglot` | `app/routes/polyglot.tsx` | marketing-static-catalog | /polyglot |
| `routes/product` | `app/routes/product.tsx` | marketing-static-catalog | /product |
| `routes/solutions._index` | `app/routes/solutions._index.tsx` | solutions-index | /solutions |
| `routes/solutions.$slug` | `app/routes/solutions.$slug.tsx` | solutions-resolver | /solutions/synthetic-unknown ; /solutions/internal-ai |
| `routes/solutions.app-builder` | `app/routes/solutions.app-builder.tsx` | solution-app-builder | /solutions/app-builder |
| `routes/solutions.chatbot-builder` | `app/routes/solutions.chatbot-builder.tsx` | solution-sales-factory | /solutions/chatbot-builder |
| `routes/solutions.dashboard-builder` | `app/routes/solutions.dashboard-builder.tsx` | solution-sales-factory | /solutions/dashboard-builder |
| `routes/solutions.enterprise` | `app/routes/solutions.enterprise.tsx` | solution-sales-factory | /solutions/enterprise |
| `routes/solutions.freelancers` | `app/routes/solutions.freelancers.tsx` | solution-sales-factory | /solutions/freelancers |
| `routes/solutions.game-builder` | `app/routes/solutions.game-builder.tsx` | solution-sales-factory | /solutions/game-builder |
| `routes/solutions.internal-ai-builder` | `app/routes/solutions.internal-ai-builder.tsx` | solution-sales-factory | /solutions/internal-ai-builder |
| `routes/solutions.startups` | `app/routes/solutions.startups.tsx` | solution-sales-factory | /solutions/startups |
| `routes/solutions.website-builder` | `app/routes/solutions.website-builder.tsx` | solution-sales-factory | /solutions/website-builder |
| `routes/team` | `app/routes/team.tsx` | product-interactive-or-static | /team |
| `routes/theme-validation` | `app/routes/theme-validation.tsx` | marketing-static-catalog | /theme-validation |
