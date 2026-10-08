import assert from 'node:assert/strict';
import { parseAllDocuments } from 'yaml';

function matches(selector = {}, labels = {}) {
  return (
    Object.entries(selector.matchLabels ?? {}).every(([key, value]) => labels[key] === value) &&
    (selector.matchExpressions ?? []).every(({ key, operator, values = [] }) => {
      if (operator === 'In') {
        return values.includes(labels[key]);
      }

      if (operator === 'NotIn') {
        return !values.includes(labels[key]);
      }

      if (operator === 'Exists') {
        return key in labels;
      }

      if (operator === 'DoesNotExist') {
        return !(key in labels);
      }

      throw new Error(`Unsupported selector operator: ${operator}`);
    })
  );
}

function inCidr(ip, cidr) {
  const number = (value) => value.split('.').reduce((total, octet) => (total * 256 + Number(octet)) >>> 0, 0);
  const [network, prefix] = cidr.split('/');
  const mask = Number(prefix) === 0 ? 0 : (0xffffffff << (32 - Number(prefix))) >>> 0;

  return (number(ip) & mask) >>> 0 === (number(network) & mask) >>> 0;
}

/** Evaluate the UNION of rendered chart policies, not a single intended policy. */
export function validateScreenshotterNetwork(rendered) {
  const documents = parseAllDocuments(rendered)
    .map((document) => {
      if (document.errors.length) {
        throw document.errors[0];
      }

      return document.toJSON();
    })
    .filter(Boolean);

  const deployment = documents.find(
    (document) =>
      document.kind === 'Deployment' &&
      document.spec.template.metadata.labels?.['app.kubernetes.io/name'] === 'screenshotter',
  );
  assert(deployment, 'positive control: rendered screenshotter Deployment exists');

  const labels = deployment.spec.template.metadata.labels;

  const policies = documents.filter(
    (document) =>
      document.kind === 'NetworkPolicy' &&
      document.spec.policyTypes?.includes('Egress') &&
      matches(document.spec.podSelector, labels),
  );
  assert(
    policies.some((policy) => policy.metadata.name === 'deny-all-default'),
    'default denial must select screenshotter',
  );
  assert(
    policies.some((policy) => policy.metadata.name === 'allow-screenshotter-egress'),
    'screenshotter must have its own egress policy',
  );

  const service = documents.find(
    (document) => document.kind === 'Service' && matches({ matchLabels: document.spec.selector }, labels),
  );
  assert(service, 'positive control: rendered screenshotter Service exists');

  const proxy = documents.find(
    (document) => document.kind === 'Service' && document.spec.selector?.['app.kubernetes.io/name'] === 'preview-proxy',
  );
  assert(proxy, 'preview proxy Service exists');

  const proxyPort = proxy.spec.ports[0].port;

  const allowed = ({ ip, port, protocol = 'TCP', name = '', namespace = name ? 'vibecore' : 'external' }) =>
    policies.some((policy) =>
      (policy.spec.egress ?? []).some(
        (rule) =>
          (!rule.ports || rule.ports.some((entry) => (entry.protocol ?? 'TCP') === protocol && entry.port === port)) &&
          (!rule.to ||
            rule.to.some((peer) => {
              if (peer.ipBlock) {
                return inCidr(ip, peer.ipBlock.cidr) && !(peer.ipBlock.except ?? []).some((cidr) => inCidr(ip, cidr));
              }

              const namespaceOk = peer.namespaceSelector
                ? matches(peer.namespaceSelector, { 'kubernetes.io/metadata.name': namespace })
                : namespace === 'vibecore';

              return (
                namespaceOk &&
                matches(peer.podSelector, {
                  'app.kubernetes.io/name': name,
                  'app.kubernetes.io/part-of': 'vibecore',
                })
              );
            })),
      ),
    );

  const probes = [
    { ip: '93.184.216.34', port: 443, expect: true },
    { ip: '93.184.216.34', port: 80, expect: false },
    { ip: '10.1.0.3', port: 3001, name: 'api', expect: false },
    { ip: '10.1.0.3', port: 443, name: 'api', expect: false },
    { ip: '10.237.1.3', port: 5432, expect: false },
    { ip: '10.237.0.3', port: 6379, expect: false },
    { ip: '169.254.169.254', port: 443, expect: false },
    { ip: '192.168.1.1', port: 443, expect: false },
    { ip: '172.16.1.1', port: 443, expect: false },
    { ip: '100.64.1.1', port: 443, expect: false },
    { ip: '10.1.0.4', port: proxyPort, name: 'preview-proxy', expect: true },
    { ip: '10.1.0.4', port: 443, name: 'preview-proxy', expect: false },
    { ip: '10.3.0.2', port: 53, namespace: 'kube-system', protocol: 'UDP', expect: true },
    { ip: '10.3.0.2', port: 53, namespace: 'kube-system', protocol: 'TCP', expect: true },
  ];

  for (const probe of probes) {
    assert.equal(
      allowed(probe),
      probe.expect,
      `screenshotter egress ${probe.ip}:${probe.port}/${probe.protocol ?? 'TCP'}`,
    );
  }

  return probes.length;
}
