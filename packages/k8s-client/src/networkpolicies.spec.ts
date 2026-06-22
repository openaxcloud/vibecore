import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAllDocuments } from 'yaml';

/*
 * The workspace runtime's tenant isolation depends on the NetworkPolicy manifest
 * being default-deny with a tightly scoped egress allowlist. These invariants are
 * easy to loosen by accident (delete a CIDR from `except`, add an open egress
 * rule, drop the default-deny policy) and such a regression would silently expose
 * the cloud metadata endpoint or let workspaces reach internal services /
 * each other. This test pins the rendered manifest so CI catches it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, '../../../infra/kubernetes/workspaces-runtime/networkpolicies.yaml');

type NetworkPolicy = {
  kind?: string;
  metadata?: { name?: string; namespace?: string };
  spec?: {
    podSelector?: Record<string, unknown>;
    policyTypes?: string[];
    egress?: Array<{ to?: Array<{ ipBlock?: { cidr?: string; except?: string[] } }>; ports?: unknown[] }>;
  };
};

const policies = parseAllDocuments(readFileSync(manifestPath, 'utf8'))
  .map((doc) => doc.toJSON() as NetworkPolicy)
  .filter((doc): doc is NetworkPolicy => Boolean(doc?.kind === 'NetworkPolicy'));

function policy(name: string) {
  const found = policies.find((p) => p.metadata?.name === name);
  expect(found, `NetworkPolicy "${name}" must exist`).toBeDefined();

  return found!;
}

describe('workspaces-runtime NetworkPolicies', () => {
  it('declares a default-deny policy covering all pods for ingress AND egress', () => {
    const deny = policy('workspace-default-deny');

    // An empty podSelector ({}) selects every pod in the namespace.
    expect(deny.spec?.podSelector).toEqual({});
    expect(deny.spec?.policyTypes).toEqual(expect.arrayContaining(['Ingress', 'Egress']));
    // A default-deny policy must carry no allow rules of its own.
    expect((deny.spec as Record<string, unknown>)?.ingress).toBeUndefined();
    expect((deny.spec as Record<string, unknown>)?.egress).toBeUndefined();
  });

  it('blocks the cloud metadata endpoint and private ranges on every egress allow rule', () => {
    const egress = policy('workspace-controlled-egress');
    const blocked = ['169.254.169.254/32', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

    const ipRules = (egress.spec?.egress ?? []).flatMap((rule) =>
      (rule.to ?? []).filter((target) => target.ipBlock?.cidr === '0.0.0.0/0'),
    );

    // There must be at least one internet-egress rule, and EVERY such rule must
    // exclude the metadata endpoint + all RFC1918 ranges.
    expect(ipRules.length).toBeGreaterThan(0);
    for (const rule of ipRules) {
      for (const cidr of blocked) {
        expect(rule.ipBlock?.except, `egress to 0.0.0.0/0 must exclude ${cidr}`).toContain(cidr);
      }
    }
  });

  it('never opens a wildcard egress rule without an except list', () => {
    for (const p of policies) {
      for (const rule of p.spec?.egress ?? []) {
        for (const target of rule.to ?? []) {
          if (target.ipBlock?.cidr === '0.0.0.0/0') {
            expect(
              (target.ipBlock.except ?? []).length,
              `${p.metadata?.name}: 0.0.0.0/0 egress must have an except list`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});
