import { redirect, requirePlatformAdmin, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  return redirect('/admin/overview');
}
