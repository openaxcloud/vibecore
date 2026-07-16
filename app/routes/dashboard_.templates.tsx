import { createHash, randomUUID } from 'node:crypto';
import type { MetaFunction } from 'react-router';
import { useRef } from 'react';
import { useActionData, useFetcher, useLoaderData, useNavigation, useSearchParams, useSubmit } from 'react-router';
import { AsyncPanelError } from '~/components/dashboard/AsyncPanelState';
import {
  ImportHub,
  IMPORT_HUB_SOURCE_IDS,
  createImportRequestFingerprint,
  type ImportHubOperation,
  type ImportHubRequest,
  type ImportHubSourceId,
  type ImportHubValidation,
} from '~/components/dashboard/ImportHub';
import { AppShell, LinkButton } from '~/components/dashboard/SaaSLayout';
import { TemplateGallery, type GalleryApp } from '~/components/dashboard/TemplateGallery';
import {
  apiErrorMessage,
  apiRequest,
  firstOrganization,
  firstOrganizationOrNull,
  isApiResponse,
  json,
  redirect,
  type EnterpriseActionArgs,
  type EnterpriseLoaderArgs,
} from '~/lib/enterprise-api.server';
import { shouldRethrowActionError } from '~/lib/route-reauth';
import { projectIdePath } from '~/utils/project-url';

export const meta: MetaFunction = () => [{ title: 'Community Gallery - E-Code' }];
export { UserAreaRouteErrorBoundary as ErrorBoundary } from '~/components/dashboard/UserAreaRouteError';

type ApiGalleryApp = {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: { handle: string; displayName: string; avatarUrl?: string };
  artifactType: string;
  category: string;
  technologies: string[];
  thumbnailUrl: string;
  previewUrl?: string;
  moderationStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
  allowRemix: boolean;
  featured: boolean;
  remixCount: number;
  reportCount: number;
  publishedAt?: string;
  provenance?: { sourceGalleryAppId: string; sourceGalleryAppSlug: string };
};

type ApiImportJob = {
  id: string;
  source: ImportHubSourceId;
  status: 'VALIDATING' | 'READY' | 'CREATING' | 'COMPLETE' | 'FAILED' | 'CANCELED';
  sourceLabel?: string;
  stage: string;
  progress: number;
  validation: Record<string, unknown>;
  runtimeDetection: Record<string, unknown>;
  missingSecretNames: string[];
  generatedConfig: Array<{ path: string; content: string }>;
  preview: Record<string, unknown>;
  usesAgent: boolean;
  creditsDisclosure?: string;
  projectId?: string;
  errorCode?: string;
  errorMessage?: string;
  recoverable: boolean;
};

type ActionData = {
  error?: string;
  intent?: string;
  appId?: string;
  notice?: string;
  importJobId?: string;
  operation?: ImportHubOperation;
};

type ProjectImportFailurePayload = {
  error?: string;
  recoverable?: boolean;
  job?: ApiImportJob;
};

export async function loader({ request }: EnterpriseLoaderArgs) {
  const organization = await firstOrganizationOrNull(request);
  if (!organization) return redirect('/');

  const url = new URL(request.url);
  const galleryQuery = galleryApiQuery(url.searchParams);
  const gallery = await apiRequest<{ apps: ApiGalleryApp[]; nextCursor?: string }>(
    request,
    `/gallery/apps?${galleryQuery.toString()}`,
  );

  return {
    organization,
    apps: gallery.apps.map(toGalleryApp),
    firstPageHref: url.searchParams.has('cursor') ? galleryPageHref(url, null) : null,
    nextPageHref: gallery.nextCursor ? galleryPageHref(url, gallery.nextCursor) : null,
  };
}

export async function action({ request }: EnterpriseActionArgs) {
  const form = await request.formData();
  const intent = String(form.get('intent') ?? '');

  try {
    const organization = await firstOrganization(request);

    if (intent === 'remix') {
      const appId = String(form.get('appId') ?? '').trim();
      const name = String(form.get('name') ?? '').trim();
      const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim() || `gallery-${randomUUID()}`;
      if (!appId || !name)
        return json<ActionData>({ error: 'Select an application to remix.', intent, appId }, { status: 400 });

      const result = await apiRequest<{ projectId: string }>(
        request,
        `/organizations/${organization.id}/gallery/apps/${encodeURIComponent(appId)}/remix`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ name: `${name} Remix` }),
        },
      );

      return redirect(projectIdePath({ id: result.projectId, organizationSlug: organization.slug }));
    }

    if (intent === 'report') {
      const appId = String(form.get('appId') ?? '').trim();
      if (!appId) return json<ActionData>({ error: 'Application not found.', intent }, { status: 400 });

      await apiRequest(request, `/gallery/apps/${encodeURIComponent(appId)}/reports`, {
        method: 'POST',
        body: JSON.stringify({
          reason: String(form.get('reason') ?? 'OTHER'),
          details: String(form.get('details') ?? 'Reported from the Community Gallery card.'),
        }),
      });
      return json<ActionData>({ intent, appId, notice: 'Report sent to the moderation queue.' });
    }

    if (intent === 'import-preflight' || intent === 'import-retry' || intent === 'import-create') {
      const source = parseImportSource(form.get('source'));
      const requestFingerprint = String(form.get('requestFingerprint') ?? '');
      const importInput = await importInputFromForm(form, source);
      const importJobId = String(form.get('importJobId') ?? '').trim();
      let payload: { job: ApiImportJob; projectId?: string };

      if (intent === 'import-preflight') {
        const idempotencyKey = String(form.get('idempotencyKey') ?? '').trim() || `import-${randomUUID()}`;
        payload = await apiRequest(request, `/organizations/${organization.id}/project-imports/preflight`, {
          method: 'POST',
          headers: { 'Idempotency-Key': idempotencyKey },
          body: JSON.stringify({ source, input: importInput }),
          includeProjectImportFailure: true,
        });
      } else {
        if (!importJobId) {
          return json<ActionData>({ error: 'Run import validation again.', intent }, { status: 400 });
        }
        payload = await apiRequest(
          request,
          `/organizations/${organization.id}/project-imports/${encodeURIComponent(importJobId)}/${
            intent === 'import-create' ? 'create' : 'retry'
          }`,
          { method: 'POST', body: JSON.stringify({ input: importInput }), includeProjectImportFailure: true },
        );
      }

      if (intent === 'import-create' && payload.projectId) {
        return redirect(projectIdePath({ id: payload.projectId, organizationSlug: organization.slug }));
      }

      return json<ActionData>({
        intent,
        importJobId: payload.job.id,
        operation: importOperation(payload.job, requestFingerprint),
      });
    }

    return json<ActionData>({ error: 'Unknown Gallery action.', intent }, { status: 400 });
  } catch (error) {
    const importIntent = intent === 'import-preflight' || intent === 'import-retry' || intent === 'import-create';
    const failure = importIntent && isApiResponse(error) ? await readProjectImportFailure(error) : undefined;
    if (shouldRethrowActionError(error) && !failure?.job) throw error;

    if (isApiResponse(error)) {
      const fallbackMessage = await apiErrorMessage(error, 'The Gallery request could not be completed.');
      const errorMessage = failure?.error ?? fallbackMessage;
      const requestFingerprint = String(form.get('requestFingerprint') ?? '');
      return json<ActionData>(
        {
          error: errorMessage,
          intent,
          appId: String(form.get('appId') ?? '') || undefined,
          importJobId: failure?.job?.id ?? (String(form.get('importJobId') ?? '') || undefined),
          operation: failure?.job
            ? importOperation(failure.job, requestFingerprint)
            : importIntent
              ? {
                  phase: 'failed',
                  requestFingerprint,
                  error: {
                    title: 'Import failed',
                    message: errorMessage,
                    recoverable: failure?.recoverable === true,
                  },
                }
              : undefined,
        },
        { status: error.status },
      );
    }

    throw error;
  }
}

export default function DashboardTemplatesPage() {
  const { apps, firstPageHref, nextPageHref } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as ActionData | undefined;
  const navigation = useNavigation();
  const submit = useSubmit();
  const reportFetcher = useFetcher<ActionData>();
  const importFetcher = useFetcher<ActionData>();
  const [searchParams] = useSearchParams();
  const section = searchParams.get('section');
  const showImport = section === 'import';
  const requestedImportSource = searchParams.get('source');
  const initialImportSource = IMPORT_HUB_SOURCE_IDS.includes(requestedImportSource as ImportHubSourceId)
    ? (requestedImportSource as ImportHubSourceId)
    : 'github';
  const remixingAppId =
    navigation.state !== 'idle' && navigation.formData?.get('intent') === 'remix'
      ? String(navigation.formData.get('appId'))
      : null;
  const operation = importFetcher.data?.operation;
  const pendingImportIntent = String(importFetcher.formData?.get('intent') ?? '');
  const pendingImportFingerprint = String(importFetcher.formData?.get('requestFingerprint') ?? '');
  const effectiveImportOperation: ImportHubOperation | undefined =
    importFetcher.state !== 'idle' &&
    (pendingImportIntent === 'import-preflight' ||
      pendingImportIntent === 'import-retry' ||
      pendingImportIntent === 'import-create')
      ? {
          phase: pendingImportIntent === 'import-create' ? 'creating' : 'validating',
          requestFingerprint: pendingImportFingerprint,
          validation: operation?.validation,
          progress:
            pendingImportIntent === 'import-create'
              ? [
                  { id: 'validate', label: 'Validate source', status: 'complete' },
                  { id: 'runtime', label: 'Detect runtime and configuration', status: 'complete' },
                  { id: 'create', label: 'Create isolated project', status: 'active' },
                ]
              : [
                  { id: 'validate', label: 'Validate source', status: 'active' },
                  { id: 'runtime', label: 'Detect runtime and configuration', status: 'pending' },
                  { id: 'create', label: 'Create isolated project', status: 'pending' },
                ],
        }
      : operation;
  const importJobId = importFetcher.data?.importJobId;
  const idempotencyKeys = useRef(new Map<string, string>());

  const submitImport =
    (intent: 'import-preflight' | 'import-retry' | 'import-create') =>
    async (hubRequest: ImportHubRequest, validation?: ImportHubValidation) => {
      const fingerprint = validation?.requestFingerprint ?? createImportRequestFingerprint(hubRequest);
      const form = importRequestForm(hubRequest, fingerprint);
      form.set('intent', intent);
      if (importJobId) form.set('importJobId', importJobId);
      if (intent === 'import-preflight') {
        const key = idempotencyKeys.current.get(fingerprint) ?? `import-${crypto.randomUUID()}`;
        idempotencyKeys.current.set(fingerprint, key);
        form.set('idempotencyKey', key);
      }
      await importFetcher.submit(form, { method: 'post', encType: 'multipart/form-data' });
    };

  return (
    <AppShell
      title={showImport ? 'Import an application' : 'Community Gallery'}
      description={
        showImport
          ? 'Validate the source, runtime, missing secrets and generated configuration before a real project is created.'
          : 'Discover working applications published by the community, inspect the live Preview, then Remix an isolated copy.'
      }
      actions={
        <>
          <LinkButton to="/dashboard/templates" variant={showImport ? 'outline' : 'default'}>
            Gallery
          </LinkButton>
          <LinkButton to="/dashboard/templates?section=import" variant={showImport ? 'default' : 'outline'}>
            Import
          </LinkButton>
          <LinkButton to="/dashboard/templates?section=import&source=empty" variant="outline">
            Empty project
          </LinkButton>
        </>
      }
    >
      {actionData?.error ? (
        <AsyncPanelError title="Gallery action failed" description={actionData.error} compact className="mb-5" />
      ) : null}
      {reportFetcher.data?.notice ? (
        <div
          className="mb-5 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
          role="status"
        >
          {reportFetcher.data.notice}
        </div>
      ) : null}

      {showImport ? (
        <ImportHub
          key={initialImportSource}
          initialSource={initialImportSource}
          operation={effectiveImportOperation}
          onValidate={submitImport('import-preflight')}
          onRetry={submitImport('import-retry')}
          onCreate={submitImport('import-create')}
        />
      ) : (
        <TemplateGallery
          apps={apps}
          firstPageHref={firstPageHref}
          nextPageHref={nextPageHref}
          remixingAppId={remixingAppId}
          onRemix={(app) => {
            const form = new FormData();
            form.set('intent', 'remix');
            form.set('appId', app.id);
            form.set('name', app.name);
            form.set('idempotencyKey', `gallery-${crypto.randomUUID()}`);
            submit(form, { method: 'post' });
          }}
          onReport={(app) => {
            const form = new FormData();
            form.set('intent', 'report');
            form.set('appId', app.id);
            form.set('reason', 'OTHER');
            form.set('details', 'Reported from the Community Gallery card for moderator review.');
            reportFetcher.submit(form, { method: 'post' });
          }}
        />
      )}
    </AppShell>
  );
}

const GALLERY_ARTIFACT_TYPES = new Set([
  'BUSINESS_APP',
  'BOOKING',
  'CRM',
  'DASHBOARD',
  'ECOMMERCE',
  'GAME',
  'INTERNAL_TOOL',
  'LANDING_PAGE',
  'PRODUCTIVITY',
  'SOCIAL',
  'OTHER',
]);

function galleryApiQuery(searchParams: URLSearchParams) {
  const query = new URLSearchParams({ limit: '24', sort: galleryApiSort(searchParams.get('sort')) });
  const search = boundedTaxonomyValue(searchParams.get('q'), 120, false);
  const category = boundedTaxonomyValue(searchParams.get('category'), 40, true);
  const technology = boundedTaxonomyValue(searchParams.get('tech'), 40, true);
  const artifactType = searchParams.get('type')?.trim().toUpperCase().replaceAll('-', '_').replaceAll(' ', '_');
  const cursor = searchParams.get('cursor')?.trim();

  if (search) query.set('query', search);
  if (category) query.set('category', category);
  if (technology) query.set('technology', technology);
  if (artifactType && GALLERY_ARTIFACT_TYPES.has(artifactType)) query.set('artifactType', artifactType);
  if (searchParams.get('featured') === 'true') query.set('featured', 'true');
  if (cursor && cursor.length <= 256) query.set('cursor', cursor);

  return query;
}

function galleryApiSort(value: string | null) {
  if (value === 'newest') return 'RECENT';
  if (value === 'most-remixed') return 'MOST_REMIXED';
  if (value === 'name') return 'NAME';
  return 'FEATURED';
}

function boundedTaxonomyValue(value: string | null, maxLength: number, taxonomy: boolean) {
  const normalized = value?.trim().slice(0, maxLength);
  if (!normalized) return undefined;
  if (taxonomy && !/^[a-z0-9][a-z0-9+._-]*$/i.test(normalized)) return undefined;
  return taxonomy ? normalized.toLowerCase() : normalized;
}

function galleryPageHref(url: URL, cursor: string | null) {
  const params = new URLSearchParams(url.searchParams);
  params.delete('section');
  if (cursor) params.set('cursor', cursor);
  else params.delete('cursor');
  const query = params.toString();
  return query ? `/dashboard/templates?${query}` : '/dashboard/templates';
}

function toGalleryApp(app: ApiGalleryApp): GalleryApp {
  return {
    id: app.id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    thumbnailUrl: app.thumbnailUrl,
    previewUrl: app.previewUrl ?? null,
    author: {
      name: app.author.displayName,
      username: app.author.handle,
      avatarUrl: app.author.avatarUrl,
      verified: app.author.handle === 'ecode',
    },
    artifactType: app.artifactType.toLowerCase().replaceAll('_', ' '),
    category: app.category,
    technologies: app.technologies,
    publishedAt: app.publishedAt ?? new Date(0).toISOString(),
    remixCount: app.remixCount,
    reportCount: app.reportCount,
    featured: app.featured,
    remixAllowed: app.allowRemix,
    moderationStatus: app.moderationStatus.toLowerCase() as GalleryApp['moderationStatus'],
    provenance: app.provenance
      ? {
          sourceAppId: app.provenance.sourceGalleryAppId,
          sourceAppName: app.provenance.sourceGalleryAppSlug,
          sourceAppSlug: app.provenance.sourceGalleryAppSlug,
        }
      : null,
  };
}

function parseImportSource(value: FormDataEntryValue | null): ImportHubSourceId {
  const source = String(value ?? '');
  if (!IMPORT_HUB_SOURCE_IDS.includes(source as ImportHubSourceId)) throw new Error('Unknown import source');
  return source as ImportHubSourceId;
}

async function importInputFromForm(form: FormData, source: ImportHubSourceId): Promise<Record<string, unknown>> {
  const name = String(form.get('projectName') ?? '').trim();
  const sourceUrl = String(form.get('sourceUrl') ?? '').trim();

  if (source === 'empty') return { name };
  if (source === 'github' || source === 'bitbucket') return { repositoryUrl: sourceUrl, name };
  if (source === 'spreadsheet' && sourceUrl) return { kind: 'google-sheets', sourceUrl, name };
  if (['vercel', 'figma', 'claude', 'bolt', 'lovable', 'base44'].includes(source)) return { sourceUrl, name };

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new Error('Select a source file.');
  const bytes = Buffer.from(await file.arrayBuffer());
  return {
    file: {
      fileName: file.name,
      contentBase64: bytes.toString('base64'),
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      mediaType: file.type || undefined,
    },
    name,
  };
}

function importRequestForm(request: ImportHubRequest, fingerprint: string) {
  const form = new FormData();
  form.set('source', request.source);
  form.set('projectName', request.projectName);
  form.set('requestFingerprint', fingerprint);
  if (request.sourceUrl) form.set('sourceUrl', request.sourceUrl);
  if (request.file) form.set('file', request.file);
  return form;
}

function importOperation(job: ApiImportJob, requestFingerprint: string): ImportHubOperation {
  const runtime = String(job.runtimeDetection.runtime ?? 'unknown');
  const framework = job.runtimeDetection.framework ? String(job.runtimeDetection.framework) : '';
  const phase =
    job.status === 'READY'
      ? 'ready'
      : job.status === 'CREATING'
        ? 'creating'
        : job.status === 'COMPLETE'
          ? 'created'
          : job.status === 'FAILED'
            ? 'failed'
            : 'validating';

  return {
    phase,
    requestFingerprint,
    projectId: job.projectId,
    validation: {
      requestFingerprint,
      runtime: {
        label: [runtime, framework].filter(Boolean).join(' · '),
        confidence: job.runtimeDetection.status === 'ready' ? 'high' : 'medium',
        startCommand:
          typeof job.runtimeDetection.devCommand === 'string'
            ? job.runtimeDetection.devCommand
            : typeof job.runtimeDetection.startCommand === 'string'
              ? job.runtimeDetection.startCommand
              : undefined,
      },
      missingSecretNames: job.missingSecretNames,
      generatedConfigFiles: job.generatedConfig.map((file) => file.path),
      preview: {
        title: job.sourceLabel ?? 'Import preview',
        description:
          typeof job.preview.message === 'string'
            ? job.preview.message
            : job.usesAgent
              ? 'Agent will reconstruct and verify this source after project creation.'
              : 'Validated source files are ready to create.',
        fileCount: typeof job.preview.fileCount === 'number' ? job.preview.fileCount : undefined,
        entrypoint: Array.isArray(job.preview.entrypoints) ? String(job.preview.entrypoints[0] ?? '') : undefined,
        url: typeof job.preview.url === 'string' ? job.preview.url : undefined,
        thumbnailUrl: typeof job.preview.thumbnailUrl === 'string' ? job.preview.thumbnailUrl : undefined,
      },
      warnings: job.creditsDisclosure ? [job.creditsDisclosure] : [],
    },
    progress: [
      { id: 'validate', label: 'Validate source', status: job.progress >= 20 ? 'complete' : 'active' },
      { id: 'runtime', label: 'Detect runtime', status: job.progress >= 45 ? 'complete' : 'pending' },
      {
        id: 'create',
        label: 'Create isolated project',
        status: job.status === 'CREATING' ? 'active' : job.status === 'COMPLETE' ? 'complete' : 'pending',
      },
    ],
    ...(job.status === 'FAILED'
      ? {
          error: {
            title: job.errorCode ?? 'Import failed',
            message: job.errorMessage ?? 'The import could not be completed.',
            recoverable: job.recoverable,
          },
        }
      : {}),
  };
}

async function readProjectImportFailure(response: Response): Promise<ProjectImportFailurePayload | undefined> {
  try {
    const payload = (await response.clone().json()) as ProjectImportFailurePayload;
    return payload && typeof payload === 'object' ? payload : undefined;
  } catch {
    return undefined;
  }
}
