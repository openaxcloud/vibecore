import { redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Community App Gallery — E-Code' },
  {
    name: 'description',
    content: 'Framework and language starter listings have moved to the community application Gallery.',
  },
];

/** Framework/language starter browsing is retired; published applications are canonical. */
export function loader(_args: LoaderFunctionArgs) {
  return redirect('/templates');
}

export default function TemplatesLanguagesRoute() {
  return null;
}
