import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
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

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);

  if (!organization) {
    return redirect('/');
  }

  try {
    const data = await apiRequest<InvoicesResponse>(request, `/orgs/${organization.id}/billing/invoices`);

    return json({ invoices: data.invoices, stripeConfigured: data.stripeConfigured, accessLimited: false });
  } catch (error) {
    if (isForbiddenApiResponse(error)) {
      return json({ invoices: [], stripeConfigured: false, accessLimited: true });
    }

    throw error;
  }
}

function formatAmount(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

export default function InvoicesPage() {
  const { invoices, stripeConfigured, accessLimited } = useLoaderData<typeof loader>();

  return (
    <EnterpriseFormPage
      title="Invoices"
      description="View invoices, payment status and downloadable receipts."
      error={accessLimited ? 'Invoices are visible to organization owners and billing administrators.' : undefined}
    >
      {invoices.length ? (
        <div className="mb-4 flex justify-end">
          <a
            href="/invoices/download"
            className="inline-flex h-8 items-center rounded-md border border-bolt-elements-borderColor px-3 text-xs font-medium text-bolt-elements-textPrimary transition-colors hover:bg-bolt-elements-background-depth-3"
          >
            Download all (.zip)
          </a>
        </div>
      ) : null}
      {invoices.length ? (
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
              <li key={invoice.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
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
                    {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString() : 'Date pending'} ·{' '}
                    {formatAmount(invoice.amountPaidCents || invoice.amountDueCents, invoice.currency)}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {unpaid && invoice.hostedInvoiceUrl ? (
                    <a
                      href={invoice.hostedInvoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md bg-[var(--vc-ide-accent-action)] px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    >
                      Retry payment
                    </a>
                  ) : null}
                  {link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md border border-bolt-elements-borderColor px-3 py-1.5 text-sm font-medium hover:border-bolt-elements-focus"
                    >
                      View
                    </a>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
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
      )}
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
