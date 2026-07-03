import { redirect } from 'react-router';

/*
 * Legacy onboarding surface. The page used to render a static checklist
 * (create project / invite / connect GitHub / review quotas) with no live
 * state; the dashboard's "Get set up" card now covers the same steps with
 * real backend signals. Nothing links here anymore, but the route is kept as
 * a redirect so old bookmarks and external links don't 404.
 */
export function loader() {
  return redirect('/dashboard');
}
