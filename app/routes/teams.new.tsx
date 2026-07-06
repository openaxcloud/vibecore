import { redirect } from 'react-router';

/*
 * H24: 'teams/new' was a standalone brochure surface. Open the real
 * create-organization flow — the modal on /organization-switcher — via
 * ?create=1 so a team/org can actually be created.
 */
export function loader() {
  return redirect('/organization-switcher?create=1', 301);
}
