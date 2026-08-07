import { redirect, type LoaderFunctionArgs } from 'react-router';

import { normalizeSupportedLanguage } from '~/lib/i18n/language';

/*
 * Legacy onboarding surface. The page used to render a static checklist
 * (create project / invite / connect GitHub / review quotas) with no live
 * state; the dashboard's "Get set up" card now covers the same steps with
 * real backend signals. Nothing links here anymore, but the route is kept as
 * a redirect so old bookmarks and external links don't 404.
 */
export function loader({ request }: LoaderFunctionArgs) {
  const requestedLanguage = normalizeSupportedLanguage(new URL(request.url).searchParams.get('lang'));
  const languageSearch = requestedLanguage ? `?lang=${requestedLanguage}` : '';

  return redirect(`/dashboard${languageSearch}`);
}
