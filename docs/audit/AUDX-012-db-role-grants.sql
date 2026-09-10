
-- AUDX-012 — GRANTs par service, GÉNÉRÉS depuis une analyse statique.
--
-- ⚠️ NE PAS APPLIQUER TEL QUEL. Un accès que l’analyse ne voit pas devient
-- ici un GRANT manquant, donc une panne en production. Faire tourner chaque
-- service sur une recette avec son rôle restreint AVANT toute application.
--
-- Les rôles eux-mêmes se créent côté Cloud SQL, hors dépôt.

-- api : 107 table(s) sur 125
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AccountLockout" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Session" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Organization" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationMember" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationInvite" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Role" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Project" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectSlugRedirect" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectIdeState" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentPatchProposal" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRepairEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectSkill" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "InstalledSkill" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SkillAuditEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectSecret" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectEnvVar" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectCollaborator" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectActivity" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CollaborationPresence" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CollaborationComment" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectShareLink" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectTemplate" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Workspace" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceIdeState" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectSnapshot" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectStorageObject" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Deployment" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ReleaseManifest" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RateCard" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AuditLog" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SecurityEventResolution" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AdminAuditLog" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "BillingCustomer" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Subscription" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Plan" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "StripeConfig" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LoginProviderConfig" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UsageEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "QuotaOverride" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "StripeEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "StripeWebhookFailure" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiConversation" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiMessage" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiToolCall" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiTokenUsage" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProviderRequestMetric" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiMessageFeedback" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AiCostLedger" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AbuseEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TicketMessage" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FeatureFlag" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SystemSetting" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailVerificationToken" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SamlAssertion" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PasswordResetToken" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MfaRecoveryCode" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EnterpriseOrganizationSettings" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "VerifiedDomain" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SsoConfiguration" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ScimToken" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CustomRole" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SiemWebhook" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ApiKey" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OAuthConnection" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "McpCatalogEntry" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "McpInstall" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "McpUserConfig" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "McpGlobalPolicy" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ChatShare" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ConsensusRecord" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ConnectorCatalog" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserConnection" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectConnectionLink" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationConnectorPolicy" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ReconnectionAlert" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Notification" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "NewsletterSubscriber" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ContactRequest" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "IntegrationFeatureRequest" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EmailDeliveryEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditWallet" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditPack" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CreditLedger" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCheckpoint" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserSpendLimit" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProviderConfig" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ModelConfig" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DatabaseInstance" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DatabaseSnapshot" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DatabaseRestore" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRoutingCard" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentCallLog" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectCheckpoint" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RemixJob" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ImportJob" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "GalleryListing" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LedgerAccount" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LedgerTransaction" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LedgerEntry" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LedgerReservation" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "LedgerReconciliationRun" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PreviewReadinessBeacon" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceLifecycleEvent" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspacePostMortem" TO vibecore_api;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DBMigrationExecution" TO vibecore_api;

-- worker : 7 table(s) sur 125
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectActivity" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AuditLog" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "EnterpriseOrganizationSettings" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SiemWebhook" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserConnection" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ReconnectionAlert" TO vibecore_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Notification" TO vibecore_worker;

-- ai-gateway : 6 table(s) sur 125
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Organization" TO vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRun" TO vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AgentRunResult" TO vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ConsensusRecord" TO vibecore_ai_gateway;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProviderConfig" TO vibecore_ai_gateway;

-- connector-proxy : 6 table(s) sur 125
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationMember" TO vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserConnection" TO vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ProjectConnectionLink" TO vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationConnectorPolicy" TO vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ReconnectionAlert" TO vibecore_connector_proxy;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Notification" TO vibecore_connector_proxy;

-- workspace-manager : 1 table(s) sur 125
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM vibecore_workspace_manager;
GRANT SELECT, INSERT, UPDATE, DELETE ON "WorkspaceRuntime" TO vibecore_workspace_manager;

