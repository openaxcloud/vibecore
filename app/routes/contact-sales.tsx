import type { MetaFunction } from 'react-router';
import ContactSales from '~/components/marketing/ecode-exact/pages/ContactSales';
import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Contact Sales — E-Code' },
  {
    name: 'description',
    content: 'Contact E-Code sales for Enterprise: SSO/SAML, single-tenant, VPC peering and dedicated support.',
  },
  ...socialMetaTags({
    title: 'Contact Sales — E-Code',
    description: 'Contact E-Code sales for Enterprise: SSO/SAML, single-tenant, VPC peering and dedicated support.',
  }),
];

export default function ContactSalesRoute() {
  return <ContactSales />;
}
