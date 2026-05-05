import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';

export default function QuotaExceededPage() {
  return (
    <EnterpriseFormPage
      title="Quota exceeded"
      description="A backend quota check blocked the requested action before cost was incurred."
    >
      <div className="space-y-4">
        <p className="text-sm text-bolt-elements-textSecondary">
          Upgrade the plan or ask an administrator for an audited quota override.
        </p>
        <PrimaryButton>Review plans</PrimaryButton>
      </div>
    </EnterpriseFormPage>
  );
}
