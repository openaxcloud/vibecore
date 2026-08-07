import { data as json, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { PublicShell } from '~/components/dashboard/SaaSLayout';
import { AgentWalkthrough } from '~/components/docs/AgentWalkthrough';
import { buildPublicRouteMeta, getPublicRouteSeoCopy } from '~/lib/i18n/catalogs/public-route-seo';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export function loader({ request }: LoaderFunctionArgs) {
  const locale = resolveRequestLocale(request);

  return json({ language: locale.language }, { headers: localeResponseHeaders(request, locale) });
}

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getPublicRouteSeoCopy(language);

  return buildPublicRouteMeta({
    language,
    pathname: '/docs',
    seo: {
      title: copy['publicRouteSeo.docs.title'],
      description: copy['publicRouteSeo.docs.description'],
      imageAlt: copy['publicRouteSeo.docs.imageAlt'],
    },
  });
};

export default function DocsRoute() {
  return (
    <PublicShell>
      <main className="bg-[var(--ecode-background)] text-[var(--ecode-text)]" data-ecode-marketing-page="docs">
        <div className="container-responsive py-16 sm:py-24">
          <AgentWalkthrough />
        </div>
      </main>
    </PublicShell>
  );
}
