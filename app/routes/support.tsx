import { billingEnabled } from '@vibecore/billing';
import { Clock, LifeBuoy, MessageSquare, ShieldAlert } from 'lucide-react';
import type { MetaFunction } from 'react-router';
import { Form, Link, useActionData, useLoaderData, useNavigation, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { Badge } from '~/components/ui/Badge';
import { Button } from '~/components/ui/Button';
import { RelativeTime } from '~/components/ui/RelativeTime';
import {
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  formatSupportResponseTarget,
  getSupportCopy,
  resolveSupportLanguage,
  supportActionErrorMessage,
  supportCategoryLabel,
  supportTicketStatusLabel,
  type SupportActionErrorCode,
  type SupportCategory,
  type SupportCopy,
  type SupportLanguage,
  type SupportResponseUnit,
} from '~/lib/i18n/catalogs/support';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type Ticket = { id: string; subject: string; status: string; category?: string; createdAt?: string };

/**
 * Mirrors SUPPORT_TICKET_CATEGORIES in services/api/src/app.ts (the create
 * route validates against that enum).
 */
const TICKET_CATEGORIES = [
  'runtime',
  'billing',
  'security',
  'account',
  'other',
] as const satisfies readonly SupportCategory[];

/**
 * Target first-response times per plan tier, keyed off the credit plan
 * catalog (packages/billing `creditPlanCatalog`: starter/core/pro/enterprise).
 *
 * ⚠️ These are TARGETS, not contractual SLAs — no support policy document
 * exists in the repo yet, so the figures below are provisional and pending
 * business validation (design handoff E18). Edit this constant once the real
 * policy is decided; the table renders from it alone.
 */
const SUPPORT_RESPONSE_TARGETS = [
  { key: 'starter', value: 2, unit: 'businessDay' },
  { key: 'core', value: 1, unit: 'businessDay' },
  { key: 'pro', value: 8, unit: 'businessHour' },
  { key: 'enterprise', value: 4, unit: 'businessHour' },
] as const satisfies readonly { key: string; value: number; unit: SupportResponseUnit }[];

type SupportTierKey = (typeof SUPPORT_RESPONSE_TARGETS)[number]['key'];

/**
 * Fold the billing endpoint's plan key (legacy keys free/pro/team/enterprise
 * or credit keys) onto the tier keys used by SUPPORT_RESPONSE_TARGETS, same
 * folding as packages/billing `toCreditPlanKey` (free→starter, team→pro).
 * Unknown keys highlight nothing rather than guessing.
 */
const PLAN_KEY_TO_TIER: Record<string, string> = {
  free: 'starter',
  starter: 'starter',
  core: 'core',
  pro: 'pro',
  team: 'pro',
  enterprise: 'enterprise',
};

const OPEN_STATUSES = new Set(['OPEN', 'PENDING']);

const STATUS_BADGE_VARIANT: Record<string, 'info' | 'warning' | 'success' | 'secondary'> = {
  OPEN: 'info',
  PENDING: 'warning',
  RESOLVED: 'success',
  CLOSED: 'secondary',
};

function isSupportCategory(value: string): value is SupportCategory {
  return TICKET_CATEGORIES.some((category) => category === value);
}

function isOpenTicketStatus(status: string): boolean {
  return OPEN_STATUSES.has(status.trim().toUpperCase());
}

export const meta: MetaFunction = ({ matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const copy = getSupportCopy(rootData?.language);
  const title = copy['support.metaTitle'];
  const description = copy['support.metaDescription'];

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
  ];
};
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const language = resolveSupportLanguage(resolveRequestLocale(request).language);
  const copy = getSupportCopy(language);

  try {
    const organization = await firstOrganization(request);

    /*
     * The plan read is best-effort decoration for the response-times table:
     * billing:read is a stricter scope than support:write, so a member who can
     * open tickets may legitimately 403 here — never let that (or any billing
     * hiccup) degrade the support page.
     */
    const [tickets, billing] = await Promise.all([
      apiRequest<{ tickets?: Ticket[] }>(request, `/support/${organization.id}/tickets`),

      // KILL-SWITCH FACTURATION : à OFF la route n'existe pas — inutile d'émettre la requête.
      billingEnabled()
        ? apiRequest<{ plan?: { key?: string } }>(request, `/orgs/${organization.id}/billing`).catch(() => null)
        : Promise.resolve(null),
    ]);

    const planKey = typeof billing?.plan?.key === 'string' ? billing.plan.key : null;

    /*
     * apiRequest returns the raw JSON of a 200 response with no shape validation,
     * so a payload skew between api versions (or `{}`) leaves `tickets.tickets`
     * undefined. Normalize to an array here so the component's `.filter(Boolean)`
     * never crashes the whole page to the root error boundary.
     */
    return {
      organization,
      tickets: Array.isArray(tickets?.tickets) ? tickets.tickets : [],
      currentTier: planKey ? (PLAN_KEY_TO_TIER[planKey] ?? null) : null,
      supportAccessLimited: null,
      language,
    };
  } catch (error) {
    /*
     * A 3xx Response here is the login / MFA re-auth redirect thrown by the
     * enterprise API on an expired or absent session. Re-throw it so the
     * framework performs the redirect instead of degrading it into a generic
     * "support unavailable" banner on the authenticated page.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    return {
      organization: null,
      tickets: [],
      currentTier: null,
      supportAccessLimited: copy['support.load.errorTitle'],
      language,
    };
  }
}

export async function action({ request }: EnterpriseActionArgs) {
  const language = resolveSupportLanguage(resolveRequestLocale(request).language);

  let organization: Awaited<ReturnType<typeof firstOrganizationOrNull>>;

  try {
    organization = await firstOrganizationOrNull(request);
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    return json({ errorCode: 'unavailable' as const }, { status: 503 });
  }

  if (!organization) {
    return json({ errorCode: 'organizationUnavailable' as const }, { status: 400 });
  }

  const form = await request.formData();
  const subject = String(form.get('subject') ?? '').trim();
  const categoryValue = String(form.get('category') || 'other');

  if (!subject) {
    return json({ errorCode: 'subjectRequired' as const }, { status: 400 });
  }

  if (!isSupportCategory(categoryValue)) {
    return json({ errorCode: 'invalidCategory' as const }, { status: 400 });
  }

  try {
    await apiRequest(request, `/orgs/${organization.id}/support/tickets`, {
      method: 'POST',
      body: JSON.stringify({
        subject,
        category: categoryValue,
      }),
    });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({ errorCode: 'forbidden' as const }, { status: 403 });
    }

    /*
     * A 3xx redirect Response thrown here is the session-expiry login or
     * MFA_REQUIRED re-auth navigation (see enterprise-api.server.ts). It is still
     * `instanceof Response`, so re-throw it BEFORE the isApiResponse branch —
     * otherwise the redirect's Location is discarded.
     */
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isApiResponse(error)) {
      const errorCode: SupportActionErrorCode =
        error.status === 429 ? 'rateLimited' : error.status >= 500 ? 'unavailable' : 'rejected';

      return json({ errorCode }, { status: error.status });
    }

    /*
     * Non-Response failures (a 500/502 from the api, an AbortSignal.timeout, or a
     * hung pod network error) would otherwise re-throw and crash the whole Support
     * page to the root error boundary. Surface the inline banner instead.
     */
    return json({ errorCode: 'unavailable' as const }, { status: 503 });
  }

  return redirect(language === 'fr' ? '/support?lang=fr' : '/support');
}

function TicketRow({ ticket, copy, language }: { ticket: Ticket; copy: SupportCopy; language: SupportLanguage }) {
  const category = supportCategoryLabel(
    ticket.category && isSupportCategory(ticket.category) ? ticket.category : 'other',
    language,
  );

  const normalizedStatus = ticket.status.trim().toUpperCase();

  return (
    <li className="flex flex-col gap-3 border-t border-bolt-elements-borderColor p-4 first:border-t-0 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
          <LifeBuoy className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <Link
            to={`/support/${ticket.id}`}
            className="inline-flex min-h-[44px] max-w-full items-center break-words text-sm font-medium hover:underline focus:underline focus:outline-none"
          >
            {ticket.subject}
          </Link>
          <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
            {category} ·{' '}
            {ticket.createdAt ? (
              <RelativeTime value={ticket.createdAt} prefix={copy['support.ticket.openedPrefix']} />
            ) : (
              copy['support.ticket.recorded']
            )}
          </p>
        </div>
      </div>
      <Badge variant={STATUS_BADGE_VARIANT[normalizedStatus] ?? 'secondary'} size="md" className="self-start">
        {supportTicketStatusLabel(ticket.status, language)}
      </Badge>
    </li>
  );
}

export default function SupportPage() {
  const { tickets, currentTier, supportAccessLimited, language: loaderLanguage } = useLoaderData<typeof loader>();
  const language = resolveSupportLanguage(loaderLanguage);
  const copy = getSupportCopy(language);
  const actionData = useActionData<typeof action>() as { errorCode?: SupportActionErrorCode } | undefined;
  const actionError = supportActionErrorMessage(actionData?.errorCode, language);
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const visibleTickets = (tickets ?? []).filter(Boolean) as Ticket[];
  const openTickets = visibleTickets.filter((ticket) => isOpenTicketStatus(ticket.status));
  const pastTickets = visibleTickets.filter((ticket) => !isOpenTicketStatus(ticket.status));
  const retrying = revalidator.state !== 'idle';
  const openingTicket = navigation.state !== 'idle' && navigation.formMethod?.toLowerCase() === 'post';

  return (
    <AppShell title={copy['support.title']} description={copy['support.description']}>
      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        {actionError ? (
          <div className="rounded-lg border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error-text)] xl:col-span-2">
            {actionError}
          </div>
        ) : null}
        <div className="grid min-w-0 content-start gap-6">
          <section className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
            <h2 className="break-words border-b border-bolt-elements-borderColor p-4 text-sm font-semibold">
              {copy['support.open.title']}
            </h2>
            {supportAccessLimited ? (
              retrying ? (
                <AsyncPanelSkeleton label={copy['support.load.loading']} rows={3} compact className="m-4" />
              ) : (
                <AsyncPanelError
                  title={copy['support.load.errorTitle']}
                  description={copy['support.load.errorDescription']}
                  onRetry={revalidator.revalidate}
                  retryLabel={copy['support.load.retry']}
                  tone="warning"
                  compact
                  className="m-4"
                />
              )
            ) : openTickets.length ? (
              <ul>
                {openTickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} copy={copy} language={language} />
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-3 p-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-bolt-elements-background-depth-3">
                  <MessageSquare className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium">{copy['support.open.emptyTitle']}</p>
                  <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
                    {copy['support.open.emptyDescription']}
                  </p>
                </div>
              </div>
            )}
          </section>

          {pastTickets.length ? (
            <section className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-sm">
              <h2 className="break-words border-b border-bolt-elements-borderColor p-4 text-sm font-semibold text-bolt-elements-textSecondary">
                {copy['support.past.title']}
              </h2>
              <ul>
                {pastTickets.map((ticket) => (
                  <TicketRow key={ticket.id} ticket={ticket} copy={copy} language={language} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Form
            method="post"
            className="grid min-w-0 gap-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6"
          >
            <label className="grid gap-2 text-sm font-medium">
              {copy['support.form.subject']}
              <input
                className="min-h-[44px] min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
                name="subject"
                placeholder={copy['support.form.subjectPlaceholder']}
                autoComplete="off"
                required
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              {copy['support.form.category']}
              <select
                className="min-h-[44px] min-w-0 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-sm outline-none focus:border-bolt-elements-focus"
                name="category"
                defaultValue="other"
                required
              >
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {supportCategoryLabel(category, language)}
                  </option>
                ))}
              </select>
            </label>
            <p id="support-security-notice" className="break-words text-sm text-bolt-elements-textSecondary">
              <ShieldAlert className="mr-2 inline h-4 w-4" aria-hidden />
              {copy['support.form.securityNotice']}
            </p>
            <Button
              className="min-h-[44px] w-full whitespace-normal sm:w-auto"
              type="submit"
              disabled={openingTicket}
              aria-busy={openingTicket}
              aria-describedby="support-security-notice"
            >
              {openingTicket ? copy['support.form.submitting'] : copy['support.form.submit']}
            </Button>
          </Form>

          <section className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-6">
            <h2 className="flex items-start gap-2 break-words text-sm font-semibold">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {copy['support.response.title']}
            </h2>
            <p className="mt-1 break-words text-sm text-bolt-elements-textSecondary">
              {copy['support.response.description']}
            </p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                {SUPPORT_RESPONSE_TARGETS.map((tier) => {
                  const isCurrent = tier.key === currentTier;
                  const planKey: `support.response.plan.${SupportTierKey}` = `support.response.plan.${tier.key}`;

                  return (
                    <tr key={tier.key} className="border-t border-bolt-elements-borderColor first:border-t-0">
                      <td className={`min-w-0 py-2 pr-3 align-top ${isCurrent ? 'font-semibold' : ''}`}>
                        {/* div (not span): Badge renders a <div>, invalid inside <span>. */}
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className="break-words">{copy[planKey]}</span>
                          {isCurrent ? (
                            <Badge variant="info" size="sm">
                              {copy['support.response.currentPlan']}
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td
                        className={`py-2 text-right align-top ${isCurrent ? 'font-semibold' : 'text-bolt-elements-textSecondary'}`}
                      >
                        {formatSupportResponseTarget(tier.value, tier.unit, language)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
