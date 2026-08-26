import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { WorkspaceSettings } from '~/components/settings/WorkspaceSettings';
import { apiRequest, json, loginRedirectFromRequest } from '~/lib/enterprise-api.server';
import { getWorkspaceSettingsCopy } from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export async function loader({ request }: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(request);
  const payload = await apiRequest<{ user?: unknown }>(request, '/auth/me');

  /*
   * A successful but malformed authentication response must not turn this
   * private route into a public shell. Fail closed and preserve the original
   * location so the user can resume after signing in.
   */
  if (!payload.user) {
    throw loginRedirectFromRequest(request);
  }

  return json({ language: localeResolution.language }, { headers: localeResponseHeaders(request, localeResolution) });
}

export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  const copy = getWorkspaceSettingsCopy(data?.language).seo;

  return [{ title: copy.title }, { name: 'description', content: copy.description }];
};

export default function WorkspaceSettingsRoute() {
  const { language } = useLoaderData<typeof loader>();
  const copy = getWorkspaceSettingsCopy(language);

  return (
    <AppShell title={copy.shell.title} description={copy.shell.description} hideHeader>
      <WorkspaceSettings language={language} />
    </AppShell>
  );
}
