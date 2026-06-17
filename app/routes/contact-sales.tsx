import type { MetaFunction } from '@remix-run/cloudflare';
import ContactSales from '~/components/marketing/ecode-exact/pages/ContactSales';

export const meta: MetaFunction = () => [
  { title: 'Contact Sales — E-Code' },
  {
    name: 'description',
    content: 'Contact E-Code sales for Enterprise: SSO/SAML, single-tenant, VPC peering and dedicated support.',
  },
];

export default function ContactSalesRoute() {
  return <ContactSales />;
}
