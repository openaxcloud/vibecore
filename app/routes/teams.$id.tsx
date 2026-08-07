import { useTranslation } from 'react-i18next';
import type { MetaFunction } from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { EnterpriseFormPage } from '~/components/enterprise/EnterpriseFormPage';
import { TeamAccessLogPanel } from '~/components/teams/TeamAccessLogPanel';
import type { EnterpriseLoaderArgs } from '~/lib/enterprise-api.server';
import { formatTeamAccessLogCopy, getTeamAccessLogCopy } from '~/lib/i18n/catalogs/team-access-log';
import { normalizeSupportedLanguage } from '~/lib/i18n/language';
import { loadTeamAccessLog, type TeamAccessLogData } from '~/lib/team-access-log.server';

export const meta: MetaFunction<typeof loader> = ({ data, matches, params }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const routeData = data as TeamAccessLogData | undefined;
  const language = routeData?.language ?? rootData?.language;
  const copy = getTeamAccessLogCopy(language);
  const teamId = params.id ?? '—';
  const title = formatTeamAccessLogCopy(copy['teamAccessLog.overview.metaTitle'], { team: teamId });
  const description = copy['teamAccessLog.overview.metaDescription'];
  const canonical = `https://e-code.ai/teams/${encodeURIComponent(params.id ?? '')}`;
  const french = normalizeSupportedLanguage(language) === 'fr';

  return [
    { title },
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: canonical },
    { property: 'og:locale', content: french ? 'fr_FR' : 'en_US' },
    { property: 'og:locale:alternate', content: french ? 'en_US' : 'fr_FR' },
    { name: 'twitter:title', content: title },
    { name: 'twitter:description', content: description },
    { tagName: 'link', rel: 'canonical', href: canonical },
    { tagName: 'link', rel: 'alternate', hrefLang: 'en', href: `${canonical}?lang=en` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'fr', href: `${canonical}?lang=fr` },
    { tagName: 'link', rel: 'alternate', hrefLang: 'x-default', href: canonical },
  ];
};

export async function loader({ request, params }: EnterpriseLoaderArgs) {
  return loadTeamAccessLog(request, params.id ?? 'unknown', `/teams/${params.id ?? 'unknown'}`);
}

export default function TeamAccessLogRoute() {
  const data = useLoaderData<typeof loader>() as TeamAccessLogData;
  const { i18n } = useTranslation();
  const copy = getTeamAccessLogCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <EnterpriseFormPage
      title={copy['teamAccessLog.overview.title']}
      description={copy['teamAccessLog.overview.description']}
    >
      <div className="flex flex-col gap-6">
        <TeamAccessLogPanel {...data} />
        <p className="text-xs text-bolt-elements-textSecondary">
          <Link
            className="inline-flex min-h-[44px] max-w-full items-center break-words underline hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            to={`/teams/${data.teamId}/settings`}
          >
            {copy['teamAccessLog.overview.openSettings']}
          </Link>
        </p>
      </div>
    </EnterpriseFormPage>
  );
}
