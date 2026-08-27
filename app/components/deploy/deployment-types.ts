import {
  getDeployRemainingCopy,
  type DeployRemainingCopy,
  type DeployRemainingKey,
} from '~/lib/i18n/catalogs/deploy-remaining';

/**
 * Replit-parity deployment-type model for the Publish panel.
 *
 * E-Code's managed deploy backend fulfils three tiers: `static` builds served at
 * `/static-deployments/<id>/`, `autoscale` managed HTTP services routed through
 * the preview proxy, `reserved-vm` always-on services when the operator reports
 * that capability, and `scheduled` commands with persisted run history. The
 * capability is fail-closed: callers must pass a positive server proof before
 * Reserved VM becomes selectable.
 */
export type DeploymentTypeId = 'static' | 'autoscale' | 'reserved-vm' | 'scheduled';

export type DeploymentTypeStatus = 'available' | 'capability-gated';

export interface DeploymentType {
  id: DeploymentTypeId;

  /** Short product name shown on the selector card. */
  name: string;

  /** One-line value proposition. */
  tagline: string;

  /** What it does, for the detail panel. */
  description: string;
  status: DeploymentTypeStatus;

  /** Best-fit app shape, e.g. "Static sites & SPAs". */
  bestFor: string;

  /**
   * For capability-gated tiers: operator prerequisites explaining why the
   * current environment cannot safely activate the tier.
   */
  requires?: { code: string[]; infra: string[] };
}

type DeploymentTypeCopyKeys = Readonly<{
  name: DeployRemainingKey;
  tagline: DeployRemainingKey;
  detailKey: DeployRemainingKey;
  bestFor: DeployRemainingKey;
}>;

const DEPLOYMENT_TYPE_COPY_KEYS: Readonly<Record<DeploymentTypeId, DeploymentTypeCopyKeys>> = {
  static: {
    name: 'deployRemaining.type.static.name',
    tagline: 'deployRemaining.type.static.tagline',
    detailKey: 'deployRemaining.type.static.description',
    bestFor: 'deployRemaining.type.static.bestFor',
  },
  autoscale: {
    name: 'deployRemaining.type.autoscale.name',
    tagline: 'deployRemaining.type.autoscale.tagline',
    detailKey: 'deployRemaining.type.autoscale.description',
    bestFor: 'deployRemaining.type.autoscale.bestFor',
  },
  'reserved-vm': {
    name: 'deployRemaining.type.reservedVm.name',
    tagline: 'deployRemaining.type.reservedVm.tagline',
    detailKey: 'deployRemaining.type.reservedVm.description',
    bestFor: 'deployRemaining.type.reservedVm.bestFor',
  },
  scheduled: {
    name: 'deployRemaining.type.scheduled.name',
    tagline: 'deployRemaining.type.scheduled.tagline',
    detailKey: 'deployRemaining.type.scheduled.description',
    bestFor: 'deployRemaining.type.scheduled.bestFor',
  },
};

const DEPLOYMENT_TYPE_STATUS: Readonly<Record<DeploymentTypeId, DeploymentTypeStatus>> = {
  static: 'available',
  autoscale: 'available',
  'reserved-vm': 'capability-gated',
  scheduled: 'available',
};

const DEPLOYMENT_TYPE_IDS: readonly DeploymentTypeId[] = ['static', 'autoscale', 'reserved-vm', 'scheduled'];

function createDeploymentType(
  id: DeploymentTypeId,
  copy: DeployRemainingCopy,
  capabilities: Readonly<{ reservedVmAvailable?: boolean }>,
): DeploymentType {
  const keys = DEPLOYMENT_TYPE_COPY_KEYS[id];

  const base = {
    id,
    name: copy[keys.name],
    tagline: copy[keys.tagline],
    description: copy[keys.detailKey],
    status: id === 'reserved-vm' && capabilities.reservedVmAvailable ? 'available' : DEPLOYMENT_TYPE_STATUS[id],
    bestFor: copy[keys.bestFor],
  } satisfies DeploymentType;

  if (id !== 'reserved-vm' || capabilities.reservedVmAvailable) {
    return base;
  }

  return {
    ...base,
    requires: {
      code: [
        copy['deployRemaining.type.reservedVm.requires.code.selection'],
        copy['deployRemaining.type.reservedVm.requires.code.lifecycle'],
      ],
      infra: [
        copy['deployRemaining.type.reservedVm.requires.infra.compute'],
        copy['deployRemaining.type.reservedVm.requires.infra.ingress'],
        copy['deployRemaining.type.reservedVm.requires.infra.storage'],
      ],
    },
  };
}

export function getDeploymentTypes(
  language?: string | null,
  capabilities: Readonly<{ reservedVmAvailable?: boolean }> = {},
): readonly DeploymentType[] {
  const copy = getDeployRemainingCopy(language);

  return DEPLOYMENT_TYPE_IDS.map((id) => createDeploymentType(id, copy, capabilities));
}

/** Backward-compatible English data for non-React callers. */
export const DEPLOYMENT_TYPES: readonly DeploymentType[] = getDeploymentTypes('en');

export function getDeploymentType(id: string, language?: string | null): DeploymentType | undefined {
  return getDeploymentTypes(language).find((type) => type.id === id);
}

export function isDeploymentTypeAvailable(
  id: string,
  capabilities: Readonly<{ reservedVmAvailable?: boolean }> = {},
): boolean {
  return getDeploymentTypes('en', capabilities).find((type) => type.id === id)?.status === 'available';
}

/** The default selection shown when the Publish panel opens. */
export const DEFAULT_DEPLOYMENT_TYPE: DeploymentTypeId = 'static';
