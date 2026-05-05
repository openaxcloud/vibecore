import { EnterpriseFormPage, PrimaryButton } from '~/components/enterprise/EnterpriseFormPage';

export default function PaymentMethodPage() {
  return (
    <EnterpriseFormPage title="Payment method" description="Update billing details through the Stripe customer portal.">
      <PrimaryButton>Manage payment method</PrimaryButton>
    </EnterpriseFormPage>
  );
}
