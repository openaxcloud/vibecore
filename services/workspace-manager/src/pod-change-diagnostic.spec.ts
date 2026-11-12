import { describe, expect, it } from 'vitest';
import { podChangeDiagnostic } from './pod-change-diagnostic.js';

const pod = (env: unknown[]) => ({ spec: { containers: [{ image: 'private-image', env }] } });

const previous = (value: unknown) => ({
  metadata: { annotations: { 'kubectl.kubernetes.io/last-applied-configuration': JSON.stringify(value) } },
});
describe('bounded pod change diagnostics', () => {
  it('reports actual env changes without retaining names, references or values', () => {
    const before = pod([{ name: 'PRIVATE_NAME', value: 'PRIVATE_VALUE' }]);

    const after = pod([
      { name: 'OTHER_PRIVATE_NAME', valueFrom: { secretKeyRef: { name: 'PRIVATE_SECRET', key: 'PRIVATE_KEY' } } },
    ]);

    const result = podChangeDiagnostic(previous(before), after);
    expect(result).toEqual({ baselineAvailable: true, categories: ['env'], envOrderingOnly: false });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|image|secretKeyRef/);
  });
  it('distinguishes env ordering from changed values and ignores object property order', () => {
    const a = { name: 'A', value: 'one' };
    const b = { name: 'B', value: 'two' };
    expect(podChangeDiagnostic(previous(pod([a, b])), pod([b, a]))).toEqual({
      baselineAvailable: true,
      categories: ['env'],
      envOrderingOnly: true,
    });
    expect(podChangeDiagnostic(previous(pod([a])), pod([{ value: 'one', name: 'A' }]))).toEqual({
      baselineAvailable: true,
      categories: [],
    });
  });
  it('has bounded fixed categories regardless of manifest cardinality', () => {
    const result = podChangeDiagnostic(
      previous(pod([])),
      pod(Array.from({ length: 5000 }, (_, i) => ({ name: `SECRET_${i}`, value: 'secret' }))),
    );
    expect(JSON.stringify(result).length).toBeLessThan(100);
    expect(result.categories).toEqual(['env']);
  });
  it('does not expose absent, malformed or oversized annotations', () => {
    for (const annotation of [undefined, 'secret not JSON', 'x'.repeat(1_048_577)]) {
      expect(
        podChangeDiagnostic(
          { metadata: { annotations: { 'kubectl.kubernetes.io/last-applied-configuration': annotation } } },
          pod([]),
        ),
      ).toEqual({ baselineAvailable: false, categories: [] });
    }
  });
});
