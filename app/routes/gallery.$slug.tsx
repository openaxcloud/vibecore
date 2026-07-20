import { randomUUID } from 'node:crypto';
import { CalendarDays, ExternalLink, Flag, GitFork, Layers3 } from 'lucide-react';
import { Form, Link, useActionData, useLoaderData, useNavigation, type MetaFunction } from 'react-router';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { Button } from '~/components/ui/Button';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

type GalleryDetailApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: { displayName: string; handle: string; avatarUrl?: string };
  artifactType: string;
  category: string;
  technologies: string[];
  thumbnailUrl: string;
  previewUrl?: string;
  allowRemix: boolean;
  featured: boolean;
  remixCount: number;
  reportCount: number;
  publishedAt?: string;
  provenance?: { sourceGalleryAppId: string; sourceGalleryAppSlug: string };
};

type ActionData = { error?: string };

const RESTRICTED_PREVIEW_SANDBOX = 'allow-forms allow-modals allow-popups allow-scripts';
const FUNCTIONAL_PREVIEW_SANDBOX = `${RESTRICTED_PREVIEW_SANDBOX} allow-same-origin`;

export function galleryPreviewSandbox(input: { appId: string; previewUrl?: string; requestUrl: string }) {
  if (!input.previewUrl) return RESTRICTED_PREVIEW_SANDBOX;

  const isTrustedBuiltIn = input.appId.startsWith('demo:') && input.previewUrl.startsWith('/gallery-apps/');

  try {
    const preview = new URL(input.previewUrl, input.requestUrl);
    const product = new URL(input.requestUrl);
    const isIsolatedOrigin = preview.protocol === 'https:' && preview.origin !== product.origin;

    // `allow-same-origin` is required by Vite/Next module graphs. It is safe for
    // immutable code-owned demos and for deployments isolated from the product
    // origin, but never for user-controlled HTML served on the product origin.
    return isTrustedBuiltIn || isIsolatedOrigin ? FUNCTIONAL_PREVIEW_SANDBOX : RESTRICTED_PREVIEW_SANDBOX;
  } catch {
    return RESTRICTED_PREVIEW_SANDBOX;
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? `${data.app.name} — Community Gallery` : 'Community Gallery — E-Code' },
  ...(data ? [{ name: 'description', content: data.app.description }] : []),
];

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const slug = params.slug?.trim();
  if (!slug) throw new Response('Gallery application not found', { status: 404 });

  const [organization, payload] = await Promise.all([
    firstOrganization(request),
    apiRequest<{ app: GalleryDetailApp }>(request, `/gallery/apps/${encodeURIComponent(slug)}`),
  ]);

  return json({
    organization,
    app: payload.app,
    previewSandbox: galleryPreviewSandbox({
      appId: payload.app.id,
      previewUrl: payload.app.previewUrl,
      requestUrl: request.url,
    }),
  });
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const slug = params.slug?.trim();
  const form = await request.formData();
  if (!slug || form.get('intent') !== 'remix')
    return json<ActionData>({ error: 'Unknown Gallery action.' }, { status: 400 });

  try {
    const organization = await firstOrganization(request);
    const appId = String(form.get('appId') ?? '').trim();
    const name = String(form.get('name') ?? '').trim();
    if (!appId || !name) return json<ActionData>({ error: 'Application not found.' }, { status: 400 });

    const result = await apiRequest<{ projectId: string }>(
      request,
      `/organizations/${organization.id}/gallery/apps/${encodeURIComponent(appId)}/remix`,
      {
        method: 'POST',
        headers: { 'Idempotency-Key': `gallery-detail-${randomUUID()}` },
        body: JSON.stringify({ name: `${name} Remix` }),
      },
    );

    return redirect(projectIdePath({ id: result.projectId, organizationSlug: organization.slug }));
  } catch (error) {
    if (shouldRethrowActionError(error)) throw error;
    if (isApiResponse(error)) {
      return json<ActionData>(
        { error: await apiErrorMessage(error, 'The application could not be remixed.') },
        { status: error.status },
      );
    }
    throw error;
  }
}

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export function HydrateFallback() {
  return (
    <AppShell title="Community Gallery" description="Loading the published application and its verified Preview.">
      <AsyncPanelSkeleton label="Loading Gallery application" rows={6} />
    </AppShell>
  );
}

export default function GalleryAppDetailPage() {
  const { app, previewSandbox } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const remixing = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'remix';
  const publishedDate = app.publishedAt
    ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(app.publishedAt))
    : 'Publication date unavailable';

  return (
    <AppShell
      title={app.name}
      description={app.description}
      actions={
        <>
          <LinkButton to="/dashboard/templates" variant="outline">
            Back to Gallery
          </LinkButton>
          {app.previewUrl ? (
            <Button variant="outline" _asChild>
              <a href={app.previewUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden /> Open Preview
              </a>
            </Button>
          ) : null}
        </>
      }
    >
      {actionData?.error ? (
        <AsyncPanelError title="Remix failed" description={actionData.error} compact className="mb-5" />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(19rem,0.6fr)]">
        <section className="overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
          <div className="aspect-[16/9] min-h-[320px] bg-bolt-elements-background-depth-1">
            {app.previewUrl ? (
              <iframe
                src={app.previewUrl}
                title={`${app.name} live Preview`}
                className="h-full w-full border-0 bg-white"
                sandbox={previewSandbox}
                referrerPolicy="no-referrer"
              />
            ) : (
              <img src={app.thumbnailUrl} alt={`Preview of ${app.name}`} className="h-full w-full object-cover" />
            )}
          </div>
        </section>

        <aside className="rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bolt-elements-background-depth-3 text-sm font-bold">
              {app.author.displayName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{app.author.displayName}</p>
              <p className="truncate text-xs text-bolt-elements-textTertiary">@{app.author.handle}</p>
            </div>
          </div>

          <dl className="mt-5 grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bolt-elements-textTertiary">Artifact</dt>
              <dd>{app.artifactType.replaceAll('_', ' ')}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-bolt-elements-textTertiary">Category</dt>
              <dd>{app.category}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-bolt-elements-textTertiary">
                <CalendarDays className="h-4 w-4" aria-hidden />
                Published
              </dt>
              <dd>{publishedDate}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="flex items-center gap-1.5 text-bolt-elements-textTertiary">
                <GitFork className="h-4 w-4" aria-hidden />
                Remixes
              </dt>
              <dd>{app.remixCount.toLocaleString()}</dd>
            </div>
            {app.reportCount ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-1.5 text-bolt-elements-textTertiary">
                  <Flag className="h-4 w-4" aria-hidden />
                  Reports
                </dt>
                <dd>{app.reportCount.toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5 flex flex-wrap gap-2" aria-label="Technologies">
            {app.technologies.map((technology) => (
              <span
                key={technology}
                className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-1 text-xs"
              >
                {technology}
              </span>
            ))}
          </div>

          {app.provenance ? (
            <p className="mt-5 text-sm text-bolt-elements-textSecondary">
              <Layers3 className="mr-1.5 inline h-4 w-4" aria-hidden />
              Remixed from{' '}
              <Link
                className="underline underline-offset-2"
                to={`/gallery/${encodeURIComponent(app.provenance.sourceGalleryAppSlug)}`}
              >
                {app.provenance.sourceGalleryAppSlug}
              </Link>
            </p>
          ) : null}

          <Form method="post" className="mt-6">
            <input type="hidden" name="intent" value="remix" />
            <input type="hidden" name="appId" value={app.id} />
            <input type="hidden" name="name" value={app.name} />
            <Button
              type="submit"
              variant="primary"
              className="min-h-11 w-full gap-2"
              disabled={!app.allowRemix || remixing}
              aria-busy={remixing || undefined}
            >
              <GitFork className="h-4 w-4" aria-hidden />
              {!app.allowRemix ? 'Remix disabled' : remixing ? 'Remixing…' : 'Remix this app'}
            </Button>
          </Form>
        </aside>
      </div>
    </AppShell>
  );
}
