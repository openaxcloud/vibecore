import { redirect } from 'react-router';

// H23: consolidated into a tab of /account-settings; 301 the old URL there.
export function loader() {
  return redirect('/account-settings/connected', 301);
}
