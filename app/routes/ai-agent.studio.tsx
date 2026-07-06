import { redirect } from 'react-router';

/*
 * H24: this route was a standalone brochure surface. Redirect (301) to the real
 * feature so the URL keeps working and search engines follow the canonical page.
 */
export function loader() {
  return redirect('/ai-agent', 301);
}
