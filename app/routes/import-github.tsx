import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { redirect } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Import with the Import Hub - E-Code' }];

/** All GitHub imports use the validated, recoverable two-phase Import Hub. */
export function loader(_args: LoaderFunctionArgs) {
  return redirect('/dashboard/templates?section=import&source=github');
}

export default function ImportGithubRedirect() {
  return null;
}
