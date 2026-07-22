import { describe, expect, it } from 'vitest';
import { collectionFromResponse, searchableText, sortRows, adminSections } from './admin-model';

describe('admin model helpers', () => {
  it('lists all required admin sections', () => {
    expect(adminSections).toHaveLength(32);
    expect(adminSections.map((section) => section.id)).toContain('kubernetes-health');
    expect(adminSections.map((section) => section.id)).toContain('incident-banner');
  });

  it('extracts and sorts records from API responses', () => {
    const users = collectionFromResponse({ users: [{ email: 'b@example.com' }, { email: 'a@example.com' }] }, adminSections.find((section) => section.id === 'users')!);
    expect(sortRows(users, 'email', 'asc').map((row) => row.email)).toEqual(['a@example.com', 'b@example.com']);
    expect(searchableText(users[0])).toContain('b@example.com');
  });
});

