import { describe, expect, it } from 'vitest';

import { notificationsEn, notificationsFr } from './notifications';

describe('notification catalogs', () => {
  it('keeps exact English and French key parity', () => {
    expect(Object.keys(notificationsFr).sort()).toEqual(Object.keys(notificationsEn).sort());
  });

  it('uses the approved French terminology and plural forms', () => {
    expect(notificationsFr['notifications.category.deployments.title']).toContain('déploiements');
    expect(notificationsFr['notifications.feed.unread_one']).toContain('non lue');
    expect(notificationsFr['notifications.feed.unread_other']).toContain('non lues');
    expect(notificationsFr['notifications.page.description']).toContain('espace de travail');
  });
});
