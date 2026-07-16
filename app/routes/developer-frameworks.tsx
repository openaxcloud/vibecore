import { redirect, type LoaderFunctionArgs, type MetaFunction } from 'react-router';

export const meta: MetaFunction = () => [
  { title: 'Community App Gallery — E-Code' },
  {
    name: 'description',
    content: 'Developer Frameworks has moved to the community application Gallery.',
  },
];

/** Keep the former Replit-style URL useful without reviving framework cards. */
export function loader(_args: LoaderFunctionArgs) {
  return redirect('/templates');
}

export default function DeveloperFrameworksRoute() {
  return null;
}
