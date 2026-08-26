import type { ImportFile } from './import-pipeline.js';

export const CREDENTIAL_IMPORT_PROVIDERS = ['vercel', 'figma', 'claude'] as const;
export type CredentialImportProvider = (typeof CREDENTIAL_IMPORT_PROVIDERS)[number];

export type CredentialImportFactKey =
  | 'framework'
  | 'repository'
  | 'updatedAt'
  | 'pages'
  | 'components'
  | 'componentSets'
  | 'version'
  | 'sourceFormat'
  | 'sourceLines'
  | 'sourceCharacters'
  | 'verifiedModel';

export type CredentialImportWarningCode = 'vercelConfigurationOnly' | 'figmaDocumentSnapshot' | 'claudeExactSource';

export interface CredentialImportPreview {
  provider: CredentialImportProvider;
  title: string;
  sourceRef: string;
  fileCount: number;
  byteCount: number;
  facts: Array<{ key: CredentialImportFactKey; value: string }>;
  warnings: CredentialImportWarningCode[];
  paths: string[];
}

export interface CredentialImportResult {
  files: ImportFile[];
  preview: CredentialImportPreview;
  resolvedSourceRef: string;
}

export type CredentialImportErrorCode =
  | 'IMPORT_CONNECTOR_SOURCE_REQUIRED'
  | 'IMPORT_CONNECTOR_SOURCE_INVALID'
  | 'IMPORT_CONNECTOR_SOURCE_NOT_FOUND'
  | 'IMPORT_CONNECTOR_SOURCE_FORBIDDEN'
  | 'IMPORT_CONNECTOR_CREDENTIAL_REJECTED'
  | 'IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE'
  | 'IMPORT_CONNECTOR_RESPONSE_INVALID'
  | 'IMPORT_CONNECTOR_SOURCE_TOO_LARGE';

export class CredentialImportError extends Error {
  readonly code: CredentialImportErrorCode;
  readonly statusCode: number;

  constructor(code: CredentialImportErrorCode, statusCode: number) {
    super(code);
    this.name = 'CredentialImportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const MAX_PROVIDER_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_CLAUDE_SOURCE_BYTES = 2 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compactText(value: unknown, fallback: string, maxLength = 160): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const compact = value.replace(/\s+/gu, ' ').trim();
  return compact.length > 0 ? compact.slice(0, maxLength) : fallback;
}

function safeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : undefined;
}

function formatTimestamp(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const timestamp = value < 10_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);

    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  if (typeof value === 'string') {
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  return undefined;
}

async function readBoundedJson(response: Response, maxBytes = MAX_PROVIDER_RESPONSE_BYTES): Promise<unknown> {
  const declaredLength = Number(response.headers.get('content-length'));

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_TOO_LARGE', 413);
  }

  if (!response.body) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let text = '';

  while (true) {
    const chunk = await reader.read();

    if (chunk.done) {
      break;
    }

    bytesRead += chunk.value.byteLength;

    if (bytesRead > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_TOO_LARGE', 413);
    }

    text += decoder.decode(chunk.value, { stream: true });
  }

  text += decoder.decode();

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }
}

function providerFailure(response: Response): never {
  if (response.status === 401) {
    throw new CredentialImportError('IMPORT_CONNECTOR_CREDENTIAL_REJECTED', 424);
  }

  if (response.status === 403) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_FORBIDDEN', 403);
  }

  if (response.status === 404) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_NOT_FOUND', 404);
  }

  throw new CredentialImportError('IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE', 502);
}

async function providerJson(
  url: URL,
  init: RequestInit,
  fetchImpl: typeof fetch,
  maxBytes = MAX_PROVIDER_RESPONSE_BYTES,
): Promise<unknown> {
  let response: Response;

  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new CredentialImportError('IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE', 502);
  }

  if (!response.ok) {
    providerFailure(response);
  }

  try {
    return await readBoundedJson(response, maxBytes);
  } catch (error) {
    if (error instanceof CredentialImportError) {
      throw error;
    }

    throw new CredentialImportError('IMPORT_CONNECTOR_UPSTREAM_UNAVAILABLE', 502);
  }
}

function byteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

function buildPreview(
  provider: CredentialImportProvider,
  title: string,
  sourceRef: string,
  files: ImportFile[],
  facts: CredentialImportPreview['facts'],
  warnings: CredentialImportWarningCode[],
): CredentialImportPreview {
  return {
    provider,
    title,
    sourceRef,
    fileCount: files.length,
    byteCount: files.reduce((total, file) => total + byteLength(file.content), 0),
    facts,
    warnings,
    paths: files.map((file) => file.path),
  };
}

function vercelSourceRef(value: string): string {
  const sourceRef = value.trim();

  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(sourceRef)) {
    throw new CredentialImportError(
      sourceRef.length === 0 ? 'IMPORT_CONNECTOR_SOURCE_REQUIRED' : 'IMPORT_CONNECTOR_SOURCE_INVALID',
      400,
    );
  }

  return sourceRef;
}

function optionalVercelScope(value?: string): string | undefined {
  const scope = value?.trim();

  if (!scope) {
    return undefined;
  }

  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(scope)) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_INVALID', 400);
  }

  return scope;
}

async function importVercel(input: CredentialImportRequest): Promise<CredentialImportResult> {
  const sourceRef = vercelSourceRef(input.sourceRef);
  const scope = optionalVercelScope(input.scopeRef);
  const url = new URL(`https://api.vercel.com/v9/projects/${encodeURIComponent(sourceRef)}`);

  if (scope) {
    url.searchParams.set('teamId', scope);
  }

  const payload = await providerJson(
    url,
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        accept: 'application/json',
        'user-agent': 'e-code-import',
      },
    },
    input.fetchImpl,
    1024 * 1024,
  );

  if (!isRecord(payload)) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const id = compactText(payload.id, '', 128);
  const name = compactText(payload.name, sourceRef, 120);

  if (!id) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const link = isRecord(payload.link) ? payload.link : undefined;
  const repository = link
    ? [compactText(link.org, '', 100), compactText(link.repo, '', 100)].filter(Boolean).join('/')
    : '';
  const updatedAt = formatTimestamp(payload.updatedAt);
  const sanitized = {
    kind: 'e-code-vercel-project-import',
    version: 1,
    source: {
      provider: 'vercel',
      projectId: id,
      projectName: name,
      ...(scope ? { teamId: scope } : {}),
      retrievedAt: new Date().toISOString(),
    },
    project: {
      framework: compactText(payload.framework, 'unknown', 80),
      ...(repository
        ? {
            repository: {
              type: compactText(link?.type, 'git', 32),
              name: repository,
            },
          }
        : {}),
      ...(typeof payload.rootDirectory === 'string' ? { rootDirectory: payload.rootDirectory.slice(0, 240) } : {}),
      ...(typeof payload.nodeVersion === 'string' ? { nodeVersion: payload.nodeVersion.slice(0, 32) } : {}),
      ...(typeof payload.buildCommand === 'string' ? { buildCommand: payload.buildCommand.slice(0, 500) } : {}),
      ...(typeof payload.installCommand === 'string' ? { installCommand: payload.installCommand.slice(0, 500) } : {}),
      ...(typeof payload.outputDirectory === 'string'
        ? { outputDirectory: payload.outputDirectory.slice(0, 240) }
        : {}),
      ...(updatedAt ? { updatedAt } : {}),
    },
  };
  const content = `${JSON.stringify(sanitized, null, 2)}\n`;
  const files: ImportFile[] = [{ path: '.e-code/import/vercel-project.json', content }];
  const facts: CredentialImportPreview['facts'] = [
    { key: 'framework', value: compactText(payload.framework, 'unknown', 80) },
  ];

  if (repository) {
    facts.push({ key: 'repository', value: repository });
  }

  if (updatedAt) {
    facts.push({ key: 'updatedAt', value: updatedAt });
  }

  return {
    files,
    resolvedSourceRef: name,
    preview: buildPreview('vercel', name, sourceRef, files, facts, ['vercelConfigurationOnly']),
  };
}

function figmaFileKey(value: string): string {
  const sourceRef = value.trim();
  let candidate = sourceRef;

  try {
    const url = new URL(sourceRef);

    if (!/(^|\.)figma\.com$/iu.test(url.hostname)) {
      throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_INVALID', 400);
    }

    const segments = url.pathname.split('/').filter(Boolean);
    const typeIndex = segments.findIndex((segment) => segment === 'file' || segment === 'design');
    candidate = typeIndex >= 0 ? (segments[typeIndex + 1] ?? '') : '';
  } catch (error) {
    if (error instanceof CredentialImportError) {
      throw error;
    }

    candidate = sourceRef;
  }

  if (!/^[A-Za-z0-9_-]{6,160}$/u.test(candidate)) {
    throw new CredentialImportError(
      sourceRef.length === 0 ? 'IMPORT_CONNECTOR_SOURCE_REQUIRED' : 'IMPORT_CONNECTOR_SOURCE_INVALID',
      400,
    );
  }

  return candidate;
}

function countFigmaPages(document: unknown): number {
  if (!isRecord(document) || !Array.isArray(document.children)) {
    return 0;
  }

  return document.children.length;
}

async function importFigma(input: CredentialImportRequest): Promise<CredentialImportResult> {
  const fileKey = figmaFileKey(input.sourceRef);
  const url = new URL(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`);
  const payload = await providerJson(
    url,
    {
      method: 'GET',
      headers: {
        'x-figma-token': input.accessToken,
        accept: 'application/json',
        'user-agent': 'e-code-import',
      },
    },
    input.fetchImpl,
  );

  if (!isRecord(payload) || !isRecord(payload.document)) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const title = compactText(payload.name, fileKey, 120);
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const files: ImportFile[] = [{ path: 'design/figma-document.json', content }];
  const components = isRecord(payload.components) ? Object.keys(payload.components).length : 0;
  const componentSets = isRecord(payload.componentSets) ? Object.keys(payload.componentSets).length : 0;
  const facts: CredentialImportPreview['facts'] = [
    { key: 'pages', value: String(countFigmaPages(payload.document)) },
    { key: 'components', value: String(components) },
    { key: 'componentSets', value: String(componentSets) },
  ];
  const version = compactText(payload.version, '', 100);
  const updatedAt = formatTimestamp(payload.lastModified);

  if (version) {
    facts.push({ key: 'version', value: version });
  }

  if (updatedAt) {
    facts.push({ key: 'updatedAt', value: updatedAt });
  }

  return {
    files,
    resolvedSourceRef: title,
    preview: buildPreview('figma', title, fileKey, files, facts, ['figmaDocumentSnapshot']),
  };
}

function safeClaudePath(value?: string): string {
  const candidate = value?.trim() || 'imports/claude/source.md';

  if (
    candidate.length > 240 ||
    candidate.startsWith('/') ||
    candidate.includes('\\') ||
    candidate.includes('\0') ||
    candidate.split('/').some((segment) => segment === '..' || segment.length === 0)
  ) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_INVALID', 400);
  }

  return candidate;
}

async function importClaude(input: CredentialImportRequest): Promise<CredentialImportResult> {
  const title = compactText(input.sourceRef, '', 120);
  const sourceContent = input.sourcePayload ?? '';
  const sourceBytes = byteLength(sourceContent);

  if (!title || !sourceContent.trim()) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_REQUIRED', 400);
  }

  if (sourceBytes > MAX_CLAUDE_SOURCE_BYTES) {
    throw new CredentialImportError('IMPORT_CONNECTOR_SOURCE_TOO_LARGE', 413);
  }

  const modelsUrl = new URL('https://api.anthropic.com/v1/models?limit=20');
  const modelsPayload = await providerJson(
    modelsUrl,
    {
      method: 'GET',
      headers: {
        'x-api-key': input.accessToken,
        'anthropic-version': '2023-06-01',
        accept: 'application/json',
        'user-agent': 'e-code-import',
      },
    },
    input.fetchImpl,
    1024 * 1024,
  );

  if (!isRecord(modelsPayload) || !Array.isArray(modelsPayload.data)) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const verifiedModel = modelsPayload.data
    .filter(isRecord)
    .map((model) => compactText(model.display_name ?? model.id, '', 100))
    .find(Boolean);

  if (!verifiedModel) {
    throw new CredentialImportError('IMPORT_CONNECTOR_RESPONSE_INVALID', 502);
  }

  const path = safeClaudePath(input.targetPath);
  const files: ImportFile[] = [{ path, content: sourceContent }];
  let sourceFormat = 'text';

  try {
    JSON.parse(sourceContent);
    sourceFormat = 'json';
  } catch {
    const extension = path.split('.').pop()?.toLowerCase();
    sourceFormat = extension && /^[a-z0-9]{1,12}$/u.test(extension) ? extension : 'text';
  }

  const facts: CredentialImportPreview['facts'] = [
    { key: 'sourceFormat', value: sourceFormat },
    { key: 'sourceLines', value: String(sourceContent.split(/\r?\n/u).length) },
    { key: 'sourceCharacters', value: String([...sourceContent].length) },
    { key: 'verifiedModel', value: verifiedModel },
  ];

  return {
    files,
    resolvedSourceRef: title,
    preview: buildPreview('claude', title, title, files, facts, ['claudeExactSource']),
  };
}

export interface CredentialImportRequest {
  provider: CredentialImportProvider;
  accessToken: string;
  sourceRef: string;
  scopeRef?: string;
  sourcePayload?: string;
  targetPath?: string;
  fetchImpl: typeof fetch;
}

export function isCredentialImportProvider(value: string): value is CredentialImportProvider {
  return (CREDENTIAL_IMPORT_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Retrieve and stage the real provider source. Tokens are accepted only as
 * request-local inputs and are never copied into files, previews, errors, or
 * logs. The caller owns authentication, tenant authorization and encrypted
 * token resolution; this module owns strict provider URLs and bounded parsing.
 */
export async function fetchCredentialImportSource(input: CredentialImportRequest): Promise<CredentialImportResult> {
  switch (input.provider) {
    case 'vercel':
      return importVercel(input);
    case 'figma':
      return importFigma(input);
    case 'claude':
      return importClaude(input);
  }
}
