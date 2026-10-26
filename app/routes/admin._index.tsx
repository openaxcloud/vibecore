import { redirect, requirePlatformAdmin, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';

export async function loader({ request }: EnterpriseLoaderArgs) {
  await requirePlatformAdmin(request);

  const language = new URL(request.url).searchParams.get('lang');
  const query = language === null ? '' : `?${new URLSearchParams({ lang: language })}`;

  return redirect(`/admin/overview${query}`);
}
