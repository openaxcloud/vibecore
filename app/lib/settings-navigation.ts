import type { NavigateFunction } from 'react-router';

/*
 * Close a full-page settings overlay. Return to the previous in-app page when
 * there is history to go back to, otherwise land on the dashboard — never the
 * public marketing home (which is where a bare navigate('/') dumped the user).
 * Shared by /settings and /settings/:tab so both behave identically.
 */
export function closeSettingsOverlay(navigate: NavigateFunction): void {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    navigate(-1);
  } else {
    navigate('/dashboard');
  }
}
