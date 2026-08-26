import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  canonicalizeProjectManifest,
  createDefaultProjectManifest,
  parseProjectManifest,
  PROJECT_MANIFEST_MAX_ARTIFACTS,
  PROJECT_MANIFEST_MAX_BYTES,
  PROJECT_MANIFEST_SCHEMA_VERSION,
  projectManifestArtifactKinds,
  projectManifestComponentKinds,
  projectManifestDeploymentTypes,
  projectManifestDigest,
  serializeProjectManifest,
  verifyStoredProjectManifestRevision,
} from './project-manifest.js';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL(`./tests/fixtures/project-manifests/${name}`, import.meta.url)), 'utf8'),
  );
}

type DocumentedProjectManifestSchema = {
  properties: { schemaVersion: { const: number }; artifacts: { maxItems: number } };
  $defs: {
    artifact: { properties: { kind: { enum: readonly string[] } } };
    component: { properties: { kind: { enum: readonly string[] } } };
    publishConfig: { properties: { deploymentType: { enum: readonly string[] } } };
  };
  'x-maxSerializedBytes': number;
  additionalProperties: boolean;
};

function documentedSchema(): DocumentedProjectManifestSchema {
  return JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../docs/parity/PROJECT_MANIFEST_SCHEMA.json', import.meta.url)), 'utf8'),
  ) as DocumentedProjectManifestSchema;
}

function errorCode(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code;
  }
}

describe('ProjectManifest runtime contract', () => {
  it('accepts and canonicalizes the production fixture with a stable sha256 digest', () => {
    const input = fixture('valid-v1.json');

    const reordered = {
      ...(input as Record<string, unknown>),
      scopes: ['deploy:preview', 'deploy:production'],
      artifacts: [
        {
          ...((input as { artifacts: Array<Record<string, unknown>> }).artifacts[0] ?? {}),
          components: [
            { componentId: 'api', kind: 'API' },
            { componentId: 'frontend', kind: 'WEB_FRONTEND' },
          ],
        },
      ],
    };

    expect(projectManifestDigest(reordered)).toBe(projectManifestDigest(input));
    expect(projectManifestDigest(input)).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(serializeProjectManifest(input).endsWith('\n')).toBe(true);
    expect(canonicalizeProjectManifest(input).scopes).toEqual(['deploy:preview', 'deploy:production']);
  });

  it('keeps the default for legacy/new projects valid and deterministic', () => {
    const first = createDefaultProjectManifest('project-123');
    const second = createDefaultProjectManifest('project-123');

    expect(first).toEqual(second);
    expect(parseProjectManifest(first)).toEqual(first);
    expect(first).toMatchObject({ schemaVersion: 1, manifestVersion: 1, projectId: 'project-123' });
  });

  it('keeps the published JSON schema enums and hard limits aligned with runtime', () => {
    const schema = documentedSchema();

    expect(schema.properties.schemaVersion.const).toBe(PROJECT_MANIFEST_SCHEMA_VERSION);
    expect(schema.properties.artifacts.maxItems).toBe(PROJECT_MANIFEST_MAX_ARTIFACTS);
    expect(schema['x-maxSerializedBytes']).toBe(PROJECT_MANIFEST_MAX_BYTES);
    expect(schema.$defs.artifact.properties.kind.enum).toEqual(projectManifestArtifactKinds);
    expect(schema.$defs.component.properties.kind.enum).toEqual(projectManifestComponentKinds);
    expect(schema.$defs.publishConfig.properties.deploymentType.enum).toEqual(projectManifestDeploymentTypes);
    expect(schema.additionalProperties).toBe(false);
  });

  it('MUTATION: refuses the historical two-mobile counterexample and duplicate relation ids', () => {
    const base = createDefaultProjectManifest('project-123');

    const invalid = {
      ...base,
      artifacts: [
        { artifactId: 'mobile-a', kind: 'MOBILE_APP', sourceRoot: 'apps/a' },
        { artifactId: 'mobile-b', kind: 'MOBILE_APP', sourceRoot: 'apps/b' },
      ],
    };

    expect(errorCode(() => parseProjectManifest(invalid))).toBe('PROJECT_MANIFEST_INVALID');

    const duplicated = {
      ...base,
      artifacts: [
        { artifactId: 'same', kind: 'WEB_APP', sourceRoot: 'apps/a' },
        { artifactId: 'same', kind: 'WEB_APP', sourceRoot: 'apps/b' },
      ],
    };
    expect(errorCode(() => parseProjectManifest(duplicated))).toBe('PROJECT_MANIFEST_INVALID');
  });

  it('MUTATION: refuses dangling component bindings instead of trusting documentation-only relations', () => {
    expect(errorCode(() => parseProjectManifest(fixture('invalid-dangling-binding.json')))).toBe(
      'PROJECT_MANIFEST_INVALID',
    );
  });

  it('fails closed on traversal, unknown keys, duplicate scopes and invalid scheduled config', () => {
    const base = createDefaultProjectManifest('project-123');

    const variants = [
      { ...base, artifacts: [{ artifactId: 'app', kind: 'WEB_APP', sourceRoot: '../other' }] },
      { ...base, privileged: true },
      { ...base, scopes: ['deploy:preview', 'deploy:preview'] },
      {
        ...base,
        artifacts: [
          {
            artifactId: 'job',
            kind: 'WEB_APP',
            sourceRoot: '.',
            publishConfig: { deploymentType: 'SCHEDULED' },
          },
        ],
      },
      {
        ...base,
        artifacts: [
          {
            artifactId: 'job',
            kind: 'WEB_APP',
            sourceRoot: '.',
            publishConfig: { deploymentType: 'SCHEDULED', schedule: 'not a cron expression' },
          },
        ],
      },
    ];

    for (const invalid of variants) {
      expect(errorCode(() => parseProjectManifest(invalid))).toBe('PROJECT_MANIFEST_INVALID');
    }
  });

  it('returns a stable unsupported-version error and bounds parser work', () => {
    expect(errorCode(() => parseProjectManifest({ schemaVersion: 999 }))).toBe('PROJECT_MANIFEST_SCHEMA_UNSUPPORTED');
    expect(
      errorCode(() =>
        parseProjectManifest({
          ...createDefaultProjectManifest('project-123'),
          entitlementsRef: `ref:${'x'.repeat(PROJECT_MANIFEST_MAX_BYTES)}`,
        }),
      ),
    ).toBe('PROJECT_MANIFEST_TOO_LARGE');

    const canary = 'private-version-value';

    expect(() => parseProjectManifest({ schemaVersion: canary })).toThrowError(
      expect.not.objectContaining({ message: expect.stringContaining(canary) }),
    );
  });

  it('MUTATION: re-hashes stored canonical bytes and refuses metadata or payload tampering', () => {
    const manifest = createDefaultProjectManifest('project-123');

    const record = {
      projectId: manifest.projectId,
      schemaVersion: manifest.schemaVersion,
      manifestVersion: manifest.manifestVersion,
      digest: projectManifestDigest(manifest),
      manifest,
    };

    expect(verifyStoredProjectManifestRevision(record, 'project-123')).toEqual(manifest);

    for (const corrupted of [
      { ...record, digest: `sha256:${'0'.repeat(64)}` },
      { ...record, manifestVersion: 2 },
      { ...record, manifest: { ...manifest, projectId: 'another-project' } },
    ]) {
      expect(() => verifyStoredProjectManifestRevision(corrupted, 'project-123')).toThrowError(
        expect.objectContaining({ code: 'PROJECT_MANIFEST_CORRUPTED' }),
      );
    }
  });
});
