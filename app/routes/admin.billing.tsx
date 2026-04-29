import { EnterpriseFormPage, TextField, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';

export default function AdminBillingPage() {
  return (
    <EnterpriseFormPage
      title="Admin billing"
      description="Review plans and create audited quota overrides for enterprise organizations."
    >
      <form className="space-y-4">
        <TextField label="Organization ID" name="orgId" />
        <TextField label="Quota key" name="key" placeholder="projects.count" />
        <TextField label="Limit" name="limit" type="number" />
        <PrimaryButton>Create override</PrimaryButton>
      </form>
    </EnterpriseFormPage>
  );
}
