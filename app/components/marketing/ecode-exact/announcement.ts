/**
 * Marketing announcement bar campaign. Bump the campaign id when the copy
 * changes: the dismissal key embeds it, so a new campaign re-shows the bar
 * for everyone while old dismissals stay untouched.
 *
 * Persistence is SSR/private-mode safe (same pattern as
 * resolve-preferred-model.ts). The root inline boot script mirrors this read
 * before first paint and sets ANNOUNCEMENT_DISMISSED_ATTRIBUTE on <html>, so a
 * dismissed bar never flashes.
 */
export const ANNOUNCEMENT_CAMPAIGN_ID = 'enterprise-cloud-governance';

export const ANNOUNCEMENT_DISMISSED_STORAGE_KEY = `ecode:announcement-dismissed:${ANNOUNCEMENT_CAMPAIGN_ID}`;

export const ANNOUNCEMENT_DISMISSED_ATTRIBUTE = 'data-ecode-announcement-dismissed';

export function readAnnouncementDismissed(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(ANNOUNCEMENT_DISMISSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function persistAnnouncementDismissed() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(ANNOUNCEMENT_DISMISSED_STORAGE_KEY, '1');
  } catch {
    // Storage blocked — the bar stays dismissed for this page via state only.
  }

  document.documentElement.setAttribute(ANNOUNCEMENT_DISMISSED_ATTRIBUTE, 'true');
}
