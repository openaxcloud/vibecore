/**
 * react-i18next runtime that takes over from the legacy `dictionary.ts`
 * lookup. Phase 0 #7 slice 1 — the provider boots i18next with the
 * existing en/fr bundles so components can switch to the `useTranslation()`
 * hook without breaking the synchronous `t()` import path the rest of the
 * codebase still uses. The two paths share the same source of truth (the
 * `messages/{en,fr}.ts` modules), so a translation added to either is
 * visible from both surfaces.
 *
 * Slice 1 stays client-only on purpose: no `remix-i18next` SSR wiring, no
 * lazy bundles per namespace. The dictionary's keys are already flat
 * "<namespace>.<key>" strings (e.g. `patchReview.title`), so the
 * i18next resource shape is intentionally a single `translation`
 * namespace keyed by the same composite string — moving call sites over
 * is a like-for-like rename later.
 */

import i18next, { createInstance, type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { accountSettingsConnectedEn, accountSettingsConnectedFr } from './catalogs/account-settings-connected';
import { actionRunnerEn, actionRunnerFr } from './catalogs/action-runner';
import { adminBillingEn, adminBillingFr } from './catalogs/admin-billing';
import { adminInfrastructureEn, adminInfrastructureFr } from './catalogs/admin-infrastructure';
import { adminOauthProvidersEn, adminOauthProvidersFr } from './catalogs/admin-oauth-providers';
import { adminStripeEn, adminStripeFr } from './catalogs/admin-stripe';
import { adminSupportTicketsEn, adminSupportTicketsFr } from './catalogs/admin-support-tickets';
import { adminWalletsEn, adminWalletsFr } from './catalogs/admin-wallets';
import { apiAiFeaturesEn, apiAiFeaturesFr } from './catalogs/api-ai-features';
import { apiRuntimeRoutesEn, apiRuntimeRoutesFr } from './catalogs/api-runtime-routes';
import { appliedFilesToastEn, appliedFilesToastFr } from './catalogs/applied-files-toast';
import { assistantMessageEn, assistantMessageFr } from './catalogs/assistant-message';
import { auditLogsEn, auditLogsFr } from './catalogs/audit-logs';
import { baseChatAstEn, baseChatAstFr } from './catalogs/base-chat-ast';
import { baseChatMobileHeaderEn, baseChatMobileHeaderFr } from './catalogs/base-chat-mobile-header';
import { billingEn, billingFr } from './catalogs/billing';
import { chatEn, chatFr } from './catalogs/chat';
import { chatBoxEn, chatBoxFr } from './catalogs/chat-box';
import { chatBoxChildrenEn, chatBoxChildrenFr } from './catalogs/chat-box-children';
import { chatClientEn, chatClientFr } from './catalogs/chat-client';
import { chatConnectorsEn, chatConnectorsFr } from './catalogs/chat-connectors';
import { chatControlsEn, chatControlsFr } from './catalogs/chat-controls';
import { chatHistoryEn, chatHistoryFr } from './catalogs/chat-history';
import { chatRenderersEn, chatRenderersFr } from './catalogs/chat-renderers';
import { chatResidualsEn, chatResidualsFr } from './catalogs/chat-residuals';
import { clientAstResidualEn, clientAstResidualFr } from './catalogs/client-ast-residual';
import { clientRuntimeResidualEn, clientRuntimeResidualFr } from './catalogs/client-runtime-residual';
import { clientStoresServicesEn, clientStoresServicesFr } from './catalogs/client-stores-services';
import { clientVisibleErrorsEn, clientVisibleErrorsFr } from './catalogs/client-visible-errors';
import { collaborationRuntimeEn, collaborationRuntimeFr } from './catalogs/collaboration-runtime';
import { compatibilityRoutesEn, compatibilityRoutesFr } from './catalogs/compatibility-routes';
import { computeTierPreviewEn, computeTierPreviewFr } from './catalogs/compute-tier-preview';
import { connectionFormEn, connectionFormFr } from './catalogs/connection-form';
import { connectionsTabEn, connectionsTabFr } from './catalogs/connections-tab';
import { databaseRestoreEn, databaseRestoreFr } from './catalogs/database-restore';
import { databaseRollbackEn, databaseRollbackFr } from './catalogs/database-rollback';
import { databaseStudioEn, databaseStudioFr } from './catalogs/database-studio';
import { deployRemainingEn, deployRemainingFr } from './catalogs/deploy-remaining';
import { deploySurfacesEn, deploySurfacesFr } from './catalogs/deploy-surfaces';
import { designPaletteEn, designPaletteFr } from './catalogs/design-palette';
import { desktopSettingsEn, desktopSettingsFr } from './catalogs/desktop-settings';
import { diffViewEn, diffViewFr } from './catalogs/diff-view';
import { enterpriseSsoSettingsEn, enterpriseSsoSettingsFr } from './catalogs/enterprise-sso-settings';
import { errorSurfacesEn, errorSurfacesFr } from './catalogs/error-surfaces';
import { featuresSettingsEn, featuresSettingsFr } from './catalogs/features-settings';
import { fileHistoryEn, fileHistoryFr } from './catalogs/file-history';
import { gitCloneEn, gitCloneFr } from './catalogs/git-clone';
import { gitMergeEditorEn, gitMergeEditorFr } from './catalogs/git-merge-editor';
import { gitProviderConnectEn, gitProviderConnectFr } from './catalogs/git-provider-connect';
import { gitSettingsEn, gitSettingsFr } from './catalogs/git-settings';
import { gitStatusDisplayEn, gitStatusDisplayFr } from './catalogs/git-status-display';
import { githubAuthDialogEn, githubAuthDialogFr } from './catalogs/github-auth-dialog';
import { githubTabEn, githubTabFr } from './catalogs/github-tab';
import { gitLabAuthDialogEn, gitLabAuthDialogFr } from './catalogs/gitlab-auth-dialog';
import { gitLabTabEn, gitLabTabFr } from './catalogs/gitlab-tab';
import { headerActionButtonsEn, headerActionButtonsFr } from './catalogs/header-action-buttons';
import { ideNewRouteEn, ideNewRouteFr } from './catalogs/ide-new-route';
import { idePanelsEn, idePanelsFr } from './catalogs/ide-panels';
import { impersonationBannerEn, impersonationBannerFr } from './catalogs/impersonation-banner';
import { importButtonsEn, importButtonsFr } from './catalogs/import-buttons';
import { importFolderButtonEn, importFolderButtonFr } from './catalogs/import-folder-button';
import { importHubEn, importHubFr } from './catalogs/import-hub';
import { importRoutesEn, importRoutesFr } from './catalogs/import-routes';
import { importSpreadsheetEn, importSpreadsheetFr } from './catalogs/import-spreadsheet';
import { inlineFileActionDiffEn, inlineFileActionDiffFr } from './catalogs/inline-file-action-diff';
import { inspectorPanelEn, inspectorPanelFr } from './catalogs/inspector-panel';
import { integrationOauthCallbackEn, integrationOauthCallbackFr } from './catalogs/integration-oauth-callback';
import { invitationsEn, invitationsFr } from './catalogs/invitations';
import { keybindingsEn, keybindingsFr } from './catalogs/keybindings';
import { legacyMarketingEn, legacyMarketingFr } from './catalogs/legacy-marketing';
import { lockManagerEn, lockManagerFr } from './catalogs/lock-manager';
import { marketingBlogDetailEn, marketingBlogDetailFr } from './catalogs/marketing-blog-detail';
import { marketingBrandEn, marketingBrandFr } from './catalogs/marketing-brand';
import { marketingLandingProjectsEn, marketingLandingProjectsFr } from './catalogs/marketing-landing-projects';
import { marketingLandingRemainingEn, marketingLandingRemainingFr } from './catalogs/marketing-landing-remaining';
import {
  marketingLandingTemplatesEn,
  marketingLandingTemplatesFr,
  marketingLandingVideoEn,
  marketingLandingVideoFr,
} from './catalogs/marketing-landing-templates-video';
import { marketingLandingWorkflowEn, marketingLandingWorkflowFr } from './catalogs/marketing-landing-workflow';
import { marketingPricingRouteEn, marketingPricingRouteFr } from './catalogs/marketing-pricing-route';
import { marketingSolutionsRouteEn, marketingSolutionsRouteFr } from './catalogs/marketing-solutions-route';
import { marketingSurfaceDynamicEn, marketingSurfaceDynamicFr } from './catalogs/marketing-surface-dynamic';
import { mfaSetupEn, mfaSetupFr } from './catalogs/mfa-setup';
import { mobileIdeTabsEn, mobileIdeTabsFr } from './catalogs/mobile-ide-tabs';
import { modelApiEn, modelApiFr } from './catalogs/model-api';
import { monitoringChartsEn, monitoringChartsFr } from './catalogs/monitoring-charts';
import { notificationsEn, notificationsFr } from './catalogs/notifications';
import { notificationsTabEn, notificationsTabFr } from './catalogs/notifications-tab';
import { organizationAccessEn, organizationAccessFr } from './catalogs/organization-access';
import { organizationDomainsEn, organizationDomainsFr } from './catalogs/organization-domains';
import { organizationMembersEn, organizationMembersFr } from './catalogs/organization-members';
import { organizationSecurityEn, organizationSecurityFr } from './catalogs/organization-security';
import { organizationSiemEn, organizationSiemFr } from './catalogs/organization-siem';
import { persistenceRuntimeEn, persistenceRuntimeFr } from './catalogs/persistence-runtime';
import { planQuotaEn, planQuotaFr } from './catalogs/plan-quota';
import { productTourEn, productTourFr } from './catalogs/product-tour';
import { profileTabEn, profileTabFr } from './catalogs/profile-tab';
import { projectCardMenuEn, projectCardMenuFr } from './catalogs/project-card-menu';
import { projectCollaboratorsEn, projectCollaboratorsFr } from './catalogs/project-collaborators';
import { projectCommandsEn, projectCommandsFr } from './catalogs/project-commands';
import { projectDashboardActivityEn, projectDashboardActivityFr } from './catalogs/project-dashboard-activity';
import { projectDomainsEn, projectDomainsFr } from './catalogs/project-domains';
import { projectEnvEn, projectEnvFr } from './catalogs/project-env';
import { projectIdeEn, projectIdeFr } from './catalogs/project-ide';
import { projectLogsEn, projectLogsFr } from './catalogs/project-logs';
import { projectOverviewPanelEn, projectOverviewPanelFr } from './catalogs/project-overview-panel';
import { projectSecretsEn, projectSecretsFr } from './catalogs/project-secrets';
import { projectSettingsEn, projectSettingsFr } from './catalogs/project-settings';
import { projectSnapshotsEn, projectSnapshotsFr } from './catalogs/project-snapshots';
import { publicGalleryEn, publicGalleryFr } from './catalogs/public-gallery';
import { publicRouteSeoEn, publicRouteSeoFr } from './catalogs/public-route-seo';
import { publicTemplateTagLabelsEn, publicTemplateTagLabelsFr } from './catalogs/public-template-tags';
import { recoveryCodesEn, recoveryCodesFr } from './catalogs/recovery-codes';
import { remainingApiRoutesEn, remainingApiRoutesFr } from './catalogs/remaining-api-routes';
import { remainingRouteShellsEn, remainingRouteShellsFr } from './catalogs/remaining-route-shells';
import { repositoryCardEn, repositoryCardFr } from './catalogs/repository-card';
import { repositorySelectorEn, repositorySelectorFr } from './catalogs/repository-selector';
import { scimTokenSettingsEn, scimTokenSettingsFr } from './catalogs/scim-token-settings';
import { screenshotSelectorEn, screenshotSelectorFr } from './catalogs/screenshot-selector';
import { securitySettingsEn, securitySettingsFr } from './catalogs/security-settings';
import { sessionSecurityEn, sessionSecurityFr } from './catalogs/session-security';
import { settingsEn, settingsFr } from './catalogs/settings';
import { settingsConnectorsResidualEn, settingsConnectorsResidualFr } from './catalogs/settings-connectors-residual';
import { settingsCoreEn, settingsCoreFr } from './catalogs/settings-core';
import { settingsPreferencesEn, settingsPreferencesFr } from './catalogs/settings-preferences';
import { settingsStatusSurfacesEn, settingsStatusSurfacesFr } from './catalogs/settings-status-surfaces';
import { shareRouteEn, shareRouteFr } from './catalogs/share-route';
import { sharedComponentsEn, sharedComponentsFr } from './catalogs/shared-components';
import { sidebarMenuRuntimeCatalog } from './catalogs/sidebar-menu';
import { slashCommandsEn, slashCommandsFr } from './catalogs/slash-commands';
import { sourceControlConnectionsEn, sourceControlConnectionsFr } from './catalogs/source-control-connections';
import { starterTemplatesEn, starterTemplatesFr } from './catalogs/starter-templates';
import { supabaseConnectionEn, supabaseConnectionFr } from './catalogs/supabase-connection';
import { supportEn, supportFr } from './catalogs/support';
import { supportTicketDetailEn, supportTicketDetailFr } from './catalogs/support-ticket-detail';
import { teamAccessLogEn, teamAccessLogFr } from './catalogs/team-access-log';
import { templatesLanguagesRouteEn, templatesLanguagesRouteFr } from './catalogs/templates-languages-route';
import { terminalSessionEn, terminalSessionFr } from './catalogs/terminal-session';
import { terminalTabsEn, terminalTabsFr } from './catalogs/terminal-tabs';
import { toolInvocationsEn, toolInvocationsFr } from './catalogs/tool-invocations';
import { updateTabEn, updateTabFr } from './catalogs/update-tab';
import { upgradeEn, upgradeFr } from './catalogs/upgrade';
import { userAreaEn, userAreaFr } from './catalogs/user-area';
import { webApiRoutesEn, webApiRoutesFr } from './catalogs/web-api-routes';
import { workbenchRuntimeEn, workbenchRuntimeFr } from './catalogs/workbench-runtime';
import { workbenchSearchEn, workbenchSearchFr } from './catalogs/workbench-search';
import { workbenchSurfaceEn, workbenchSurfaceFr } from './catalogs/workbench-surface';
import { workspaceMiscEn, workspaceMiscFr } from './catalogs/workspace-misc';
import { workspaceResourcesEn, workspaceResourcesFr } from './catalogs/workspace-resources';
import { detectUserLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from './language';
import { ar } from './messages/ar';
import { en } from './messages/en';
import { es } from './messages/es';
import { fr } from './messages/fr';

const RESOURCES: Record<SupportedLanguage, { translation: Record<string, string> }> = {
  en: {
    translation: {
      ...en,
      ...actionRunnerEn,
      ...accountSettingsConnectedEn,
      ...appliedFilesToastEn,
      ...adminOauthProvidersEn,
      ...adminBillingEn,
      ...adminInfrastructureEn,
      ...adminStripeEn,
      ...adminSupportTicketsEn,
      ...adminWalletsEn,
      ...apiAiFeaturesEn,
      ...apiRuntimeRoutesEn,
      ...assistantMessageEn,
      ...auditLogsEn,
      ...baseChatAstEn,
      ...workspaceResourcesEn,
      ...baseChatMobileHeaderEn,
      ...userAreaEn,
      ...notificationsEn,
      ...notificationsTabEn,
      ...billingEn,
      ...idePanelsEn,
      ...mobileIdeTabsEn,
      ...terminalTabsEn,
      ...ideNewRouteEn,
      ...importHubEn,
      ...importFolderButtonEn,
      ...importButtonsEn,
      ...importRoutesEn,
      ...importSpreadsheetEn,
      ...impersonationBannerEn,
      ...inlineFileActionDiffEn,
      ...inspectorPanelEn,
      ...integrationOauthCallbackEn,
      ...invitationsEn,
      ...legacyMarketingEn,
      ...lockManagerEn,
      ...marketingBlogDetailEn,
      ...marketingBrandEn,
      ...marketingLandingTemplatesEn,
      ...marketingLandingVideoEn,
      ...marketingLandingProjectsEn,
      ...marketingLandingRemainingEn,
      ...marketingLandingWorkflowEn,
      ...marketingPricingRouteEn,
      ...marketingSolutionsRouteEn,
      ...marketingSurfaceDynamicEn,
      ...mfaSetupEn,
      ...modelApiEn,
      ...monitoringChartsEn,
      ...securitySettingsEn,
      ...scimTokenSettingsEn,
      ...screenshotSelectorEn,
      ...sessionSecurityEn,
      ...shareRouteEn,
      ...settingsEn,
      ...settingsCoreEn,
      ...settingsConnectorsResidualEn,
      ...settingsPreferencesEn,
      ...settingsStatusSurfacesEn,
      ...sharedComponentsEn,
      ...sidebarMenuRuntimeCatalog.en,
      ...slashCommandsEn,
      ...sourceControlConnectionsEn,
      ...starterTemplatesEn,
      ...supabaseConnectionEn,
      ...supportEn,
      ...supportTicketDetailEn,
      ...teamAccessLogEn,
      ...templatesLanguagesRouteEn,
      ...terminalSessionEn,
      ...toolInvocationsEn,
      ...upgradeEn,
      ...updateTabEn,
      ...webApiRoutesEn,
      ...workbenchSearchEn,
      ...workbenchRuntimeEn,
      ...workbenchSurfaceEn,
      ...workspaceMiscEn,
      ...chatEn,
      ...chatBoxEn,
      ...chatBoxChildrenEn,
      ...chatClientEn,
      ...chatConnectorsEn,
      ...chatControlsEn,
      ...chatHistoryEn,
      ...chatRenderersEn,
      ...chatResidualsEn,
      ...clientAstResidualEn,
      ...clientRuntimeResidualEn,
      ...clientStoresServicesEn,
      ...clientVisibleErrorsEn,
      ...collaborationRuntimeEn,
      ...computeTierPreviewEn,
      ...compatibilityRoutesEn,
      ...connectionFormEn,
      ...connectionsTabEn,
      ...databaseRestoreEn,
      ...databaseRollbackEn,
      ...databaseStudioEn,
      ...designPaletteEn,
      ...desktopSettingsEn,
      ...deploySurfacesEn,
      ...deployRemainingEn,
      ...diffViewEn,
      ...enterpriseSsoSettingsEn,
      ...errorSurfacesEn,
      ...featuresSettingsEn,
      ...fileHistoryEn,
      ...gitCloneEn,
      ...gitMergeEditorEn,
      ...gitSettingsEn,
      ...gitProviderConnectEn,
      ...gitLabAuthDialogEn,
      ...gitLabTabEn,
      ...gitStatusDisplayEn,
      ...githubAuthDialogEn,
      ...githubTabEn,
      ...headerActionButtonsEn,
      ...keybindingsEn,
      ...organizationAccessEn,
      ...organizationDomainsEn,
      ...organizationMembersEn,
      ...organizationSecurityEn,
      ...organizationSiemEn,
      ...planQuotaEn,
      ...persistenceRuntimeEn,
      ...profileTabEn,
      ...projectCardMenuEn,
      ...projectCommandsEn,
      ...projectCollaboratorsEn,
      ...projectDashboardActivityEn,
      ...projectDomainsEn,
      ...projectEnvEn,
      ...projectIdeEn,
      ...projectLogsEn,
      ...projectOverviewPanelEn,
      ...projectSettingsEn,
      ...projectSecretsEn,
      ...projectSnapshotsEn,
      ...productTourEn,
      ...publicGalleryEn,
      ...publicRouteSeoEn,
      ...publicTemplateTagLabelsEn,
      ...recoveryCodesEn,
      ...remainingApiRoutesEn,
      ...remainingRouteShellsEn,
      ...repositoryCardEn,
      ...repositorySelectorEn,
    },
  },
  fr: {
    translation: {
      ...fr,
      ...actionRunnerFr,
      ...accountSettingsConnectedFr,
      ...appliedFilesToastFr,
      ...adminOauthProvidersFr,
      ...adminBillingFr,
      ...adminInfrastructureFr,
      ...adminStripeFr,
      ...adminSupportTicketsFr,
      ...adminWalletsFr,
      ...apiAiFeaturesFr,
      ...apiRuntimeRoutesFr,
      ...assistantMessageFr,
      ...auditLogsFr,
      ...baseChatAstFr,
      ...workspaceResourcesFr,
      ...baseChatMobileHeaderFr,
      ...userAreaFr,
      ...notificationsFr,
      ...notificationsTabFr,
      ...billingFr,
      ...idePanelsFr,
      ...mobileIdeTabsFr,
      ...terminalTabsFr,
      ...ideNewRouteFr,
      ...importHubFr,
      ...importFolderButtonFr,
      ...importButtonsFr,
      ...importRoutesFr,
      ...importSpreadsheetFr,
      ...impersonationBannerFr,
      ...inlineFileActionDiffFr,
      ...inspectorPanelFr,
      ...integrationOauthCallbackFr,
      ...invitationsFr,
      ...legacyMarketingFr,
      ...lockManagerFr,
      ...marketingBlogDetailFr,
      ...marketingBrandFr,
      ...marketingLandingTemplatesFr,
      ...marketingLandingVideoFr,
      ...marketingLandingProjectsFr,
      ...marketingLandingRemainingFr,
      ...marketingLandingWorkflowFr,
      ...marketingPricingRouteFr,
      ...marketingSolutionsRouteFr,
      ...marketingSurfaceDynamicFr,
      ...mfaSetupFr,
      ...modelApiFr,
      ...monitoringChartsFr,
      ...securitySettingsFr,
      ...scimTokenSettingsFr,
      ...screenshotSelectorFr,
      ...sessionSecurityFr,
      ...shareRouteFr,
      ...settingsFr,
      ...settingsCoreFr,
      ...settingsConnectorsResidualFr,
      ...settingsPreferencesFr,
      ...settingsStatusSurfacesFr,
      ...sharedComponentsFr,
      ...sidebarMenuRuntimeCatalog.fr,
      ...slashCommandsFr,
      ...sourceControlConnectionsFr,
      ...starterTemplatesFr,
      ...supabaseConnectionFr,
      ...supportFr,
      ...supportTicketDetailFr,
      ...teamAccessLogFr,
      ...templatesLanguagesRouteFr,
      ...terminalSessionFr,
      ...toolInvocationsFr,
      ...upgradeFr,
      ...updateTabFr,
      ...webApiRoutesFr,
      ...workbenchSearchFr,
      ...workbenchRuntimeFr,
      ...workbenchSurfaceFr,
      ...workspaceMiscFr,
      ...chatFr,
      ...chatBoxFr,
      ...chatBoxChildrenFr,
      ...chatClientFr,
      ...chatConnectorsFr,
      ...chatControlsFr,
      ...chatHistoryFr,
      ...chatRenderersFr,
      ...chatResidualsFr,
      ...clientAstResidualFr,
      ...clientRuntimeResidualFr,
      ...clientStoresServicesFr,
      ...clientVisibleErrorsFr,
      ...collaborationRuntimeFr,
      ...computeTierPreviewFr,
      ...compatibilityRoutesFr,
      ...connectionFormFr,
      ...connectionsTabFr,
      ...databaseRestoreFr,
      ...databaseRollbackFr,
      ...databaseStudioFr,
      ...designPaletteFr,
      ...desktopSettingsFr,
      ...deploySurfacesFr,
      ...deployRemainingFr,
      ...diffViewFr,
      ...enterpriseSsoSettingsFr,
      ...errorSurfacesFr,
      ...featuresSettingsFr,
      ...fileHistoryFr,
      ...gitCloneFr,
      ...gitMergeEditorFr,
      ...gitSettingsFr,
      ...gitProviderConnectFr,
      ...gitLabAuthDialogFr,
      ...gitLabTabFr,
      ...gitStatusDisplayFr,
      ...githubAuthDialogFr,
      ...githubTabFr,
      ...headerActionButtonsFr,
      ...keybindingsFr,
      ...organizationAccessFr,
      ...organizationDomainsFr,
      ...organizationMembersFr,
      ...organizationSecurityFr,
      ...organizationSiemFr,
      ...planQuotaFr,
      ...persistenceRuntimeFr,
      ...profileTabFr,
      ...projectCardMenuFr,
      ...projectCommandsFr,
      ...projectCollaboratorsFr,
      ...projectDashboardActivityFr,
      ...projectDomainsFr,
      ...projectEnvFr,
      ...projectIdeFr,
      ...projectLogsFr,
      ...projectOverviewPanelFr,
      ...projectSettingsFr,
      ...projectSecretsFr,
      ...projectSnapshotsFr,
      ...productTourFr,
      ...publicGalleryFr,
      ...publicRouteSeoFr,
      ...publicTemplateTagLabelsFr,
      ...recoveryCodesFr,
      ...remainingApiRoutesFr,
      ...remainingRouteShellsFr,
      ...repositoryCardFr,
      ...repositorySelectorFr,
    },
  },
  es: { translation: { ...es } },
  ar: { translation: { ...ar } },
};

let initialized = false;

const runtimeOptions = (language: SupportedLanguage) => ({
  resources: RESOURCES,
  lng: language,
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
    prefix: '{',
    suffix: '}',
  },
  returnNull: false,
  returnEmptyString: false,
  initImmediate: false,
  parseMissingKeyHandler: () => en['common.unavailable'],
});

/**
 * Create an isolated, synchronously initialized instance for one document
 * render. SSR must never reuse the mutable global i18next language across two
 * visitors, otherwise a French request can leak into a concurrent English one.
 */
export function createI18nInstance(language: SupportedLanguage): I18nInstance {
  const instance = createInstance();

  instance
    .use(initReactI18next)
    .init(runtimeOptions(language))
    .catch(() => undefined);

  return instance;
}

export function getI18nInstance(): I18nInstance {
  if (!initialized) {
    i18next
      .use(initReactI18next)
      .init(runtimeOptions(detectUserLanguage()))
      .catch(() => {
        /*
         * Init only fails on truly bad config; nothing to do at runtime —
         * the fallbackLng path returns the key as the value, which is the
         * same degraded behaviour the old `t()` already had.
         */
      });

    initialized = true;
  }

  return i18next;
}

/**
 * Tests-only reset so a spec can boot i18next fresh between cases without
 * leaking interpolation prefix overrides into the next module.
 */
export function resetI18nForTest(): void {
  initialized = false;
}
