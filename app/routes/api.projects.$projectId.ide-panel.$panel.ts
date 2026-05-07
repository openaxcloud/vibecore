import { randomUUID } from 'node:crypto';
import {
  apiRequest,
  clearSessionCookie,
  firstOrganization,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export type IdePanelStatus = 'ok' | 'empty' | 'error';

export interface IdePanelEnvelope<T = unknown> {
  panel: string;
  project: unknown;
  status: IdePanelStatus;
  data: T;
  error?: { code: string; message: string; retryable: boolean };
}

function isPanelDataEmpty(data: unknown): boolean {
  if (data === null || data === undefined) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);

    if (entries.length === 0) {
      return true;
    }

    return entries.every(([, value]) => {
      if (Array.isArray(value)) {
        return value.length === 0;
      }

      return value === null || value === undefined;
    });
  }

  return false;
}

function panelEnvelope<T>(panel: string, project: unknown, data: T): IdePanelEnvelope<T> {
  return {
    panel,
    project,
    status: isPanelDataEmpty(data) ? 'empty' : 'ok',
    data,
  };
}

function panelEnvelopeError(panel: string, project: unknown, error: unknown): IdePanelEnvelope<null> {
  const message = error instanceof Error ? error.message : 'Failed to load panel data';
  const status = (error as { status?: number } | undefined)?.status;

  const code =
    status === 401
      ? 'PANEL_AUTH'
      : status === 403
        ? 'PANEL_FORBIDDEN'
        : status === 404
          ? 'PANEL_NOT_FOUND'
          : status && status >= 500
            ? 'PANEL_BACKEND_UNAVAILABLE'
            : 'PANEL_REQUEST_FAILED';

  const retryable = !status || status >= 500 || status === 408 || status === 429;

  return {
    panel,
    project,
    status: 'error',
    data: null,
    error: { code, message, retryable },
  };
}

function panelErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Runtime request failed';
}

const panelEndpoints: Record<string, (projectId: string) => string> = {
  overview: (projectId) => `/projects/${projectId}/dashboard`,
  database: (projectId) => `/projects/${projectId}/dashboard`,
  'object-storage': (projectId) => `/projects/${projectId}/dashboard`,
  packages: (projectId) => `/projects/${projectId}/dashboard`,
  monitoring: (projectId) => `/projects/${projectId}/dashboard`,
  extensions: (projectId) => `/projects/${projectId}/dashboard`,
  integrations: (projectId) => `/projects/${projectId}/env-vars`,
  workflows: (projectId) => `/projects/${projectId}/env-vars`,
  terminal: (projectId) => `/projects/${projectId}/dashboard`,
  deployments: (projectId) => `/projects/${projectId}/deployments`,
  env: (projectId) => `/projects/${projectId}/env-vars`,
  secrets: (projectId) => `/projects/${projectId}/secrets`,
  git: (projectId) => `/projects/${projectId}/git/status`,
  activity: (projectId) => `/projects/${projectId}/activity`,
  logs: (projectId) => `/projects/${projectId}/dashboard`,
  collaborators: (projectId) => `/projects/${projectId}/collaboration`,
  snapshots: (projectId) => `/projects/${projectId}/snapshots`,
  settings: (projectId) => `/projects/${projectId}/settings`,
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: 'Project panel not found' }, { status: 404 });
  }

  const project = await apiRequest<{ project: unknown }>(request, `/projects/${projectId}`);
  const url = new URL(request.url);

  if (panel === 'domains') {
    try {
      const organization = await firstOrganization(request);
      const domains = await apiRequest(request, `/orgs/${organization.id}/domains`);

      return json(panelEnvelope(panel, project.project, domains));
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'secrets' && url.searchParams.get('reveal') === 'true' && url.searchParams.get('key')) {
    const confirmation = url.searchParams.get('confirm');

    if (confirmation !== '1') {
      return json<IdePanelEnvelope<null>>({
        panel,
        project: project.project,
        status: 'error',
        data: null,
        error: {
          code: 'PANEL_REVEAL_REQUIRES_CONFIRMATION',
          message: 'Secret reveal requires explicit user confirmation. Add &confirm=1 once acknowledged.',
          retryable: true,
        },
      });
    }

    try {
      const key = url.searchParams.get('key') ?? '';

      const data = await apiRequest(
        request,
        `/projects/${projectId}/secrets?reveal=true&key=${encodeURIComponent(key)}`,
      );

      return json(panelEnvelope(panel, project.project, data));
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (['database', 'object-storage', 'packages', 'monitoring', 'extensions'].includes(panel)) {
    try {
      const [dashboard, envVars, deployments] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/deployments`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(deployments as any),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'integrations') {
    try {
      const [dashboard, envVars, secrets, activity] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(secrets as any),
          ...(activity as any),
          integrationsState: readIntegrationsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'workflows') {
    try {
      const [dashboard, envVars, activity] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(activity as any),
          workflowsState: readWorkflowsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'settings') {
    try {
      const [settings, account, sessions, envVars, secrets, aiUsage, organizations] = await Promise.all([
        apiRequest(request, `/projects/${projectId}/settings`),
        apiRequest(request, '/auth/me').catch((error) => ({ error: panelErrorMessage(error) })),
        apiRequest(request, '/auth/sessions').catch((error) => ({ error: panelErrorMessage(error), sessions: [] })),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, '/ai/usage').catch((error) => ({ error: panelErrorMessage(error), usage: [] })),
        apiRequest(request, '/orgs').catch((error) => ({ error: panelErrorMessage(error), organizations: [] })),
      ]);

      const orgs = (organizations as any)?.organizations ?? [];

      const billing = orgs[0]?.id
        ? await apiRequest(request, `/orgs/${orgs[0].id}/billing`).catch((error) => ({
            error: panelErrorMessage(error),
          }))
        : { error: 'No organization available for billing.' };

      return json(
        panelEnvelope(panel, project.project, {
          ...(settings as any),
          account,
          sessions,
          envVars: (envVars as any)?.envVars ?? [],
          secrets: (secrets as any)?.secrets ?? [],
          aiUsage,
          organizations,
          billing,
          settingsState: readIdeSettingsState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  if (panel === 'terminal') {
    try {
      const [dashboard, envVars, secrets, activity] = await Promise.all([
        apiRequest<any>(request, `/projects/${projectId}/dashboard`),
        apiRequest(request, `/projects/${projectId}/env-vars`),
        apiRequest(request, `/projects/${projectId}/secrets`),
        apiRequest(request, `/projects/${projectId}/activity`),
      ]);

      const workspaceId = dashboard?.workspace?.id ?? projectId;

      const [runtimeStatus, runtimeFiles, runtimeProcesses, runtimePorts] = await Promise.all([
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
        apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/ports`).catch((error) => ({
          error: panelErrorMessage(error),
        })),
      ]);

      return json(
        panelEnvelope(panel, project.project, {
          ...(dashboard as any),
          ...(envVars as any),
          ...(secrets as any),
          ...(activity as any),
          workspaceId,
          runtimeStatus,
          runtimeFiles,
          runtimeProcesses,
          runtimePorts,
          terminalState: readTerminalState(envVars),
        }),
      );
    } catch (error) {
      return json(panelEnvelopeError(panel, project.project, error));
    }
  }

  const endpoint = panelEndpoints[panel];

  if (!endpoint) {
    throw json({ error: 'Unsupported IDE panel' }, { status: 404 });
  }

  try {
    const data = await apiRequest(request, endpoint(projectId));

    return json(panelEnvelope(panel, project.project, data));
  } catch (error) {
    return json(panelEnvelopeError(panel, project.project, error));
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const projectId = params.projectId;
  const panel = params.panel;

  if (!projectId || !panel) {
    throw json({ error: 'Project panel not found' }, { status: 404 });
  }

  const body = formObject(await request.formData()) as Record<string, string>;
  const intent = body.intent ?? 'default';

  if (panel === 'snapshots') {
    if (intent === 'restore') {
      await apiRequest(request, `/projects/${projectId}/snapshots/${body.snapshotId}/restore`, { method: 'POST' });
    } else {
      await apiRequest(request, `/projects/${projectId}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ label: body.label || 'Manual checkpoint', kind: 'manual', manifest: {} }),
      });
    }
  } else if (panel === 'deployments') {
    if (intent === 'cancel') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/cancel`, { method: 'POST' });
    } else if (intent === 'redeploy') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/redeploy`, {
        method: 'POST',
      });
    } else if (intent === 'rollback') {
      await apiRequest(request, `/projects/${projectId}/deployments/${body.deploymentId}/rollback`, {
        method: 'POST',
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/deployments`, {
        method: 'POST',
        body: JSON.stringify({
          provider: body.provider || 'static',
          environment: body.environment || 'preview',
          buildCommand: body.buildCommand || 'npm run build',
          outputDirectory: body.outputDirectory || 'dist',
          framework: body.framework || undefined,
          branch: body.branch || undefined,
          commitSha: body.commitSha || undefined,
          customDomain: body.customDomain || undefined,
          previewDeployment: body.previewDeployment === 'on',
          envVars: parseEnvVars(body.envVars ?? ''),
          injectSecrets: (body.injectSecrets ?? '')
            .split(',')
            .map((secret) => secret.trim())
            .filter(Boolean),
          githubIntegration: body.repositoryUrl
            ? { repositoryUrl: body.repositoryUrl, branch: body.branch || undefined }
            : undefined,
        }),
      });
    }
  } else if (panel === 'env') {
    if (intent === 'delete') {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
    }
  } else if (panel === 'secrets') {
    if (intent === 'delete') {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: body.key }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
      });
    }
  } else if (panel === 'collaborators') {
    if (intent === 'comment') {
      await apiRequest(request, `/projects/${projectId}/collaboration/comments`, {
        method: 'POST',
        body: JSON.stringify({
          filePath: body.filePath || undefined,
          line: body.line || undefined,
          body: body.body,
        }),
      });
    } else if (intent === 'share-link') {
      await apiRequest(request, `/projects/${projectId}/collaboration/share-links`, {
        method: 'POST',
        body: JSON.stringify({
          roleKey: body.roleKey || 'viewer',
          expiresInMinutes: body.expiresInMinutes || 1440,
        }),
      });
    } else if (intent === 'terminal-permission') {
      await apiRequest(request, `/projects/${projectId}/collaboration/terminal-permissions`, {
        method: 'POST',
        body: JSON.stringify({ userId: body.userId, allowed: body.allowed === 'true' }),
      });
    } else if (intent === 'ai-sharing') {
      await apiRequest(request, `/projects/${projectId}/collaboration/ai-conversation`, {
        method: 'POST',
        body: JSON.stringify({ shared: body.shared === 'true', mode: body.mode || 'comment' }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/collaborators`, {
        method: 'POST',
        body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey ?? 'member' }),
      });
    }
  } else if (panel === 'domains') {
    const organization = await firstOrganization(request);

    if (intent === 'verify') {
      await apiRequest(request, `/orgs/${organization.id}/domains/${encodeURIComponent(body.domain ?? '')}/verify`, {
        method: 'POST',
      });
    } else {
      await apiRequest(request, `/orgs/${organization.id}/domains`, {
        method: 'POST',
        body: JSON.stringify({ domain: body.domain }),
      });
    }
  } else if (panel === 'settings') {
    if (intent === 'profile') {
      await apiRequest(request, '/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          name: body.name,
          email: body.email || undefined,
          timezone: body.timezone || undefined,
        }),
      });
    } else if (intent === 'change-password') {
      await apiRequest(request, '/auth/password', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword: body.currentPassword, newPassword: body.newPassword }),
      });
    } else if (intent === 'logout-all') {
      await apiRequest(request, '/auth/logout-all', { method: 'POST' });
    } else if (intent === 'revoke-session') {
      await apiRequest(request, `/auth/sessions/${encodeURIComponent(body.sessionId ?? '')}`, { method: 'DELETE' });
    } else if (intent === 'send-verification') {
      await apiRequest(request, '/auth/send-verification', { method: 'POST' });
    } else if (intent === 'delete-account') {
      await apiRequest(request, '/auth/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: body.confirmation }),
      });
      return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
    } else if (intent === 'preferences' || intent === 'notification' || intent === 'ai-credential-mode') {
      const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
      const state = readIdeSettingsState(envVars);

      if (intent === 'preferences') {
        state.preferences = {
          ...state.preferences,
          theme: body.theme === 'light' ? 'light' : body.theme === 'system' ? 'system' : 'dark',
          keyboardMode: body.keyboardMode === 'true',
          creditAlertThreshold: Number(body.creditAlertThreshold) || state.preferences.creditAlertThreshold,
        };
      } else if (intent === 'notification') {
        const key = body.key;

        if (key && Object.prototype.hasOwnProperty.call(state.notifications, key)) {
          state.notifications = { ...state.notifications, [key]: body.enabled === 'true' };
        }
      } else {
        const provider = body.provider;

        if (provider && SETTINGS_BYOK_SECRET_KEY_MAP[provider]) {
          state.aiCredentials = {
            ...state.aiCredentials,
            [provider]: {
              ...(state.aiCredentials[provider] ?? {}),
              mode: body.mode === 'byok' ? 'byok' : 'managed',
            },
          };
        }
      }

      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({
          key: IDE_SETTINGS_STATE_ENV_KEY,
          value: JSON.stringify(normalizeIdeSettingsState(state)),
        }),
      });
    } else if (intent === 'save-ai-key') {
      const provider = body.provider;
      const secretKey = provider ? SETTINGS_BYOK_SECRET_KEY_MAP[provider] : undefined;

      if (!secretKey) {
        throw json({ error: 'Unsupported AI provider' }, { status: 400 });
      }

      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: secretKey, value: body.apiKey ?? '' }),
      });

      const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
      const state = readIdeSettingsState(envVars);
      state.aiCredentials = {
        ...state.aiCredentials,
        [provider]: { ...(state.aiCredentials[provider] ?? {}), mode: 'byok' },
      };
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({
          key: IDE_SETTINGS_STATE_ENV_KEY,
          value: JSON.stringify(normalizeIdeSettingsState(state)),
        }),
      });
    } else if (intent === 'delete-ai-key') {
      const provider = body.provider;
      const secretKey = provider ? SETTINGS_BYOK_SECRET_KEY_MAP[provider] : undefined;

      if (!secretKey) {
        throw json({ error: 'Unsupported AI provider' }, { status: 400 });
      }

      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: secretKey }),
      });
    } else {
      await apiRequest(request, `/projects/${projectId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: body.name,
          description: body.description,
          gitRepositoryUrl: body.gitRepositoryUrl || undefined,
          gitDefaultBranch: body.gitDefaultBranch || undefined,
        }),
      });
    }
  } else if (panel === 'database') {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: body.key || 'DATABASE_URL', value: body.value ?? '' }),
    });
  } else if (panel === 'object-storage') {
    if (intent === 'export') {
      await apiRequest(request, `/projects/${projectId}/export/zip`);
    } else {
      await apiRequest(request, `/projects/${projectId}/env-vars`, {
        method: 'PUT',
        body: JSON.stringify({ key: body.key || 'OBJECT_STORAGE_BUCKET', value: body.value ?? '' }),
      });
    }
  } else if (panel === 'packages') {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: 'PACKAGE_INSTALL_PLAN', value: body.packages ?? '' }),
    });
  } else if (panel === 'extensions') {
    const requestedExtension = (body.extension ?? '').trim();

    const existingExtensions = (body.installedExtensions ?? '')
      .split(',')
      .map((extension) => extension.trim())
      .filter(Boolean);

    const extensions = Array.from(new Set([...existingExtensions, requestedExtension].filter(Boolean)));

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: 'VIBECORE_EXTENSIONS', value: extensions.join(',') }),
    });
  } else if (panel === 'integrations') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readIntegrationsState(envVars);
    const now = new Date().toISOString();
    const intent = body.intent ?? 'default';

    if (intent === 'connect' || intent === 'disconnect') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json({ error: 'integrationId is required' }, { status: 400 });
      }

      state.integrations[integrationId] = {
        ...(state.integrations[integrationId] ?? {}),
        connected: intent === 'connect',
        status: intent === 'connect' ? 'active' : undefined,
        lastSync: intent === 'connect' ? now : undefined,
        config: { organization: body.organization ?? '' },
      };

      if (intent === 'connect' && body.apiToken) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: integrationSecretKey(integrationId), value: body.apiToken }),
        });
      }
    } else if (intent === 'sync') {
      const integrationId = body.integrationId;

      if (!integrationId) {
        throw json({ error: 'integrationId is required' }, { status: 400 });
      }

      state.integrations[integrationId] = {
        ...(state.integrations[integrationId] ?? {}),
        connected: true,
        status: 'active',
        lastSync: now,
      };
    } else if (intent === 'create-webhook') {
      const id = randomUUID();

      const events = (body.events ?? 'all')
        .split(',')
        .map((event) => event.trim())
        .filter(Boolean);

      state.webhooks.unshift({
        id,
        name: body.name || 'Project webhook',
        url: body.url,
        events: events.length ? events : ['all'],
        active: true,
        successRate: 100,
        createdAt: now,
      });

      if (body.secret) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: `INTEGRATION_WEBHOOK_SECRET_${id}`, value: body.secret }),
        });
      }
    } else if (intent === 'toggle-webhook') {
      state.webhooks = state.webhooks.map((webhook: any) =>
        webhook.id === body.webhookId ? { ...webhook, active: String(body.active) === 'true' } : webhook,
      );
    } else if (intent === 'delete-webhook') {
      state.webhooks = state.webhooks.filter((webhook: any) => webhook.id !== body.webhookId);
    } else if (intent === 'create-api-key') {
      const id = randomUUID();
      const prefix = body.environment === 'production' ? 'ek_live_' : body.environment === 'ci' ? 'ek_ci_' : 'ek_test_';
      const token = `${prefix}${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8)}`;

      const expiresAt =
        body.expiration && body.expiration !== 'never'
          ? new Date(Date.now() + Number(body.expiration) * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      state.apiKeys.unshift({
        id,
        name: body.name || 'Project API key',
        prefix,
        permissions: (body.permissions ?? 'read,write')
          .split(',')
          .map((permission) => permission.trim())
          .filter(Boolean),
        expiresAt,
        createdAt: now,
      });
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'PUT',
        body: JSON.stringify({ key: `INTEGRATION_API_KEY_${id}`, value: token }),
      });
    } else if (intent === 'revoke-api-key') {
      state.apiKeys = state.apiKeys.filter((apiKey: any) => apiKey.id !== body.apiKeyId);
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: `INTEGRATION_API_KEY_${body.apiKeyId}` }),
      });
    } else if (intent === 'create-stream') {
      state.eventStreams.unshift({
        id: randomUUID(),
        name: body.name || 'Project event stream',
        destination: body.destination || 'AWS Kinesis',
        events: (body.events ?? '*')
          .split(',')
          .map((event) => event.trim())
          .filter(Boolean),
        active: true,
        throughput: 0,
        createdAt: now,
      });
    } else if (intent === 'toggle-stream') {
      state.eventStreams = state.eventStreams.map((stream: any) =>
        stream.id === body.streamId ? { ...stream, active: String(body.active) === 'true' } : stream,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: INTEGRATIONS_STATE_ENV_KEY, value: JSON.stringify(state) }),
    });
  } else if (panel === 'workflows') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readWorkflowsState(envVars);
    const now = new Date().toISOString();
    const workflowId = body.workflowId ? Number(body.workflowId) : undefined;
    const taskId = body.taskId ? Number(body.taskId) : undefined;

    if (intent === 'create-workflow') {
      const id = Date.now();

      state.workflows.unshift({
        id,
        projectId,
        name: body.name || 'Project workflow',
        executionMode: body.executionMode === 'parallel' ? 'parallel' : 'sequential',
        isRunButton: body.isRunButton === 'true',
        isGenerated: body.isGenerated === 'true',
        isSystem: false,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        tasks: [
          {
            id: id + 1,
            orderIndex: 0,
            taskType: 'shell',
            command: body.command || 'npm run dev',
            targetWorkflowId: null,
          },
        ],
      });
    } else if (intent === 'update-workflow') {
      state.workflows = state.workflows.map((workflow: any) =>
        workflow.id === workflowId
          ? {
              ...workflow,
              name: body.name ?? workflow.name,
              executionMode:
                body.executionMode === 'parallel' || body.executionMode === 'sequential'
                  ? body.executionMode
                  : workflow.executionMode,
              enabled: body.enabled === undefined ? workflow.enabled : body.enabled === 'true',
              updatedAt: now,
            }
          : workflow,
      );
    } else if (intent === 'delete-workflow') {
      state.workflows = state.workflows.filter((workflow: any) => workflow.id !== workflowId);
    } else if (intent === 'set-run-button') {
      state.workflows = state.workflows.map((workflow: any) => ({
        ...workflow,
        isRunButton: workflow.id === workflowId,
        updatedAt: workflow.id === workflowId ? now : workflow.updatedAt,
      }));
    } else if (intent === 'add-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        const tasks = Array.isArray(workflow.tasks) ? workflow.tasks : [];
        const taskType = ['shell', 'packages', 'workflow'].includes(body.taskType ?? '') ? body.taskType : 'shell';

        return {
          ...workflow,
          updatedAt: now,
          tasks: normalizeWorkflowTasks([
            ...tasks,
            {
              id: Date.now(),
              orderIndex: tasks.length,
              taskType,
              command: taskType === 'packages' ? body.command || 'pnpm install' : body.command || '',
              targetWorkflowId: body.targetWorkflowId ? Number(body.targetWorkflowId) : null,
            },
          ]),
        };
      });
    } else if (intent === 'update-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        return {
          ...workflow,
          updatedAt: now,
          tasks: normalizeWorkflowTasks(
            (workflow.tasks ?? []).map((task: any) =>
              task.id === taskId
                ? {
                    ...task,
                    taskType: ['shell', 'packages', 'workflow'].includes(body.taskType ?? '')
                      ? body.taskType
                      : task.taskType,
                    command: body.command ?? task.command,
                    targetWorkflowId: body.targetWorkflowId ? Number(body.targetWorkflowId) : null,
                  }
                : task,
            ),
          ),
        };
      });
    } else if (intent === 'delete-task') {
      state.workflows = state.workflows.map((workflow: any) =>
        workflow.id === workflowId
          ? {
              ...workflow,
              updatedAt: now,
              tasks: normalizeWorkflowTasks((workflow.tasks ?? []).filter((task: any) => task.id !== taskId)),
            }
          : workflow,
      );
    } else if (intent === 'move-task') {
      state.workflows = state.workflows.map((workflow: any) => {
        if (workflow.id !== workflowId) {
          return workflow;
        }

        const tasks = normalizeWorkflowTasks(workflow.tasks ?? []);
        const index = tasks.findIndex((task: any) => task.id === taskId);
        const direction = body.direction === 'down' ? 1 : -1;
        const nextIndex = Math.max(0, Math.min(tasks.length - 1, index + direction));

        if (index < 0 || index === nextIndex) {
          return workflow;
        }

        const [moved] = tasks.splice(index, 1);
        tasks.splice(nextIndex, 0, moved);

        return { ...workflow, updatedAt: now, tasks: normalizeWorkflowTasks(tasks) };
      });
    } else if (intent === 'run-workflow') {
      const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
      const workflow = state.workflows.find((item: any) => item.id === workflowId);

      if (!workflow) {
        throw json({ error: 'workflowId is invalid' }, { status: 400 });
      }

      const run = await runWorkflowTasks(
        request,
        projectId,
        dashboard?.workspace?.id ?? projectId,
        state,
        workflow,
        now,
      );
      state.runs.unshift(run);
      state.runs = state.runs.slice(0, 25);
      state.workflows = state.workflows.map((item: any) =>
        item.id === workflow.id
          ? { ...item, lastRunAt: run.startedAt, lastRunStatus: run.status, updatedAt: run.finishedAt ?? now }
          : item,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: WORKFLOWS_STATE_ENV_KEY, value: JSON.stringify(normalizeWorkflowsState(state)) }),
    });
  } else if (panel === 'terminal') {
    const envVars = await apiRequest(request, `/projects/${projectId}/env-vars`);
    const state = readTerminalState(envVars);
    const dashboard = await apiRequest<any>(request, `/projects/${projectId}/dashboard`).catch(() => null);
    const workspaceId = dashboard?.workspace?.id ?? projectId;
    const now = new Date().toISOString();

    if (intent === 'add-env') {
      if (body.isSecret === 'true') {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      } else {
        await apiRequest(request, `/projects/${projectId}/env-vars`, {
          method: 'PUT',
          body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
        });
      }
    } else if (intent === 'delete-env') {
      await apiRequest(
        request,
        body.isSecret === 'true' ? `/projects/${projectId}/secrets` : `/projects/${projectId}/env-vars`,
        {
          method: 'DELETE',
          body: JSON.stringify({ key: body.key }),
        },
      );
    } else if (intent === 'run-script') {
      const script = body.script ?? '';
      const run = await runTerminalCommand(request, workspaceId, script, body.name || 'Terminal script', now);
      state.scriptRuns.unshift(run);
      state.scriptRuns = state.scriptRuns.slice(0, 20);
    } else if (intent === 'stop-process') {
      await apiRequest(
        request,
        `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/processes/${encodeURIComponent(body.processId ?? '')}/kill`,
        { method: 'POST' },
      );
    } else if (intent === 'restart-workspace') {
      await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/restart`, {
        method: 'POST',
      });
    } else if (intent === 'stop-workspace') {
      await apiRequest(request, `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/stop`, { method: 'POST' });
    } else if (intent === 'add-ssh') {
      const id = randomUUID();
      state.sshConnections.unshift({
        id,
        name: body.name || `${body.username}@${body.host}`,
        host: body.host,
        port: Number(body.port) || 22,
        username: body.username,
        status: 'disconnected',
        createdAt: now,
      });

      if (body.privateKey) {
        await apiRequest(request, `/projects/${projectId}/secrets`, {
          method: 'PUT',
          body: JSON.stringify({ key: terminalSshSecretKey(id), value: body.privateKey }),
        });
      }
    } else if (intent === 'delete-ssh') {
      state.sshConnections = state.sshConnections.filter((connection: any) => connection.id !== body.connectionId);
      await apiRequest(request, `/projects/${projectId}/secrets`, {
        method: 'DELETE',
        body: JSON.stringify({ key: terminalSshSecretKey(body.connectionId ?? '') }),
      }).catch(() => undefined);
    } else if (intent === 'disconnect-ssh') {
      state.sshConnections = state.sshConnections.map((connection: any) =>
        connection.id === body.connectionId ? { ...connection, status: 'disconnected', updatedAt: now } : connection,
      );
    } else if (intent === 'connect-ssh') {
      const connection = state.sshConnections.find((item: any) => item.id === body.connectionId);

      if (!connection) {
        throw json({ error: 'SSH connection not found' }, { status: 400 });
      }

      const command = [
        'ssh',
        '-o BatchMode=yes',
        '-o StrictHostKeyChecking=no',
        '-o ConnectTimeout=8',
        '-p',
        shellQuote(String(connection.port || 22)),
        `${shellQuote(`${connection.username}@${connection.host}`)}`,
        shellQuote('echo vibecore-ssh-connected'),
      ].join(' ');

      const run = await runTerminalCommand(request, workspaceId, command, `SSH ${connection.name}`, now);
      state.scriptRuns.unshift(run);
      state.scriptRuns = state.scriptRuns.slice(0, 20);
      state.sshConnections = state.sshConnections.map((item: any) =>
        item.id === connection.id
          ? {
              ...item,
              status: run.exitCode === 0 ? 'connected' : 'disconnected',
              lastCheckedAt: run.finishedAt,
              lastError: run.exitCode === 0 ? undefined : run.output.slice(-500),
              updatedAt: run.finishedAt,
            }
          : item,
      );
    }

    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: TERMINAL_STATE_ENV_KEY, value: JSON.stringify(normalizeTerminalState(state)) }),
    });
  } else if (panel === 'git') {
    if (intent === 'commit') {
      await apiRequest(request, `/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({ message: body.message || 'Update project files' }),
      });
    } else if (intent === 'push') {
      await apiRequest(request, `/projects/${projectId}/git/push`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main' }),
      });
    } else if (intent === 'pull') {
      await apiRequest(request, `/projects/${projectId}/git/pull`, {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch || 'main' }),
      });
    } else if (intent === 'pr') {
      await apiRequest(request, `/projects/${projectId}/git/pull-requests`, {
        method: 'POST',
        body: JSON.stringify({
          title: body.title || 'Project update',
          sourceBranch: body.sourceBranch || 'main',
          targetBranch: body.targetBranch || 'main',
          body: body.body,
        }),
      });
    }
  } else {
    throw json({ error: 'Unsupported IDE panel action' }, { status: 404 });
  }

  return json({ ok: true });
}

function parseEnvVars(value: string) {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split('=');

        return [key.trim(), rest.join('=').trim()];
      })
      .filter(([key]) => key),
  );
}

const IDE_SETTINGS_STATE_ENV_KEY = 'VIBECORE_IDE_SETTINGS_STATE';

const SETTINGS_BYOK_SECRET_KEY_MAP: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  google: 'GOOGLE_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

function defaultIdeSettingsState() {
  return {
    preferences: {
      theme: 'dark',
      keyboardMode: false,
      creditAlertThreshold: 80,
    },
    notifications: {
      agent: true,
      billing: true,
      deployment: true,
      security: true,
      team: true,
      system: true,
    },
    aiCredentials: Object.fromEntries(
      Object.keys(SETTINGS_BYOK_SECRET_KEY_MAP).map((provider) => [provider, { mode: 'managed' }]),
    ),
  };
}

function readIdeSettingsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === IDE_SETTINGS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultIdeSettingsState();
  }

  try {
    return normalizeIdeSettingsState(JSON.parse(raw));
  } catch {
    return defaultIdeSettingsState();
  }
}

function normalizeIdeSettingsState(input: any) {
  const fallback = defaultIdeSettingsState();
  const notifications = { ...fallback.notifications, ...(input?.notifications ?? {}) };
  const aiCredentials = { ...fallback.aiCredentials, ...(input?.aiCredentials ?? {}) };

  return {
    preferences: {
      theme: ['dark', 'light', 'system'].includes(input?.preferences?.theme) ? input.preferences.theme : 'dark',
      keyboardMode: Boolean(input?.preferences?.keyboardMode),
      creditAlertThreshold: Number(input?.preferences?.creditAlertThreshold) || 80,
    },
    notifications: {
      agent: notifications.agent !== false,
      billing: notifications.billing !== false,
      deployment: notifications.deployment !== false,
      security: notifications.security !== false,
      team: notifications.team !== false,
      system: notifications.system !== false,
    },
    aiCredentials: Object.fromEntries(
      Object.keys(SETTINGS_BYOK_SECRET_KEY_MAP).map((provider) => [
        provider,
        {
          mode: aiCredentials[provider]?.mode === 'byok' ? 'byok' : 'managed',
        },
      ]),
    ),
  };
}

const INTEGRATIONS_STATE_ENV_KEY = 'VIBECORE_INTEGRATIONS_STATE';

function defaultIntegrationsState() {
  return {
    integrations: {},
    webhooks: [],
    apiKeys: [],
    eventStreams: [],
  };
}

function readIntegrationsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === INTEGRATIONS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultIntegrationsState();
  }

  try {
    const parsed = JSON.parse(raw);

    return {
      integrations: parsed?.integrations && typeof parsed.integrations === 'object' ? parsed.integrations : {},
      webhooks: Array.isArray(parsed?.webhooks) ? parsed.webhooks : [],
      apiKeys: Array.isArray(parsed?.apiKeys) ? parsed.apiKeys : [],
      eventStreams: Array.isArray(parsed?.eventStreams) ? parsed.eventStreams : [],
    };
  } catch {
    return defaultIntegrationsState();
  }
}

function integrationSecretKey(integrationId: string) {
  return `INTEGRATION_TOKEN_${integrationId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

const TERMINAL_STATE_ENV_KEY = 'VIBECORE_TERMINAL_STATE';

function defaultTerminalState() {
  return {
    sshConnections: [],
    scriptRuns: [],
  };
}

function readTerminalState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === TERMINAL_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultTerminalState();
  }

  try {
    return normalizeTerminalState(JSON.parse(raw));
  } catch {
    return defaultTerminalState();
  }
}

function normalizeTerminalState(input: any) {
  return {
    sshConnections: Array.isArray(input?.sshConnections)
      ? input.sshConnections.map((connection: any) => ({
          id: String(connection.id || randomUUID()),
          name: String(connection.name || connection.host || 'SSH connection'),
          host: String(connection.host || ''),
          port: Number(connection.port) || 22,
          username: String(connection.username || ''),
          status: ['connected', 'connecting', 'disconnected'].includes(connection.status)
            ? connection.status
            : 'disconnected',
          createdAt: connection.createdAt,
          updatedAt: connection.updatedAt,
          lastCheckedAt: connection.lastCheckedAt,
          lastError: connection.lastError,
        }))
      : [],
    scriptRuns: Array.isArray(input?.scriptRuns) ? input.scriptRuns.slice(0, 20) : [],
  };
}

function terminalSshSecretKey(connectionId: string) {
  return `TERMINAL_SSH_PRIVATE_KEY_${connectionId.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

async function runTerminalCommand(
  request: Request,
  workspaceId: string,
  script: string,
  name: string,
  startedAt: string,
) {
  const command = script.trim();

  if (!command) {
    throw json({ error: 'Script is required' }, { status: 400 });
  }

  const finishedAt = new Date().toISOString();

  try {
    const result = await apiRequest<{ exitCode?: number; output?: string }>(
      request,
      `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({ command: 'sh', args: ['-lc', command], timeoutMs: 120_000 }),
      },
    );

    return {
      id: randomUUID(),
      name,
      script: command,
      exitCode: result.exitCode ?? 0,
      status: result.exitCode && result.exitCode !== 0 ? 'failed' : 'succeeded',
      output: result.output ?? '',
      startedAt,
      finishedAt,
    };
  } catch (error) {
    return {
      id: randomUUID(),
      name,
      script: command,
      exitCode: 1,
      status: 'failed',
      output: panelErrorMessage(error),
      startedAt,
      finishedAt,
    };
  }
}

const WORKFLOWS_STATE_ENV_KEY = 'VIBECORE_WORKFLOWS_STATE';

function defaultWorkflowsState() {
  return {
    workflows: [
      {
        id: 1001,
        projectId: null,
        name: 'Run development server',
        executionMode: 'sequential',
        isRunButton: true,
        isGenerated: true,
        isSystem: true,
        enabled: true,
        tasks: [
          {
            id: 1002,
            orderIndex: 0,
            taskType: 'shell',
            command: 'npm run dev',
            targetWorkflowId: null,
          },
        ],
      },
    ],
    runs: [],
  };
}

function readWorkflowsState(envVarsResponse: unknown) {
  const envVars = (envVarsResponse as any)?.envVars ?? [];
  const raw = envVars.find((item: any) => item.key === WORKFLOWS_STATE_ENV_KEY)?.value;

  if (typeof raw !== 'string' || !raw.trim()) {
    return defaultWorkflowsState();
  }

  try {
    return normalizeWorkflowsState(JSON.parse(raw));
  } catch {
    return defaultWorkflowsState();
  }
}

function normalizeWorkflowsState(input: any) {
  const fallback = defaultWorkflowsState();
  const workflows = Array.isArray(input?.workflows) ? input.workflows : fallback.workflows;

  return {
    workflows: workflows.map((workflow: any, index: number) => ({
      id: Number(workflow.id) || Date.now() + index,
      projectId: workflow.projectId ?? null,
      name: String(workflow.name || 'Project workflow'),
      executionMode: workflow.executionMode === 'parallel' ? 'parallel' : 'sequential',
      isRunButton: Boolean(workflow.isRunButton),
      isGenerated: Boolean(workflow.isGenerated),
      isSystem: Boolean(workflow.isSystem),
      enabled: workflow.enabled !== false,
      createdAt: workflow.createdAt,
      updatedAt: workflow.updatedAt,
      lastRunAt: workflow.lastRunAt,
      lastRunStatus: workflow.lastRunStatus,
      tasks: normalizeWorkflowTasks(Array.isArray(workflow.tasks) ? workflow.tasks : []),
    })),
    runs: Array.isArray(input?.runs) ? input.runs.slice(0, 25) : [],
  };
}

function normalizeWorkflowTasks(tasks: any[]) {
  return tasks
    .map((task, index) => ({
      id: Number(task.id) || Date.now() + index,
      orderIndex: Number.isFinite(Number(task.orderIndex)) ? Number(task.orderIndex) : index,
      taskType: ['shell', 'packages', 'workflow'].includes(task.taskType) ? task.taskType : 'shell',
      command: typeof task.command === 'string' ? task.command : '',
      targetWorkflowId: task.targetWorkflowId ? Number(task.targetWorkflowId) : null,
    }))
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((task, index) => ({ ...task, orderIndex: index }));
}

async function runWorkflowTasks(
  request: Request,
  projectId: string,
  workspaceId: string,
  state: any,
  workflow: any,
  startedAt: string,
  depth = 0,
): Promise<any> {
  const run = {
    id: randomUUID(),
    workflowId: workflow.id,
    workflowName: workflow.name,
    status: 'running',
    startedAt,
    finishedAt: undefined as string | undefined,
    logs: [] as Array<{ level: string; message: string; timestamp: string }>,
  };

  const tasks = normalizeWorkflowTasks(workflow.tasks ?? []);

  if (!workflow.enabled) {
    run.status = 'skipped';
    run.finishedAt = new Date().toISOString();
    run.logs.push({ level: 'warn', message: 'Workflow is disabled.', timestamp: run.finishedAt });

    return run;
  }

  async function executeTask(task: any) {
    const timestamp = new Date().toISOString();

    if (task.taskType === 'workflow') {
      if (depth >= 3) {
        throw new Error('Nested workflow depth limit reached');
      }

      const target = state.workflows.find((item: any) => item.id === task.targetWorkflowId);

      if (!target) {
        throw new Error(`Target workflow ${task.targetWorkflowId ?? ''} was not found`);
      }

      const nestedRun = await runWorkflowTasks(request, projectId, workspaceId, state, target, timestamp, depth + 1);
      run.logs.push(...nestedRun.logs);

      if (nestedRun.status === 'failed') {
        throw new Error(`Nested workflow "${target.name}" failed`);
      }

      return;
    }

    const command = String(task.command || (task.taskType === 'packages' ? 'pnpm install' : '')).trim();

    if (!command) {
      throw new Error('Workflow task has no command');
    }

    run.logs.push({ level: 'info', message: `$ ${command}`, timestamp });

    const result = await apiRequest<{ exitCode?: number; output?: string }>(
      request,
      `/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/commands`,
      {
        method: 'POST',
        body: JSON.stringify({ command: 'sh', args: ['-lc', command], timeoutMs: 120_000 }),
      },
    );

    if (result.output) {
      run.logs.push({
        level: result.exitCode && result.exitCode !== 0 ? 'error' : 'info',
        message: result.output.slice(-4000),
        timestamp: new Date().toISOString(),
      });
    }

    if (result.exitCode && result.exitCode !== 0) {
      throw new Error(`Command exited with ${result.exitCode}`);
    }
  }

  try {
    if (workflow.executionMode === 'parallel') {
      await Promise.all(tasks.map((task) => executeTask(task)));
    } else {
      for (const task of tasks) {
        await executeTask(task);
      }
    }

    run.status = 'succeeded';
  } catch (error) {
    const timestamp = new Date().toISOString();
    run.status = 'failed';
    run.logs.push({
      level: 'error',
      message: error instanceof Error ? error.message : String(error),
      timestamp,
    });
  }

  run.finishedAt = new Date().toISOString();

  return run;
}
