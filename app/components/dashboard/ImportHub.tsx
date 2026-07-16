import {
  Archive,
  ArrowRight,
  Bot,
  Boxes,
  Check,
  CheckCircle2,
  Cloud,
  Code2,
  ExternalLink,
  Figma,
  FilePlus2,
  Github,
  History,
  KeyRound,
  Link2,
  LoaderCircle,
  RefreshCw,
  Settings2,
  Sheet,
  ShieldAlert,
  Sparkles,
  Upload,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Component, useMemo, useState, type ChangeEvent, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';

export const IMPORT_HUB_SOURCE_IDS = [
  'github',
  'bitbucket',
  'vercel',
  'figma',
  'claude',
  'bolt',
  'lovable',
  'base44',
  'zip',
  'spreadsheet',
  'previous-agent-export',
  'empty',
] as const;

export type ImportHubSourceId = (typeof IMPORT_HUB_SOURCE_IDS)[number];

type ImportInputKind = 'url' | 'file' | 'spreadsheet' | 'empty';

type ImportSourceDefinition = {
  id: ImportHubSourceId;
  name: string;
  shortDescription: string;
  inputKind: ImportInputKind;
  icon: LucideIcon;
  usesAgent: boolean;
  urlLabel?: string;
  urlPlaceholder?: string;
  acceptedFiles?: string;
};

export const IMPORT_HUB_SOURCES: readonly ImportSourceDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    shortDescription: 'Repository or express import URL',
    inputKind: 'url',
    icon: Github,
    usesAgent: false,
    urlLabel: 'GitHub repository URL',
    urlPlaceholder: 'https://github.com/owner/repo',
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    shortDescription: 'Import a repository',
    inputKind: 'url',
    icon: Code2,
    usesAgent: false,
    urlLabel: 'Bitbucket repository URL',
    urlPlaceholder: 'https://bitbucket.org/workspace/repo',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    shortDescription: 'Bring over a deployed project',
    inputKind: 'url',
    icon: Cloud,
    usesAgent: false,
    urlLabel: 'Vercel project URL',
    urlPlaceholder: 'https://vercel.com/team/project',
  },
  {
    id: 'figma',
    name: 'Figma',
    shortDescription: 'Turn a design file into an app',
    inputKind: 'url',
    icon: Figma,
    usesAgent: true,
    urlLabel: 'Figma file URL',
    urlPlaceholder: 'https://www.figma.com/design/…',
  },
  {
    id: 'claude',
    name: 'Claude',
    shortDescription: 'Continue from a shared artifact',
    inputKind: 'url',
    icon: Sparkles,
    usesAgent: true,
    urlLabel: 'Claude artifact URL',
    urlPlaceholder: 'https://claude.ai/artifacts/…',
  },
  {
    id: 'bolt',
    name: 'Bolt',
    shortDescription: 'Import a Bolt project',
    inputKind: 'url',
    icon: Zap,
    usesAgent: true,
    urlLabel: 'Bolt project URL',
    urlPlaceholder: 'https://bolt.new/…',
  },
  {
    id: 'lovable',
    name: 'Lovable',
    shortDescription: 'Import a Lovable project',
    inputKind: 'url',
    icon: Bot,
    usesAgent: true,
    urlLabel: 'Lovable project URL',
    urlPlaceholder: 'https://lovable.dev/projects/…',
  },
  {
    id: 'base44',
    name: 'Base44',
    shortDescription: 'Import a Base44 application',
    inputKind: 'url',
    icon: Boxes,
    usesAgent: true,
    urlLabel: 'Base44 app URL',
    urlPlaceholder: 'https://app.base44.com/apps/…',
  },
  {
    id: 'zip',
    name: 'ZIP',
    shortDescription: 'Upload a source archive',
    inputKind: 'file',
    icon: Archive,
    usesAgent: false,
    acceptedFiles: '.zip,application/zip,application/x-zip-compressed',
  },
  {
    id: 'spreadsheet',
    name: 'Spreadsheet',
    shortDescription: 'Build an app from tabular data',
    inputKind: 'spreadsheet',
    icon: Sheet,
    usesAgent: true,
    urlLabel: 'Google Sheets URL (optional)',
    urlPlaceholder: 'https://docs.google.com/spreadsheets/d/…',
    acceptedFiles: '.xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    id: 'previous-agent-export',
    name: 'Previous Agent export',
    shortDescription: 'Resume from a portable export',
    inputKind: 'file',
    icon: History,
    usesAgent: false,
    acceptedFiles: '.zip,.json,application/zip,application/json',
  },
  {
    id: 'empty',
    name: 'Empty',
    shortDescription: 'No Agent, framework, or scaffolding',
    inputKind: 'empty',
    icon: FilePlus2,
    usesAgent: false,
  },
] as const;

export type ImportHubRequest = {
  source: ImportHubSourceId;
  projectName: string;
  sourceUrl?: string;
  file?: File;
};

export type ImportHubProgressStep = {
  id: string;
  label: string;
  detail?: string;
  status: 'pending' | 'active' | 'complete' | 'error';
};

export type ImportHubValidation = {
  requestFingerprint: string;
  runtime: {
    label: string;
    confidence?: 'high' | 'medium' | 'low';
    startCommand?: string;
  } | null;
  missingSecretNames: readonly string[];
  generatedConfigFiles: readonly string[];
  preview: {
    title: string;
    description?: string;
    fileCount?: number;
    entrypoint?: string;

    /** URL of a disposable, isolated preview produced by validation. */
    url?: string;
    thumbnailUrl?: string;
  };
  warnings?: readonly string[];
};

export type ImportHubError = {
  title: string;
  message: string;
  recoverable: boolean;
};

export type ImportHubOperation = {
  phase: 'idle' | 'validating' | 'ready' | 'creating' | 'failed' | 'created';
  requestFingerprint?: string;
  validation?: ImportHubValidation;
  progress?: readonly ImportHubProgressStep[];
  error?: ImportHubError;
  projectId?: string;
};

export type ImportHubProps = {
  operation?: ImportHubOperation;
  initialSource?: ImportHubSourceId;
  initialProjectName?: string;
  initialSourceUrl?: string;
  onValidate: (request: ImportHubRequest) => void | Promise<void>;
  onCreate: (request: ImportHubRequest, validation: ImportHubValidation) => void | Promise<void>;
  onRetry?: (request: ImportHubRequest) => void | Promise<void>;
  onSourceChange?: (source: ImportHubSourceId) => void;
  onRenderError?: (error: Error, info: ErrorInfo) => void;
  className?: string;
};

export function createImportRequestFingerprint(request: ImportHubRequest): string {
  const filePart = request.file
    ? `${request.file.name}:${request.file.size}:${request.file.type}:${request.file.lastModified}`
    : '';

  return [request.source, request.projectName.trim(), request.sourceUrl?.trim() ?? '', filePart].join('|');
}

export function validateImportHubRequest(request: ImportHubRequest): string | null {
  if (!request.projectName.trim()) {
    return 'Enter a project name.';
  }

  const source = getSource(request.source);

  if (source.inputKind === 'empty') {
    return null;
  }

  if (source.inputKind === 'file') {
    return request.file ? null : `Choose a ${source.name} file.`;
  }

  if (source.inputKind === 'spreadsheet') {
    if (!request.file && !request.sourceUrl?.trim()) {
      return 'Upload an .xlsx or .csv file, or enter a Google Sheets URL.';
    }

    if (request.file) {
      return null;
    }
  }

  const value = request.sourceUrl?.trim();

  if (!value) {
    return `Enter the ${source.name} URL.`;
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return 'Enter a complete https:// URL.';
  }

  if (url.protocol !== 'https:') {
    return 'Import URLs must use https://.';
  }

  if (request.source === 'spreadsheet' && url.hostname !== 'docs.google.com') {
    return 'Use a Google Sheets URL, or upload an .xlsx or .csv file.';
  }

  if (request.source === 'github' && !isGitHubImportUrl(url)) {
    return 'Use github.com/owner/repo or replit.com/github.com/owner/repo.';
  }

  return null;
}

function isGitHubImportUrl(url: URL) {
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (url.hostname === 'github.com') {
    return pathParts.length >= 2;
  }

  return url.hostname === 'replit.com' && pathParts[0] === 'github.com' && pathParts.length >= 3;
}

function getSource(id: ImportHubSourceId) {
  return IMPORT_HUB_SOURCES.find((source) => source.id === id) ?? IMPORT_HUB_SOURCES[0];
}

type ImportHubBoundaryProps = {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
};

class ImportHubBoundary extends Component<ImportHubBoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <section
          role="alert"
          className="rounded-xl border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-5 text-[var(--status-error-text)]"
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <div>
              <h2 className="font-semibold text-bolt-elements-textPrimary">Import Hub could not render</h2>
              <p className="mt-1 text-sm text-bolt-elements-textSecondary">
                The rest of the dashboard is safe. Retry this panel after checking the import data.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 min-h-11 gap-2"
                onClick={() => this.setState({ error: null })}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry panel
              </Button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}

export function ImportHub(props: ImportHubProps) {
  return (
    <ImportHubBoundary onError={props.onRenderError}>
      <ImportHubSurface {...props} />
    </ImportHubBoundary>
  );
}

function ImportHubSurface({
  operation = { phase: 'idle' },
  initialSource = 'github',
  initialProjectName = '',
  initialSourceUrl = '',
  onValidate,
  onCreate,
  onRetry,
  onSourceChange,
  className,
}: ImportHubProps) {
  const [sourceId, setSourceId] = useState<ImportHubSourceId>(initialSource);
  const [projectName, setProjectName] = useState(initialProjectName);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [file, setFile] = useState<File>();
  const source = getSource(sourceId);

  const request = useMemo<ImportHubRequest>(
    () => ({
      source: sourceId,
      projectName,
      ...(sourceUrl.trim() ? { sourceUrl: sourceUrl.trim() } : {}),
      ...(file ? { file } : {}),
    }),
    [file, projectName, sourceId, sourceUrl],
  );

  const fingerprint = createImportRequestFingerprint(request);
  const localError = validateImportHubRequest(request);
  const operationMatches = operation.requestFingerprint === fingerprint;
  const validation = operation.validation;

  const validated =
    (operation.phase === 'ready' || operation.phase === 'creating') &&
    operationMatches &&
    validation?.requestFingerprint === fingerprint;

  const busy = (operation.phase === 'validating' || operation.phase === 'creating') && operationMatches;

  const chooseSource = (nextSource: ImportHubSourceId) => {
    setSourceId(nextSource);
    setSourceUrl('');
    setFile(undefined);
    onSourceChange?.(nextSource);
  };

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0]);
  };

  return (
    <section
      className={classNames(
        'overflow-hidden rounded-xl border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary shadow-sm',
        className,
      )}
      aria-labelledby="import-hub-title"
      data-testid="import-hub"
      aria-busy={busy}
    >
      <header className="relative overflow-hidden border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-5 sm:px-6 sm:py-6">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full border-[28px] border-[color-mix(in_srgb,var(--vc-action-primary)_9%,transparent)]"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--vc-action-primary)]">
              <span className="h-px w-6 bg-current" aria-hidden />
              Bring your work
            </p>
            <h1 id="import-hub-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Import Hub
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-bolt-elements-textSecondary">
              Validate the source, inspect the detected runtime and configuration, then create the project.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-bolt-elements-textTertiary">
            <ShieldAlert className="h-4 w-4 text-[var(--status-success-text)]" aria-hidden />
            Secrets and database values are never imported
          </div>
        </div>
      </header>

      <div className="p-3 sm:p-5 lg:p-6">
        <fieldset>
          <legend className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-bolt-elements-textTertiary">
            1 · Choose a source
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {IMPORT_HUB_SOURCES.map((candidate) => {
              const Icon = candidate.icon;
              const selected = candidate.id === sourceId;

              return (
                <button
                  key={candidate.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSource(candidate.id)}
                  className={classNames(
                    'group relative min-h-[112px] rounded-lg border p-3 text-left transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)]',
                    selected
                      ? 'border-[var(--vc-action-primary)] bg-[color-mix(in_srgb,var(--vc-action-primary)_8%,var(--bolt-elements-background-depth-2))] shadow-[inset_0_0_0_1px_var(--vc-action-primary)]'
                      : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:-translate-y-0.5 hover:border-bolt-elements-borderColorActive hover:bg-bolt-elements-background-depth-3',
                  )}
                  data-import-source={candidate.id}
                >
                  <span
                    className={classNames(
                      'mb-3 flex h-8 w-8 items-center justify-center rounded-md border',
                      selected
                        ? 'border-[var(--vc-action-primary)] bg-[var(--vc-action-primary)] text-[var(--vc-action-primary-foreground)]'
                        : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textSecondary group-hover:text-bolt-elements-textPrimary',
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="block text-sm font-semibold leading-5">{candidate.name}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-bolt-elements-textTertiary">
                    {candidate.shortDescription}
                  </span>
                  {selected ? (
                    <span className="absolute right-2 top-2 text-[var(--vc-action-primary)]" aria-hidden>
                      <CheckCircle2 className="h-4 w-4" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-5 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(21rem,1.1fr)]">
          <div className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-bolt-elements-textTertiary">
                  2 · Configure
                </p>
                <h2 className="mt-1 text-lg font-semibold">Import from {source.name}</h2>
              </div>
              {source.usesAgent ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--status-warning-text)]">
                  <Sparkles className="h-3 w-3" aria-hidden /> Agent
                </span>
              ) : null}
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-bolt-elements-textSecondary">Project name</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                disabled={busy}
                autoComplete="off"
                className="min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-3 text-sm outline-none placeholder:text-bolt-elements-textTertiary focus-visible:border-[var(--vc-action-primary)] focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)] disabled:opacity-60"
                placeholder="My imported app"
              />
            </label>

            {source.inputKind === 'url' || source.inputKind === 'spreadsheet' ? (
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-semibold text-bolt-elements-textSecondary">
                  {source.urlLabel}
                </span>
                <span className="relative block">
                  <Link2
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-bolt-elements-textTertiary"
                    aria-hidden
                  />
                  <input
                    type="url"
                    value={sourceUrl}
                    onChange={(event) => setSourceUrl(event.target.value)}
                    disabled={busy || (source.inputKind === 'spreadsheet' && Boolean(file))}
                    autoComplete="url"
                    className="min-h-11 w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 py-2 pl-10 pr-3 text-sm outline-none placeholder:text-bolt-elements-textTertiary focus-visible:border-[var(--vc-action-primary)] focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-focus-ring)] disabled:opacity-50"
                    placeholder={source.urlPlaceholder}
                  />
                </span>
              </label>
            ) : null}

            {source.id === 'github' ? (
              <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-bolt-elements-textTertiary">
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Express URLs are accepted: replit.com/github.com/owner/repo
              </p>
            ) : null}

            {source.inputKind === 'file' || source.inputKind === 'spreadsheet' ? (
              <div className="mt-4">
                {source.inputKind === 'spreadsheet' ? (
                  <div className="mb-3 flex items-center gap-3 text-[11px] uppercase tracking-wider text-bolt-elements-textTertiary">
                    <span className="h-px flex-1 bg-bolt-elements-borderColor" /> or upload{' '}
                    <span className="h-px flex-1 bg-bolt-elements-borderColor" />
                  </div>
                ) : null}
                <label className="flex min-h-24 cursor-pointer items-center gap-3 rounded-md border border-dashed border-bolt-elements-borderColorActive bg-bolt-elements-background-depth-1 p-3 transition-colors hover:bg-bolt-elements-background-depth-3 focus-within:ring-2 focus-within:ring-[var(--vc-ide-focus-ring)]">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
                    <Upload className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{file?.name ?? 'Choose a file'}</span>
                    <span className="mt-0.5 block text-xs text-bolt-elements-textTertiary">
                      {source.id === 'spreadsheet'
                        ? '.xlsx or .csv · data seeds a new isolated database'
                        : source.id === 'zip'
                          ? '.zip source archive'
                          : '.zip or .json Agent export'}
                    </span>
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept={source.acceptedFiles}
                    onChange={chooseFile}
                    disabled={busy}
                  />
                </label>
              </div>
            ) : null}

            {source.inputKind === 'empty' ? (
              <div className="mt-5 rounded-md border border-[var(--status-success-border)] bg-[var(--status-success-bg)] p-3 text-sm text-[var(--status-success-text)]">
                <p className="flex items-center gap-2 font-semibold">
                  <Check className="h-4 w-4" aria-hidden /> Direct creation
                </p>
                <p className="mt-1 text-xs leading-5">
                  No Agent, framework, dependencies, or scaffolding. The project opens as an empty workspace.
                </p>
              </div>
            ) : null}

            {source.usesAgent ? (
              <div
                role="note"
                className="mt-4 flex items-start gap-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-xs leading-5 text-[var(--status-warning-text)]"
              >
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  This source asks the Agent to analyze or reconstruct the app.{' '}
                  <strong>Agent work consumes credits.</strong>
                </p>
              </div>
            ) : null}

            {localError ? (
              <p className="mt-3 text-xs text-bolt-elements-textTertiary" aria-live="polite">
                {localError}
              </p>
            ) : null}

            <Button
              type="button"
              variant="primary"
              className="mt-4 min-h-11 w-full gap-2"
              disabled={Boolean(localError) || busy}
              aria-busy={operation.phase === 'validating' && operationMatches}
              onClick={() => void onValidate(request)}
            >
              {operation.phase === 'validating' && operationMatches ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <ShieldAlert className="h-4 w-4" aria-hidden />
              )}
              {operation.phase === 'validating' && operationMatches ? 'Validating source…' : 'Validate import'}
            </Button>
          </div>

          <div className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-bolt-elements-textTertiary">
                  3 · Review & create
                </p>
                <h2 className="mt-1 text-lg font-semibold">Creation preview</h2>
              </div>
              <span
                className={classNames(
                  'rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                  validated
                    ? 'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]'
                    : 'border-bolt-elements-borderColor text-bolt-elements-textTertiary',
                )}
              >
                {validated ? 'Validated' : 'Awaiting validation'}
              </span>
            </div>

            {validated && validation ? (
              <ValidationPreview validation={validation} />
            ) : (
              <div className="mt-5 flex min-h-52 flex-col items-center justify-center rounded-md border border-dashed border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 text-bolt-elements-textTertiary">
                  <Settings2 className="h-5 w-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold">Validate before creating</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-bolt-elements-textTertiary">
                  Runtime, required secret names, generated config, and the project preview will appear here.
                </p>
              </div>
            )}

            {operation.error && operationMatches ? (
              <div
                role="alert"
                className="mt-4 rounded-md border border-[var(--status-error-border)] bg-[var(--status-error-bg)] p-3 text-[var(--status-error-text)]"
              >
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {operation.error.title}
                </p>
                <p className="mt-1 pl-6 text-xs leading-5">{operation.error.message}</p>
                {operation.error.recoverable && onRetry ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-6 mt-3 gap-2 border-[var(--status-error-border)]"
                    onClick={() => void onRetry(request)}
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry import
                  </Button>
                ) : null}
              </div>
            ) : null}

            {operation.progress?.length && operationMatches ? <ImportProgress steps={operation.progress} /> : null}

            <Button
              type="button"
              variant="primary"
              className="mt-4 min-h-11 w-full gap-2"
              disabled={!validated || busy}
              aria-busy={operation.phase === 'creating' && operationMatches}
              onClick={() => {
                if (validated && validation) {
                  void onCreate(request, validation);
                }
              }}
            >
              {operation.phase === 'creating' && operationMatches ? (
                <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden />
              )}
              {operation.phase === 'creating' && operationMatches ? 'Creating project…' : 'Create project'}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ValidationPreview({ validation }: { validation: ImportHubValidation }) {
  return (
    <div className="mt-5 space-y-3" data-testid="import-validation-preview">
      {validation.preview.url ? (
        <div className="relative aspect-[16/7] min-h-40 overflow-hidden rounded-md border border-bolt-elements-borderColor bg-white">
          <iframe
            src={validation.preview.url}
            title={`${validation.preview.title} validation preview`}
            className="h-full w-full"
            sandbox="allow-forms allow-popups allow-scripts"
            referrerPolicy="no-referrer"
          />
          <span className="pointer-events-none absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
            <ExternalLink className="h-3 w-3" aria-hidden /> Isolated preview
          </span>
        </div>
      ) : validation.preview.thumbnailUrl ? (
        <div className="relative aspect-[16/7] overflow-hidden rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1">
          <img src={validation.preview.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
            <ExternalLink className="h-3 w-3" aria-hidden /> Source preview
          </span>
        </div>
      ) : null}

      <div className="rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 p-3">
        <p className="truncate text-sm font-semibold">{validation.preview.title}</p>
        {validation.preview.description ? (
          <p className="mt-1 text-xs leading-5 text-bolt-elements-textTertiary">{validation.preview.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-bolt-elements-textSecondary">
          {validation.preview.fileCount !== undefined ? (
            <span className="rounded border border-bolt-elements-borderColor px-2 py-1">
              {validation.preview.fileCount} files
            </span>
          ) : null}
          {validation.preview.entrypoint ? (
            <span className="max-w-full truncate rounded border border-bolt-elements-borderColor px-2 py-1 font-mono">
              {validation.preview.entrypoint}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <DetectionCard
          icon={Code2}
          label="Runtime"
          value={validation.runtime?.label ?? 'No runtime detected'}
          detail={validation.runtime?.startCommand}
        />
        <DetectionCard
          icon={KeyRound}
          label="Missing secrets"
          value={
            validation.missingSecretNames.length ? `${validation.missingSecretNames.length} required` : 'None detected'
          }
          detail={validation.missingSecretNames.join(', ')}
          warning={validation.missingSecretNames.length > 0}
        />
        <DetectionCard
          icon={Settings2}
          label="Generated config"
          value={
            validation.generatedConfigFiles.length
              ? `${validation.generatedConfigFiles.length} ${validation.generatedConfigFiles.length === 1 ? 'file' : 'files'}`
              : 'No changes'
          }
          detail={validation.generatedConfigFiles.join(', ')}
        />
      </div>

      {validation.warnings?.length ? (
        <ul className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] p-3 text-xs leading-5 text-[var(--status-warning-text)]">
          {validation.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DetectionCard({
  icon,
  label,
  value,
  detail,
  warning = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail?: string;
  warning?: boolean;
}) {
  const Icon = icon;

  return (
    <div
      className={classNames(
        'min-w-0 rounded-md border p-3',
        warning
          ? 'border-[var(--status-warning-border)] bg-[var(--status-warning-bg)]'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-1',
      )}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-bolt-elements-textTertiary">
        <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-2 truncate text-xs font-semibold">{value}</p>
      {detail ? (
        <p className="mt-1 break-words font-mono text-[10px] leading-4 text-bolt-elements-textTertiary">{detail}</p>
      ) : null}
    </div>
  );
}

function ImportProgress({ steps }: { steps: readonly ImportHubProgressStep[] }) {
  return (
    <ol className="mt-4 space-y-2" aria-label="Import progress" aria-live="polite">
      {steps.map((step) => (
        <li key={step.id} className="flex items-start gap-2 text-xs">
          <span
            className={classNames(
              'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
              step.status === 'complete' &&
                'border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)]',
              step.status === 'active' && 'border-[var(--vc-action-primary)] text-[var(--vc-action-primary)]',
              step.status === 'error' &&
                'border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]',
              step.status === 'pending' && 'border-bolt-elements-borderColor text-bolt-elements-textTertiary',
            )}
          >
            {step.status === 'complete' ? <Check className="h-2.5 w-2.5" aria-hidden /> : null}
            {step.status === 'active' ? (
              <LoaderCircle className="h-2.5 w-2.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {step.status === 'error' ? <span aria-hidden>!</span> : null}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-bolt-elements-textSecondary">{step.label}</span>
            {step.detail ? <span className="mt-0.5 block text-bolt-elements-textTertiary">{step.detail}</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
