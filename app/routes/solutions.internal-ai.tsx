import { redirect } from 'react-router';

/** Permanent compatibility route for the former Internal AI marketing link. */
export function loader() {
  return redirect('/solutions/internal-ai-builder', 308);
}
