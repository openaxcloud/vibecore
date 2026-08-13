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
import { isReauthRedirect } from '~/lib/route-reauth';
import { statusDisplayLabel } from '~/lib/user-facing-labels';

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

export const meta: MetaFunction = () => [{ title: 'Invoices - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

const invoiceEuroFormatter = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const invoiceDateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const data = await apiRequest<InvoicesResponse>(request, `/orgs/${organization.id}/billing/invoices`);

    return json({
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
        invoices: [],
        stripeConfigured: false,
        accessLimited: true,
        invoicesUnavailable: false,
      });
    }

    return json({
      invoices: [],
      stripeConfigured: false,
      accessLimited: false,
      invoicesUnavailable: true,
    });
  }
}

function formatInvoiceAmount(cents: number) {
  return invoiceEuroFormatter.format(cents / 100);
}

export default function InvoicesPage() {
  const { invoices, stripeConfigured, accessLimited, invoicesUnavailable } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const retrying = revalidator.state !== 'idle';
  const loadFailed = accessLimited || invoicesUnavailable;

  return (
    <EnterpriseFormPage title="Invoices" description="View invoices, payment status and downloadable receipts.">
      {loadFailed ? (
        retrying ? (
          <AsyncPanelSkeleton label="Loading invoices" rows={4} compact />
        ) : (
          <AsyncPanelError
            title={accessLimited ? 'Invoices are restricted' : 'Invoices could not load'}
            description={
              accessLimited
                ? 'Only organization owners and billing administrators can view invoices.'
                : 'Invoice history is hidden because the latest request failed. Your billing data was not changed.'
            }
            onRetry={revalidator.revalidate}
            retryLabel="Reload invoices"
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
            Download all (.zip)
          </a>
        </div>
      ) : null}
      {!loadFailed && invoices.length ? (
        <ul className="divide-y divide-bolt-elements-borderColor">
          {invoices.map((invoice) => {
            const link = invoice.hostedInvoiceUrl ?? invoice.invoicePdf;

            /*
             * 'uncollectible' = a payment definitively failed; 'open' with an
             * outstanding amount = awaiting/retryable payment. Stripe's hosted
             * invoice page IS the retry surface for the customer.
             */
            const unpaid =
              invoice.status === 'uncollectible' || (invoice.status === 'open' && invoice.amountDueCents > 0);

            return (
              <li
                key={invoice.id}
                className="flex flex-col items-start justify-between gap-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-bolt-elements-textPrimary">
                    {invoice.number ?? invoice.id}
                    {invoice.status ? (
                      unpaid ? (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                          style={{
                            color: 'var(--status-error-text)',
                            background: 'color-mix(in srgb, var(--vc-ide-accent-error) 12%, transparent)',
                          }}
                        >
                          {invoice.status === 'uncollectible' ? 'Failed' : 'Unpaid'}
                        </span>
                      ) : (
                        <span className="ml-2 text-xs uppercase tracking-wide text-bolt-elements-textSecondary">
                          {statusDisplayLabel(invoice.status)}
                        </span>
                      )
                    ) : null}
                  </p>
                  <p className="text-bolt-elements-textSecondary">
                    {invoice.createdAt ? invoiceDateFormatter.format(new Date(invoice.createdAt)) : 'Date pending'} ·{' '}
                    {formatInvoiceAmount(invoice.amountPaidCents || invoice.amountDueCents)}
                  </p>
                </div>
                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  {unpaid && invoice.hostedInvoiceUrl ? (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-md bg-[var(--vc-ide-accent-action)] px-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Retry payment
                    </a>
                  ) : null}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[44px] items-center rounded-md border border-bolt-elements-borderColor px-3 text-sm font-medium hover:border-bolt-elements-focus"
                    >
                      View
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
          title="No invoices yet"
          description={
            stripeConfigured
              ? 'Invoices appear here after your first paid billing cycle.'
              : 'Invoices will appear here when billing is active.'
          }
        />
      ) : null}
      <p className="mt-4 text-sm text-bolt-elements-textSecondary">
        Manage payment details and download receipts in the{' '}
        <Link to="/payment-method" className="underline">
          Stripe customer portal
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
