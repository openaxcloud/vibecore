import { Link } from '@remix-run/react';
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
          ]}
        />
        <PrimaryButton>Start checkout</PrimaryButton>
      </form>
      <p className="mt-4 text-sm text-bolt-elements-textSecondary">
        Need Enterprise (SSO/SAML, custom quotas, premium support)?{' '}
        <Link to="/contact-sales" className="underline">
          Talk to sales
        </Link>
        .
      </p>
    </EnterpriseFormPage>
  );
}
