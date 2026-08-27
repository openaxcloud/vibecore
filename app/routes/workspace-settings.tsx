import { useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { WorkspaceSettings } from '~/components/settings/WorkspaceSettings';
import { getWorkspaceSettingsCopy } from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

export function loader({ request }: LoaderFunctionArgs) {
  return { language: resolveRequestLocale(request).language };
}

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
