import { redirect, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request: _request }: EnterpriseLoaderArgs) {
  return redirect('/admin/overview');
}
