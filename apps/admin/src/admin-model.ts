import { adminStandaloneT as adminT } from './i18n';
export interface AdminSection {
  id: string;
  label: string;
  endpoint: string;
  collectionKey: string;
  description: string;
  exportable?: boolean;
}

export const adminSections: AdminSection[] = [
  {
    id: 'overview',
    label: adminT('admin.standalone.overview_0efc2e'),
    endpoint: '/admin/overview',
    collectionKey: 'overview',
    description: adminT('admin.standalone.globalPlatformHealthAndOperatingMetrics_81b4b1'),
  },
  {
    id: 'users',
    label: adminT('admin.standalone.users_57f2b1'),
    endpoint: '/admin/users',
    collectionKey: 'users',
    description: adminT('admin.standalone.platformUsersMfaStateSessionsAndSuspensionStatus_674132'),
  },
  {
    id: 'organizations',
    label: adminT('admin.standalone.organizations_076052'),
    endpoint: '/admin/organizations',
    collectionKey: 'organizations',
    description: adminT('admin.standalone.tenantOrganizationsAndSuspensionControls_68d4c8'),
  },
  {
    id: 'projects',
    label: adminT('admin.standalone.projects_53e890'),
    endpoint: '/admin/projects',
    collectionKey: 'projects',
    description: adminT('admin.standalone.projectMetadataAcrossTenantsSecretsAreNeverShown_0713cf'),
  },
  {
    id: 'workspaces',
    label: adminT('admin.standalone.workspaces_205b45'),
    endpoint: '/admin/workspaces',
    collectionKey: 'workspaces',
    description: adminT('admin.standalone.workspaceLifecycleRuntimeModeAndOperatorControls_656919'),
  },
  {
    id: 'terminals',
    label: adminT('admin.standalone.activeTerminals_2e99ad'),
    endpoint: '/admin/terminals',
    collectionKey: 'terminals',
    description: adminT('admin.standalone.liveTerminalSessionsByWorkspace_034925'),
  },
  {
    id: 'previews',
    label: adminT('admin.standalone.previews_beb86d'),
    endpoint: '/admin/previews',
    collectionKey: 'previews',
    description: adminT('admin.standalone.previewRoutesExposedByWorkspaces_841b1a'),
  },
  {
    id: 'deployments',
    label: adminT('admin.standalone.deployments_8d458e'),
    endpoint: '/admin/deployments',
    collectionKey: 'deployments',
    description: adminT('admin.standalone.deploymentHistoryAndCurrentStatus_a261f4'),
  },
  {
    id: 'billing',
    label: adminT('admin.standalone.billing_abaec4'),
    endpoint: '/admin/billing',
    collectionKey: 'plans',
    description: adminT('admin.standalone.billingPlansSubscriptionsAndManualMarkers_d262a7'),
  },
  {
    id: 'usage',
    label: adminT('admin.standalone.usage_0bb186'),
    endpoint: '/admin/usage',
    collectionKey: 'usage',
    description: adminT('admin.standalone.usageEventsAcrossOrganizations_bf205e'),
  },
  {
    id: 'ai-usage',
    label: adminT('admin.standalone.aiUsage_03b2de'),
    endpoint: '/admin/ai-usage',
    collectionKey: 'usage',
    description: adminT('admin.standalone.aiTokenAndCostLedger_a1e7c0'),
  },
  {
    id: 'credit-wallets',
    label: adminT('admin.standalone.creditWallets_159a5d'),
    endpoint: '/admin/wallets',
    collectionKey: 'wallets',
    description: adminT('admin.standalone.orgCreditBalancesSignedAdjustmentsReasonRequiredAnd_6f9ac9'),
  },
  {
    id: 'agent-routing',
    label: adminT('admin.standalone.agentRouting_15123f'),
    endpoint: '/admin/agent-routing',
    collectionKey: 'lines',
    description: adminT('admin.standalone.modeModelRoutingCardCostOfRevenueBilled_7f245d'),
  },
  {
    id: 'ai-models',
    label: adminT('admin.standalone.aiModels_220092'),
    endpoint: '/admin/models',
    collectionKey: 'models',
    description: adminT('admin.standalone.planModelAccessMatrixCostPer1mTokens_c5bc44'),
  },
  {
    id: 'agent-checkpoints',
    label: adminT('admin.standalone.agentCheckpoints_153494'),
    endpoint: '/admin/checkpoints/storage',
    collectionKey: 'byOrg',
    description: adminT('admin.standalone.perOrgCheckpointStorageFootprintRetentionRuleAnd_ec8fa1'),
  },
  {
    id: 'provider-health',
    label: adminT('admin.standalone.providerHealth_a137ae'),
    endpoint: '/admin/provider-health',
    collectionKey: 'providers',
    description: adminT('admin.standalone.aiGatewayAndProviderStatus_4447a9'),
  },
  {
    id: 'quotas',
    label: adminT('admin.standalone.quotas_34ed58'),
    endpoint: '/admin/quotas',
    collectionKey: 'quotas',
    description: adminT('admin.standalone.planLimitsUsageAndQuotaOverrides_d2cc63'),
  },
  {
    id: 'abuse-events',
    label: adminT('admin.standalone.abuseEvents_b36589'),
    endpoint: '/admin/abuse-events',
    collectionKey: 'abuseEvents',
    description: adminT('admin.standalone.abuseQueueAndResolutionFlow_2f80c6'),
  },
  {
    id: 'security-events',
    label: adminT('admin.standalone.securityEvents_c68076'),
    endpoint: '/admin/security-events',
    collectionKey: 'events',
    description: adminT('admin.standalone.authenticationMfaAndSecurityRelevantEvents_5d0ac7'),
  },
  {
    id: 'account-deletions',
    label: adminT('admin.standalone.accountDeletions_4361ee'),
    endpoint: '/admin/account-deletions',
    collectionKey: 'requests',
    description: adminT('admin.standalone.pendingSelfServeDeletions14DayPurgeQueue_1b2b14'),
  },
  {
    id: 'audit-logs',
    label: adminT('admin.standalone.auditLogs_676e58'),
    endpoint: '/admin/audit-logs',
    collectionKey: 'auditLogs',
    description: adminT('admin.standalone.tenantAuditTrail_aa7118'),
    exportable: true,
  },
  {
    id: 'admin-audit-logs',
    label: adminT('admin.standalone.adminAuditLogs_c7298e'),
    endpoint: '/admin/admin-audit-logs',
    collectionKey: 'adminAuditLogs',
    description: adminT('admin.standalone.operatorActionTimeline_d0925f'),
    exportable: true,
  },
  {
    id: 'support-tickets',
    label: adminT('admin.standalone.supportTickets_46b7e6'),
    endpoint: '/admin/support-tickets',
    collectionKey: 'tickets',
    description: adminT('admin.standalone.supportQueueAndAdminResponses_e9e913'),
  },
  {
    id: 'feature-flags',
    label: adminT('admin.standalone.featureFlags_f546d3'),
    endpoint: '/admin/feature-flags',
    collectionKey: 'flags',
    description: adminT('admin.standalone.createAndRollOutFlagsSafely_c80a0d'),
  },
  {
    id: 'system-settings',
    label: adminT('admin.standalone.systemSettings_1b4c8f'),
    endpoint: '/admin/system-settings',
    collectionKey: 'settings',
    description: adminT('admin.standalone.globalPlatformSettings_f86726'),
  },
  {
    id: 'kubernetes-health',
    label: adminT('admin.standalone.kubernetesHealth_5caace'),
    endpoint: '/admin/health',
    collectionKey: 'kubernetes',
    description: adminT('admin.standalone.clusterRuntimeAndSandboxConfiguration_739067'),
  },
  {
    id: 'queue-health',
    label: adminT('admin.standalone.queueHealth_74de31'),
    endpoint: '/admin/health',
    collectionKey: 'queues',
    description: adminT('admin.standalone.queueConnectivity_c9abea'),
  },
  {
    id: 'database-health',
    label: adminT('admin.standalone.databaseHealth_3af8fc'),
    endpoint: '/admin/health',
    collectionKey: 'database',
    description: adminT('admin.standalone.postgresqlConnectivity_bd233a'),
  },
  {
    id: 'redis-health',
    label: adminT('admin.standalone.redisHealth_ac508d'),
    endpoint: '/admin/health',
    collectionKey: 'redis',
    description: adminT('admin.standalone.redisConnectivity_36c4bd'),
  },
  {
    id: 'costs',
    label: adminT('admin.standalone.costDashboard_564e1b'),
    endpoint: '/admin/costs',
    collectionKey: 'aiCosts',
    description: adminT('admin.standalone.aiAndPlatformCostSignals_18bae8'),
  },
  {
    id: 'announcements',
    label: adminT('admin.standalone.announcements_06b01c'),
    endpoint: '/admin/system-settings',
    collectionKey: 'settings',
    description: adminT('admin.standalone.globalAnnouncements_309757'),
  },
  {
    id: 'incident-banner',
    label: adminT('admin.standalone.incidentBannerStatus_1d6886'),
    endpoint: '/admin/system-settings',
    collectionKey: 'settings',
    description: adminT('admin.standalone.incidentBannerAndStatusPageControls_f71c5e'),
  },
];

export const dangerousActions = new Set([
  'suspend-user',
  'unsuspend-user',
  'suspend-org',
  'stop-workspace',
  'restart-workspace',
  'delete-workspace',
  'force-logout',
  'reset-mfa',
  'quota-override',
  'plan-override',
  'refund-note',
  'redact-logs',
  'resolve-abuse',
  'respond-ticket',
  'create-flag',
  'maintenance',
  'announcement',
  'incident',
]);

export function collectionFromResponse(response: unknown, section: AdminSection) {
  const source = response as Record<string, unknown>;

  if (section.collectionKey === 'overview') {
    return [source];
  }

  const direct = source[section.collectionKey];

  if (Array.isArray(direct)) {
    return direct as Record<string, unknown>[];
  }

  if (direct && typeof direct === 'object') {
    return [direct as Record<string, unknown>];
  }

  return [];
}

export function searchableText(row: Record<string, unknown>) {
  return Object.values(row)
    .map((value) => (typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')))
    .join(' ')
    .toLowerCase();
}

export function sortRows(rows: Record<string, unknown>[], key: string, direction: 'asc' | 'desc') {
  return [...rows].sort((left, right) => {
    const a = String(left[key] ?? '');
    const b = String(right[key] ?? '');

    return direction === 'asc' ? a.localeCompare(b) : b.localeCompare(a);
  });
}
