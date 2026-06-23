import { describe, expect, it } from 'vitest';
import { getStatusMessage, getTabUpdateStatus, type TabStatusInputs } from './tab-status';

const baseInputs: TabStatusInputs = {
  hasNewFeatures: false,
  unviewedFeaturesCount: 0,
  hasUnreadNotifications: false,
  unreadNotificationsCount: 0,
};

describe('getTabUpdateStatus', () => {
  it('reflects real feature/notification signals', () => {
    expect(getTabUpdateStatus('features', { ...baseInputs, hasNewFeatures: true })).toBe(true);
    expect(getTabUpdateStatus('features', baseInputs)).toBe(false);
    expect(getTabUpdateStatus('notifications', { ...baseInputs, hasUnreadNotifications: true })).toBe(true);
    expect(getTabUpdateStatus('notifications', baseInputs)).toBe(false);
  });

  it('never shows a connection-issue badge on connector tabs (false-positive bug)', () => {
    /*
     * Even with feature/notification signals present, connector tiles must not
     * light up — they are no longer driven by the global app-backend connection
     * status, so a backend latency blip must not flag any provider.
     */
    const noisyInputs: TabStatusInputs = {
      hasNewFeatures: true,
      unviewedFeaturesCount: 3,
      hasUnreadNotifications: true,
      unreadNotificationsCount: 5,
    };

    for (const tab of ['github', 'gitlab', 'supabase', 'vercel', 'netlify'] as const) {
      expect(getTabUpdateStatus(tab, noisyInputs)).toBe(false);
      expect(getStatusMessage(tab, noisyInputs)).toBe('');
    }
  });
});

describe('getStatusMessage', () => {
  it('pluralizes feature and notification counts', () => {
    expect(getStatusMessage('features', { ...baseInputs, unviewedFeaturesCount: 1 })).toBe('1 new feature to explore');
    expect(getStatusMessage('features', { ...baseInputs, unviewedFeaturesCount: 2 })).toBe('2 new features to explore');
    expect(getStatusMessage('notifications', { ...baseInputs, unreadNotificationsCount: 1 })).toBe(
      '1 unread notification',
    );
    expect(getStatusMessage('notifications', { ...baseInputs, unreadNotificationsCount: 0 })).toBe(
      '0 unread notifications',
    );
  });

  it('returns no message for tabs without status', () => {
    expect(getStatusMessage('data', baseInputs)).toBe('');
  });
});
