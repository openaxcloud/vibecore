import { ArrowLeft, ExternalLink, Flag, GitFork, Eye, Loader2, Scale, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Form, Link, useLoaderData, useNavigation } from 'react-router';
import { useActionData } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import {
  apiRequest,
  isApiResponse,
  json,
  redirect,
  safeReturnTo,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatPublicGalleryCopy,
  formatPublicGalleryNumber,
  getPublicGalleryCopy,
  selectPublicGalleryPlural,
} from '~/lib/i18n/catalogs/public-gallery';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';
import { MARKETING_SITE_URL } from '~/utils/social-meta';

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
  thumbnailUrl: string | null;

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

const REPORT_SUBJECT_PREFIX = 'Report gallery app:';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getPublicGalleryCopy(data?.language);

  const title = data?.listing?.title
    ? formatPublicGalleryCopy(copy['publicGallery.detail.meta.title'], { title: data.listing.title })
    : copy['publicGallery.detail.meta.fallbackTitle'];

  const description = data?.listing?.description ?? copy['publicGallery.detail.meta.fallbackDescription'];

  const canonical = data?.listing?.slug
    ? `${MARKETING_SITE_URL}/gallery/${encodeURIComponent(data.listing.slug)}`
    : `${MARKETING_SITE_URL}/gallery`;

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: data?.language === 'fr' ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: data?.language === 'fr' ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  const language = resolveRequestLocale(request).language;
  const copy = getPublicGalleryCopy(language);
  const slug = params.slug;

  if (!slug) {
    throw json({ error: copy['publicGallery.detail.error.notFound'] }, { status: 404 });
  }

  try {
    const { listing } = await apiRequest<{ listing: GalleryDetail }>(request, `/gallery/${encodeURIComponent(slug)}`, {
      redirectOn401: false,
    });

    return json({ listing, language });
  } catch (error) {
    if (isApiResponse(error) && error.status === 404) {
      throw json({ error: copy['publicGallery.detail.error.notFound'] }, { status: 404 });
    }

    console.error('Gallery detail loader failed:', error);
    throw json({ error: copy['publicGallery.detail.error.unavailable'] }, { status: 503 });
  }
}

export async function action({ request, params }: EnterpriseActionArgs) {
  const language = resolveRequestLocale(request).language;
  const copy = getPublicGalleryCopy(language);
  const slug = params.slug;

  if (!slug) {
    return json({ error: copy['publicGallery.detail.error.notFound'] }, { status: 404 });
  }

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
      console.error('Gallery organization lookup failed:', error);
      return json({ error: copy['publicGallery.detail.error.unavailable'] }, { status: 503 });
    }

    if (error.status !== 401 && error.status !== 403) {
      return json({ error: copy['publicGallery.detail.error.unavailable'] }, { status: error.status });
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
  const submittedKey = form.get('idempotencyKey');

  const idempotencyKey =
    typeof submittedKey === 'string' && submittedKey.trim().length >= 8
      ? submittedKey.trim()
      : globalThis.crypto.randomUUID();

  try {
    const result = await apiRequest<{
      project: { id: string; slug?: string } | null;
      remix: { id?: string; remixJobId?: string; state: string };
      retryAfterMs?: number;
    }>(request, `/gallery/${encodeURIComponent(slug)}/remix`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ organizationId: organization.id, acceptLicense, idempotencyKey }),
    });

    if (!result.project) {
      return json({
        pending: true,
        idempotencyKey,
        remixState: result.remix.state,
        retryAfterMs: result.retryAfterMs ?? 2_000,
      });
    }

    // Clone created — open the IDE on it.
    return redirect(
      projectIdePath({ id: result.project.id, slug: result.project.slug, organizationSlug: organization.slug }),
    );
  } catch (error) {
    if (shouldRethrowActionError(error)) {
      throw error;
    }

    console.error('Gallery remix failed:', error);

    return json(
      { error: copy['publicGallery.detail.error.remixFailed'] },
      { status: isApiResponse(error) ? error.status : 503 },
    );
  }
}

export default function GalleryDetailRoute() {
  const { i18n } = useTranslation();
  const { listing, language: loadedLanguage } = useLoaderData<typeof loader>();
  const language = i18n.resolvedLanguage ?? i18n.language ?? loadedLanguage;
  const copy = getPublicGalleryCopy(language);

  const actionData = useActionData<typeof action>() as
    | { error?: string; pending?: boolean; idempotencyKey?: string; remixState?: string }
    | undefined;

  const navigation = useNavigation();
  const remixing = navigation.state !== 'idle' && navigation.formMethod === 'POST';
  const [licenseAccepted, setLicenseAccepted] = useState(false);

  return (
    <PublicShell>
      <main
        className="min-w-0 bg-[var(--ecode-background)] text-[var(--ecode-text)]"
        data-public-resource-page="gallery-detail"
      >
        <div className="container-responsive py-10 sm:py-14">
          <Link
            to="/gallery"
            className="inline-flex min-h-[44px] items-center gap-2 text-[13px] font-semibold text-[var(--ecode-text-secondary)] hover:text-[var(--ecode-accent)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {copy['publicGallery.detail.back']}
          </Link>

          <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            {/* Main column */}
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ecode-border)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ecode-text-secondary)]">
                {listing.category}
              </span>
              <h1 className="mt-4 break-words text-[28px] font-bold leading-tight text-[var(--ecode-text)] [overflow-wrap:anywhere] sm:text-[34px]">
                {listing.title}
              </h1>
              <p className="mt-2 break-words text-[14px] text-[var(--ecode-text-muted)]">
                {formatPublicGalleryCopy(copy['publicGallery.detail.author'], { author: listing.author })}
              </p>

              {listing.thumbnailUrl ? (
                <img
                  src={listing.thumbnailUrl}
                  alt={formatPublicGalleryCopy(copy['publicGallery.detail.previewAlt'], {
                    title: listing.title,
                  })}
                  width={1200}
                  height={675}
                  className="mt-6 aspect-[16/9] w-full rounded-xl border border-[var(--ecode-border)] bg-[var(--ecode-background)] object-cover"
                  data-testid="gallery-detail-thumb"
                />
              ) : null}

              <p className="mt-6 max-w-2xl break-words text-[15px] leading-7 text-[var(--ecode-text-secondary)] [overflow-wrap:anywhere]">
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
            <aside className="min-w-0 rounded-2xl border border-[var(--ecode-border)] bg-[var(--ecode-surface)] p-4 sm:p-6">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)]">
                    <Eye className="h-4 w-4" aria-hidden />
                    {copy['publicGallery.detail.views']}
                  </dt>
                  <dd className="mt-1 text-[20px] font-bold text-[var(--ecode-text)]">
                    {formatPublicGalleryNumber(language, listing.views)}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)]">
                    <GitFork className="h-4 w-4" aria-hidden />
                    {copy['publicGallery.detail.usedLabel']}
                  </dt>
                  <dd className="mt-1 text-[20px] font-bold text-[var(--ecode-text)]">
                    {formatPublicGalleryCopy(
                      copy[`publicGallery.detail.used_${selectPublicGalleryPlural(language, listing.uses)}`],
                      { count: formatPublicGalleryNumber(language, listing.uses) },
                    )}
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
                  {copy['publicGallery.detail.license']}
                </p>
                <p className="mt-1 text-[13px] text-[var(--ecode-text)]" data-testid="gallery-license-id">
                  {listing.license ? listing.license.id : copy['publicGallery.detail.licenseMissing']}
                </p>
                {listing.licenseText ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-[12px] text-[var(--ecode-text-muted)] hover:text-[var(--ecode-text-secondary)]">
                      {copy['publicGallery.detail.licenseRead']}
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
                    ? copy['publicGallery.detail.piiMasked']
                    : formatPublicGalleryCopy(copy['publicGallery.detail.piiConsent'], {
                        version: listing.piiHandling.consentVersion,
                      })}
                </p>
              </div>

              {listing.remixAllowed ? (
                <Form
                  method="post"
                  className="mt-4"
                  onSubmit={(event) => {
                    const input = event.currentTarget.elements.namedItem('idempotencyKey');

                    if (input instanceof HTMLInputElement && !input.value) {
                      input.value = globalThis.crypto.randomUUID();
                    }
                  }}
                >
                  <input type="hidden" name="idempotencyKey" defaultValue={actionData?.idempotencyKey ?? ''} />
                  <label className="flex min-h-[44px] cursor-pointer items-start gap-2 py-1 text-[12px] leading-5 text-[var(--ecode-text-secondary)]">
                    <input
                      type="checkbox"
                      name="acceptLicense"
                      checked={licenseAccepted}
                      onChange={(event) => setLicenseAccepted(event.target.checked)}
                      className="mt-0.5 h-4 w-4 accent-[var(--ecode-accent)]"
                      data-testid="gallery-consent"
                    />
                    <span className="min-w-0 break-words">
                      {formatPublicGalleryCopy(copy['publicGallery.detail.acceptLicense'], {
                        version: listing.remixConsentVersion,
                      })}
                    </span>
                  </label>
                  <button
                    type="submit"
                    disabled={remixing || !licenseAccepted}
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal rounded-lg bg-[var(--vc-action-primary-strong)] px-5 py-3 text-center text-[15px] font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    data-testid="gallery-remix"
                  >
                    {remixing ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <GitFork className="h-4 w-4" aria-hidden />
                    )}
                    {remixing ? copy['publicGallery.detail.remixing'] : copy['publicGallery.detail.remix']}
                  </button>
                </Form>
              ) : (
                <p
                  className="mt-4 rounded-md border border-[var(--ecode-border)] bg-[var(--ecode-background)] px-3 py-2 text-[13px] text-[var(--ecode-text-muted)]"
                  data-testid="gallery-remix-disabled"
                >
                  {copy['publicGallery.detail.remixDisabled']}
                </p>
              )}

              {actionData?.error ? (
                <p
                  className="mt-3 break-words rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-2 text-[13px] text-[var(--status-error-text)]"
                  role="alert"
                >
                  {actionData.error}
                </p>
              ) : null}

              {actionData?.pending ? (
                <p
                  className="mt-3 break-words rounded-md border border-[var(--status-info-border)] bg-[var(--status-info-bg)] px-3 py-2 text-[13px] text-[var(--status-info-text)]"
                  role="status"
                  data-testid="gallery-remix-pending"
                >
                  {copy['publicGallery.detail.remixPending']}
                </p>
              ) : null}

              {listing.appUrl ? (
                <a
                  href={listing.appUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 whitespace-normal rounded-lg border border-[var(--ecode-border)] px-5 py-3 text-center text-[15px] font-semibold text-[var(--ecode-text)] transition hover:border-[var(--ecode-accent)]"
                  data-testid="gallery-view-app"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  {copy['publicGallery.detail.viewApp']}
                </a>
              ) : null}

              <p className="mt-4 text-[12px] leading-5 text-[var(--ecode-text-muted)]">
                {copy['publicGallery.detail.copyDisclosure']}
              </p>

              <a
                href={`mailto:trust-safety@e-code.ai?subject=${encodeURIComponent(`${REPORT_SUBJECT_PREFIX} ${listing.slug}`)}`}
                className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-[12px] text-[var(--ecode-text-muted)] hover:text-[var(--ecode-text-secondary)]"
                data-testid="gallery-report"
              >
                <Flag className="h-3.5 w-3.5" aria-hidden />
                {copy['publicGallery.detail.report']}
              </a>
            </aside>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
