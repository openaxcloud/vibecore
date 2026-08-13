import type { MetaFunction } from 'react-router';
import CommercialAgreement from '~/components/marketing/ecode-exact/pages/CommercialAgreement';

export const meta: MetaFunction = () => [
  { title: 'Commercial Agreement — E-Code' },
  { name: 'description', content: 'E-Code Commercial Agreement.' },
];

export default function CommercialAgreementRoute() {
  return <CommercialAgreement />;
}
