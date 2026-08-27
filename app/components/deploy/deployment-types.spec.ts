import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEPLOYMENT_TYPE,
  DEPLOYMENT_TYPES,
  getDeploymentType,
  isDeploymentTypeAvailable,
} from './deployment-types';

describe('deployment-types', () => {
  it('exposes the four Replit-parity tiers', () => {
    expect(DEPLOYMENT_TYPES.map((t) => t.id)).toEqual(['static', 'autoscale', 'reserved-vm', 'scheduled']);
  });

  it('marks static + autoscale + scheduled available (all fulfilled by the backend)', () => {
    expect(isDeploymentTypeAvailable('static')).toBe(true);
    expect(isDeploymentTypeAvailable('autoscale')).toBe(true);
    expect(isDeploymentTypeAvailable('scheduled')).toBe(true);

    expect(isDeploymentTypeAvailable('reserved-vm')).toBe(false);
    expect(isDeploymentTypeAvailable('reserved-vm', { reservedVmAvailable: true })).toBe(true);
  });

  it('defaults to the static deployment tier', () => {
    expect(DEFAULT_DEPLOYMENT_TYPE).toBe('static');
    expect(isDeploymentTypeAvailable(DEFAULT_DEPLOYMENT_TYPE)).toBe(true);
  });

  it('every capability-gated tier documents its operator requirements', () => {
    for (const type of DEPLOYMENT_TYPES) {
      if (type.status === 'capability-gated') {
        expect(type.requires?.infra.length, `${type.id} needs infra reqs`).toBeGreaterThan(0);
        expect(type.requires?.code.length, `${type.id} needs code reqs`).toBeGreaterThan(0);
      } else {
        expect(type.requires).toBeUndefined();
      }
    }
  });

  it('returns undefined for an unknown id rather than throwing', () => {
    expect(getDeploymentType('nope')).toBeUndefined();
    expect(isDeploymentTypeAvailable('nope')).toBe(false);
  });
});
