# Couverture partielle —43 IDs P1 consolidés

**357 IDs uniques :94 partiellement exercés,103 non exercés,5 réservés historiques,155 hors UI.** Les43 transitions sont prouvées par les reçus consolidés et ne signifient ni43 pages indépendantes ni43 correctifs validés. Aucune page déclarée entièrement validée ou validée en production.

[JSON complet357 lignes](current-routes.json) ; base [overlay51/146](../ui-safe-content-2026-10-26/coverage-overlay-support-quota.json). Les anciens inventaires et archives restent inchangés. Les37 réservations de travail de l’allocation sont une dimension distincte dans les146 anciens non_exerce ; elles ne remplacent pas les5 réservations historiques.

| Groupe | IDs nouvellement partiels | Preuve réellement vérifiée |
| --- | ---: | --- |
| Auth |7|4 pages/80observations et3protocoles/27cas ; complément formulaires20états +6récupérations +2renvois simulés|
| Organisation |8|5 entrées restent baseline11899 ;3routes avec20observations chacune après12099, dont enfant Settings enfin rendu|
| Découverte |15|14URL/280observations ; parent Marketplace indirect sans écran supplémentaire|
| Entrées |13|5alias +8compat ;15états/300observations, ID réel confirmé pour10étatscompat|

## Couverture et correction : états séparés

**Auth reset/renvoi email et Gallery titre/tag : recettes compilées ciblées du build commun fbb678704 désormais réussies.** Auth12199 :40 observations sur2routes et4groupes ; Galerie13099 :20 mesures et4parcours. Leurs baselines restent distinctes ; aucun autre état ou route n’est réputé rejoué. Organisation : corrections Outlet/SSO vérifiées sur build isolé12099 ; ce résultat ne vaut pas replay du build commun. Entrées : aucun défaut reproduit dans le périmètre ciblé.

## Vérification des preuves et dénominateurs

- Auth : receipt.json contient exactement20observations par forgot-password/register/reset-password/verify-email. protocols.json contient7cas startOAuth,17callback,3logout ; destinations fournisseur non suivies. Register réexporte signup mais ne lui transfère aucune couverture. actions.json20états, recovery.json12soumissions pour6paires503→200, resend.json4soumissions pour2paires :36POST navigateur synthétiques, distincts des protocoles ; aucune vraie émission de compte/session/email.
- Organisation : les20 observations baseline de teams.settings mesuraient le mauvais parent, donc ne servent pas de preuve du contenu enfant. after12099 contient20observations du vrai enfant, titres Paramètres de l’équipe/Team settings et parcours Team→Settings→Back. MFA enabled seulement ; invitations fictives non acceptées ; tokens/codes métadonnées seulement ; teams.new est un alias vers le dialogue Switcher.
- Découverte : matrix.json et les14paths du reçu concordent ; Marketplace parent est un Outlet confirmé par source et traversé avec son index, sans20observations supplémentaires. marketplace.templates réexporte Templates, mais sa propre URL est visitée. interactions.json première navigation Galerie invalide (course de harness) exclue ; navigation.json attend le vrai détail/Retour, navigation-search.json le résultatTemplates/Back. GET503 récupérés par rechargement, pas Retry produit inventé.
- Entrées :5statuts/Location des alias vérifiés ; matched-route-ids.json distingue catch-all$, $slug, marketing réexport et profils404. Deux états connus/inconnus pour$slug etadvanced donnent10états, pas10IDs.60groupes simples Tab/Escape/Back atteignent seulement le skiplink, pas tous les menus.

Les comptes d’observations/parcours/POST ne s’additionnent jamais au dénominateur des routes. Les groupes FR/EN×thèmes et dimensions exactes restent dans chaque reçu/ligne JSON ; pas de prétention à une recette de tous les états dynamiques.

##43 transitions et preuves par ID

| ID | Nature | Preuve/version | Statut du correctif |
| --- | --- | --- | --- |
| `routes/$` | rendered_page | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': '$'}` | no correction attributed by this overlay |
| `routes/$slug` | rendered_page | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': '$slug'}` | no correction attributed by this overlay |
| `routes/account-data` | loader_redirect | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'account-data'}` | no correction attributed by this overlay |
| `routes/advanced.$section` | rendered_page | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'advanced.$section'}` | no correction attributed by this overlay |
| `routes/auth.oauth.$provider` | protocol | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/protocols.json) ; sélection `7` | no correction attributed by this overlay |
| `routes/auth.oauth.$provider.callback` | protocol | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/protocols.json) ; sélection `17` | no correction attributed by this overlay |
| `routes/community` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/community'}` | no correction attributed by this overlay |
| `routes/community.post.$id` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/community/post/mobile-preview-checklist'}` | no correction attributed by this overlay |
| `routes/connected-accounts` | loader_redirect | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'connected-accounts'}` | no correction attributed by this overlay |
| `routes/enterprise-sso-settings` | rendered_page | [compiled12099 corrected](../ui-organization-access-2026-10-26/after12099/receipt.json) ; sélection `{'path': '/enterprise-sso-settings'}` | targeted isolated compiled recipe12099 passed; no claim common build retested |
| `routes/explore` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/explore'}` | no correction attributed by this overlay |
| `routes/forgot-password` | rendered_page | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/receipt.json) ; sélection `{'route': '/forgot-password'}` | no correction attributed by this overlay |
| `routes/forum` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/forum'}` | no correction attributed by this overlay |
| `routes/gallery.$slug` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/gallery/synthetic-gallery'}` | no correction attributed by this overlay |
| `routes/gallery._index` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/gallery'}` | targeted corrected common-build recipe13099 passed; no production acceptance |
| `routes/help` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/help'}` | no correction attributed by this overlay |
| `routes/help-center` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/help-center'}` | no correction attributed by this overlay |
| `routes/invitations_.accept` | rendered_page | [baseline11899](../ui-organization-access-2026-10-26/before11899/receipt.json) ; sélection `{'path': '/invitations/accept?token=synthetic-not-an-access-token'}` | no correction attributed by this overlay |
| `routes/languages` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/languages'}` | no correction attributed by this overlay |
| `routes/logout` | protocol | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/protocols.json) ; sélection `3` | no correction attributed by this overlay |
| `routes/marketing.$slug` | module_reexport | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'marketing.$slug'}` | no correction attributed by this overlay |
| `routes/marketplace` | outlet_layout_indirect | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/marketplace'}` | no correction attributed by this overlay |
| `routes/marketplace._index` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/marketplace'}` | no correction attributed by this overlay |
| `routes/marketplace.templates` | module_reexport | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/marketplace/templates'}` | no correction attributed by this overlay |
| `routes/mfa-setup` | rendered_page | [baseline11899](../ui-organization-access-2026-10-26/before11899/receipt.json) ; sélection `{'path': '/mfa-setup'}` | no correction attributed by this overlay |
| `routes/onboarding` | loader_redirect | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'onboarding'}` | no correction attributed by this overlay |
| `routes/profile.$username` | unconditional_http404 | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'profile.$username'}` | no correction attributed by this overlay |
| `routes/recovery-codes` | rendered_page | [baseline11899](../ui-organization-access-2026-10-26/before11899/receipt.json) ; sélection `{'path': '/recovery-codes'}` | no correction attributed by this overlay |
| `routes/register` | module_reexport | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/receipt.json) ; sélection `{'route': '/register'}` | no correction attributed by this overlay |
| `routes/reset-password` | rendered_page | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/receipt.json) ; sélection `{'route': '/reset-password'}` | targeted corrected common-build recipe12199 passed; no production acceptance |
| `routes/scim-token-settings` | rendered_page | [baseline11899](../ui-organization-access-2026-10-26/before11899/receipt.json) ; sélection `{'path': '/scim-token-settings'}` | no correction attributed by this overlay |
| `routes/search` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/search?q=api'}` | no correction attributed by this overlay |
| `routes/subscribe` | loader_redirect | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'subscribe'}` | no correction attributed by this overlay |
| `routes/teams.$id` | rendered_page | [compiled12099 corrected](../ui-organization-access-2026-10-26/after12099/receipt.json) ; sélection `{'path': '/teams/synthetic-team'}` | targeted isolated compiled recipe12099 passed; no claim common build retested |
| `routes/teams.$id.settings` | rendered_page | [compiled12099 corrected](../ui-organization-access-2026-10-26/after12099/receipt.json) ; sélection `{'path': '/teams/synthetic-team/settings'}` | targeted isolated compiled recipe12099 passed; no claim common build retested |
| `routes/teams.new` | loader_redirect | [baseline11899](../ui-organization-access-2026-10-26/before11899/receipt.json) ; sélection `{'path': '/teams/new'}` | no correction attributed by this overlay |
| `routes/templates_.languages` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/templates/languages'}` | no correction attributed by this overlay |
| `routes/tutorials` | rendered_page | [baseline12999; not corrected common build](../ui-discovery-2026-10-26/before12999/receipt.json) ; sélection `{'path': '/tutorials'}` | no correction attributed by this overlay |
| `routes/u.$username` | unconditional_http404 | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'u.$username'}` | no correction attributed by this overlay |
| `routes/u.$username.$projectname` | unconditional_http404 | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'u.$username.$projectname'}` | no correction attributed by this overlay |
| `routes/user.$username` | unconditional_http404 | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'user.$username'}` | no correction attributed by this overlay |
| `routes/user.settings` | loader_redirect | [existing12399 UI975+merge main](../ui-entry-audit-2026-10-26/before12399/receipt.json) ; sélection `{'id': 'user.settings'}` | no correction attributed by this overlay |
| `routes/verify-email` | rendered_page | [baseline11999; not corrected common build](../ui-authentication-2026-10-26/receipt.json) ; sélection `{'route': '/verify-email'}` | targeted corrected common-build recipe12199 passed; no production acceptance |

## Limites et suite

Aucune opération backend réelle, fournisseur OAuth, achat, invitation acceptée, nouveau secret/permission, SSO/SCIM ou session production validée. Polices tierces bloquées ; aucune nouvelle acceptation Safari/Firefox, lecteur d’écran, zoom natif200%, clavierOS, safeareas physiques ou contrasteWCAG. Restes propres aux routes conservés dans leurs README, pas absorbés par le total94.

Aucun nouveau build/test/navigateur exécuté pour cette consolidation. Contrôles documentaires :357 IDs égaux à la base ;43 changements uniques non_exerce→teste_local_partiel ; comptes94/103/5/155 ; liens de reçus existants ; nombre et sélection des observations vérifiés. Les reçus corrigés sont maintenant rattachés sans effacer la baseline ; contrôles/fusion/livraison restent séparés sous responsabilité du parent. Aucun statut main/live modifié.

## Compléments compilés finaux — mêmes dénominateurs

[Auth12199](../ui-authentication-2026-10-26/after12199/README.md) : reset-password et verify-email, chacun20observations FR/EN×thèmes×5formats. Premier contrôle de révélation mesuré≥44px, padding52px et borne texte avant bouton ; Tab/Space fonctionne et conserve le texte. Il ne s’agit pas d’une mesure individuelle de chaque champ ni du pixel de caret interne. Quatre groupes resize/brouillon/renvoi503, cooldown virtuel61s, réactivation ;4POST vers fixture locale, zéro erreur JS. Les36POST synthétiques antérieurs ne sont pas rejoués.

[Galerie13099](../ui-discovery-2026-10-26/after13099/receipt.json) :20observations intrinsèques titre/tag et4parcours Enter vers détail puis Back. Contenu complet conservé, bornes dans la carte, scrollWidth≤clientWidth+2, zéro erreur JS. La capture carte seule recouvre le haut avec le header ; la capture page depuis le haut fournit la preuve visuelle complémentaire. Pas de replay280observations Discovery. Les deux routes source/build comparées ont la même empreinte documentée dans l’archive.

Les totaux restent94/103/5/155 et43transitions. Recettes locales synthétiques uniquement ; main/live demeurent faux. Aucun changement des archives historiques ou du code par cette mise à jour documentaire.

## Complément de zoom natif

Le [complément Chromium 200 %](../ui-priority-zoom-2026-10-26/README.md) ajoute 12 observations et 6 transitions sur trois IDs déjà partiels : reset-password, teams.$id.settings et gallery._index. Fenêtres 640/1440, largeurs CSS 320/720, FR clair et EN sombre. Les totaux restent 94/103/5/155 ; les limites sans zoom ci-dessus décrivent les phases précédentes, pas ce complément ciblé. Aucun autre viewport, navigateur ou état métier promu.
