import { redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

import { socialMetaTags } from '~/utils/social-meta';

export const meta: MetaFunction = () => [
  { title: 'Community App Gallery — E-Code' },
  {
    name: 'description',
    content: 'Discover working applications published by the E-Code community, preview them and remix your own copy.',
  },
  ...socialMetaTags({
    title: 'Community App Gallery — E-Code',
    description: 'Discover working community applications, preview them and remix your own copy.',
  }),
];

/** The canonical Gallery lives in the authenticated product surface. */
export function loader(_args: LoaderFunctionArgs) {
  return redirect('/dashboard/templates');
}

export default function TemplatesRoute() {
  return null;
}
