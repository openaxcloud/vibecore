import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectImportMaterializationPolicy } from './project-import-hub.js';
import {
  ProjectImportSourceService,
  parseCsvDataset,
  parseXlsxDatasets,
  type ProjectImportSourceContext,
  type ProjectImportSourceFile,
} from './project-import-source-service.js';
import type { GitProvider, ProjectFile } from './project-storage.js';

const directPolicy: ProjectImportMaterializationPolicy = {
  copySecretValues: false,
  copyDatabaseData: false,
  allowSpreadsheetSeedData: false,
  useAgent: false,
  scaffold: true,
};

const agentPolicy: ProjectImportMaterializationPolicy = {
  copySecretValues: false,
  copyDatabaseData: false,
  allowSpreadsheetSeedData: true,
  useAgent: true,
  scaffold: true,
};

function context(
  source: ProjectImportSourceContext['source'],
  input: ProjectImportSourceContext['input'],
): ProjectImportSourceContext {
  return { organizationId: 'org-1', userId: 'user-1', source, input };
}

function projectFile(path: string, content: string, encoding: ProjectFile['encoding'] = 'utf8'): ProjectFile {
  return { path, content, encoding, updatedAt: '2026-07-16T00:00:00.000Z' };
}

function uploadedFile(fileName: string, bytes: Buffer, mediaType: string) {
  return {
    fileName,
    contentBase64: bytes.toString('base64'),
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    mediaType,
  };
}

class GitFixture {
  files: ProjectFile[];
  readonly calls: Array<{ repositoryUrl: string; branch?: string }> = [];

  constructor(files: ProjectFile[]) {
    this.files = files;
  }

  readonly provider: Pick<GitProvider, 'importRepository'> = {
    importRepository: async (input) => {
      this.calls.push(input);
      return {
        files: structuredClone(this.files),
        defaultBranch: input.branch ?? 'main',
        remoteUrl: input.repositoryUrl,
      };
    },
  };
}

async function zipBytes(entries: Array<{ path: string; content: string | Buffer }>) {
  const zip = new JSZip();
  for (const entry of entries) zip.file(entry.path, entry.content);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function xlsxBytes() {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Customers" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0"?><worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Name</t></is></c><c r="B1" t="inlineStr"><is><t>Active</t></is></c></row>' +
      '<row r="2"><c r="A2" t="inlineStr"><is><t>Alice</t></is></c><c r="B2" t="b"><v>1</v></c></row>' +
      '</sheetData></worksheet>',
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

function filesAsText(files: readonly ProjectImportSourceFile[]) {
  return files
    .filter((file) => file.encoding === 'utf8')
    .map((file) => file.content)
    .join('\n');
}

describe('ProjectImportSourceService repository and archive sources', () => {
  it('really imports GitHub/Bitbucket through GitProvider and strips secrets, VCS data, and database rows', async () => {
    const githubToken = `ghp_${'a'.repeat(30)}`;
    const git = new GitFixture([
      projectFile(
        'package.json',
        JSON.stringify({
          scripts: { dev: 'RUNTIME_TOKEN=creator-runtime-token vite' },
          devDependencies: { vite: '^7.0.0' },
        }),
      ),
      projectFile(
        'src/main.ts',
        `const API_TOKEN = "creator-code-secret";\nconst token = "${githubToken}";\nconst db = "postgres://owner:password@db/private";`,
      ),
      projectFile('.env', 'DATABASE_URL=postgres://private'),
      projectFile('.git/config', '[remote "origin"]\nurl=https://token@github.com/private/repo'),
      projectFile('backup.sql', "INSERT INTO users VALUES ('private row');"),
      projectFile('migrations/001_create_users.sql', 'CREATE TABLE users(id text primary key);'),
      projectFile('assets/logo.bin', Buffer.from([0, 1, 2, 3]).toString('base64'), 'base64'),
    ]);
    const service = new ProjectImportSourceService({ gitProvider: git.provider });
    const request = context('github', {
      repositoryUrl: 'https://replit.com/github.com/openaxcloud/example-app',
      branch: 'main',
      name: 'Example app',
    });

    const inspected = await service.inspectSource(request);
    expect(git.calls[0]).toEqual({ repositoryUrl: 'https://github.com/openaxcloud/example-app', branch: 'main' });
    expect(inspected.metadata).toMatchObject({
      source: 'github',
      fileCount: 4,
      defaultBranch: 'main',
      removedPaths: ['.env', '.git/config', 'backup.sql'],
    });
    expect(inspected.validation).toMatchObject({ contentHash: inspected.metadata.contentHash });
    expect(inspected.generatedConfig?.[0]?.path).toBe('.vibecore/import.json');
    expect(inspected.files.find((file) => file.path === 'assets/logo.bin')).not.toHaveProperty('content');
    const inspectedText = JSON.stringify(inspected);
    expect(inspectedText).not.toContain('creator-runtime-token');
    expect(inspectedText).not.toContain('creator-code-secret');
    expect(inspectedText).not.toContain(githubToken);
    expect(inspectedText).not.toContain('private row');

    const materialized = await service.materializeSource({
      ...request,
      policy: directPolicy,
      expectedContentHash: inspected.metadata.contentHash,
    });
    expect(materialized.files.map((file) => file.path)).toEqual([
      'assets/logo.bin',
      'migrations/001_create_users.sql',
      'package.json',
      'src/main.ts',
    ]);
    const safeText = filesAsText(materialized.files);
    expect(safeText).toContain('RUNTIME_TOKEN=${RUNTIME_TOKEN}');
    expect(safeText).toContain('const API_TOKEN = "<redacted>"');
    expect(safeText).toContain('<redacted-database-url>');
    expect(safeText).not.toContain('creator-code-secret');

    const bitbucket = await service.inspectSource(
      context('bitbucket', { repositoryUrl: 'https://bitbucket.org/team/example-app' }),
    );
    expect(bitbucket.metadata.source).toBe('bitbucket');
    expect(git.calls.at(-1)?.repositoryUrl).toBe('https://bitbucket.org/team/example-app');
  });

  it('detects a source change between preflight and materialization', async () => {
    const git = new GitFixture([projectFile('index.html', '<h1>Version one</h1>')]);
    const service = new ProjectImportSourceService({ gitProvider: git.provider });
    const request = context('github', { repositoryUrl: 'https://github.com/org/repo' });
    const inspected = await service.inspectSource(request);
    git.files = [projectFile('index.html', '<h1>Version two</h1>')];

    await expect(
      service.materializeSource({
        ...request,
        policy: directPolicy,
        expectedContentHash: inspected.metadata.contentHash,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_IMPORT_SOURCE_CHANGED',
      recoverable: true,
    });
  });

  it('loads ZIP and Previous Agent JSON/ZIP exports, strips a common wrapper, and rejects unsafe paths', async () => {
    const git = new GitFixture([]);
    const service = new ProjectImportSourceService({ gitProvider: git.provider });
    const archive = await zipBytes([
      { path: 'wrapped/package.json', content: '{"scripts":{"dev":"vite"}}' },
      { path: 'wrapped/src/main.ts', content: 'console.log("ready")' },
      { path: 'wrapped/.env', content: 'TOKEN=secret' },
      { path: 'wrapped/data.sqlite', content: Buffer.from([1, 2, 3]) },
    ]);
    const zipInput = { file: uploadedFile('project.zip', archive, 'application/zip'), name: 'ZIP app' };
    const zipped = await service.materializeSource({ ...context('zip', zipInput), policy: directPolicy });
    expect(zipped.files.map((file) => file.path)).toEqual(['package.json', 'src/main.ts']);
    expect(zipped.metadata.removedPaths).toEqual(['.env', 'data.sqlite']);

    const json = Buffer.from(
      JSON.stringify({
        schemaVersion: 1,
        files: [
          { path: 'index.html', content: '<h1>Portable</h1>' },
          {
            path: 'src/config.ts',
            content: Buffer.from('export const API_TOKEN = "creator-base64-secret";').toString('base64'),
            encoding: 'base64',
          },
          { path: 'assets/logo.bin', content: Buffer.from([0, 1, 2, 3]).toString('base64'), encoding: 'base64' },
          { path: '.env', content: 'SECRET=private' },
        ],
        secrets: { ignored: 'must-not-import' },
      }),
    );
    const jsonResult = await service.materializeSource({
      ...context('previous-agent-export', {
        file: uploadedFile('agent-export.json', json, 'application/json'),
        name: 'Portable app',
      }),
      policy: directPolicy,
    });
    expect(jsonResult.files.map((file) => file.path)).toEqual(['assets/logo.bin', 'index.html', 'src/config.ts']);
    const base64Config = jsonResult.files.find((file) => file.path === 'src/config.ts');
    expect(Buffer.from(base64Config?.content ?? '', 'base64').toString('utf8')).toContain('API_TOKEN = "<redacted>"');
    expect(
      Buffer.from(jsonResult.files.find((file) => file.path === 'assets/logo.bin')?.content ?? '', 'base64'),
    ).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(JSON.stringify(jsonResult)).not.toContain('creator-base64-secret');
    expect(JSON.stringify(jsonResult)).not.toContain('must-not-import');

    const zipResult = await service.inspectSource(
      context('previous-agent-export', {
        file: uploadedFile('agent-export.zip', archive, 'application/zip'),
        name: 'Portable zip app',
      }),
    );
    expect(zipResult.metadata.fileCount).toBe(2);

    git.files = [projectFile('../outside.txt', 'unsafe')];
    await expect(
      service.inspectSource(context('github', { repositoryUrl: 'https://github.com/org/unsafe' })),
    ).rejects.toMatchObject({
      code: 'PROJECT_IMPORT_SOURCE_UNSAFE_PATH',
    });
  });
});

describe('ProjectImportSourceService spreadsheet sources', () => {
  it('parses RFC-4180 CSV into typed, isolated seed files without persisting row values in preview metadata', async () => {
    const git = new GitFixture([]);
    const service = new ProjectImportSourceService({ gitProvider: git.provider });
    const csv = Buffer.from('ID,Name,Active,Price\r\n001,"Alice, Inc",true,12.50\r\n002,"Bob\nSmith",false,8.00\r\n');
    const request = context('spreadsheet', {
      file: uploadedFile('customers.csv', csv, 'text/csv'),
      name: 'Customer manager',
    });
    const inspected = await service.inspectSource(request);

    expect(inspected.files).toEqual([
      expect.objectContaining({ path: '.vibecore/import-data/customers.json', sizeBytes: expect.any(Number) }),
    ]);
    expect(inspected.files[0]).not.toHaveProperty('content');
    expect(inspected.preview).toMatchObject({
      kind: 'spreadsheet-schema',
      datasetCount: 1,
      rowCount: 2,
      columnCount: 4,
    });
    expect(inspected.agentPrompt).toContain('full-stack TypeScript application');
    expect(
      JSON.stringify({ preview: inspected.preview, metadata: inspected.metadata, prompt: inspected.agentPrompt }),
    ).not.toContain('Alice');

    const materialized = await service.materializeSource({ ...request, policy: agentPolicy });
    const seed = JSON.parse(materialized.files[0]!.content) as {
      rows: Array<Record<string, unknown>>;
      columns: Array<{ key: string; type: string }>;
    };
    expect(seed.columns.map((column) => column.type)).toEqual(['string', 'string', 'boolean', 'number']);
    expect(seed.rows).toEqual([
      { id: '001', name: 'Alice, Inc', active: true, price: 12.5 },
      { id: '002', name: 'Bob\nSmith', active: false, price: 8 },
    ]);

    await expect(
      service.materializeSource({ ...request, policy: { ...agentPolicy, allowSpreadsheetSeedData: false } }),
    ).rejects.toMatchObject({ code: 'PROJECT_IMPORT_SPREADSHEET_SEED_NOT_AUTHORIZED' });
  });

  it('parses XLSX worksheets and fetches a real Google Sheets CSV export through an injectable connection', async () => {
    const xlsx = await xlsxBytes();
    const parsed = await parseXlsxDatasets(xlsx.toString('base64'));
    expect(parsed).toEqual([
      expect.objectContaining({
        name: 'Customers',
        columns: [
          expect.objectContaining({ key: 'name', type: 'string' }),
          expect.objectContaining({ key: 'active', type: 'boolean' }),
        ],
        rows: [{ name: 'Alice', active: true }],
      }),
    ]);

    const git = new GitFixture([]);
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer google-server-token');
      return new Response('Name,Count\nAlice,3\n', { status: 200, headers: { 'content-type': 'text/csv' } });
    });
    const service = new ProjectImportSourceService({
      gitProvider: git.provider,
      fetchImpl: fetchImpl as typeof fetch,
      resolveGoogleSheetsAccess: async () => ({ accessToken: 'google-server-token' }),
    });
    const xlsxResult = await service.materializeSource({
      ...context('spreadsheet', {
        file: uploadedFile('customers.xlsx', xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
        name: 'XLSX app',
      }),
      policy: agentPolicy,
    });
    expect(xlsxResult.files[0]?.path).toBe('.vibecore/import-data/customers.json');

    const google = await service.materializeSource({
      ...context('spreadsheet', {
        kind: 'google-sheets',
        sourceUrl: 'https://docs.google.com/spreadsheets/d/AbCdEf123/edit?gid=42',
        name: 'Sheets app',
      }),
      policy: agentPolicy,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.origin + requestedUrl.pathname).toBe('https://docs.google.com/spreadsheets/d/AbCdEf123/export');
    expect(requestedUrl.searchParams.get('format')).toBe('csv');
    expect(requestedUrl.searchParams.get('gid')).toBe('42');
    expect(JSON.parse(google.files[0]!.content).rows).toEqual([{ name: 'Alice', count: 3 }]);
    expect(JSON.stringify(google.metadata)).not.toContain('google-server-token');
  });

  it('rejects invalid CSV instead of generating a partial dataset', () => {
    expect(() => parseCsvDataset('Name,Note\nAlice,"unterminated')).toThrowError(
      expect.objectContaining({ code: 'PROJECT_IMPORT_CSV_INVALID' }),
    );
  });
});

describe('ProjectImportSourceService hosted and Vercel sources', () => {
  it('keeps Empty free of files, config, Agent, and scaffolding', async () => {
    const git = new GitFixture([]);
    const service = new ProjectImportSourceService({ gitProvider: git.provider });
    const request = context('empty', { name: 'Raw workspace', slug: 'raw-workspace' });
    const inspected = await service.inspectSource(request);
    expect(inspected).toMatchObject({
      files: [],
      generatedConfig: [],
      preview: { kind: 'empty-project', fileCount: 0 },
      metadata: { source: 'empty', fileCount: 0 },
    });
    expect(inspected).not.toHaveProperty('agentPrompt');

    const materialized = await service.materializeSource({
      ...request,
      policy: { ...directPolicy, scaffold: false },
      expectedContentHash: inspected.metadata.contentHash,
    });
    expect(materialized.files).toEqual([]);
    expect(materialized.generatedConfig).toEqual([]);
    expect(git.calls).toEqual([]);
  });

  it('validates hosted URLs and returns an Agent plan without treating screenshots as a source', async () => {
    const git = new GitFixture([]);
    const validateHostedSource = vi.fn(async ({ sourceUrl }: { sourceUrl: string }) => ({
      accessible: true,
      label: 'Verified shared app',
      contentHash: createHash('sha256').update(`provider-snapshot:${sourceUrl}`).digest('hex'),
    }));
    const service = new ProjectImportSourceService({ gitProvider: git.provider, validateHostedSource });
    const cases = [
      ['figma', 'https://figma.com/design/AbCdEf/App'],
      ['claude', 'https://claude.ai/artifacts/example'],
      ['bolt', 'https://bolt.new/example'],
      ['lovable', 'https://lovable.dev/projects/example'],
      ['base44', 'https://app.base44.com/apps/example'],
    ] as const;

    for (const [source, sourceUrl] of cases) {
      const inspected = await service.inspectSource(context(source, { sourceUrl, name: `${source} app` }));
      expect(inspected.files).toEqual([]);
      expect(inspected.preview).toMatchObject({
        kind: 'agent-plan',
        provider: source,
        sourceUrl,
        accessible: true,
        label: 'Verified shared app',
        sourceEvidenceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(inspected.agentPrompt).toContain('JavaScript/TypeScript');
      expect(inspected.agentPrompt).toContain('never as an import provider');
    }

    await expect(
      service.inspectSource(context('figma', { sourceUrl: 'https://evil.example/design/AbCdEf/App', name: 'Bad' })),
    ).rejects.toMatchObject({ code: 'PROJECT_IMPORT_VALIDATION_FAILED' });

    await expect(
      service.materializeSource({
        ...context('figma', { sourceUrl: 'https://figma.com/design/AbCdEf/App', name: 'Figma app' }),
        policy: { ...agentPolicy, useAgent: false },
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_IMPORT_AGENT_REQUIRED' });
  });

  it('fails closed when a hosted connector cannot return verifiable source evidence', async () => {
    const git = new GitFixture([]);
    const request = context('figma', {
      sourceUrl: 'https://figma.com/design/AbCdEf/App',
      name: 'Figma app',
    });

    await expect(
      new ProjectImportSourceService({ gitProvider: git.provider }).inspectSource(request),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'PROJECT_IMPORT_HOSTED_CONNECTOR_UNAVAILABLE',
      recoverable: true,
    });

    const missingEvidence = new ProjectImportSourceService({
      gitProvider: git.provider,
      validateHostedSource: async () => ({ accessible: true }),
    });
    await expect(missingEvidence.inspectSource(request)).rejects.toMatchObject({
      statusCode: 502,
      code: 'PROJECT_IMPORT_HOSTED_EVIDENCE_INVALID',
      recoverable: true,
    });
  });

  it('detects hosted source changes between preflight and materialization', async () => {
    const git = new GitFixture([]);
    let revision = 'revision-one';
    const service = new ProjectImportSourceService({
      gitProvider: git.provider,
      validateHostedSource: async () => ({
        accessible: true,
        contentHash: createHash('sha256').update(revision).digest('hex'),
      }),
    });
    const request = context('bolt', { sourceUrl: 'https://bolt.new/example', name: 'Bolt app' });
    const inspected = await service.inspectSource(request);
    revision = 'revision-two';

    await expect(
      service.materializeSource({
        ...request,
        policy: agentPolicy,
        expectedContentHash: inspected.metadata.contentHash,
      }),
    ).rejects.toMatchObject({ code: 'PROJECT_IMPORT_SOURCE_CHANGED', recoverable: true });
  });

  it('returns an explicit recoverable Vercel connection error and otherwise resolves source via token/API', async () => {
    const git = new GitFixture([projectFile('index.html', '<h1>Vercel app</h1>')]);
    const sourceUrl = 'https://vercel.com/acme/example-app';
    const disconnected = new ProjectImportSourceService({ gitProvider: git.provider });

    await expect(
      disconnected.inspectSource(context('vercel', { sourceUrl, name: 'Vercel app' })),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_IMPORT_VERCEL_CONNECTION_REQUIRED',
      recoverable: true,
    });

    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer vercel-server-token');
      return new Response(
        JSON.stringify({ link: { type: 'github', org: 'openaxcloud', repo: 'example-app', productionBranch: 'main' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const connected = new ProjectImportSourceService({
      gitProvider: git.provider,
      fetchImpl: fetchImpl as typeof fetch,
      resolveVercelConnection: async () => ({ accessToken: 'vercel-server-token', teamId: 'team-1' }),
    });
    const inspected = await connected.inspectSource(context('vercel', { sourceUrl, name: 'Vercel app' }));
    expect(inspected.metadata).toMatchObject({ source: 'vercel', defaultBranch: 'main', fileCount: 1 });
    expect(git.calls.at(-1)).toEqual({ repositoryUrl: 'https://github.com/openaxcloud/example-app', branch: 'main' });
    expect(JSON.stringify(inspected)).not.toContain('vercel-server-token');
    const apiUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(apiUrl.pathname).toBe('/v9/projects/example-app');
    expect(apiUrl.searchParams.get('teamId')).toBe('team-1');

    const unsafeAdapter = new ProjectImportSourceService({
      gitProvider: git.provider,
      resolveVercelConnection: async () => ({ accessToken: 'vercel-server-token' }),
      resolveVercelSource: async () => ({
        files: [{ path: 'leak.txt', content: 'vercel-server-token' }],
      }),
    });
    await expect(
      unsafeAdapter.inspectSource(context('vercel', { sourceUrl, name: 'Unsafe Vercel app' })),
    ).rejects.toMatchObject({ code: 'PROJECT_IMPORT_PROVIDER_OUTPUT_UNSAFE' });
  });

  it('returns recoverable access errors for private Google Sheets', async () => {
    const git = new GitFixture([]);
    const service = new ProjectImportSourceService({
      gitProvider: git.provider,
      fetchImpl: vi.fn(async () => new Response('forbidden', { status: 403 })) as unknown as typeof fetch,
    });

    await expect(
      service.inspectSource(
        context('spreadsheet', {
          kind: 'google-sheets',
          sourceUrl: 'https://docs.google.com/spreadsheets/d/AbCdEf123/edit',
          name: 'Private sheet',
        }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'PROJECT_IMPORT_GOOGLE_SHEETS_ACCESS_REQUIRED',
      recoverable: true,
    });
  });
});
