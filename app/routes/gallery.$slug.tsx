import { ArrowLeft, ExternalLink, Flag, GitFork, Eye, Loader2, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useLoaderData, useNavigation } from 'react-router';
import { useActionData } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  apiErrorMessage,
  apiRequest,
  isApiResponse,
  json,
  redirect,
  safeReturnTo,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

/*
 * Gallery detail (TPL-02). CONFIRMED replit.com/gallery/work/… surface: title,
 * author, description, public stats ("Views N" / "Used N times"), an outbound
 * "View App" link, a Remix CTA, and a Report (Trust & Safety) affordance. The
 * Remix POST is the wired path: authenticated → the API clones the listing's
 * PINNED snapshot into the user's org and we redirect into the IDE on the clone.
 */

type GalleryDetail = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  featured: boolean;
  author: string;
  appUrl: string | null;

  /* License + fork rights (P0-V3-05): what a remixer accepts, versioned. */
  remixAllowed: boolean;
  license: { id: string; textSha256: string | null } | null;
  licenseText: string | null;
  piiHandling: { mode: 'MASKED' } | { mode: 'AUTHOR_CONSENT'; consentVersion: string };
  remixConsentVersion: string;
  views: number;
  uses: number;
  publishedAt: string | null;
};

type Organization = { id: string; slug?: string };

const fullNumber = new Intl.NumberFormat('en-US');

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const title = data?.listing?.title ? `${data.listing.title} - Gallery - E-Code` : 'Gallery - E-Code';
  return [
    { title },
    { name: 'description', content: data?.listing?.description ?? 'An app published to the E-Code Gallery.' },
  ];
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const slug = params.slug!;

  try {
    const { listing } = await apiRequest<{ listing: GalleryDetail }>(request, `/gallery/${encodeURIComponent(slug)}`, {
      redirectOn401: false,
    });

    return json({ listing });
  } catch (error) {
    if (isApiResponse(error) && error.status === 404) {
      throw new Response('Not found', { status: 404 });
    }

    throw error;
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const slug = params.slug!;
  const returnTo = `/gallery/${slug}`;

  /*
   * Remixing needs an account. Resolve the caller's org WITHOUT forcing a bare
   * login redirect (redirectOn401:false), so an anonymous visitor is sent to
   * sign-in with a returnTo back to this listing — then can remix in one click.
   */
  let organization: Organization | null = null;

  try {
    const { organizations } = await apiRequest<{ organizations: Organization[] }>(request, '/orgs', {
      redirectOn401: false,
    });
    organization = organizations[0] ?? null;
  } catch (error) {
    if (!isApiResponse(error)) {
      throw error;
    }

    // 401/403 → treat as signed-out below.
  }

  if (!organization) {
    return redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo) ?? '/gallery')}`);
  }

  /*
   * The consent is an explicit INPUT (I-RMX-3): the checkbox posts
   * acceptLicense, and the API refuses the remix without it — the server is
   * the enforcement point, the UI only makes the acceptance informed.
   */
  const form = await request.formData();
  const acceptLicense = form.get('acceptLicense') === 'on' || form.get('acceptLicense') === 'true';

  try {
    const result = await apiRequest<{ project: { id: string; slug?: string } }>(
      request,
      `/gallery/${encodeURIComponent(slug)}/remix`,
      {
        method: 'POST',
        body: JSON.stringify({ organizationId: organization.id, acceptLicense }),
      },
    );

    // Clone created — open the IDE on it.
    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      return json(
        { error: await apiErrorMessage(error, 'Could not remix this app. Please try again.') },
        { status: error.status },
      );
    }

    throw error;
  }
}

export default function GalleryDetailRoute() {
  const { listing } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as { error?: string } | undefined;
  const navigation = useNavigation();
  const remixing = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [licenseAccepted, setLicenseAccepted] = useState(false);

  return (
    <PublicShell>
      <main
        className="bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-public-resource-page="gallery-detail"
      >
        <div className="container-responsive py-10 sm:py-14">
          <Link
            to="/gallery"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ecode-text-secondary)] hover:text-[var(--ecode-accent)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to gallery
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ecode-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ecode-text-secondary)]">
                {listing.category}
              </span>
              <h1 className="mt-4 text-[28px] font-bold leading-tight text-[var(--ecode-text)] sm:text-[34px]">
                {listing.title}
              </h1>
              <p className="mt-2 text-[14px] text-[var(--ecode-text-muted)]">by {listing.author}</p>

              <p className="mt-6 max-w-2xl text-[15px] leading-7 text-[var(--ecode-text-secondary)]">
                {listing.description}
              </p>

              {listing.tags.length > 0 ? (
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {listing.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[var(--ecode-surface)] px-2.5 py-1 text-[12px] text-[var(--ecode-text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Action rail */}
            <aside className="rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-6">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)]">
                    <Eye className="h-4 w-4" aria-hidden />
                    Views
                  </dt>
                  <dd className="mt-1 text-[20px] font-bold text-[var(--ecode-text)]">
                    {fullNumber.format(listing.views)}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)]">
                    <GitFork className="h-4 w-4" aria-hidden />
                    Used
                  </dt>
                  <dd className="mt-1 text-[20px] font-bold text-[var(--ecode-text)]">
                    {fullNumber.format(listing.uses)} {listing.uses === 1 ? 'time' : 'times'}
                  </dd>
                </div>
              </dl>

              {/* License + data-handling disclosure (P0-V3-05): what a remixer accepts. */}
              <div
                className="mt-6 rounded-lg border border-[var(--ecode-border)] bg-[var(--ecode-background)] p-4"
                data-testid="gallery-license"
              >
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--ecode-text-secondary)]">
                  <Scale className="h-4 w-4" aria-hidden />
                  License
                </p>
                <p className="mt-1 text-[13px] text-[var(--ecode-text)]" data-testid="gallery-license-id">
                  {listing.license ? listing.license.id : 'No license specified by the author'}
                </p>
                {listing.licenseText ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] text-[var(--ecode-text-muted)] hover:text-[var(--ecode-text-secondary)]">
                      Read the license text
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--ecode-surface)] p-3 text-[11px] leading-4 text-[var(--ecode-text-secondary)]">
                      {listing.licenseText}
                    </pre>
                  </details>
                ) : null}
                <p
                  className="mt-3 flex items-start gap-1.5 text-[12px] leading-5 text-[var(--ecode-text-muted)]"
                  data-testid="gallery-pii-handling"
                >
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {listing.piiHandling.mode === 'MASKED'
                    ? 'Personal data (emails, phone numbers, payment identifiers) found in the source files is masked in your copy.'
                    : 'The author explicitly consented to share the app data as-is (consent ' +
                      listing.piiHandling.consentVersion +
                      ').'}
                </p>
              </div>

              {listing.remixAllowed ? (
                <Form method="post" className="mt-4">
                  <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-5 text-[var(--ecode-text-secondary)]">
                    <input
                      type="checkbox"
                      name="acceptLicense"
                      checked={licenseAccepted}
                      onChange={(event) => setLicenseAccepted(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--ecode-accent)]"
                      data-testid="gallery-consent"
                    />
                    <span>
                      I accept the license terms above and the data-handling policy (consent{' '}
                      {listing.remixConsentVersion}
                      ).
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={remixing || !licenseAccepted}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ecode-accent)] px-5 py-3 text-[15px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="gallery-remix"
                  >
                    {remixing ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <GitFork className="h-4 w-4" aria-hidden />
                    )}
                    {remixing ? 'Remixing…' : 'Remix this app'}
                  </button>
                </Form>
              ) : (
                <p
                  className="mt-4 rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-background)] px-3 py-2 text-[13px] text-[var(--ecode-text-muted)]"
                  data-testid="gallery-remix-disabled"
                >
                  The author has not allowed this app to be remixed.
                </p>
              )}

              {actionData?.error ? (
                <p className="mt-3 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-[13px] text-[var(--status-error-text)]">
                  {actionData.error}
                </p>
              ) : null}

              {listing.appUrl ? (
                <a
                  href={listing.appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--ecode-border)] px-5 py-3 text-[15px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)]"
                  data-testid="gallery-view-app"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  View app
                </a>
              ) : null}

              <p className="mt-4 text-[12px] leading-5 text-[var(--ecode-text-muted)]">
                Remixing creates a private copy in your workspace. Secrets from the original are never copied, and
                personal data is masked unless the author consented to share it.
              </p>

              <a
                href={`mailto:trust-safety@e-code.ai?subject=${encodeURIComponent(`Report gallery app: ${listing.slug}`)}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)] hover:text-[var(--ecode-text-secondary)]"
                data-testid="gallery-report"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden />
                Report this app
              </a>
            </aside>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
