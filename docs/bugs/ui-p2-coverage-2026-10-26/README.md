# Couverture partielle consolidée P2

Base current-routes.json de priority :357 identifiants uniques,94 testés localement de façon partielle,103 non exercés,5 réservés et155 hors UI. Après vérification des reçus des cinq groupes disjoints,66 transitions donnent **160 partiels /37 non exercés /5 réservés /155 hors UI**. Cette consolidation locale ne constitue ni un index publié ni un verdict « tout fonctionne ».

Les30 IDs Solutions/Produit sont maintenant étayés : receipt.json terminé,1276 observations sur29IDs rendus,8 contrats HTTP et32 groupes représentatifs. Chaque observation porte le bon match ReactRouter et la langue/le thème attendus. Le30eID est un alias301, pas une page supplémentaire. Les archives ont été lues dans le worktree marketing-next, commitca126b351 ; source du build réellement servi222495dda, différente de la base de préparation7759cbcbd. Les64 sources comparées ne présentent pas d'écart.

**Le hero MarketingDeployments a passé sa recette compilée finale ciblée (13899).** Sa route devient partiellement exercée parce que le défaut et ses états ont été observés, pas parce que le correctif serait livré. Les12 contrepreuves DOM restent distinctes de ce contrôle final :44 observations et8 groupes clavier, CTA44px, textes et cartes contenus.

## Matrice des preuves

| Groupe | Baseline | Preuve corrigée compilée | Formats réellement exercés |
|---|---|---|---|
| Administration6 |140 observations,7URLs pour6IDs,13199 |20 observations Billing uniquement,13299 build222495dda ; les120 autres ne sont pas recomptées comme rejouées |320,390,844 paysage,820,1440 ; FR/EN clair/sombre |
| Éditorial15 |300 observations,13399 ; détail Blog masqué par le parent |20 observations du détail,13499 build222495dda ; cartes et Newsletter restent ouvertes |320,390,844 paysage,820,1440 ; FR/EN clair/sombre |
| Légal15 |Historique statique puis12 observations sur3routes |600 observations par resize,12699 build222495dda :160 sur4routes corrigées et440 sur11routes supplémentaires |320,360,390,844 paysage,768,820,1024,1280,1440,1920 ; FR/EN clair/sombre |
| Solutions11 +Produit19 |1276 observations,13699 build222495dda ;28 contenus +état404 +aliasHTTP |Hero :44 observations et8 groupes clavier sur buildc2823890d, recette13899 |320,360,390,844 paysage,768,820,1024,1280,1440,1920,2560 ; FR/EN clair/sombre |

Les dimensions exactes, observations par ID, URLs concrètes et chemins de reçus sont dans routes-evidence.json. Les parcours supplémentaires y sont distingués : identités admin synthétiques, GET503 ciblés, alias admin, un slug Blog publié, une valeur Compare, huit ancres StudentDPA, clavier/resize/Back et focus du tableau. Les1276 observations incluent des redimensionnements ; ce ne sont pas1276 parcours fonctionnels complets.

## Défauts et limites de fonctionnalités ouverts

- Cartes Blog : sept liens restent sur /blog, sans correspondance éditoriale exacte avec les trois articles disponibles. Le correctif Outlet rend un détail connu ; il ne répare pas les cartes.
- Newsletter : confirmation sans token et désinscription mènent à un succès d'abonnement non prouvé. Contrat backend de confirmation/désinscription manquant ; aucune fonction déclarée achevée.
- MarketingDeployments : chevauchement confirmé à1024, CTA documentation trop large à320FR dans la contrepreuve. Deux classes locales puis priorité minimum44px corrigées ; recette compilée13899 réussie, aucune livraison inférée.
- Admin : petits contrôles Users et perte de querylang lors du redirect /admin restent des observations distinctes, non corrigées par la réparation Billing.
- Collaboration : deux signaux de texte dépassant le padding à768FR, sans sortie de carte ni collision confirmée ; ne pas les transformer en défaut réparé ou ignorer leur limite.

open-defects.json donne les preuves et prochaines étapes. Les contrôles légaux possèdent une preuve Range compilée. Les classes min-height seules ne constituent pas une mesure.

## Mapping exact des66 transitions

| ID | URLs concrètes | Observations/contrats par reçu |
|---|---|---|
| routes/admin._index | /admin | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 20 observations (baseline) |
| routes/admin.$section | /admin/overview, /admin/users | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 40 observations (baseline) |
| routes/admin.billing | /admin/billing | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 20 observations (baseline) ; docs/bugs/ui-administration-2026-10-26/after13299/receipt.json : 20 observations (corrected compiled) |
| routes/admin.oauth-providers | /admin/oauth-providers | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 20 observations (baseline) |
| routes/admin.stripe | /admin/stripe | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 20 observations (baseline) |
| routes/admin.wallets | /admin/wallets | docs/bugs/ui-administration-2026-10-26/before13199/receipt.json : 20 observations (baseline) |
| routes/about | /about | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/blog | /blog | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/blog.$slug | /blog/introducing-e-code | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) ; docs/bugs/ui-editorial-2026-10-26/after13499/receipt.json : 20 observations (corrected compiled) |
| routes/careers | /careers | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/case-studies | /case-studies | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/changelog | /changelog | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/compare._index | /compare | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/compare.$slug | /compare/github-codespaces | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/partners | /partners | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/press | /press | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/status | /status | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/newsletter | /newsletter | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/newsletter-confirmed | /newsletter-confirmed | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/newsletter_.confirm | /newsletter/confirm | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/newsletter_.unsubscribe | /newsletter/unsubscribe | docs/bugs/ui-editorial-2026-10-26/before13399/receipt.json : 20 observations (baseline) |
| routes/acceptable-use | /acceptable-use | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/accessibility | /accessibility | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/commercial-agreement | /commercial-agreement | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/data-deletion | /data-deletion | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/deleting-your-data | /deleting-your-data | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/dpa | /dpa | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/corrected/receipt.json : 40 observations (final compiled) |
| routes/enforcement | /enforcement | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/licensing | /licensing | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/report-abuse | /report-abuse | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/corrected/receipt.json : 40 observations (final compiled) |
| routes/security | /security | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/strike-system | /strike-system | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/student-dpa | /student-dpa | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/corrected/receipt.json : 40 observations (final compiled) |
| routes/subprocessors | /subprocessors | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/corrected/receipt.json : 40 observations (final compiled) |
| routes/trust-and-safety | /trust-and-safety | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/usage-limits | /usage-limits | docs/bugs/ui-legal-accessibility-2026-10-26/after12699/remaining/receipt.json : 40 observations (final compiled) |
| routes/solutions._index | /solutions | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.$slug | /solutions/synthetic-unknown, /solutions/internal-ai | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations +4 contrats (baseline before hero correction) |
| routes/solutions.app-builder | /solutions/app-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.chatbot-builder | /solutions/chatbot-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.dashboard-builder | /solutions/dashboard-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.enterprise | /solutions/enterprise | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.freelancers | /solutions/freelancers | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.game-builder | /solutions/game-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.internal-ai-builder | /solutions/internal-ai-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.startups | /solutions/startups | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/solutions.website-builder | /solutions/website-builder | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/ai | /ai | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/ai-agent.studio | /ai-agent/studio | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 0 observations +4 contrats (baseline before hero correction) |
| routes/ai-docs | /ai-docs | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/ai-documentation | /ai-documentation | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/bounties | /bounties | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/collaboration | /collaboration | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/customers | /customers | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/demo | /demo | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/deployments | /deployments | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/desktop | /desktop | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/marketing.bounties | /marketing/bounties | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/marketing.deployments | /marketing/deployments | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/marketing.teams | /marketing/teams | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/mcp | /mcp | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/mobile | /mobile | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/polyglot | /polyglot | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/product | /product | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/team | /team | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |
| routes/theme-validation | /theme-validation | docs/bugs/ui-solutions-product-2026-10-26/receipt.json : 44 observations (baseline before hero correction) |

## Limites communes et intégration

Aucune validation production, donnée réelle, email réel, achat, permission créée ou mutation backend. Les actions unitaires et API synthétiques restent distinctes des GET publics. Pas de certification juridique, WCAG, lecteur d'écran, WebKit, clavier virtuel matériel ou zoom supplémentaire. Les fontes tierces bloquées impliquent un rendu local de repli. Une route dynamique n'est exercée que pour les paramètres listés ; l'alias studio ne transmet aucune couverture à /ai-agent, le résolveur Solutions est exercé en404 et308, pas dans toutes ses branches.

Le lien du registre éditorial a été corrigé vers before13399/route-map.json ; les reçus historiques restent inchangés.

Les assertions de consolidation vérifient357IDs uniques,66IDs disjoints initialement non exercés,29matches rendus +un alias, comptes1276/8/32, langues/thèmes, absence d'erreurs déclarées et de mutations. L'état « partiel » ne masque aucun défaut ouvert. La consolidation est intégrée au lot local. La réserve de recette locale du Hero est levée par13899 ; aucune validation main/live n'est déduite du comptage.

Complément final : l’échec intermédiaire13799 (CTA22px sur écran≥768) est conservé. La source corrigée c2823890d est vérifiée sur13899 sans injection CSS ; cette recette ne rejoue pas les1276 observations des autres pages. Le fichier open-defects.json conserve aussi le suivi du Hero désormais corrigé localement, avec livraison encore distincte.
