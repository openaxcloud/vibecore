import type { AppLoadContext, LoaderFunctionArgs } from 'react-router';
import { previewTenantCookie } from '~/lib/.server/preview-tenant';
import { apiErrorMessage, apiRequest, json } from '~/lib/enterprise-api.server';
import { getEnterpriseApiErrorCopy } from '~/lib/i18n/catalogs/enterprise-api-errors';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isSuccessfulPanelPayload } from '~/lib/ide/panel-payload-cache';

export type ProjectWorkspaceSummary = {
  id: string;
  name?: string;
  status?: string;
  runtimeMode?: string;
  createdAt?: string;
  gitRepositoryUrl?: string | null;
};

export type ProjectLoaderData = {
  projectId: string;
  project: {
    id: string;
    name: string;
    slug?: string;
    organizationId?: string;
    gitDefaultBranch?: string;

    /** Number of deployments; drives the top bar's Publish vs Republish label. */
    deploymentCount?: number;
  };
  workspace: {
    id?: string;
    name?: string;
    status?: string;
    runtimeMode?: string;
    ports?: Array<{ port?: number; ready?: boolean; url?: string }>;
  } | null;
  organization: {
    id: string;
    name?: string;
    slug?: string;
  } | null;
  git: {
    branch?: string;
  };
  collaborators: Array<{ id?: string; userId?: string; roleKey?: string }>;
  notifications: Array<{ id?: string; action: string; createdAt?: string; metadata?: unknown }>;
  initialIdePanels: Record<
    string,
    {
      panel: string;
      project: ProjectLoaderData['project'];
      status: 'ok' | 'empty' | 'error';
      data: unknown;
    }
  >;

  /*
   * The list of workspaces the project owns, plus the resolved selection. The
   * current workspace defaults to the primary (oldest) one and is overridden
   * when the IDE URL carries `?workspace=<id>`. UI tabs read this id via the
   * CurrentWorkspaceContext so per-workspace scoping stays consistent without
   * each tab fetching the workspace list on its own.
   */
  workspaces: ProjectWorkspaceSummary[];
  currentWorkspaceId?: string;
  primaryWorkspaceId?: string;
  projectApiError?: string;
};

/*
 * `apiRequest` signals login/MFA navigations by throwing a redirect `Response`
 * (3xx). React Router only navigates when a loader throws such a Response, so
 * the IDE loader must re-throw these instead of folding them into its soft
 * error shell.
 */
export function isRedirectResponse(error: unknown): error is Response {
  return error instanceof Response && error.status >= 300 && error.status < 400;
}

/*
 * The IDE loader must distinguish genuine client-facing failures from transient
 * backend hiccups when resolving the project itself.
 *
 * `apiRequest` throws a `Response` carrying the upstream status for every
 * non-ok reply. A 3xx is a login/MFA redirect; a 401/403/404 (and any other
 * 4xx) is a definitive answer — the session is gone, the caller has no
 * permission, or the project does not exist — and must surface as that status
 * so the route renders a clean re-auth/forbidden/not-found page instead of a
 * fully-mounted IDE shell that echoes the raw project id as its name.
 *
 * Only transient 5xx / network / timeout failures should degrade into the soft
 * error shell, where the IDE chrome stays up with a recoverable banner. So:
 * re-throw any thrown `Response` whose status is < 500 (covers 3xx redirects and
 * all 4xx), and let everything else (5xx Responses, plain network errors) fall
 * through to the soft shell.
 */
export function shouldRethrowResolveError(error: unknown): error is Response {
  return error instanceof Response && error.status < 500;
}

/**
 * Panneaux demandés au PREMIER rendu de l'IDE. Mesuré sur un chargement à
 * froid : `snapshots` et `settings`, et eux seuls. Embarquer les douze
 * panneaux gonflerait un document qui est en `no-store`, donc jamais mis en
 * cache — ces deux-là pèsent ~5,7 Kio bruts à eux deux.
 */
export const PANNEAUX_PRECHARGES = ['snapshots', 'settings'] as const;

type ChargeurRoutePanneau = () => Promise<{ loader: (args: never) => Promise<unknown> }>;

let chargeurDeRoutePanneau: ChargeurRoutePanneau = () =>
  import('~/routes/api.projects.$projectId.ide-panel.$panel') as unknown as ReturnType<ChargeurRoutePanneau>;

/** Couture de test uniquement : la vraie route pèse 5 200 lignes et parle au réseau. */
export function __setChargeurRoutePanneauForTests(chargeur: ChargeurRoutePanneau | null) {
  chargeurDeRoutePanneau =
    chargeur ??
    ((() => import('~/routes/api.projects.$projectId.ide-panel.$panel')) as unknown as ChargeurRoutePanneau);
}

export { chargerPanneauEnProcessus as __chargerPanneauPourTests };

/*
 * Appel EN PROCESSUS du loader de la route panneau — pas de requête HTTP, donc
 * pas d'aller-retour réseau du tout. L'import est dynamique : la route pèse
 * 5 200 lignes et l'importer au chargement du module créerait un cycle avec
 * `enterprise-api.server`.
 *
 * POURQUOI CELA NE RETARDE PAS LE DOCUMENT. Le bloc ci-dessous est un
 * `Promise.all` : son coût est le MAXIMUM, pas la somme. Mesuré sur connexion
 * réutilisée (plancher réseau ~80-95 ms) :
 *
 *   dashboard      402 / 442 ms   <- déjà le plus lent, de loin
 *   settings       205 / 207 ms
 *   snapshots      148 / 155 ms
 *   collaborators   94 / 105 ms
 *   orgs            98 /  88 ms
 *   workspaces     105 / 107 ms
 *
 * `dashboard` est 2,5x plus lent que le plus lourd des deux ajouts, et ceux-ci
 * n'ont même pas de trajet réseau. Ils terminent largement avant lui.
 *
 * Toute défaillance est avalée : un panneau absent de `initialIdePanels` fait
 * simplement retomber le client sur son chargement actuel. Précharger ne doit
 * JAMAIS pouvoir casser le rendu du document.
 */
async function chargerPanneauEnProcessus(
  request: LoaderFunctionArgs['request'],
  projectId: string,
  panel: string,
  context: AppLoadContext,
): Promise<unknown | null> {
  try {
    const module = await chargeurDeRoutePanneau();

    /*
     * Le projet embarque les types Cloudflare Workers : le `Request` global y
     * est `Request<unknown, CfProperties>`, incompatible en signature avec le
     * `Request` standard qu'attend `LoaderFunctionArgs`. Les deux décrivent le
     * MÊME objet à l'exécution — c'est un désaccord de déclarations, pas de
     * valeurs. Le passage est donc explicite et local, plutôt qu'un
     * `@ts-expect-error` qui masquerait aussi les vraies erreurs de cet appel.
     */
    const response = await module.loader({ request, params: { projectId, panel }, context } as unknown as Parameters<
      typeof module.loader
    >[0]);

    if (!response || typeof (response as Response).json !== 'function') {
      return null;
    }

    const charge = await (response as Response).json();

    /*
     * MÊME prédicat que le cache de panneau côté client, importé et non
     * réécrit : une enveloppe d'erreur n'est pas du contenu. La semer
     * peindrait un panneau vide — c'est BUG-PANEL-CACHE-003, dans l'autre
     * sens. Réécrire la condition ici, c'est se donner deux contrats qui
     * divergeront.
     */
    return isSuccessfulPanelPayload(charge) ? charge : null;
  } catch {
    return null;
  }
}

/*
 * `context` est OPTIONNEL : les appelants qui ne le transmettent pas sautent
 * simplement le préchargement et retombent sur le comportement actuel. Un
 * chemin qui n'en profite pas doit continuer de fonctionner à l'identique —
 * précharger est une optimisation, jamais une condition de rendu.
 */
export async function loadProjectIdeData(
  request: LoaderFunctionArgs['request'],
  projectId: string,
  context?: AppLoadContext,
) {
  const locale = resolveRequestLocale(request);
  const copy = getEnterpriseApiErrorCopy(locale.language);

  if (!projectId) {
    throw new Response(copy.projectMissing, { status: 404, headers: localeResponseHeaders(request, locale) });
  }

  const url = new URL(request.url);

  /*
   * `?workspace=` is the canonical name; `?workspaceId=` is accepted as a
   * tolerant alias so links forwarded from API responses keep working.
   */
  const requestedWorkspaceId = url.searchParams.get('workspace') ?? url.searchParams.get('workspaceId') ?? undefined;

  try {
    const result = await apiRequest<{ project: ProjectLoaderData['project'] }>(request, `/projects/${projectId}`);

    const [collaboratorsResult, dashboardResult, organizationsResult, workspacesResult, panneauxPrecharges] =
      await Promise.all([
        apiRequest<{ collaborators: ProjectLoaderData['collaborators'] }>(
          request,
          `/projects/${projectId}/collaborators`,
        ).catch(() => ({ collaborators: [] })),
        apiRequest<{
          workspace?: ProjectLoaderData['workspace'];
          git?: ProjectLoaderData['git'];
          recentActivity?: ProjectLoaderData['notifications'];
        }>(request, `/projects/${projectId}/dashboard`).catch(() => ({ workspace: null, git: {}, recentActivity: [] })),
        apiRequest<{ organizations: NonNullable<ProjectLoaderData['organization']>[] }>(request, '/orgs').catch(() => ({
          organizations: [],
        })),
        apiRequest<{ workspaces: ProjectWorkspaceSummary[] }>(request, `/projects/${projectId}/workspaces`).catch(
          () => ({
            workspaces: [] as ProjectWorkspaceSummary[],
          }),
        ),
        context
          ? Promise.all(
              PANNEAUX_PRECHARGES.map(
                async (panel) => [panel, await chargerPanneauEnProcessus(request, projectId, panel, context)] as const,
              ),
            )
          : Promise.resolve([] as (readonly [string, unknown | null])[]),
      ]);

    const organization =
      organizationsResult.organizations.find((item) => item.id === result.project.organizationId) ??
      organizationsResult.organizations[0] ??
      null;

    const workspaces = Array.isArray(workspacesResult.workspaces) ? workspacesResult.workspaces : [];
    const { currentWorkspaceId, primaryWorkspaceId } = resolveWorkspaceSelection(workspaces, requestedWorkspaceId);

    /*
     * Mint/refresh the `vc_preview` tenant cookie (Domain=.e-code.ai) so the
     * cross-origin preview host can recognise this authenticated owner — the
     * prerequisite for the private-port gate. No-op (undefined) until
     * PREVIEW_TENANT_SECRET is provisioned, so this is inert dark-launch code.
     */
    const previewCookie = previewTenantCookie(
      organization?.id ?? result.project.organizationId,
      url.hostname,
      Date.now(),
    );

    const headers = localeResponseHeaders(request, locale);

    if (previewCookie) {
      headers.append('Set-Cookie', previewCookie);
    }

    return json<ProjectLoaderData>(
      {
        projectId,
        project: result.project,
        workspace: dashboardResult.workspace ?? null,
        organization,
        git: dashboardResult.git ?? {},
        collaborators: collaboratorsResult.collaborators ?? [],
        notifications: dashboardResult.recentActivity ?? [],
        initialIdePanels: {
          git: {
            panel: 'git',
            project: result.project,
            status: 'ok',
            data: { status: dashboardResult.git ?? {} },
          },
          ...Object.fromEntries(panneauxPrecharges.filter(([, charge]) => charge !== null)),
        },
        workspaces,
        currentWorkspaceId,
        primaryWorkspaceId,
      },
      { headers },
    );
  } catch (error) {
    /*
     * Re-throw definitive client-facing failures so React Router handles them:
     * 3xx login/MFA redirects (it only navigates when a loader *throws* such a
     * Response) and 4xx answers — 401 expired session, 403 no permission, 404
     * project not found. Folding a 403/404 into the soft shell below would render
     * broken IDE chrome that confirms and displays the raw project id instead of
     * a clean forbidden/not-found page. Only transient 5xx / network failures
     * fall through to the recoverable soft shell.
     */
    if (shouldRethrowResolveError(error)) {
      throw error;
    }

    const message = await apiErrorMessage(error, copy.requestFailed);

    return json<ProjectLoaderData>(
      {
        projectId,
        project: { id: projectId, name: projectId },
        workspace: null,
        organization: null,
        git: {},
        collaborators: [],
        notifications: [],
        initialIdePanels: {},
        workspaces: [],
        projectApiError: message,
      },
      { headers: localeResponseHeaders(request, locale) },
    );
  }
}

function resolveWorkspaceSelection(workspaces: ProjectWorkspaceSummary[], requestedWorkspaceId: string | undefined) {
  /*
   * Workspaces from /workspaces come back DESC by createdAt. The primary is the
   * oldest, so we sort ascending and take the first entry. Picking the primary
   * by default means freshly opening the IDE lands on the canonical working
   * tree rather than whatever experimental branch was created last.
   */
  const orderedByCreated = [...workspaces].sort((a, b) =>
    String(a?.createdAt ?? '').localeCompare(String(b?.createdAt ?? '')),
  );

  const primaryWorkspaceId = orderedByCreated[0]?.id;

  const requestedIsKnown =
    requestedWorkspaceId && workspaces.some((workspace) => workspace?.id === requestedWorkspaceId);

  const currentWorkspaceId = requestedIsKnown ? requestedWorkspaceId : primaryWorkspaceId;

  return { currentWorkspaceId, primaryWorkspaceId };
}
