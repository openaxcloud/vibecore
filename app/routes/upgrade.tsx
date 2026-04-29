import { EnterpriseFormPage, PrimaryButton, SelectField } from '~/components/enterprise/EnterpriseFormPage';

export default function UpgradePage() {
  return (
    <EnterpriseFormPage
      title="Upgrade"
      description="Move an organization to a higher plan before quota-restricted actions are retried."
    >
      <form className="space-y-4">
        <SelectField
          label="Plan"
          name="planKey"
          options={[
            { value: 'pro', label: 'Pro' },
            { value: 'team', label: 'Team' },
            { value: 'enterprise', label: 'Enterprise' },
          ]}
        />
        <PrimaryButton>Start checkout</PrimaryButton>
      </form>
    </EnterpriseFormPage>
  );
}
