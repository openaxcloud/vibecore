import {
  apiRequest,
  formObject,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { getEnterpriseApiErrorCopy } from '~/lib/i18n/catalogs/enterprise-api-errors';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export type ProjectRecord = {
  id: string;
  name: string;
  slug?: string;
  description?: string;
  organizationId: string;
  ownershipEpoch: number;
  gitRepositoryUrl?: string;
  gitDefaultBranch?: string;
  sourceType?: string;
  createdAt?: string;
  updatedAt?: string;
};

export async function projectLoader<T>(request: Request, projectId: string, path: string) {
  const localeResolution = resolveRequestLocale(request);

  const [projectResult, data] = await Promise.all([
    apiRequest<{ project: ProjectRecord }>(request, `/projects/${projectId}`),
    apiRequest<T>(request, path),
  ]);

  return json(
    { language: localeResolution.language, project: projectResult.project, data },
    { headers: localeResponseHeaders(request, localeResolution) },
  );
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
    const localeResolution = resolveRequestLocale(args.request);

    throw json(
      { ok: false, errorCode: 'projectNotFound' },
      { status: 404, headers: localeResponseHeaders(args.request, localeResolution) },
    );
  }

  const body = formObject(await args.request.formData()) as Record<string, string>;
  const intent = body.intent ?? 'default';
  const handler = handlers[intent] ?? handlers.default;

  if (!handler) {
    const localeResolution = resolveRequestLocale(args.request);

    return json(
      {
        error: getEnterpriseApiErrorCopy(localeResolution.language).unsupportedAction,
        code: 'UNSUPPORTED_ACTION',
      },
      { status: 400, headers: localeResponseHeaders(args.request, localeResolution) },
    );
  }

  return handler({ request: args.request, projectId, body });
}

export async function projectPageLoader<T>(args: EnterpriseLoaderArgs, pathFactory: (projectId: string) => string) {
  const projectId = args.params.projectId;

  if (!projectId) {
    const localeResolution = resolveRequestLocale(args.request);

    throw json(
      { ok: false, errorCode: 'projectNotFound' },
      { status: 404, headers: localeResponseHeaders(args.request, localeResolution) },
    );
  }

  return projectLoader<T>(args.request, projectId, pathFactory(projectId));
}

export function backToProject(projectId: string, suffix: string) {
  return redirect(`/projects/${projectId}${suffix}`);
}
