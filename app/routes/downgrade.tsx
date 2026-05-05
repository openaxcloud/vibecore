import { EnterpriseFormPage, PrimaryButton, SelectField } from '~/components/enterprise/EnterpriseFormPage';

export default function DowngradePage() {
  return (
    <EnterpriseFormPage
      title="Downgrade"
      description="Preview lower-plan limits before scheduling a subscription change."
    >
      <form className="space-y-4">
        <SelectField
          label="Plan"
          name="planKey"
          options={[
            { value: 'free', label: 'Free' },
            { value: 'pro', label: 'Pro' },
            { value: 'team', label: 'Team' },
          ]}
        />
        <PrimaryButton>Schedule change</PrimaryButton>
      </form>
    </EnterpriseFormPage>
  );
}
