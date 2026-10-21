import { describe, expect, it } from 'vitest';
import { hasReadyDeployment } from './dashboard-onboarding';

// Pure decision tests. These records do not represent an actual published application.
describe('publication readiness decision', () => {
  it('recognizes READY even among other attempts', () => {
    expect(hasReadyDeployment([{ status: 'READY' }])).toBe(true);
    expect(hasReadyDeployment([{ status: 'FAILED' }, { status: 'READY' }, { status: 'QUEUED' }])).toBe(true);
  });

  it.each(['QUEUED', 'BUILDING', 'FAILED', 'CANCELED'])('does not count %s as a publication', (status) => {
    expect(hasReadyDeployment([{ status }])).toBe(false);
  });

  it('does not count missing or empty records as a publication', () => {
    expect(hasReadyDeployment(undefined)).toBe(false);
    expect(hasReadyDeployment([])).toBe(false);
  });
});
