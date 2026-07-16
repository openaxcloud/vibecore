import type { LoaderFunctionArgs, MetaFunction } from 'react-router';
import { redirect } from 'react-router';

export const meta: MetaFunction = () => [{ title: 'Import with the Import Hub - E-Code' }];

/** ZIP archives are validated and previewed in the central two-phase Import Hub. */
export function loader(_args: LoaderFunctionArgs) {
  return redirect('/dashboard/templates?section=import&source=zip');
}

export default function ImportZipRedirect() {
  return null;
}
