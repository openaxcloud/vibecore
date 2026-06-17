import type { MetaFunction } from '@remix-run/cloudflare';
import CommercialAgreement from '~/components/marketing/ecode-exact/pages/CommercialAgreement';

export const meta: MetaFunction = () => [
  { title: 'Commercial Agreement — VibeCore' },
  { name: 'description', content: 'VibeCore Commercial Agreement.' },
];

export default function CommercialAgreementRoute() {
  return <CommercialAgreement />;
}
