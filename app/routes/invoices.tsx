import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';

export default function InvoicesPage() {
  return (
    <EnterpriseFormPage
      title="Invoices"
      description="Track invoice lifecycle, successful payments and failed payment events."
    >
      <div className="rounded-md border border-bolt-elements-borderColor p-4 text-sm text-bolt-elements-textSecondary">
        Invoice events are ingested from verified Stripe webhooks.
      </div>
    </EnterpriseFormPage>
  );
}
