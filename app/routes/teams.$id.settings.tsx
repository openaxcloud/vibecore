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
  const title = formatTeamAccessLogCopy(copy['teamAccessLog.settings.metaTitle'], { team: teamId });
  const description = copy['teamAccessLog.settings.metaDescription'];
  const canonical = `https://e-code.ai/teams/${encodeURIComponent(params.id ?? '')}/settings`;
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
  return loadTeamAccessLog(request, params.id ?? 'unknown', `/teams/${params.id ?? 'unknown'}/settings`);
}

export default function TeamSettingsRoute() {
  const data = useLoaderData<typeof loader>() as TeamAccessLogData;
  const { i18n } = useTranslation();
  const copy = getTeamAccessLogCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <EnterpriseFormPage
      title={copy['teamAccessLog.settings.title']}
      description={copy['teamAccessLog.settings.description']}
    >
      <div className="flex flex-col gap-6">
        <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 py-2 text-xs text-bolt-elements-textSecondary">
          {formatTeamAccessLogCopy(copy['teamAccessLog.settings.banner'], { team: data.teamId })}
          {/*
            Lien sorti de la phrase : un inline-flex de 44px au milieu d'une
            ligne text-xs gonflait la line-box de ~28px et cassait le rythme
            typographique du bandeau.
          */}
          <Link
            className="mt-1 flex min-h-[44px] w-fit max-w-full items-center break-words underline hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            to={`/teams/${data.teamId}`}
          >
            {copy['teamAccessLog.settings.openFullLog']}
          </Link>
        </div>
        <TeamAccessLogPanel {...data} />
      </div>
    </EnterpriseFormPage>
  );
}
