import {
  apiRequest,
  firstOrganization,
  formObject,
  json,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

const panelEndpoints: Record<string, (projectId: string) => string> = {
  overview: (projectId) => `/projects/${projectId}/dashboard`,
  database: (projectId) => `/projects/${projectId}/dashboard`,
  'object-storage': (projectId) => `/projects/${projectId}/dashboard`,
  packages: (projectId) => `/projects/${projectId}/dashboard`,
  monitoring: (projectId) => `/projects/${projectId}/dashboard`,
  extensions: (projectId) => `/projects/${projectId}/dashboard`,
  deployments: (projectId) => `/projects/${projectId}/deployments`,
  env: (projectId) => `/projects/${projectId}/env-vars`,
  secrets: (projectId) => `/projects/${projectId}/secrets`,
  git: (projectId) => `/projects/${projectId}/git/status`,
  activity: (projectId) => `/projects/${projectId}/activity`,
  logs: (projectId) => `/projects/${projectId}/dashboard`,
  collaborators: (projectId) => `/projects/${projectId}/collaborators`,
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

  if (panel === 'domains') {
    const organization = await firstOrganization(request);
    const domains = await apiRequest(request, `/orgs/${organization.id}/domains`);

    return json({ panel, project: project.project, data: domains });
  }

  if (['database', 'object-storage', 'packages', 'monitoring', 'extensions'].includes(panel)) {
    const [dashboard, envVars, deployments] = await Promise.all([
      apiRequest(request, `/projects/${projectId}/dashboard`),
      apiRequest(request, `/projects/${projectId}/env-vars`),
      apiRequest(request, `/projects/${projectId}/deployments`),
    ]);

    return json({
      panel,
      project: project.project,
      data: { ...(dashboard as any), ...(envVars as any), ...(deployments as any) },
    });
  }

  const endpoint = panelEndpoints[panel];

  if (!endpoint) {
    throw json({ error: 'Unsupported IDE panel' }, { status: 404 });
  }

  const data = await apiRequest(request, endpoint(projectId));

  return json({ panel, project: project.project, data });
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
    await apiRequest(request, `/projects/${projectId}/deployments`, {
      method: 'POST',
      body: JSON.stringify({ provider: body.provider || 'preview', url: body.url || undefined }),
    });
  } else if (panel === 'env') {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
    });
  } else if (panel === 'secrets') {
    await apiRequest(request, `/projects/${projectId}/secrets`, {
      method: 'PUT',
      body: JSON.stringify({ key: body.key, value: body.value ?? '' }),
    });
  } else if (panel === 'collaborators') {
    await apiRequest(request, `/projects/${projectId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ userId: body.userId, roleKey: body.roleKey ?? 'member' }),
    });
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
    await apiRequest(request, `/projects/${projectId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: body.name,
        description: body.description,
        gitRepositoryUrl: body.gitRepositoryUrl || undefined,
        gitDefaultBranch: body.gitDefaultBranch || undefined,
      }),
    });
  } else if (panel === 'database') {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: body.key || 'DATABASE_URL', value: body.value ?? '' }),
    });
  } else if (panel === 'object-storage') {
    await apiRequest(request, `/projects/${projectId}/env-vars`, {
      method: 'PUT',
      body: JSON.stringify({ key: body.key || 'OBJECT_STORAGE_BUCKET', value: body.value ?? '' }),
    });
  } else if (panel === 'extensions') {
    await apiRequest(request, `/projects/${projectId}/deployments`, {
      method: 'POST',
      body: JSON.stringify({ provider: `extension:${body.extension || 'marketplace'}` }),
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
