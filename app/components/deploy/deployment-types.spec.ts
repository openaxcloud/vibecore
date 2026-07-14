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

  it('marks static + autoscale available (both are fulfilled by the backend)', () => {
    expect(isDeploymentTypeAvailable('static')).toBe(true);
    expect(isDeploymentTypeAvailable('autoscale')).toBe(true);

    for (const id of ['reserved-vm', 'scheduled']) {
      expect(isDeploymentTypeAvailable(id)).toBe(false);
    }
  });

  it('defaults to the only deployable tier', () => {
    expect(DEFAULT_DEPLOYMENT_TYPE).toBe('static');
    expect(isDeploymentTypeAvailable(DEFAULT_DEPLOYMENT_TYPE)).toBe(true);
  });

  it('every coming-soon tier documents its code + infra requirements', () => {
    for (const type of DEPLOYMENT_TYPES) {
      if (type.status === 'coming-soon') {
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
