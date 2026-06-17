import type { MetaFunction } from '@remix-run/cloudflare';
import ContactSales from '~/components/marketing/ecode-exact/pages/ContactSales';

export const meta: MetaFunction = () => [
  { title: 'Contact Sales — VibeCore' },
  {
    name: 'description',
    content: 'Contact VibeCore sales for Enterprise: SSO/SAML, single-tenant, VPC peering and dedicated support.',
  },
];

export default function ContactSalesRoute() {
  return <ContactSales />;
}
