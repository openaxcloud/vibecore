import { useLoaderData, type MetaFunction } from 'react-router';
import { AppShell } from '~/components/dashboard/SaaSLayout';
import { WorkspaceSettings } from '~/components/settings/WorkspaceSettings';
import { requireAuthenticatedUser, type EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { getWorkspaceSettingsCopy } from '~/lib/i18n/catalogs/api-keys-workspace-settings';
import { resolveRequestLocale } from '~/lib/i18n/request-locale';

/*
 * BUG-AUTH-001 — cet appel est la SEULE chose qui ferme la page. Ce loader ne
 * lit aucune donnée serveur, donc rien d'autre ne peut lever la redirection de
 * connexion à sa place : le retirer rouvre la page aux visiteurs déconnectés
 * sans changer une seule ligne visible.
 */
export async function loader({ request }: EnterpriseLoaderArgs) {
  await requireAuthenticatedUser(request);

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
