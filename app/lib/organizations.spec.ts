import { describe, expect, it } from 'vitest';
import { buildOrganizationRows, organizationLabel, type Organization } from './organizations';

describe('organizationLabel', () => {
  it('prefers name, then slug, then id', () => {
    expect(organizationLabel({ id: 'o1', name: 'Acme', slug: 'acme' })).toBe('Acme');
    expect(organizationLabel({ id: 'o1', slug: 'acme' })).toBe('acme');
    expect(organizationLabel({ id: 'o1' })).toBe('o1');
  });
});

describe('buildOrganizationRows', () => {
  it('renders one row per organization with an honest, non-switching detail', () => {
    const orgs: Organization[] = [
      { id: 'o1', name: 'First' },
      { id: 'o2', name: 'Second' },
    ];

    const rows = buildOrganizationRows(orgs);

    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('First');
    expect(rows[1].title).toBe('Second');

    /*
     * The page cannot switch the active org, so no row may claim to be the
     * "current" one or imply selecting it changes anything.
     */
    for (const row of rows) {
      expect(row.detail.toLowerCase()).not.toContain('current');
      expect(row.detail.toLowerCase()).not.toContain('switch');
    }
  });

  it('returns a single empty-state row when the user has no organizations', () => {
    const rows = buildOrganizationRows([]);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('No organizations');
    expect(rows[0].detail).toContain('Create an organization');
  });
});
