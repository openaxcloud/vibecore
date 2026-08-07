/**
 * Redeems a project share link.
 *
 * Project share-link tokens are minted by `POST
 * /projects/:id/collaboration/share-links` and consumed by `GET
 * /collaboration/share-links/:token`, which grants the link's role on the
 * project to the authenticated recipient. Previously the IDE pointed share
 * URLs at `/share/<token>` — the *chat*-share viewer — so a project share link
 * could never be redeemed (its token has no HMAC signature and failed the chat
 * verifier). This route is the real redeem surface: it requires login (handled
 * by `apiRequest`'s 401 → login redirect), redeems the link, and forwards the
 * user straight into the project IDE.
 */

import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { data as json } from 'react-router';
import { isRouteErrorResponse, useLoaderData, useRouteError } from 'react-router';

import type { ShareLinkErrorKind } from '~/components/share/ShareLinkErrorView';
import { ShareLinkErrorView } from '~/components/share/ShareLinkErrorView';
import { apiRequest, isApiResponse, redirect } from '~/lib/enterprise-api.server';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';
import { legacyProjectIdePath } from '~/utils/project-url';

interface RedeemResponse {
  valid: boolean;
  redeemed: boolean;
  share: { projectId: string; projectName?: string; organizationId: string; roleKey: string; expiresAt?: string };
}

interface LoaderData {
  /*
   * Typed error state (G29). `GET /collaboration/share-links/:token`
   * distinguishes `SHARE_LINK_INVALID` (unknown token, expired, or revoked —
   * the store collapses those into one 404) from `SHARE_LINK_PROJECT_MISSING`
   * (link valid but the project was deleted). Each maps to branded copy
   * rendered inside PublicShell.
   */
  errorKind?: ShareLinkErrorKind;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const localeResolution = resolveRequestLocale(request);
  const token = params.token ?? '';

  if (!token) {
    return json<LoaderData>(
      { errorKind: 'invalid' },
      { status: 400, headers: localeResponseHeaders(request, localeResolution) },
    );
  }

  try {
    const result = await apiRequest<RedeemResponse>(
      request as unknown as Request,
      `/collaboration/share-links/${encodeURIComponent(token)}`,
    );

    /* Redeemed (or already a collaborator) - drop the user into the project. */
    return redirect(legacyProjectIdePath(result.share.projectId), {
      headers: localeResponseHeaders(request, localeResolution),
    });
  } catch (error) {
    if (isApiResponse(error, 404)) {
      /*
       * Read the API error code to tell "link gone" from "project gone".
       * `apiRequest` re-wraps the upstream body as `{ ok, error, code }`,
       * where `error` carries the upstream `error` field — here the object
       * `{ code, message }` sent by the share-links endpoint.
       */
      let code: string | undefined;

      try {
        const body = (await error.clone().json()) as { error?: { code?: string } | string };
        code = typeof body.error === 'object' && body.error ? body.error.code : undefined;
      } catch {
        code = undefined;
      }

      return json<LoaderData>(
        { errorKind: code === 'SHARE_LINK_PROJECT_MISSING' ? 'project-missing' : 'not-found' },
        { status: 404, headers: localeResponseHeaders(request, localeResolution) },
      );
    }

    /*
     * `apiRequest` throws a redirect Response (e.g. -> /login on 401) for page
     * navigations; that and any other thrown Response must propagate. Non-3xx
     * Responses land in this route's ErrorBoundary below (branded), no longer
     * the bare root boundary.
     */
    if (error instanceof Response) {
      throw error;
    }

    return json<LoaderData>(
      { errorKind: 'unavailable' },
      { status: 502, headers: localeResponseHeaders(request, localeResolution) },
    );
  }
};

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getRemainingRouteShellsCopy(rootData?.language);

  return buildRemainingRouteMeta({
    title: copy['remainingRoutes.projectShare.title'],
    description: copy['remainingRoutes.projectShare.description'],
    path: '/projects/share',
    language: rootData?.language,
    noindex: true,
  });
};

/*
 * Catches thrown Responses (unexpected API failures rethrown by the loader)
 * and render errors, keeping them inside the branded PublicShell.
 */
export function ErrorBoundary() {
  const error = useRouteError();

  return (
    <ShareLinkErrorView kind={isRouteErrorResponse(error) && error.status === 404 ? 'not-found' : 'unavailable'} />
  );
}

export default function ProjectShareRedeemRoute() {
  const { errorKind } = useLoaderData<typeof loader>() as LoaderData;

  /*
   * The happy path redirects from the loader, so this component only ever
   * renders an error state.
   */
  return <ShareLinkErrorView kind={errorKind ?? 'unavailable'} />;
}
