import { describe, expect, it, vi } from 'vitest';

import {
  CredentialImportError,
  fetchCredentialImportSource,
  type CredentialImportRequest,
} from './credential-import.js';

const ACCESS_CREDENTIAL = 'credential-value-used-only-in-test';

function request(
  provider: CredentialImportRequest['provider'],
  overrides: Partial<CredentialImportRequest> = {},
): CredentialImportRequest {
  return {
    provider,
    accessToken: ACCESS_CREDENTIAL,
    sourceRef: 'source-id',
    fetchImpl: vi.fn(),
    ...overrides,
  };
}

describe('credential-backed import source retrieval', () => {
  it('retrieves a Vercel project and stages a sanitized configuration snapshot', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.toString()).toBe('https://api.vercel.com/v9/projects/acme-web?teamId=team_7');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${ACCESS_CREDENTIAL}`);

      return Response.json({
        id: 'project_1',
        name: 'acme-web',
        framework: 'nextjs',
        updatedAt: 1_800_000_000_000,
        link: { type: 'github', org: 'acme', repo: 'web', gitCredentialId: 'must-not-leave-provider' },
        rootDirectory: 'apps/web',
        buildCommand: 'pnpm build',
        environmentVariables: [{ key: 'PRIVATE', value: 'must-not-be-staged' }],
      });
    });

    const result = await fetchCredentialImportSource(
      request('vercel', { sourceRef: 'acme-web', scopeRef: 'team_7', fetchImpl }),
    );

    expect(result.preview).toMatchObject({
      provider: 'vercel',
      title: 'acme-web',
      warnings: ['vercelConfigurationOnly'],
      paths: ['.e-code/import/vercel-project.json'],
    });
    expect(result.preview.facts).toEqual(
      expect.arrayContaining([
        { key: 'framework', value: 'nextjs' },
        { key: 'repository', value: 'acme/web' },
      ]),
    );
    const staged = result.files[0]?.content ?? '';
    expect(staged).toContain('project_1');
    expect(staged).not.toContain(ACCESS_CREDENTIAL);
    expect(staged).not.toContain('must-not-leave-provider');
    expect(staged).not.toContain('must-not-be-staged');
  });

  it('retrieves a full Figma document from either a file URL or key and previews real counts', async () => {
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(String(input)).toBe('https://api.figma.com/v1/files/FigmaKey_123');
      expect(new Headers(init?.headers).get('x-figma-token')).toBe(ACCESS_CREDENTIAL);

      return Response.json({
        name: 'Checkout design',
        version: 'v19',
        lastModified: '2030-01-02T03:04:05.000Z',
        document: { id: '0:0', children: [{ id: '1:1' }, { id: '2:2' }] },
        components: { a: {}, b: {} },
        componentSets: { c: {} },
      });
    });

    const result = await fetchCredentialImportSource(
      request('figma', {
        sourceRef: 'https://www.figma.com/design/FigmaKey_123/Checkout?node-id=1-2',
        fetchImpl,
      }),
    );

    expect(result.preview).toMatchObject({
      title: 'Checkout design',
      sourceRef: 'FigmaKey_123',
      warnings: ['figmaDocumentSnapshot'],
    });
    expect(result.preview.facts).toEqual(
      expect.arrayContaining([
        { key: 'pages', value: '2' },
        { key: 'components', value: '2' },
        { key: 'componentSets', value: '1' },
      ]),
    );
    expect(result.files[0]?.content).toContain('Checkout design');
    expect(result.files[0]?.content).not.toContain(ACCESS_CREDENTIAL);
  });

  it('validates Claude access with live model data and stages the exact explicit export', async () => {
    const sourcePayload = '# Artifact\n\nexport const answer = 42;\n';
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(String(input)).toBe('https://api.anthropic.com/v1/models?limit=20');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-api-key')).toBe(ACCESS_CREDENTIAL);
      expect(headers.get('anthropic-version')).toBe('2023-06-01');

      return Response.json({ data: [{ id: 'claude-model-id', display_name: 'Claude verified model' }] });
    });

    const result = await fetchCredentialImportSource(
      request('claude', {
        sourceRef: 'Billing artifact',
        sourcePayload,
        targetPath: 'src/billing-artifact.ts',
        fetchImpl,
      }),
    );

    expect(result.files).toEqual([{ path: 'src/billing-artifact.ts', content: sourcePayload }]);
    expect(result.preview).toMatchObject({
      title: 'Billing artifact',
      warnings: ['claudeExactSource'],
      paths: ['src/billing-artifact.ts'],
    });
    expect(result.preview.facts).toContainEqual({ key: 'verifiedModel', value: 'Claude verified model' });
    expect(JSON.stringify(result)).not.toContain(ACCESS_CREDENTIAL);
  });

  it.each([
    [401, 'IMPORT_CONNECTOR_CREDENTIAL_REJECTED', 424],
    [403, 'IMPORT_CONNECTOR_SOURCE_FORBIDDEN', 403],
    [404, 'IMPORT_CONNECTOR_SOURCE_NOT_FOUND', 404],
    [503, 'IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE', 502],
  ] as const)('maps provider HTTP %i to stable code %s without upstream text', async (status, code, publicStatus) => {
    const fetchImpl = vi.fn(async () => new Response('credential or provider diagnostic', { status }));

    await expect(
      fetchCredentialImportSource(request('vercel', { sourceRef: 'project', fetchImpl })),
    ).rejects.toMatchObject({ code, statusCode: publicStatus });
  });

  it('rejects traversal in a Claude target path before any project is staged', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: [{ id: 'claude-model-id' }] }));

    await expect(
      fetchCredentialImportSource(
        request('claude', {
          sourceRef: 'Export',
          sourcePayload: 'content',
          targetPath: '../outside.txt',
          fetchImpl,
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CredentialImportError>>({
        code: 'IMPORT_CONNECTOR_SOURCE_INVALID',
        statusCode: 400,
      }),
    );
  });

  it('bounds provider bodies even when content-length is missing', async () => {
    const oversized = JSON.stringify({ document: { children: [] }, payload: 'x'.repeat(8 * 1024 * 1024) });
    const fetchImpl = vi.fn(async () => new Response(oversized, { status: 200 }));

    await expect(
      fetchCredentialImportSource(request('figma', { sourceRef: 'FigmaKey_123', fetchImpl })),
    ).rejects.toMatchObject({ code: 'IMPORT_CONNECTOR_SOURCE_TOO_LARGE', statusCode: 413 });
  });

  it('maps a provider body stream failure to a stable retryable error', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error('private transport diagnostic'));
            },
          }),
          { status: 200 },
        ),
    );

    await expect(
      fetchCredentialImportSource(request('figma', { sourceRef: 'FigmaKey_123', fetchImpl })),
    ).rejects.toMatchObject({ code: 'IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE', statusCode: 502 });
  });
});
