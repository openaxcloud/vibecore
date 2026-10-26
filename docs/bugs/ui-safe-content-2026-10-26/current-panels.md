# Panneaux : complément courant ciblé

**151 identifiants conservés ;14 unités avec preuve partielle historique,14 actuellement.** Trois unités déjà partielles reçoivent de nouvelles preuves : Dialog, AppShell et EcodeExactPublicNavbar. Aucune nouvelle catégorie déclarée testée ;137 unités restent sans recette établie. Ces nombres ne s’ajoutent pas aux357 routes ni aux observations des matrices.

Base : [inventaire historique](../ui-coverage-2026-10-26/panels.md), conservé. Ce document additionnel est préparé dans le worktree safecontent, après commit local64917980, sans modification de la tête #797, des sources ou de l’index. [JSON courant](current-panels.json).

## Correspondances exactes

| ID conservé | Instance réellement exercée | Preuves ajoutées |
| --- | --- | --- |
| `shared:AppShell` | AppShell — instances limitées ci-dessous | appshell-header-menu10999, dialog-shell-scroll11099, appshell-safecontent11399 |
| `shared:Dialog` | Dialog — instances limitées ci-dessous | switcher-dialog10599, dialog-shell-scroll11099, appshell-safecontent11399 |
| `shared:EcodeExactPublicNavbar` | EcodeExactPublicNavbar — instances limitées ci-dessous | public-sheet11099 |

### switcher-dialog10599

Brouillon et resize, Tab/Escape ; quatre fermetures depuis vrai bouton (Escape, Annuler, Fermer, fond) avec restitution du focus.

Les48géométries/8groupes du reçu couvrent trois routes, pas48tests de ce dialogue. Entrée directe?create=1 sans vrai ouvreur non couverte. Pas validation de tous consommateurs Dialog.

Version :10599. [Reçu et méthode](../ui-coverage-2026-10-26/organization-after10599/README.md).

### appshell-header-menu10999

8simulations safeareas FRclair Security/Switcher sur4formats ;32observations header sansinset sur8formats×FR/EN×thèmes,16ouverturesmenu/Escape/focus.

SimulationCDP, pas iOS matériel ; header/menu seulement, aucun succès API permissions. AppShell mobile/tablette sans barre basse préexistante : demande globale ouverte.

Version :10999. [Reçu et méthode](../ui-coverage-2026-10-26/safeareas/after10999/README.md).

### dialog-shell-scroll11099

Switcher dialogue sûr/Escape/focus ; Security wheel/PageDown et récupération du champ aprèsresize, headercontenu.

ChampSecurityx43<safe47 àcebuild, traité horizontalement11399 séparément. Ce complément ne rejoue pas8+32header10999 ni48org10599.

Version :11099. [Reçu et méthode](../ui-coverage-2026-10-26/safeareas/after11099/README.md).

### public-sheet11099

4groupes FR/EN×clair/sombre844×390 : ouverturemenu, fond verrouillé malgréwheel, Escape/focusau déclencheur et reprisescroll.

Pas transfert à tous menus publics ni à une primitive Sheet inexistante dans les151IDs. Focusmailto aprèsresize peut rester horsvue ; pas activationmail/backend.

Version :11099. [Reçu et méthode](../ui-coverage-2026-10-26/account-inactivity/after11099/README.md).

### appshell-safecontent11399

32cas contenuSecurity FR/EN×thèmes×4formats×insetsnuls/simulés ;4paysagechampx43→69,28autresgéométriesinchangées.4groupes resizebrouillon/menuEscape/SwitcherEscape/Retour ;8états sidebar1024/1440 ouverte/repliée×insets0/47 ; gardesSIEM320 etpadding0projects/new.

Header inchangé ; preuve horizontale seulement. Focus aprèsresize peut toucher bas390 au lieu safe369 : visibilitéverticale non garantie. Exceptioncustomcontentprojects/new conservée, pas certificationsafearea de cettepage. Aucun accès/connexionSIEM créé.

Version :11399, commitlocal64917980. [Reçu et méthode](../ui-safe-content-2026-10-26/README.md).

## Preuve IDE non transférée à un autre panneau

La [barre basse IDE compilée11099](../ui-coverage-2026-10-26/safeareas/after11099/README.md) reste un complément non attribué : l’ID `ide-overlay:mobile-nav` désigne les tools sheet/tab switcher, dont aucun parcours d’ouverture/état n’est établi ici. Une barre visible ne valide pas ces overlays. Aucun ID ajouté, ni agent/IDE global promu. Les données mémoire/conversation manquent dans la fixture ; les moteurs, WebSockets et permissions ne sont pas validés.

## Toutes les unités, statut courant

| ID | Historique | Courant | Nouvelles preuves |
| --- | --- | --- | --- |
| `ide:agent` | not_established | not_established |  |
| `ide:editor` | not_established | not_established |  |
| `ide:preview` | partial_historical | partial_historical |  |
| `ide:files` | not_established | not_established |  |
| `ide:search` | not_established | not_established |  |
| `ide:locks` | not_established | not_established |  |
| `ide:overview` | not_established | not_established |  |
| `ide:studio` | not_established | not_established |  |
| `ide:problems` | not_established | not_established |  |
| `ide:database` | not_established | not_established |  |
| `ide:object-storage` | not_established | not_established |  |
| `ide:packages` | not_established | not_established |  |
| `ide:skills` | not_established | not_established |  |
| `ide:monitoring` | not_established | not_established |  |
| `ide:ports` | not_established | not_established |  |
| `ide:extensions` | not_established | not_established |  |
| `ide:integrations` | not_established | not_established |  |
| `ide:workflows` | not_established | not_established |  |
| `ide:debugger` | partial_historical | partial_historical |  |
| `ide:deployments` | partial_historical | partial_historical |  |
| `ide:security` | not_established | not_established |  |
| `ide:env` | not_established | not_established |  |
| `ide:secrets` | not_established | not_established |  |
| `ide:git` | not_established | not_established |  |
| `ide:activity` | not_established | not_established |  |
| `ide:terminal` | not_established | not_established |  |
| `ide:logs` | not_established | not_established |  |
| `ide:collaborators` | not_established | not_established |  |
| `ide:domains` | partial_historical | partial_historical |  |
| `ide:snapshots` | not_established | not_established |  |
| `ide:settings` | not_established | not_established |  |
| `admin-web:overview` | not_established | not_established |  |
| `admin-web:health` | not_established | not_established |  |
| `admin-web:monitoring` | not_established | not_established |  |
| `admin-web:users` | not_established | not_established |  |
| `admin-web:organizations` | not_established | not_established |  |
| `admin-web:projects` | not_established | not_established |  |
| `admin-web:workspaces` | not_established | not_established |  |
| `admin-web:infrastructure` | not_established | not_established |  |
| `admin-web:terminals` | not_established | not_established |  |
| `admin-web:previews` | not_established | not_established |  |
| `admin-web:deployments` | not_established | not_established |  |
| `admin-web:usage` | not_established | not_established |  |
| `admin-web:ai-usage` | not_established | not_established |  |
| `admin-web:provider-health` | not_established | not_established |  |
| `admin-web:quotas` | not_established | not_established |  |
| `admin-web:abuse-events` | not_established | not_established |  |
| `admin-web:security-events` | not_established | not_established |  |
| `admin-web:audit-logs` | not_established | not_established |  |
| `admin-web:admin-audit-logs` | not_established | not_established |  |
| `admin-web:support-tickets` | not_established | not_established |  |
| `admin-web:account-deletions` | not_established | not_established |  |
| `admin-web:feature-flags` | not_established | not_established |  |
| `admin-web:system-settings` | not_established | not_established |  |
| `admin-web:ops-controls` | not_established | not_established |  |
| `admin-web:costs` | not_established | not_established |  |
| `admin-web:ai-provider-keys` | not_established | not_established |  |
| `admin-web:providers` | not_established | not_established |  |
| `admin-web:models` | not_established | not_established |  |
| `admin-web:oauth-providers` | not_established | not_established |  |
| `admin-web:wallets` | not_established | not_established |  |
| `admin-web:checkpoints` | not_established | not_established |  |
| `admin-web:stripe-health` | not_established | not_established |  |
| `admin-web:mcp-catalog` | not_established | not_established |  |
| `admin-web:developer-tools` | not_established | not_established |  |
| `admin-route:billing` | not_established | not_established |  |
| `admin-route:stripe` | not_established | not_established |  |
| `admin-route:wallets` | not_established | not_established |  |
| `admin-route:oauth-providers` | not_established | not_established |  |
| `admin-standalone:overview` | not_established | not_established |  |
| `admin-standalone:users` | not_established | not_established |  |
| `admin-standalone:organizations` | not_established | not_established |  |
| `admin-standalone:projects` | not_established | not_established |  |
| `admin-standalone:workspaces` | not_established | not_established |  |
| `admin-standalone:terminals` | not_established | not_established |  |
| `admin-standalone:previews` | not_established | not_established |  |
| `admin-standalone:deployments` | not_established | not_established |  |
| `admin-standalone:billing` | not_established | not_established |  |
| `admin-standalone:usage` | not_established | not_established |  |
| `admin-standalone:ai-usage` | not_established | not_established |  |
| `admin-standalone:credit-wallets` | not_established | not_established |  |
| `admin-standalone:agent-routing` | not_established | not_established |  |
| `admin-standalone:ai-models` | not_established | not_established |  |
| `admin-standalone:agent-checkpoints` | not_established | not_established |  |
| `admin-standalone:provider-health` | not_established | not_established |  |
| `admin-standalone:quotas` | not_established | not_established |  |
| `admin-standalone:abuse-events` | not_established | not_established |  |
| `admin-standalone:security-events` | not_established | not_established |  |
| `admin-standalone:account-deletions` | not_established | not_established |  |
| `admin-standalone:audit-logs` | not_established | not_established |  |
| `admin-standalone:admin-audit-logs` | not_established | not_established |  |
| `admin-standalone:support-tickets` | not_established | not_established |  |
| `admin-standalone:feature-flags` | not_established | not_established |  |
| `admin-standalone:system-settings` | not_established | not_established |  |
| `admin-standalone:kubernetes-health` | not_established | not_established |  |
| `admin-standalone:queue-health` | not_established | not_established |  |
| `admin-standalone:database-health` | not_established | not_established |  |
| `admin-standalone:redis-health` | not_established | not_established |  |
| `admin-standalone:costs` | not_established | not_established |  |
| `admin-standalone:announcements` | not_established | not_established |  |
| `admin-standalone:incident-banner` | not_established | not_established |  |
| `settings-overlay:ProfileTab` | not_established | not_established |  |
| `settings-overlay:SettingsTab` | not_established | not_established |  |
| `settings-overlay:NotificationsTab` | not_established | not_established |  |
| `settings-overlay:FeaturesTab` | not_established | not_established |  |
| `settings-overlay:DataTab` | not_established | not_established |  |
| `settings-overlay:EventLogsTab` | not_established | not_established |  |
| `settings-overlay:GitHubTab` | not_established | not_established |  |
| `settings-overlay:GitLabTab` | not_established | not_established |  |
| `settings-overlay:SupabaseTab` | not_established | not_established |  |
| `settings-overlay:VercelTab` | not_established | not_established |  |
| `settings-overlay:NetlifyTab` | not_established | not_established |  |
| `settings-overlay:CloudProvidersTab` | not_established | not_established |  |
| `settings-overlay:LocalProvidersTab` | not_established | not_established |  |
| `settings-overlay:McpTab` | not_established | not_established |  |
| `settings-overlay:ConnectionsTab` | not_established | not_established |  |
| `settings-overlay:UpdateTab` | not_established | not_established |  |
| `settings-overlay:DebugTab` | not_established | not_established |  |
| `settings-overlay:TaskManagerTab` | not_established | not_established |  |
| `settings-overlay:ServiceStatusTab` | not_established | not_established |  |
| `shared:ProjectGrid` | partial_historical | partial_historical |  |
| `shared:TemplateGallery` | partial_historical | partial_historical |  |
| `shared:CommandPalettePreview` | partial_historical | partial_historical |  |
| `shared:AppShell` | partial_historical | partial_local_targeted | appshell-header-menu10999, dialog-shell-scroll11099, appshell-safecontent11399 |
| `shared:ProjectShell` | not_established | not_established |  |
| `shared:StatGrid` | not_established | not_established |  |
| `shared:OnboardingChecklistCard` | not_established | not_established |  |
| `shared:ActivityList` | not_established | not_established |  |
| `shared:PendingInvitationsSection` | not_established | not_established |  |
| `shared:ProductTour` | not_established | not_established |  |
| `shared:ImpersonationBanner` | not_established | not_established |  |
| `shared:ProjectCardMenu` | partial_historical | partial_historical |  |
| `shared:WorkspaceSettings` | partial_historical | partial_historical |  |
| `shared:ConfirmationDialog` | partial_historical | partial_historical |  |
| `shared:Dialog` | partial_historical | partial_local_targeted | switcher-dialog10599, dialog-shell-scroll11099, appshell-safecontent11399 |
| `shared:Dropdown` | partial_historical | partial_historical |  |
| `shared:InputDialog` | not_established | not_established |  |
| `shared:EcodeExactPublicNavbar` | partial_historical | partial_local_targeted | public-sheet11099 |
| `modal:ColorSchemeDialog` | not_established | not_established |  |
| `modal:ExpoQrModal` | not_established | not_established |  |
| `modal:GitLabDeploymentDialog` | not_established | not_established |  |
| `modal:GitHubDeploymentDialog` | not_established | not_established |  |
| `modal:GitHubAuthDialog` | not_established | not_established |  |
| `modal:GitLabAuthDialog` | not_established | not_established |  |
| `ide-overlay:pane-layout` | not_established | not_established |  |
| `ide-overlay:mobile-nav` | not_established | not_established |  |
| `ide-overlay:right-panel` | not_established | not_established |  |
| `ide-overlay:share` | not_established | not_established |  |
| `ide-overlay:rollback` | not_established | not_established |  |
| `ide-overlay:editor-history` | not_established | not_established |  |
| `ide-overlay:files-context` | not_established | not_established |  |

## Limites

- 151 units are not additional routes or a count of unique journeys; repeated phases/instances are nonadditive.
- Partial only: no wholepanel, permission, engine, API or production functional acceptance.
- LocalChromium/synthetic fixtures; no Safari/Firefox, hardware safeareas, OSkeyboard, screenreader or dynamiczoom evidence added.
- CI/rollout/main tracked separately; localcommit and compiledreceipt do not certify production.
- No AppShell bottomnavigation in observed routes; historical user request remains open despite IDE bottomnav proof.
- Existing shared:AppShell baseline sourceReference points app/root.tsx; actual instance inspected here is AppShell/TopBar/MobileSidebarDrawer in app/components/dashboard/SaaSLayout.tsx. Baseline preserved, no assertion all root state exercised.

Vérifications documentaires :151 IDs uniques égaux au registre original, chemins des reçus existants, compte14 recalculé, historique inchangé par SHA256. Aucun nouveau test ou navigateur exécuté pour cet overlay.
