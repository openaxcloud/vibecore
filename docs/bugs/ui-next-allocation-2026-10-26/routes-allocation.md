# Allocation des 146 routes non exercées

Base source et inventaire : `6b8940ec823a4a765fc7e6ef8ed021d3a6644dcd`. Lecture de `app/routes.ts` : `flatRoutes` avec exclusion des specs ; lecture des imports, exports et loaders des146 fichiers. Proposition de lots, sans édition produit, index, commit ou recette nouvelle. Les propriétaires « proposés » ne désignent pas des agents déjà lancés.

**146 IDs exactement une fois,14 groupes disjoints.** Les fichiers de route sont attribués une seule fois ; les composants dépendants restent des références en lecture seule dans un registre central. Un groupe réservé ici ne change pas le statut historique `non_exerce`. Les cinq routes projet database/deployments/domains/git/snapshots déjà réservées dans l’inventaire sont hors de ces146.

| Groupe | Nombre | Priorité | Propriétaire / coordination |
| --- | ---: | --- | --- |
| IDE, projets, imports et compatibilité | 33 | reserved | Session IDE / Git / Deploy existante |
| Paramètres ControlPanel partagé IDE | 2 | reserved | Coordination avec session IDE, non attribué à notre lot |
| Callback du hub Intégrations | 1 | reserved | Session hub Intégrations existante |
| Authentification et récupération | 7 | P1 | Lot auth proposé, à attribuer |
| Accès organisation et équipes hors IDE | 8 | P1 | Notre périmètre UI hors IDE, lot proposé |
| Entrées compte et offre | 5 | P1 | Notre périmètre UI hors IDE, lot proposé |
| Administration | 6 | P2 | Lot admin proposé, à attribuer |
| Catalogue, recherche, communauté et aide | 15 | P1 | Lot public découverte proposé |
| Politiques, confiance et information compte | 15 | P2 | Lot public légal proposé |
| Solutions | 11 | P2 | Lot public solutions proposé |
| Marketing et éditorial | 15 | P2 | Lot public éditorial proposé |
| Présentations produit | 19 | P2 | Lot public produit proposé |
| Catch-all et compatibilité HTTP404 | 8 | P1 | Lot public erreurs proposé |
| Domaines organisation partagés | 1 | reserved | Session Domains existante, coordination obligatoire |

## Ordre et blocages concrets

P1 : récupération des erreurs/catch-all, entrées compte/offre, recherche/aide et accès organisation/auth sous fixtures. Ce sont des priorités de parcours, pas des défauts produits nouvellement reproduits. P2 : administration et contenus publics/légaux/solutions. Réservé : IDE/projets/imports, ControlPanel, Intégrations et Domaines nécessitent coordination explicite avant prise en charge.

Les callbacks OAuth peuvent muter côté serveur sur un GET navigateur valide : blocage des POST navigateur seul insuffisant ; fixture serveur obligatoire, aucun code/token réel. Aucun SSO, SCIM, invitation, domaine/DNS, abonnement ou action admin réelle. Sans contrat fixture couvrant ces effets, le parcours reste bloqué, pas supposé validé.

## Alias, réutilisations et faux doublons

- `register` réexporte signup ; `marketplace.templates` réexporte templates ; `marketing.$slug` réexporte le catch-all `$`. Les exports exacts sont consignés avec lignes dans le JSON.
- `ai-docs` et `ai-documentation` rendent la même définition `marketingPages['ai-documentation']`, sans redirection.
- `$accountSlug.$projectSlug` réutilise ProjectIdeRoute avec son propre loader de résolution : pas simple alias HTTP.
- `profile.$username`, `u.$username`, `u.$username.$projectname`, `user.$username` jettent HTTP404. Leur ancien type redirect_alias est conservé comme historique, corrigé dans implementationKind.
- `marketplace`/`marketplace._index` et `projects.$projectId`/`projects.$projectId._index` partagent un motif URL parce que parent Outlet et index : pas deux pages équivalentes.
- `$slug` et `advanced.$section` rendent aussi des surfaces connues ; recette404 seule insuffisante. `/ide/:id`, `/ide/new`, mobile-workspace et runtime-test rendent des pages marketing, pas des redirections déduites de leur nom.
- Les couples marketing.teams/team, marketing.deployments/deployments et marketing.bounties/bounties importent des composants différents : aucune équivalence présumée. Newsletter confirm/confirmed/unsubscribe utilisent des définitions différentes.
- organization-domains partage les endpoints et la liste organisation avec projects.$projectId.domains ; deux rendus, pas réexport. Le propriétaire Domains conserve la coordination.

## Dépendances partagées

[JSON détaillé](routes-allocation.json) : chaque route indique son fichier possédé, les imports directs résolus et les lignes de preuve. Le registre dependencyRegistry donne un seul propriétaire par fichier. Chaque ligne JSON contient `ne_pas_modifier_sans_coordination` et `sharedComponentsOwners`, avec le registre comme source unique d’ownership. Root coordonne SaaSLayout, EnterpriseFormPage, AuthScreen, Dialog, EcodeMarketingPages, EcodeExactShell, root.tsx/styles et services partagés ; aucun de ces fichiers n’est implicitement attribué à tous les lots consommateurs. Les dépendances @settings/chat/workbench/project-ide sont réservées IDE. `admin.$section.tsx` importe dynamiquement des onglets @settings/debug/task-manager/service-status/event-logs/providers : lot Admin ne reçoit pas ces composants.

Le registre couvre imports statiques/réexports et imports dynamiques littéraux directs, pas tout le graphe transitif. Avant édition d’un composant indirect, vérifier les consommateurs et l’accord du propriétaire ; cette limite est explicite et interdit de conclure absence de conflit sur la seule liste.

## Liste exhaustive par lot

### IDE, projets, imports et compatibilité — 33

Coordination propriétaire avant audit ; focus390, navigation Git/Deploy ; aucune création, import, secret ou runtime réel.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/$accountSlug.$projectSlug` | `/:accountSlug/:projectSlug` | `app/routes/$accountSlug.$projectSlug.tsx` | `component_reuse_with_own_loader` Dépendances du registre JSON |
| `routes/$accountSlug.$projectSlug.ide` | `/:accountSlug/:projectSlug/ide` | `app/routes/$accountSlug.$projectSlug.ide.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/chat.$id` | `/chat/:id` | `app/routes/chat.$id.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/editor.$id` | `/editor/:id` | `app/routes/editor.$id.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/editor.new` | `/editor/new` | `app/routes/editor.new.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/git` | `/git` | `app/routes/git.tsx` | `rendered_page` `app/components/chat/BaseChat.tsx` ; `app/components/git/GitUrlImport.client.tsx` ; `app/components/header/Header.tsx` ; `app/components/ui/BackgroundRays/index.tsx` |
| `routes/github-import` | `/github-import` | `app/routes/github-import.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/ide.$id` | `/ide/:id` | `app/routes/ide.$id.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/ide.new` | `/ide/new` | `app/routes/ide.new.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/import._index` | `/import` | `app/routes/import._index.tsx` | `rendered_page` `app/components/dashboard/AsyncPanelState.tsx` ; `app/components/dashboard/SaaSLayout.tsx` |
| `routes/import-github` | `/import-github` | `app/routes/import-github.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` |
| `routes/import-zip` | `/import-zip` | `app/routes/import-zip.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` |
| `routes/import.$provider` | `/import/:provider` | `app/routes/import.$provider.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/import.empty` | `/import/empty` | `app/routes/import.empty.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` |
| `routes/import.spreadsheet` | `/import/spreadsheet` | `app/routes/import.spreadsheet.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` |
| `routes/mobile-workspace.$projectId` | `/mobile-workspace/:projectId` | `app/routes/mobile-workspace.$projectId.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/project.$id` | `/project/:id` | `app/routes/project.$id.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/projects.$projectId._index` | `/projects/:projectId` | `app/routes/projects.$projectId._index.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId` | `/projects/:projectId` | `app/routes/projects.$projectId.tsx` | `outlet_layout` Dépendances du registre JSON |
| `routes/projects.$projectId.activity` | `/projects/:projectId/activity` | `app/routes/projects.$projectId.activity.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId.collaborators` | `/projects/:projectId/collaborators` | `app/routes/projects.$projectId.collaborators.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` ; `app/components/ui/RelativeTime.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId.env` | `/projects/:projectId/env` | `app/routes/projects.$projectId.env.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId.ide` | `/projects/:projectId/ide` | `app/routes/projects.$projectId.ide.tsx` | `rendered_page` `app/components/chat/AgentHeaderMenu.tsx` ; `app/components/chat/ComposerToolsState.tsx` ; `app/components/chat/IdePaletteState.tsx` ; `app/components/chat/PendingComposerShell.tsx` ; `app/components/project-ide/ProjectBreadcrumbSeparator.tsx` ; `app/components/ui/Dialog.tsx` ; `app/components/ui/InputDialog.tsx` ; `app/components/ui/PanelBoundary.tsx` ; `app/components/ui/use-toast.ts` ; `app/components/workbench/ProjectResourcesPanel.tsx` ; `app/components/chat/Chat.client.tsx` |
| `routes/projects.$projectId.import.$source` | `/projects/:projectId/import/:source` | `app/routes/projects.$projectId.import.$source.tsx` | `rendered_page` `app/components/marketing/EcodeSurfacePages.tsx` |
| `routes/projects.$projectId.logs` | `/projects/:projectId/logs` | `app/routes/projects.$projectId.logs.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId.preview` | `/projects/:projectId/preview` | `app/routes/projects.$projectId.preview.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/projects.$projectId.secrets` | `/projects/:projectId/secrets` | `app/routes/projects.$projectId.secrets.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` ; `app/components/ui/RevealButton.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.$projectId.settings` | `/projects/:projectId/settings` | `app/routes/projects.$projectId.settings.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Button.tsx` ; `app/components/ui/Dialog.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/projects.new` | `/projects/new` | `app/routes/projects.new.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/marketing/ecode-exact/resolve-preferred-model.ts` ; `app/components/ui/index.ts` |
| `routes/projects.share.$token` | `/projects/share/:token` | `app/routes/projects.share.$token.tsx` | `rendered_page` `app/components/share/ShareLinkErrorView.tsx` |
| `routes/runtime-test` | `/runtime-test` | `app/routes/runtime-test.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/share.$token` | `/share/:token` | `app/routes/share.$token.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/share/ShareLinkErrorView.tsx` |
| `routes/webcontainer.preview.$id` | `/webcontainer/preview/:id` | `app/routes/webcontainer.preview.$id.tsx` | `rendered_page` Dépendances du registre JSON |

### Paramètres ControlPanel partagé IDE — 2

Ouverture/fermeture, onglets, retour et focus ; composants @settings partagés avec IDE, accord requis.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/settings` | `/settings` | `app/routes/settings.tsx` | `rendered_page` `app/components/@settings/core/ControlPanel.tsx` |
| `routes/settings.$tab` | `/settings/:tab` | `app/routes/settings.$tab.tsx` | `rendered_page` `app/components/@settings/core/ControlPanel.tsx` |

### Callback du hub Intégrations — 1

Erreur callback sans code/state ; callback valide interdit hors fixture car loader effectue un POST serveur.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/integrations.oauth.$provider.callback` | `/integrations/oauth/:provider/callback` | `app/routes/integrations.oauth.$provider.callback.tsx` | `rendered_page` Dépendances du registre JSON |

### Authentification et récupération — 7

Erreur/validation et clavier, liens de retour ; mock réseau serveur obligatoire pour callback, pas de compte/session réelle créée.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/auth.oauth.$provider` | `/auth/oauth/:provider` | `app/routes/auth.oauth.$provider.tsx` | `authentication_protocol_redirect` Dépendances du registre JSON |
| `routes/auth.oauth.$provider.callback` | `/auth/oauth/:provider/callback` | `app/routes/auth.oauth.$provider.callback.tsx` | `authentication_protocol_redirect` Dépendances du registre JSON |
| `routes/forgot-password` | `/forgot-password` | `app/routes/forgot-password.tsx` | `rendered_page` `app/components/auth/AuthScreen.tsx` |
| `routes/logout` | `/logout` | `app/routes/logout.tsx` | `authentication_protocol_redirect` Dépendances du registre JSON |
| `routes/register` | `/register` | `app/routes/register.tsx` | `module_reexport` Dépendances du registre JSON |
| `routes/reset-password` | `/reset-password` | `app/routes/reset-password.tsx` | `rendered_page` `app/components/auth/AuthScreen.tsx` ; `app/components/auth/PasswordStrength.tsx` |
| `routes/verify-email` | `/verify-email` | `app/routes/verify-email.tsx` | `rendered_page` `app/components/auth/AuthScreen.tsx` |

### Accès organisation et équipes hors IDE — 8

Fixtures GET droits autorisés/refusés, longs identifiants, 320/paysage, Escape/Back ; ne pas accepter invitation, créer clé, modifier SSO/domaine/rôle.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/enterprise-sso-settings` | `/enterprise-sso-settings` | `app/routes/enterprise-sso-settings.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/ui/AlertBanner.tsx` ; `app/components/ui/Button.tsx` ; `app/components/ui/Switch.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/invitations_.accept` | `/invitations/accept` | `app/routes/invitations_.accept.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` |
| `routes/mfa-setup` | `/mfa-setup` | `app/routes/mfa-setup.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` |
| `routes/recovery-codes` | `/recovery-codes` | `app/routes/recovery-codes.tsx` | `rendered_page` `app/components/dashboard/AsyncPanelState.tsx` ; `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/ui/Dialog.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/scim-token-settings` | `/scim-token-settings` | `app/routes/scim-token-settings.tsx` | `rendered_page` `app/components/dashboard/AsyncPanelState.tsx` ; `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/ui/Dialog.tsx` ; `app/components/ui/FieldError.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/teams.$id` | `/teams/:id` | `app/routes/teams.$id.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/teams/TeamAccessLogPanel.tsx` |
| `routes/teams.$id.settings` | `/teams/:id/settings` | `app/routes/teams.$id.settings.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/teams/TeamAccessLogPanel.tsx` |
| `routes/teams.new` | `/teams/new` | `app/routes/teams.new.tsx` | `loader_redirect` Dépendances du registre JSON |

### Entrées compte et offre — 5

Vérifier destination, query et Back des alias vers pages déjà partiellement couvertes ; aucun achat/connexion réelle.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/account-data` | `/account-data` | `app/routes/account-data.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/connected-accounts` | `/connected-accounts` | `app/routes/connected-accounts.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/onboarding` | `/onboarding` | `app/routes/onboarding.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/subscribe` | `/subscribe` | `app/routes/subscribe.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/user.settings` | `/user/settings` | `app/routes/user.settings.tsx` | `loader_redirect` Dépendances du registre JSON |

### Administration — 6

États GET synthétiques droits/refus/erreur, tables et formulaires ; aucune impersonation, action Stripe, solde ou modification fournisseur.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/admin._index` | `/admin` | `app/routes/admin._index.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/admin.$section` | `/admin/:section` | `app/routes/admin.$section.tsx` | `rendered_page` `app/components/admin/InfrastructurePanel.tsx` ; `app/components/admin/SupportTicketsPanel.tsx` ; `app/components/dashboard/SaaSLayout.tsx` ; `app/components/ui/Dialog.tsx` ; `app/components/ui/Dropdown.tsx` ; `app/components/ui/FilterChip.tsx` ; `app/components/ui/RelativeTime.tsx` ; `app/components/@settings/tabs/debug/DebugTab.tsx` ; `app/components/@settings/tabs/task-manager/TaskManagerTab.tsx` ; `app/components/@settings/tabs/service-status/ServiceStatusTab.tsx` ; `app/components/@settings/tabs/event-logs/EventLogsTab.tsx` ; `app/components/@settings/tabs/providers/cloud/CloudProvidersTab.tsx` ; `app/components/@settings/tabs/providers/local/LocalProvidersTab.tsx` ; `app/components/admin/MonitoringCharts.tsx` ; onglets @settings réservés IDE |
| `routes/admin.billing` | `/admin/billing` | `app/routes/admin.billing.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/ui/FieldError.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/admin.oauth-providers` | `/admin/oauth-providers` | `app/routes/admin.oauth-providers.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/admin.stripe` | `/admin/stripe` | `app/routes/admin.stripe.tsx` | `rendered_page` `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |
| `routes/admin.wallets` | `/admin/wallets` | `app/routes/admin.wallets.tsx` | `rendered_page` `app/components/dashboard/AsyncPanelState.tsx` ; `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/components/ui/FieldError.tsx` ; `app/components/dashboard/UserAreaRouteError.tsx` |

### Catalogue, recherche, communauté et aide — 15

Recherche/filtre, retour liste/détail, résultats longs/vides/503 et scroll ; aucune acquisition/import de modèle.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/community` | `/community` | `app/routes/community.tsx` | `rendered_page` `app/components/marketing/EcodePublicResourcePages.tsx` |
| `routes/community.post.$id` | `/community/post/:id` | `app/routes/community.post.$id.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/explore` | `/explore` | `app/routes/explore.tsx` | `rendered_page` `app/components/marketing/EcodeExploreGallery.tsx` |
| `routes/forum` | `/forum` | `app/routes/forum.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Forum.tsx` |
| `routes/gallery._index` | `/gallery` | `app/routes/gallery._index.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/gallery.$slug` | `/gallery/:slug` | `app/routes/gallery.$slug.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/help` | `/help` | `app/routes/help.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/help-center` | `/help-center` | `app/routes/help-center.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/HelpCenter.tsx` |
| `routes/languages` | `/languages` | `app/routes/languages.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Languages.tsx` |
| `routes/marketplace._index` | `/marketplace` | `app/routes/marketplace._index.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/marketplace` | `/marketplace` | `app/routes/marketplace.tsx` | `outlet_layout` Dépendances du registre JSON |
| `routes/marketplace.templates` | `/marketplace/templates` | `app/routes/marketplace.templates.tsx` | `module_reexport` Dépendances du registre JSON |
| `routes/search` | `/search` | `app/routes/search.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/marketing/ecode-exact/pages/help-search.ts` ; `app/components/ui/EmptyState.tsx` |
| `routes/templates_.languages` | `/templates/languages` | `app/routes/templates_.languages.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/tutorials` | `/tutorials` | `app/routes/tutorials.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Tutorials.tsx` |

### Politiques, confiance et information compte — 15

Ancres, lecture et retour sur petit écran/paysage, zoom200 ; aucune suppression de données ni signalement réel.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/acceptable-use` | `/acceptable-use` | `app/routes/acceptable-use.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/accessibility` | `/accessibility` | `app/routes/accessibility.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Accessibility.tsx` |
| `routes/commercial-agreement` | `/commercial-agreement` | `app/routes/commercial-agreement.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/CommercialAgreement.tsx` |
| `routes/data-deletion` | `/data-deletion` | `app/routes/data-deletion.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/DataDeletion.tsx` |
| `routes/deleting-your-data` | `/deleting-your-data` | `app/routes/deleting-your-data.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/dpa` | `/dpa` | `app/routes/dpa.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/DPA.tsx` |
| `routes/enforcement` | `/enforcement` | `app/routes/enforcement.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Enforcement.tsx` |
| `routes/licensing` | `/licensing` | `app/routes/licensing.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/report-abuse` | `/report-abuse` | `app/routes/report-abuse.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/ReportAbuse.tsx` |
| `routes/security` | `/security` | `app/routes/security.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Security.tsx` |
| `routes/strike-system` | `/strike-system` | `app/routes/strike-system.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/student-dpa` | `/student-dpa` | `app/routes/student-dpa.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/StudentDPA.tsx` |
| `routes/subprocessors` | `/subprocessors` | `app/routes/subprocessors.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Subprocessors.tsx` |
| `routes/trust-and-safety` | `/trust-and-safety` | `app/routes/trust-and-safety.tsx` | `rendered_page` `app/components/marketing/ecode-exact/EcodeExactShell.tsx` |
| `routes/usage-limits` | `/usage-limits` | `app/routes/usage-limits.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |

### Solutions — 11

Catalogue→solution→retour, CTA sans création ; FR/EN longs textes, zoom, scroll.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/solutions._index` | `/solutions` | `app/routes/solutions._index.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/solutions.$slug` | `/solutions/:slug` | `app/routes/solutions.$slug.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/solutions.app-builder` | `/solutions/app-builder` | `app/routes/solutions.app-builder.tsx` | `rendered_page` `app/components/marketing/solutions/AppBuilderSolutionPage.tsx` ; `app/components/marketing/solutions/app-builder.copy.ts` |
| `routes/solutions.chatbot-builder` | `/solutions/chatbot-builder` | `app/routes/solutions.chatbot-builder.tsx` | `rendered_page` `app/components/marketing/solutions/chatbot-builder.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.dashboard-builder` | `/solutions/dashboard-builder` | `app/routes/solutions.dashboard-builder.tsx` | `rendered_page` `app/components/marketing/solutions/dashboard-builder.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.enterprise` | `/solutions/enterprise` | `app/routes/solutions.enterprise.tsx` | `rendered_page` `app/components/marketing/solutions/enterprise.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.freelancers` | `/solutions/freelancers` | `app/routes/solutions.freelancers.tsx` | `rendered_page` `app/components/marketing/solutions/freelancers.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.game-builder` | `/solutions/game-builder` | `app/routes/solutions.game-builder.tsx` | `rendered_page` `app/components/marketing/solutions/game-builder.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.internal-ai-builder` | `/solutions/internal-ai-builder` | `app/routes/solutions.internal-ai-builder.tsx` | `rendered_page` `app/components/marketing/solutions/internal-ai-builder.copy.ts` ; `app/components/marketing/solutions/solution-route.tsx` |
| `routes/solutions.startups` | `/solutions/startups` | `app/routes/solutions.startups.tsx` | `rendered_page` `app/components/marketing/solutions/solution-route.tsx` ; `app/components/marketing/solutions/startups.copy.ts` |
| `routes/solutions.website-builder` | `/solutions/website-builder` | `app/routes/solutions.website-builder.tsx` | `rendered_page` `app/components/marketing/solutions/solution-route.tsx` ; `app/components/marketing/solutions/website-builder.copy.ts` |

### Marketing et éditorial — 15

Liste/détail/Back, états inconnus et langues ; newsletter token absent/synthétique seulement, aucune inscription/désinscription réelle.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/about` | `/about` | `app/routes/about.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/About.tsx` |
| `routes/blog` | `/blog` | `app/routes/blog.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Blog.tsx` |
| `routes/blog.$slug` | `/blog/:slug` | `app/routes/blog.$slug.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/careers` | `/careers` | `app/routes/careers.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Careers.tsx` |
| `routes/case-studies` | `/case-studies` | `app/routes/case-studies.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/CaseStudies.tsx` |
| `routes/changelog` | `/changelog` | `app/routes/changelog.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Changelog.tsx` |
| `routes/compare._index` | `/compare` | `app/routes/compare._index.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/CompareIndex.tsx` |
| `routes/compare.$slug` | `/compare/:slug` | `app/routes/compare.$slug.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/newsletter` | `/newsletter` | `app/routes/newsletter.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/newsletter-confirmed` | `/newsletter-confirmed` | `app/routes/newsletter-confirmed.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/newsletter_.confirm` | `/newsletter/confirm` | `app/routes/newsletter_.confirm.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/newsletter_.unsubscribe` | `/newsletter/unsubscribe` | `app/routes/newsletter_.unsubscribe.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/partners` | `/partners` | `app/routes/partners.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Partners.tsx` |
| `routes/press` | `/press` | `app/routes/press.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Press.tsx` |
| `routes/status` | `/status` | `app/routes/status.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/StatusPage.tsx` |

### Présentations produit — 19

Lecture, CTA et liens canoniques, comparaison des wrappers distincts ; aucun IDE/runtime lancé.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/ai` | `/ai` | `app/routes/ai.tsx` | `rendered_page` `app/components/marketing/EcodeProductMarketingPages.tsx` |
| `routes/ai-agent.studio` | `/ai-agent/studio` | `app/routes/ai-agent.studio.tsx` | `loader_redirect` Dépendances du registre JSON |
| `routes/ai-docs` | `/ai-docs` | `app/routes/ai-docs.tsx` | `same_rendered_definition` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/ai-documentation` | `/ai-documentation` | `app/routes/ai-documentation.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/bounties` | `/bounties` | `app/routes/bounties.tsx` | `rendered_page` `app/components/marketing/EcodeExactProductMarketingPages.tsx` |
| `routes/collaboration` | `/collaboration` | `app/routes/collaboration.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Collaboration.tsx` |
| `routes/customers` | `/customers` | `app/routes/customers.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/demo` | `/demo` | `app/routes/demo.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/deployments` | `/deployments` | `app/routes/deployments.tsx` | `rendered_page` `app/components/marketing/EcodeProductMarketingPages.tsx` |
| `routes/desktop` | `/desktop` | `app/routes/desktop.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Desktop.tsx` |
| `routes/marketing.bounties` | `/marketing/bounties` | `app/routes/marketing.bounties.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/Bounties.tsx` |
| `routes/marketing.deployments` | `/marketing/deployments` | `app/routes/marketing.deployments.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/PublicDeploymentsPage.tsx` |
| `routes/marketing.teams` | `/marketing/teams` | `app/routes/marketing.teams.tsx` | `rendered_page` `app/components/marketing/ecode-exact/pages/PublicTeamPage.tsx` |
| `routes/mcp` | `/mcp` | `app/routes/mcp.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/mobile` | `/mobile` | `app/routes/mobile.tsx` | `rendered_page` `app/components/marketing/EcodeProductMarketingPages.tsx` |
| `routes/polyglot` | `/polyglot` | `app/routes/polyglot.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/product` | `/product` | `app/routes/product.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |
| `routes/team` | `/team` | `app/routes/team.tsx` | `rendered_page` `app/components/marketing/EcodeProductMarketingPages.tsx` |
| `routes/theme-validation` | `/theme-validation` | `app/routes/theme-validation.tsx` | `rendered_page` `app/components/marketing/EcodeMarketingPages.tsx` |

### Catch-all et compatibilité HTTP404 — 8

404 réelle, texte localisé, récupération accueil/Back ; cas connus/inconnus des résolveurs dynamiques.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/$` | `/*` | `app/routes/$.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` |
| `routes/$slug` | `/:slug` | `app/routes/$slug.tsx` | `rendered_page` `app/components/dashboard/SaaSLayout.tsx` ; `app/components/marketing/EcodeSurfacePages.tsx` |
| `routes/advanced.$section` | `/advanced/:section` | `app/routes/advanced.$section.tsx` | `rendered_page` `app/components/marketing/EcodeSurfacePages.tsx` |
| `routes/marketing.$slug` | `/marketing/:slug` | `app/routes/marketing.$slug.tsx` | `module_reexport` Dépendances du registre JSON |
| `routes/profile.$username` | `/profile/:username` | `app/routes/profile.$username.tsx` | `unconditional_http404` Dépendances du registre JSON |
| `routes/u.$username` | `/u/:username` | `app/routes/u.$username.tsx` | `unconditional_http404` Dépendances du registre JSON |
| `routes/u.$username.$projectname` | `/u/:username/:projectname` | `app/routes/u.$username.$projectname.tsx` | `unconditional_http404` Dépendances du registre JSON |
| `routes/user.$username` | `/user/:username` | `app/routes/user.$username.tsx` | `unconditional_http404` Dépendances du registre JSON |

### Domaines organisation partagés — 1

Même liste /orgs/:orgId/domains que la route projet ; GET synthétique seulement après accord, aucune vérification DNS.

| ID | Motif | Fichier possédé | Nature source | Ne pas modifier sans coordination |
| --- | --- | --- | --- | --- |
| `routes/organization-domains` | `/organization-domains` | `app/routes/organization-domains.tsx` | `rendered_page` `app/components/dashboard/AsyncPanelState.tsx` ; `app/components/enterprise/EnterpriseFormPage.tsx` ; `app/routes/projects.$projectId.domains.tsx` |

## Vérifications documentaires

Ensemble146 identique au filtre non_exerce de l’overlay ; unicité IDs et fichiers possédés ; somme des groupes146 ; fichiers/numéros de lignes présents ; dépendances résolues existantes et registre sans doublon. Aucun statut de couverture promu. Pas de nouveau test produit, build, navigateur ou opération externe.
