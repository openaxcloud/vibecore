import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData, useRevalidator } from 'react-router';
import { AsyncPanelError, AsyncPanelSkeleton } from '~/components/dashboard/AsyncPanelState';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import { EmptyState } from '~/components/ui/EmptyState';
import {
  apiRequest,
  firstOrganizationOrNull,
  isForbiddenApiResponse,
  json,
  redirect,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import {
  billingDisplayName,
  billingEn,
  billingFr,
  formatBillingCurrency,
  formatBillingDate,
} from '~/lib/i18n/catalogs/billing';
import type { SupportedLanguage } from '~/lib/i18n/language';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';
import { isReauthRedirect } from '~/lib/route-reauth';

type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  amountDueCents: number;
  amountPaidCents: number;
  currency: string;
  createdAt: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
};

type InvoicesResponse = {
  invoices: Invoice[];
  stripeConfigured: boolean;
};

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: (data?.language === 'fr' ? billingFr : billingEn)['invoices.meta.title'] },
];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);
  const { language } = resolveRequestLocale(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const data = await apiRequest<InvoicesResponse>(request, `/orgs/${organization.id}/billing/invoices`);

    return json({
      language,
      invoices: Array.isArray(data.invoices) ? data.invoices : [],
      stripeConfigured: data.stripeConfigured,
      accessLimited: false,
      invoicesUnavailable: false,
    });
  } catch (error) {
    if (isReauthRedirect(error)) {
      throw error;
    }

    if (isForbiddenApiResponse(error)) {
      return json({
        language,
        invoices: [],
        stripeConfigured: false,
        accessLimited: true,
        invoicesUnavailable: false,
      });
    }

    return json({
      language,
      invoices: [],
      stripeConfigured: false,
      accessLimited: false,
      invoicesUnavailable: true,
    });
  }
}

export function formatInvoiceAmount(cents: number, currency = 'EUR', language: SupportedLanguage = 'en') {
  return formatBillingCurrency(cents, currency, language);
}

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { language, invoices, stripeConfigured, accessLimited, invoicesUnavailable } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const loadFailed = accessLimited || invoicesUnavailable;

  return (
    <EnterpriseFormPage title={t('invoices.page.title')} description={t('invoices.page.description')}>
      {loadFailed ? (
        retrying ? (
          <AsyncPanelSkeleton label={t('invoices.loading')} rows={4} compact />
        ) : (
          <AsyncPanelError
            title={t(accessLimited ? 'invoices.restrictedTitle' : 'invoices.errorTitle')}
            description={t(accessLimited ? 'invoices.restrictedDescription' : 'invoices.errorDescription')}
            onRetry={revalidator.revalidate}
            retryLabel={t('invoices.reload')}
            tone={accessLimited ? 'warning' : 'error'}
            compact
          />
        )
      ) : invoices.length ? (
        <div className="mb-4 flex justify-end">
          <a
            href="/invoices/download"
            className="inline-flex min-h-[44px] items-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
          >
            {t('invoices.downloadAll')}
          </a>
        </div>
      ) : null}
      {!loadFailed && invoices.length ? (
        <ul className="divide-y divide-bolt-elements-borderColor">
          {invoices.map((invoice) => {
            const link = invoice.hostedInvoiceUrl ?? invoice.invoicePdf;

            /* Stripe's hosted invoice page is the retry surface for failed or outstanding payments. */
            const unpaid =
              invoice.status === 'uncollectible' || (invoice.status === 'open' && invoice.amountDueCents > 0);

            return (
              <li
                key={invoice.id}
                className="flex flex-col items-start justify-between gap-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0 break-words">
                  <p className="font-medium text-bolt-elements-textPrimary">
                    {invoice.number ?? invoice.id}
                    {invoice.status ? (
                      unpaid ? (
                        <span
                          className="ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                          style={{
                            color: 'var(--status-error-text)',
                            background: 'color-mix(in srgb, var(--vc-ide-accent-error) 12%, transparent)',
                          }}
                        >
                          {t(invoice.status === 'uncollectible' ? 'invoices.failed' : 'invoices.unpaid')}
                        </span>
                      ) : (
                        <span className="ml-2 inline-flex text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                          {billingDisplayName(invoice.status, language, 'billing.label.statusUnavailable')}
                        </span>
                      )
                    ) : null}
                  </p>
                  <p className="text-bolt-elements-textSecondary">
                    {invoice.createdAt ? formatBillingDate(invoice.createdAt, language) : t('invoices.datePending')} ·{' '}
                    {formatInvoiceAmount(invoice.amountPaidCents || invoice.amountDueCents, invoice.currency, language)}
                  </p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {unpaid && invoice.hostedInvoiceUrl ? (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-md bg-[var(--vc-action-primary)] px-3 text-sm font-medium text-[var(--vc-action-primary-foreground)] transition-opacity hover:opacity-90"
                    >
                      {t('invoices.retryPayment')}
                    </a>
                  ) : null}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium hover:border-bolt-elements-focus"
                    >
                      {t('invoices.view')}
                    </a>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : !loadFailed ? (
        <EmptyState
          variant="compact"
          icon="i-ph:receipt"
          title={t('invoices.emptyTitle')}
          description={t(stripeConfigured ? 'invoices.emptyConfigured' : 'invoices.emptyInactive')}
        />
      ) : null}
      <p className="mt-4 text-sm text-bolt-elements-textSecondary">
        {t('invoices.portalPrefix')}{' '}
        <Link to="/payment-method" className="underline">
          {t('invoices.portalLink')}
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
