# Inventaire des panneaux, dialogues et interfaces admin

Base examinée : `1714415cb44fc5e1a377afc85601d2a2c0d696eb`. Lecture seule ; aucun test, navigateur ou accès admin lancé. Ce fichier complète la matrice des routes, sans transformer les tests présents en recette exécutée.

## Comptes et niveau de preuve

- **31** unités `ide`.
- **34** unités `admin_web`.
- **4** unités `admin_explicit_route`.
- **32** unités `admin_standalone`.
- **19** unités `settings_overlay`.
- **18** unités `dashboard_navigation_dialog`.
- **6** unités `named_dialog_module`.
- **7** unités `ide_overlay`.

**151 unités d’inventaire**, dont **14** reliées à une preuve locale historique partielle. Une unité peut être un panneau, une section admin ou une famille de dialogues : ce total ne signifie pas autant de pages ou parcours testés.

**0** nouvelle recette navigateur, **0** nouveau test exécuté, **0** exécution CI attribuée individuellement, **0** recette production vérifiée dans cet inventaire. Les totaux CI globaux 507/87 ne prouvent ni affichage humain ni couverture par viewport.

Le registre IDE est exhaustif pour ses clés adressables ; les registres admin et les imports de ControlPanel sont dénombrés. Les dialogues nommés sont inventoriés par fichiers, les dialogues inline par familles : tous les états dynamiques ne sont pas énumérés. Les références de tests dans le JSON sont des correspondances de symboles, pas une preuve de passage.

## IDE : portes et propriétaires

| Clé | Composant | Propriétaire réservé | Preuve locale historique |
|---|---|---|---|
| `agent` | `BaseChat` | À coordonner | Non établie ici |
| `editor` | `EditorAdapter` | À coordonner | Non établie ici |
| `preview` | `Preview` | À coordonner | ide-publish-preview |
| `files` | `ProjectFilesTool` | À coordonner | Non établie ici |
| `search` | `Search` | À coordonner | Non établie ici |
| `locks` | `LockManager` | À coordonner | Non établie ici |
| `overview` | `ProjectOverviewPanel` | À coordonner | Non établie ici |
| `studio` | `ProjectAgentStudioPanel` | À coordonner | Non établie ici |
| `problems` | `ProjectProblemsPanel` | À coordonner | Non établie ici |
| `database` | `ProjectDatabasePanel` | À coordonner | Non établie ici |
| `object-storage` | `ProjectObjectStoragePanel` | À coordonner | Non établie ici |
| `packages` | `ProjectPackagesPanel` | À coordonner | Non établie ici |
| `skills` | `ProjectSkillsPanel` | À coordonner | Non établie ici |
| `monitoring` | `ProjectMonitoringPanel` | À coordonner | Non établie ici |
| `ports` | `ProjectPortsPanel` | À coordonner | Non établie ici |
| `extensions` | `ProjectExtensionsPanel` | À coordonner | Non établie ici |
| `integrations` | `ProjectIntegrationsPanel` | hub Integrations owner (separate active session) | Non établie ici |
| `workflows` | `ProjectWorkflowsPanel` | À coordonner | Non établie ici |
| `debugger` | `ProjectDebuggerPanel` | #783 Debugger (merged/deployed reported; UI coverage only per receipt) | ide-debugger |
| `deployments` | `ProjectDeploymentsPanel` | #788 Git/Publish/Deploy/Domains | ide-publish-preview |
| `security` | `ProjectSecurityPanel` | À coordonner | Non établie ici |
| `env` | `ProjectEnvPanel` | À coordonner | Non établie ici |
| `secrets` | `ProjectSecretsPanel` | À coordonner | Non établie ici |
| `git` | `GitTab` | #788 Git/Publish/Deploy/Domains | Non établie ici |
| `activity` | `ProjectActivityPanel` | À coordonner | Non établie ici |
| `terminal` | `ProjectInteractiveTerminalPanel` | À coordonner | Non établie ici |
| `logs` | `ProjectLogsPanel` | À coordonner | Non établie ici |
| `collaborators` | `ProjectIdeServicePanel` | À coordonner | Non établie ici |
| `domains` | `LegacyDomainsServicePanel` | #788 Git/Publish/Deploy/Domains | ide-domains |
| `snapshots` | `ProjectIdeServicePanel` | #793/#794 Restore/Fleet | Non établie ici |
| `settings` | `ProjectSettingsPanel` | À coordonner | Non établie ici |

Toutes ces clés entrent par `/projects/:projectId/ide?panel=...`. Agent est un dock/onglet mobile ; les 25 panneaux de gestion passent par le transport du panneau de service. Le fallback de surface mobile nommé `deploy` est un conteneur : il ne signifie pas que tous ces panneaux exécutent un déploiement.

Alias historiques : `/projects/:id/git` redirige vers `ide?view=git` ; Deployments utilise `canonicalDeploymentHref` ; Domains redirige vers `ide?panel=domains`. Les anciennes actions POST restent distinctes des GET de navigation. Aucun changement de ces routes.

## Deux interfaces admin distinctes

| Interface | Section | Composant | Recette dédiée |
|---|---|---|---|
| admin_web | `overview` | `OverviewPanel` | Non établie ici |
| admin_web | `health` | `HealthPanel` | Non établie ici |
| admin_web | `monitoring` | `MonitoringPanel` | Non établie ici |
| admin_web | `users` | `UsersPanel` | Non établie ici |
| admin_web | `organizations` | `OrganizationsPanel` | Non établie ici |
| admin_web | `projects` | `DataPanel` | Non établie ici |
| admin_web | `workspaces` | `WorkspacesPanel` | Non établie ici |
| admin_web | `infrastructure` | `InfrastructurePanel` | Non établie ici |
| admin_web | `terminals` | `DataPanel` | Non établie ici |
| admin_web | `previews` | `PreviewsPanel` | Non établie ici |
| admin_web | `deployments` | `DataPanel` | Non établie ici |
| admin_web | `usage` | `DataPanel` | Non établie ici |
| admin_web | `ai-usage` | `DataPanel` | Non établie ici |
| admin_web | `provider-health` | `DataPanel` | Non établie ici |
| admin_web | `quotas` | `QuotaOverridePanel` | Non établie ici |
| admin_web | `abuse-events` | `AbuseEventsPanel` | Non établie ici |
| admin_web | `security-events` | `SecurityEventsPanel` | Non établie ici |
| admin_web | `audit-logs` | `AuditLogsPanel` | Non établie ici |
| admin_web | `admin-audit-logs` | `AuditLogsPanel` | Non établie ici |
| admin_web | `support-tickets` | `SupportTicketsPanel` | Non établie ici |
| admin_web | `account-deletions` | `AccountDeletionsPanel` | Non établie ici |
| admin_web | `feature-flags` | `ToggleListPanel` | Non établie ici |
| admin_web | `system-settings` | `SystemSettingUpsertPanel` | Non établie ici |
| admin_web | `ops-controls` | `OpsControlsPanel` | Non établie ici |
| admin_web | `costs` | `CostsPanel` | Non établie ici |
| admin_web | `ai-provider-keys` | `DataPanel` | Non établie ici |
| admin_web | `providers` | `ProvidersPanel` | Non établie ici |
| admin_web | `models` | `ToggleListPanel` | Non établie ici |
| admin_web | `oauth-providers` | `OauthProvidersPanel` | Non établie ici |
| admin_web | `wallets` | `DataPanel` | Non établie ici |
| admin_web | `checkpoints` | `DataPanel` | Non établie ici |
| admin_web | `stripe-health` | `DataPanel` | Non établie ici |
| admin_web | `mcp-catalog` | `McpCatalogPanel` | Non établie ici |
| admin_web | `developer-tools` | `DeveloperToolsPanel` | Non établie ici |
| admin_explicit_route | `billing` | `billing` | Non établie ici |
| admin_explicit_route | `stripe` | `stripe` | Non établie ici |
| admin_explicit_route | `wallets` | `wallets` | Non établie ici |
| admin_explicit_route | `oauth-providers` | `oauth-providers` | Non établie ici |
| admin_standalone | `overview` | `Overview` | Non établie ici |
| admin_standalone | `users` | `App generic admin table` | Non établie ici |
| admin_standalone | `organizations` | `App generic admin table` | Non établie ici |
| admin_standalone | `projects` | `App generic admin table` | Non établie ici |
| admin_standalone | `workspaces` | `App generic admin table` | Non établie ici |
| admin_standalone | `terminals` | `App generic admin table` | Non établie ici |
| admin_standalone | `previews` | `PreviewsPanel` | Non établie ici |
| admin_standalone | `deployments` | `App generic admin table` | Non établie ici |
| admin_standalone | `billing` | `App generic admin table` | Non établie ici |
| admin_standalone | `usage` | `App generic admin table` | Non établie ici |
| admin_standalone | `ai-usage` | `App generic admin table` | Non établie ici |
| admin_standalone | `credit-wallets` | `CreditWalletsPanel` | Non établie ici |
| admin_standalone | `agent-routing` | `AgentRoutingPanel` | Non établie ici |
| admin_standalone | `ai-models` | `AiModelsPanel` | Non établie ici |
| admin_standalone | `agent-checkpoints` | `CheckpointsPanel` | Non établie ici |
| admin_standalone | `provider-health` | `ProvidersPanel` | Non établie ici |
| admin_standalone | `quotas` | `App generic admin table` | Non établie ici |
| admin_standalone | `abuse-events` | `AbuseEventsPanel` | Non établie ici |
| admin_standalone | `security-events` | `SecurityEventsPanel` | Non établie ici |
| admin_standalone | `account-deletions` | `AccountDeletionsPanel` | Non établie ici |
| admin_standalone | `audit-logs` | `App generic admin table` | Non établie ici |
| admin_standalone | `admin-audit-logs` | `App generic admin table` | Non établie ici |
| admin_standalone | `support-tickets` | `App generic admin table` | Non établie ici |
| admin_standalone | `feature-flags` | `App generic admin table` | Non établie ici |
| admin_standalone | `system-settings` | `App generic admin table` | Non établie ici |
| admin_standalone | `kubernetes-health` | `App generic admin table` | Non établie ici |
| admin_standalone | `queue-health` | `App generic admin table` | Non établie ici |
| admin_standalone | `database-health` | `App generic admin table` | Non établie ici |
| admin_standalone | `redis-health` | `App generic admin table` | Non établie ici |
| admin_standalone | `costs` | `CostsPanel` | Non établie ici |
| admin_standalone | `announcements` | `App generic admin table` | Non établie ici |
| admin_standalone | `incident-banner` | `App generic admin table` | Non établie ici |

L’application `apps/admin` choisit ses sections avec `setSectionId` : aucun chemin HTTP supplémentaire n’est inventé. Les modules explicites billing/stripe/wallets/oauth-providers de l’application principale peuvent masquer une section du routeur dynamique. Les tables, reauth, export, confirmation d’action dangereuse et panneaux infrastructure n’ont pas été ouverts. Restore/Fleet reste réservé à #793/#794.

## Autres panneaux et navigation

| Groupe | Composant/famille | Entrée | Preuve |
|---|---|---|---|
| settings_overlay | `ProfileTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `SettingsTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `NotificationsTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `FeaturesTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `DataTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `EventLogsTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `GitHubTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `GitLabTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `SupabaseTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `VercelTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `NetlifyTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `CloudProvidersTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `LocalProvidersTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `McpTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `ConnectionsTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `UpdateTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `DebugTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `TaskManagerTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| settings_overlay | `ServiceStatusTab` | ControlPanel overlay (caller-controlled tab; not a route) | Non établie ici |
| dashboard_navigation_dialog | `ProjectGrid` | /dashboard; /projects; /recent-projects | dashboard-grid |
| dashboard_navigation_dialog | `TemplateGallery` | app/routes/dashboard_.templates.tsx; /projects/new | templates |
| dashboard_navigation_dialog | `CommandPalettePreview` | /dashboard; /command-palette | palette |
| dashboard_navigation_dialog | `AppShell` | app user-area routes | project-menu, account-dialog |
| dashboard_navigation_dialog | `ProjectShell` | /projects/:projectId/* | Non établie ici |
| dashboard_navigation_dialog | `StatGrid` | /dashboard; /usage | Non établie ici |
| dashboard_navigation_dialog | `OnboardingChecklistCard` | /dashboard | Non établie ici |
| dashboard_navigation_dialog | `ActivityList` | /security-settings; /dashboard | Non établie ici |
| dashboard_navigation_dialog | `PendingInvitationsSection` | /organization-members | Non établie ici |
| dashboard_navigation_dialog | `ProductTour` | app user-area routes | Non établie ici |
| dashboard_navigation_dialog | `ImpersonationBanner` | admin impersonation session | Non établie ici |
| dashboard_navigation_dialog | `ProjectCardMenu` | /projects; /recent-projects | project-menu |
| dashboard_navigation_dialog | `WorkspaceSettings` | /workspace-settings | workspace |
| dashboard_navigation_dialog | `ConfirmationDialog` | route-local dialogs; IDE destructive confirmations | project-menu, account-dialog, security-dialog |
| dashboard_navigation_dialog | `Dialog` | route-local dialogs | account-dialog |
| dashboard_navigation_dialog | `Dropdown` | many route/component menus | project-menu |
| dashboard_navigation_dialog | `InputDialog` | workbench files/paths | Non établie ici |
| dashboard_navigation_dialog | `EcodeExactPublicNavbar` | public marketing routes | public-nav |
| named_dialog_module | `ColorSchemeDialog` | app/components/chat/ChatBox.tsx | Non établie ici |
| named_dialog_module | `ExpoQrModal` | app/components/chat/ChatBox.tsx; app/components/workbench/Preview.tsx | Non établie ici |
| named_dialog_module | `GitLabDeploymentDialog` | app/components/deploy/DeployButton.tsx | Non établie ici |
| named_dialog_module | `GitHubDeploymentDialog` | app/components/deploy/DeployButton.tsx | Non établie ici |
| named_dialog_module | `GitHubAuthDialog` | app/components/deploy/GitHubDeploymentDialog.tsx | Non établie ici |
| named_dialog_module | `GitLabAuthDialog` | app/components/deploy/GitLabDeploymentDialog.tsx | Non établie ici |
| ide_overlay | `Pane split/move/pin/floating context menus` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `Mobile tools sheet and tab switcher` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `Right preview-logs/problems/files` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `Share/collaboration dialogs` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `Agent checkpoint rollback confirmation` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `EditorHistoryOverlay` | /projects/:projectId/ide | Non établie ici |
| ide_overlay | `Project file create/rename/delete dialogs` | /projects/:projectId/ide | Non établie ici |

## Preuves exécutées indexées, sans extrapolation

- **ide-debugger** — [docs/bugs/debugger-node-stepping-2026-10-25/VALIDATION.md](../debugger-node-stepping-2026-10-25/VALIDATION.md): Node Inspector real local process + synthetic workspace; browser breakpoint/pause/variables/stopped at390/820/1440, use receipt for exact states; not Kubernetes/production
- **ide-publish-preview** — [docs/bugs/publish-canonical-flow-2026-10-25/preview-history-final/README.md](../publish-canonical-flow-2026-10-25/preview-history-final/README.md): 6 targeted Preview/Publish cases, 0 retries; provider operations intercepted; not all IDE panels or current commit acceptance
- **ide-domains** — [docs/bugs/deploy-canonical-navigation-2026-10-25/README.md](../deploy-canonical-navigation-2026-10-25/README.md): Canonical Domains routing/bookmarks/legacy form errors; reserved owner evidence, not rerun
- **project-menu** — [docs/bugs/user-area-2026-10-25/integration-main-d090/menus-billing/README.md](../user-area-2026-10-25/integration-main-d090/menus-billing/README.md): 16 menus at320/390/820/1440 ×FR/EN×themes; keyboard/Escape/outside/rename resize/delete cancel; 0writes
- **account-dialog** — [docs/bugs/user-area-2026-10-25/README.md](../user-area-2026-10-25/README.md): 88 observations plus8interaction groups across data/connected; deletion dialogue cancel only; no production
- **dashboard-grid** — [docs/bugs/user-area-secondary-2026-10-25/templates-recent/README.md](../user-area-secondary-2026-10-25/templates-recent/README.md): Templates/Recent88geometry,6interaction groups,24count+24numericvisibility,8nativezoom; two-line clamp preserved. Not all dashboard widgets.
- **templates** — [docs/bugs/user-area-secondary-2026-10-25/templates-recent/README.md](../user-area-secondary-2026-10-25/templates-recent/README.md): Same run as dashboard-grid, do not add counts twice. No template creation/import executed.
- **palette** — [docs/bugs/user-area-2026-10-25/palette/README.md](../user-area-2026-10-25/palette/README.md): Dashboard and page palette40observations/8keyboard groups on historical build; exact final spacing receipts in linked directory
- **workspace** — [docs/bugs/user-area-secondary-2026-10-25/workspace-support-desktop/README.md](../user-area-secondary-2026-10-25/workspace-support-desktop/README.md): Workspace within176geometry/8interaction/16nativezoom grouped support+desktop run;4targeted contrast replay observations,148eligible text measurements; simulated bridge is not Electron
- **public-nav** — [docs/bugs/user-area-secondary-2026-10-25/public/README.md](../user-area-secondary-2026-10-25/public/README.md): Public header/footer, Escape/close/resize1279→1280, RTL and nativezoom; receipts split by build, not IDE mobile navigation
- **security-dialog** — [docs/bugs/user-area-secondary-2026-10-25/security/README.md](../user-area-secondary-2026-10-25/security/README.md): Session confirmation open/Tab/Escape,4groups;88geometry+8nativezoom across2security routes; no revoke/MFA/token mutation

Les 11 fiches de preuve renvoient à 10 groupes distincts : `templates` et `dashboard-grid` partagent la même recette et ne se cumulent pas.

Ces preuves restent attachées à leurs builds historiques et aux fixtures déclarées. Le moteur Debugger a des tests avec vrais processus Node locaux, distincts de ses mesures navigateur ; cela ne prouve pas Kubernetes ni la production. Les actions Publish/rollback ont été interceptées avant fournisseur. Le succès de livraison rapporté par coordination n’est pas une recette UI production.

## Restes prioritaires et barrières de périmètre

1. Faire valider par les propriétaires les recettes IDE Git/Publish/Domains#788, hub Intégrations, Restore/Fleet #793/#794 et Debugger #783 ; aucun rejeu autonome dans ces périmètres.
2. Construire des fixtures en lecture seule pour les panneaux IDE sans reçus, puis couvrir états vide/chargement/erreur/retry, clavier, changement de panneau, resize pendant saisie et navigation Retour. Un test de registre ou un snapshot i18n ne remplace pas cela.
3. Traiter séparément les deux interfaces admin avec données synthétiques et aucune mutation de comptes, clés, déploiements, crédits ou ressources.
4. Safari et Firefox, lecteurs d’écran réels, clavier OS, safe areas physiques restent non établis par les preuves indexées. Le zoom natif 200% existe seulement sur les sous-ensembles indiqués ; aucun crédit global IDE/admin.
5. Menus Projets≠menus IDE ; WorkspaceSettings route≠ControlPanel IDE ; Dialogue compte≠tous les Dialog partagés. Ne pas transférer les verdicts entre instances.

Le JSON fournit les fichiers/lignes, les portes, les tests source trouvés, les réservations et les identifiants de preuve pour chaque unité. Aucun code, index, commit ou push modifié.
