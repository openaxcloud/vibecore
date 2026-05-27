import {
  apiRequest,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';

export type ProjectRecord = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  organizationId: string;
  gitRepositoryUrl?: string;
  gitDefaultBranch?: string;
  sourceType?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function projectLoader<T>(request: Request, projectId: string, path: string) {
  const [projectResult, data] = await Promise.all([
    apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`),
    apiRequest<T>(request, path),
  ]);

  return json({ project: projectResult.project, data });
}

export async function projectAction(
  args: EnterpriseActionArgs,
  handlers: Record<
    string,
    (context: { request: Request; projectId: string; body: Record<string, string> }) => Promise<Response | unknown>
  >,
) {
  const projectId = args.params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  const body = formObject(await args.request.formData()) as Record<string, string>;
  const intent = body.intent ?? 'default';
  const handler = handlers[intent] ?? handlers.default;

  if (!handler) {
    return json({ error: `Unsupported action: ${intent}` }, { status: 400 });
  }

  return handler({ request: args.request, projectId, body });
}

export async function projectPageLoader<T>(args: EnterpriseLoaderArgs, pathFactory: (projectId: string) => string) {
  const projectId = args.params.projectId;

  if (!projectId) {
    throw json({ ok: false, error: 'Project not found' }, { status: 404 });
  }

  return projectLoader<T>(args.request, projectId, pathFactory(projectId));
}

export function backToProject(projectId: string, suffix: string) {
  return redirect(`/projects/${projectId}${suffix}`);
}
