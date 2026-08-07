import type { LoaderFunctionArgs } from 'react-router';
import { data as json, type MetaFunction } from 'react-router';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { GitUrlImport } from '~/components/git/GitUrlImport.client';
import { Header } from '~/components/header/Header';
import BackgroundRays from '~/components/ui/BackgroundRays';
import { buildRemainingRouteMeta, getRemainingRouteShellsCopy } from '~/lib/i18n/catalogs/remaining-route-shells';
import { localeResponseHeaders, resolveRequestLocale } from '~/lib/i18n/request-locale';

export const meta: MetaFunction<typeof loader> = ({ data, matches }) => {
  const rootData = matches.find((match) => match.id === 'root')?.data as { language?: string } | undefined;
  const language = data?.language ?? rootData?.language;
  const copy = getRemainingRouteShellsCopy(language);

  return buildRemainingRouteMeta({
    title: copy['remainingRoutes.git.title'],
    description: copy['remainingRoutes.git.description'],
    path: '/git',
    language,
  });
};

export async function loader(args: LoaderFunctionArgs) {
  const localeResolution = resolveRequestLocale(args.request);

  return json(
    { language: localeResolution.language, url: args.params.url },
    { headers: localeResponseHeaders(args.request, localeResolution) },
  );
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full bg-bolt-elements-background-depth-1">
      <BackgroundRays />
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <GitUrlImport />}</ClientOnly>
    </div>
  );
}
