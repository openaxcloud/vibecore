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

import type { LoaderFunctionArgs, MetaFunction } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { useLoaderData } from '@remix-run/react';

import { apiRequest, isApiResponse, redirect } from '~/lib/enterprise-api.server';
import { legacyProjectIdePath } from '~/utils/project-url';

interface RedeemResponse {
  valid: boolean;
  redeemed: boolean;
  share: { projectId: string; projectName?: string; organizationId: string; roleKey: string; expiresAt?: string };
}

interface LoaderData {
  error?: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const token = params.token ?? '';

  if (!token) {
    return json<LoaderData>({ error: 'Missing share token.' }, { status: 400 });
  }

  try {
    const result = await apiRequest<RedeemResponse>(
      request as unknown as Request,
      `/collaboration/share-links/${encodeURIComponent(token)}`,
    );

    // Redeemed (or already a collaborator) — drop the user into the project.
    return redirect(legacyProjectIdePath(result.share.projectId));
  } catch (error) {
    if (isApiResponse(error, 404)) {
      return json<LoaderData>(
        { error: 'This share link is invalid, expired, or has been revoked.' },
        { status: 404 },
      );
    }

    // `apiRequest` throws a redirect Response (e.g. → /login on 401) for page
    // navigations; that and any other thrown Response must propagate.
    if (error instanceof Response) {
      throw error;
    }

    return json<LoaderData>({ error: 'Failed to redeem the share link.' }, { status: 502 });
  }
};

export const meta: MetaFunction = () => [{ title: 'Project share · Vibecore' }];

export default function ProjectShareRedeemRoute() {
  const { error } = useLoaderData<typeof loader>() as LoaderData;

  return (
    <main className="bolt-share-view bolt-share-view-error" role="alert">
      <h1>Share link unavailable</h1>
      <p>{error ?? 'The share link could not be redeemed.'}</p>
    </main>
  );
}
