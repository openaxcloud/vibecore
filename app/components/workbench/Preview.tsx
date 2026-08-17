import { useStore } from '@nanostores/react';
import {
  Cloud,
  Database,
  ExternalLink,
  Globe,
  History,
  Lightbulb,
  MessageSquare,
  Pencil,
  Puzzle,
  Settings,
  Shield,
  Smartphone,
  Sparkles,
  UserPlus,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-toastify';
import { Inspector, type ElementInfo } from './Inspector';
import { PortDropdown } from './PortDropdown';
import { ScreenshotSelector } from './ScreenshotSelector';
import { evaluatePreviewReadyEdge, resolvePreviewAddress, type PreviewReadyEdgeState } from './preview-address';
import {
  decidePreviewLoadOutcome,
  shouldReloadPreviewOnReadyEdge,
  shouldRunPreviewBootLoop,
  MAX_PREVIEW_BOOT_ATTEMPTS,
} from './preview-frame-recovery';
import { EmptyState } from '~/components/ui/EmptyState';
import { IconButton } from '~/components/ui/IconButton';
import { ExpoQrModal } from '~/components/workbench/ExpoQrModal';
import { getProjectIdeMemory, saveProjectIdeMemory } from '~/lib/persistence/projectIdeMemory';
import { workspaceEvents } from '~/lib/runtime/workspace-events';
import type { FileMap } from '~/lib/stores/files';
import {
  resolvePreviewBootOverlay,
  shouldKickReopenPreview,
  shouldLatchPreviewStartFailure,
  shouldReattachRunningPreview,
} from '~/lib/stores/preview-recovery';
import { expoUrlAtom } from '~/lib/stores/qrCodeStore';
import { workbenchStore } from '~/lib/stores/workbench';
import { captureAndUploadThumbnail } from '~/lib/thumbnail-capture';
import { WORK_DIR } from '~/utils/constants';

/*
 * F7 — resolve a preview-error `filename` (usually a full iframe URL such as
 * http://host/src/App.tsx?t=… or a Vite /@fs/ path) to a real workbench file
 * key so the console entry can jump straight to the source. Returns undefined
 * when no matching file is open, in which case the entry stays plain text.
 */
function resolvePreviewSourcePath(filename: string): string | undefined {
  let pathname = filename;

  try {
    pathname = new URL(filename).pathname;
  } catch {
    pathname = filename.split(/[?#]/)[0];
  }

  // Strip Vite-internal prefixes: /@fs/<abs> and /@id/<id>.
  pathname = pathname.replace(/^\/@fs/, '').replace(/^\/@id\//, '/');

  const stripped = pathname.replace(/^\/+/, '');

  if (!stripped) {
    return undefined;
  }

  const files = workbenchStore.files.get();
  const absolutePath = pathname.startsWith(WORK_DIR) ? pathname : `${WORK_DIR}/${stripped}`;

  if (files[absolutePath]?.type === 'file') {
    return absolutePath;
  }

  if (files[pathname]?.type === 'file') {
    return pathname;
  }

  return Object.keys(files).find(
    (candidate) => candidate.endsWith(`/${stripped}`) && files[candidate]?.type === 'file',
  );
}

/* Open a resolved source file in the editor at the reported 1-based line/column. */
function openPreviewSource(path: string, line: number, column?: number) {
  workbenchStore.setSelectedFile(path);
  workbenchStore.setCurrentDocumentScrollPosition({
    line: Math.max(0, line - 1),

    // CodeMirror treats scroll.column as a 0-based offset from the line start.
    column: column && column > 0 ? column - 1 : 0,
  });
  workbenchStore.currentView.set('code');
}

/*
 * F7 — a single `path:line[:col]` reference recovered from console/stack text.
 * `path` is exactly the substring that appeared before the line number (it may
 * be a workspace path, a leading-slash absolute path, or a full Vite iframe URL
 * with a `?t=` cache-busting query); resolution to a real workbench file is done
 * later by resolvePreviewSourcePath so the parser stays pure and unit-testable.
 */
export interface ConsoleSourceRef {
  path: string;
  line: number;
  column?: number;
}

export type ConsoleMessageSegment =
  | { type: 'text'; value: string }
  | { type: 'ref'; value: string; ref: ConsoleSourceRef };

/*
 * Restrict matches to real source extensions so stack-trace noise (host:port,
 * timestamps like 12:34:56, `example.com:443`) never masquerades as a file ref.
 * The optional `?query`/`#hash` after the extension covers Vite's transformed
 * URLs (…/src/App.tsx?t=1699999999:12:5).
 */
const CONSOLE_SOURCE_REF_REGEX =
  /([^\s()<>'"]+?\.(?:tsx?|jsx?|mjs|cjs|vue|svelte|astro|css|scss|sass|less|html?|json|mdx?|ya?ml)(?:[?#][^\s():]*)?):(\d+)(?::(\d+))?/gi;

/*
 * Split console/stack text into plain-text and `path:line[:col]` reference
 * segments. Pure: does not touch the workbench file map, so the render layer can
 * decide (per ref) whether the path resolves to an open file and only then wire
 * a clickable jump — an unresolved ref stays plain text (no dead link).
 */
export function parseConsoleSourceRefs(text: string): ConsoleMessageSegment[] {
  const segments: ConsoleMessageSegment[] = [];

  if (!text) {
    return segments;
  }

  CONSOLE_SOURCE_REF_REGEX.lastIndex = 0;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = CONSOLE_SOURCE_REF_REGEX.exec(text)) !== null) {
    const [raw, path, lineText, columnText] = match;

    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }

    segments.push({
      type: 'ref',
      value: raw,
      ref: {
        path,
        line: Number(lineText),
        column: columnText ? Number(columnText) : undefined,
      },
    });

    lastIndex = match.index + raw.length;

    // Guard against a zero-length match stalling the loop.
    if (CONSOLE_SOURCE_REF_REGEX.lastIndex === match.index) {
      CONSOLE_SOURCE_REF_REGEX.lastIndex += 1;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/*
 * Render console/stack text with each resolvable `path:line[:col]` ref turned
 * into a keyboard-activatable jump button (blue = action). Refs that don't map
 * to an open workbench file render as plain text.
 */
type Translate = (key: string, options?: Record<string, unknown>) => string;

function renderConsoleMessage(message: string, t: Translate): ReactNode {
  const segments = parseConsoleSourceRefs(message);

  if (segments.length <= 1 && segments[0]?.type !== 'ref') {
    return message;
  }

  return segments.map((segment, index) => {
    if (segment.type === 'text') {
      return <Fragment key={index}>{segment.value}</Fragment>;
    }

    const resolvedPath = resolvePreviewSourcePath(segment.ref.path);

    if (!resolvedPath) {
      return <Fragment key={index}>{segment.value}</Fragment>;
    }

    const { line, column } = segment.ref;
    const location = `${resolvedPath}:${line}${column ? `:${column}` : ''}`;

    return (
      <button
        key={index}
        type="button"
        className="bolt-preview-console-ref"
        onClick={() => openPreviewSource(resolvedPath, line, column)}
        title={t('idePanels.preview.openLocation', { location })}
        aria-label={t('idePanels.preview.openFileLine', { path: resolvedPath, line })}
      >
        {segment.value}
      </button>
    );
  });
}

type ResizeSide = 'left' | 'right' | null;
type PreviewDevice = 'desktop' | 'tablet' | 'mobile' | 'custom';
type PreviewLogTab = 'webview' | 'server';
type PreviewDevToolsTab = 'console' | 'network' | 'elements';
type SplashLayout = 'icon-hero' | 'two-column' | 'tips-carousel' | 'stat-highlight' | 'icon-grid';
type PreviewBootStepId = 'dependencies' | 'build' | 'server' | 'ready';

interface SplashSlide {
  layout: SplashLayout;
  icon?: LucideIcon;
  headline: string;
  subtitle: string;
  color: string;
  stats?: Array<{ label: string; value: string }>;
  gridItems?: Array<{ icon: LucideIcon; label: string }>;
}

interface PreviewProps {
  setSelectedElement?: (element: ElementInfo | null) => void;
  projectId?: string;
  autoStart?: boolean;
  previewDevice?: PreviewDevice;
  onPreviewDeviceChange?: (device: PreviewDevice) => void;
  onOpenLogsRight?: () => void;
  onOpenSourceFile?: (filePath: string) => void;
}

interface WindowSize {
  name: string;
  width: number;
  height: number;
  icon: string;
  hasFrame?: boolean;
  frameType?: 'mobile' | 'tablet' | 'laptop' | 'desktop';
}

function getPreviewBootSteps(t: Translate): Array<{ id: PreviewBootStepId; label: string; description: string }> {
  return [
    {
      id: 'dependencies',
      label: t('idePanels.preview.bootDependencies'),
      description: t('idePanels.preview.bootDependenciesBody'),
    },
    {
      id: 'build',
      label: t('idePanels.preview.bootBuild'),
      description: t('idePanels.preview.bootBuildBody'),
    },
    {
      id: 'server',
      label: t('idePanels.preview.bootServer'),
      description: t('idePanels.preview.bootServerBody'),
    },
    {
      id: 'ready',
      label: t('idePanels.preview.bootReady'),
      description: t('idePanels.preview.bootReadyBody'),
    },
  ];
}

/*
 * Whether to show the "Starting project workspace…" boot overlay. Critically it
 * must return FALSE on a failed workspace boot or preview run: when the provider
 * sets workspaceError it leaves workspaceStatus undefined (workspaceReady stays
 * false), which previously left the overlay spinning forever with no error and no
 * recovery. A failure renders the recoverable error UI instead.
 */
export function shouldShowStartupOverlay(input: {
  hasActivePreview: boolean;
  hasStaticPreview: boolean;
  autoStart: boolean;
  previewRunFailed: boolean;
  hasWorkspaceError: boolean;
  isStartingPreview: boolean;
  isRefreshingPorts: boolean;
  workspaceReady: boolean;
  previewStatus?: string;
}): boolean {
  if (input.previewRunFailed || input.hasWorkspaceError) {
    return false;
  }

  return Boolean(
    !input.hasActivePreview &&
      !input.hasStaticPreview &&
      input.autoStart &&
      (input.isStartingPreview || input.isRefreshingPorts || !input.workspaceReady || input.previewStatus),
  );
}

/*
 * Inspector message types that the Inspector component owns exclusively. The
 * Inspector applies offsetRect() to translate the iframe-local rect into page
 * coordinates and calls onElementSelect for these. Preview's own postMessage
 * handler must NOT react to them — doing so would store the raw, un-offset rect
 * and run the selection side-effects twice per event (last-writer-wins on the
 * wrong coordinates).
 */
const INSPECTOR_MESSAGE_TYPES_OWNED_BY_INSPECTOR = new Set(['INSPECTOR_CLICK', 'INSPECTOR_HOVER', 'INSPECTOR_LEAVE']);

/**
 * Whether Preview's own window `message` handler should process a given message
 * type. Inspector selection/hover events are owned solely by the Inspector
 * component (which offsets coordinates), so Preview must skip them to avoid the
 * double-handling / un-offset-rect bug.
 */
export function shouldPreviewHandleInspectorMessage(messageType: unknown): boolean {
  if (typeof messageType !== 'string') {
    return false;
  }

  return !INSPECTOR_MESSAGE_TYPES_OWNED_BY_INSPECTOR.has(messageType);
}

export function resolvePreviewBootProgress(input: {
  workspaceReady: boolean;
  previewsLength: number;
  isStartingPreview: boolean;
  isRefreshingPorts: boolean;
  previewRunFailed: boolean;
  previewStatus?: string;
  upstreamNotReady?: boolean;
}) {
  const status = input.previewStatus?.toLowerCase() ?? '';

  /*
   * A registered preview entry is NOT proof the dev server answers. When the
   * iframe reports the upstream is not up yet, the panel already tells the user
   * "Preview server is still starting; retrying…" — claiming step `ready` at
   * 100% at the same time put two contradictory statements in the same panel
   * (and the state could stay frozen there when no server ever came up).
   * Whatever the panel says in its task line wins over the mere existence of a
   * preview entry.
   */
  if (input.upstreamNotReady) {
    return { activeStep: 'server' as PreviewBootStepId, progress: 76 };
  }

  if (input.previewsLength > 0) {
    return { activeStep: 'ready' as PreviewBootStepId, progress: 100 };
  }

  if (input.previewRunFailed) {
    return { activeStep: 'server' as PreviewBootStepId, progress: 82 };
  }

  if (!input.workspaceReady || status.includes('install') || status.includes('dependenc')) {
    return { activeStep: 'dependencies' as PreviewBootStepId, progress: 24 };
  }

  if (input.isStartingPreview || status.includes('build') || status.includes('running')) {
    return { activeStep: 'build' as PreviewBootStepId, progress: 52 };
  }

  if (
    input.isRefreshingPorts ||
    status.includes('port') ||
    status.includes('dev server') ||
    status.includes('detect')
  ) {
    return { activeStep: 'server' as PreviewBootStepId, progress: 76 };
  }

  return { activeStep: 'server' as PreviewBootStepId, progress: 68 };
}

function getWindowSizes(t: Translate): WindowSize[] {
  return [
    {
      name: t('idePanels.preview.deviceIphoneSe'),
      width: 375,
      height: 667,
      icon: 'i-ph:device-mobile',
      hasFrame: true,
      frameType: 'mobile',
    },
    {
      name: t('idePanels.preview.deviceIphone'),
      width: 390,
      height: 844,
      icon: 'i-ph:device-mobile',
      hasFrame: true,
      frameType: 'mobile',
    },
    {
      name: t('idePanels.preview.deviceIphoneProMax'),
      width: 428,
      height: 926,
      icon: 'i-ph:device-mobile',
      hasFrame: true,
      frameType: 'mobile',
    },
    {
      name: t('idePanels.preview.deviceIpadMini'),
      width: 768,
      height: 1024,
      icon: 'i-ph:device-tablet',
      hasFrame: true,
      frameType: 'tablet',
    },
    {
      name: t('idePanels.preview.deviceIpadAir'),
      width: 820,
      height: 1180,
      icon: 'i-ph:device-tablet',
      hasFrame: true,
      frameType: 'tablet',
    },
    {
      name: t('idePanels.preview.deviceIpadPro11'),
      width: 834,
      height: 1194,
      icon: 'i-ph:device-tablet',
      hasFrame: true,
      frameType: 'tablet',
    },
    {
      name: t('idePanels.preview.deviceIpadPro13'),
      width: 1024,
      height: 1366,
      icon: 'i-ph:device-tablet',
      hasFrame: true,
      frameType: 'tablet',
    },
    {
      name: t('idePanels.preview.deviceSmallLaptop'),
      width: 1280,
      height: 800,
      icon: 'i-ph:laptop',
      hasFrame: true,
      frameType: 'laptop',
    },
    {
      name: t('idePanels.preview.deviceLaptop'),
      width: 1366,
      height: 768,
      icon: 'i-ph:laptop',
      hasFrame: true,
      frameType: 'laptop',
    },
    {
      name: t('idePanels.preview.deviceLargeLaptop'),
      width: 1440,
      height: 900,
      icon: 'i-ph:laptop',
      hasFrame: true,
      frameType: 'laptop',
    },
    {
      name: t('idePanels.preview.deviceDesktop'),
      width: 1920,
      height: 1080,
      icon: 'i-ph:monitor',
      hasFrame: true,
      frameType: 'desktop',
    },
    {
      name: t('idePanels.preview.device4k'),
      width: 3840,
      height: 2160,
      icon: 'i-ph:monitor',
      hasFrame: true,
      frameType: 'desktop',
    },
  ];
}

function getPreviewTips(t: Translate) {
  return [
    { icon: MessageSquare, text: t('idePanels.preview.tipAgent') },
    { icon: Cloud, text: t('idePanels.preview.tipDeploy') },
    { icon: Pencil, text: t('idePanels.preview.tipFiles') },
    { icon: UserPlus, text: t('idePanels.preview.tipCollaborators') },
    { icon: History, text: t('idePanels.preview.tipSnapshots') },
    { icon: Settings, text: t('idePanels.preview.tipEnvironment') },
    { icon: ExternalLink, text: t('idePanels.preview.tipWindow') },
    { icon: Sparkles, text: t('idePanels.preview.tipPorts') },
    { icon: Shield, text: t('idePanels.preview.tipIsolation') },
    { icon: Globe, text: t('idePanels.preview.tipDomains') },
    { icon: Database, text: t('idePanels.preview.tipDatabase') },
    { icon: Smartphone, text: t('idePanels.preview.tipDevices') },
  ];
}

function getPreviewSplashSlides(t: Translate): SplashSlide[] {
  return [
    {
      layout: 'icon-hero',
      icon: Sparkles,
      headline: t('idePanels.preview.slidePreparing'),
      subtitle: t('idePanels.preview.slidePreparingBody'),
      color: 'var(--vc-ide-accent-action)',
    },
    {
      layout: 'two-column',
      icon: Zap,
      headline: t('idePanels.preview.slideAutomatic'),
      subtitle: t('idePanels.preview.slideAutomaticBody'),
      color: 'var(--vc-ide-accent-warning)',
      stats: [
        { label: t('idePanels.preview.portScans'), value: t('idePanels.preview.automatic') },
        { label: t('idePanels.preview.devServer'), value: t('idePanels.preview.live') },
      ],
    },
    {
      layout: 'tips-carousel',
      icon: Lightbulb,
      headline: t('idePanels.preview.slideBooting'),
      subtitle: t('idePanels.preview.slideBootingBody'),
      color: 'var(--vc-ide-accent-success)',
    },
    {
      layout: 'icon-grid',
      icon: Puzzle,
      headline: t('idePanels.preview.slideConnected'),
      subtitle: t('idePanels.preview.slideConnectedBody'),
      color: 'var(--vc-ide-accent-error)',
      gridItems: [
        { icon: Database, label: t('idePanels.preview.database') },
        { icon: Shield, label: t('idePanels.preview.secrets') },
        { icon: Globe, label: t('idePanels.preview.domains') },
        { icon: Cloud, label: t('idePanels.preview.deployments') },
      ],
    },
    {
      layout: 'stat-highlight',
      icon: Globe,
      headline: t('idePanels.preview.slidePublishing'),
      subtitle: t('idePanels.preview.slidePublishingBody'),
      color: 'var(--vc-ide-accent-action)',
      stats: [
        { label: t('idePanels.preview.tls'), value: t('idePanels.preview.builtIn') },
        { label: t('idePanels.preview.rollback'), value: t('idePanels.preview.oneClick') },
        { label: t('idePanels.preview.logs'), value: t('idePanels.preview.live') },
      ],
    },
  ];
}

function staticPreviewFileContent(files: FileMap, filePath: string) {
  const normalizedTarget = filePath.replaceAll('\\', '/').replace(/^\/+/, '');

  for (const [candidatePath, file] of Object.entries(files)) {
    const normalizedCandidate = candidatePath.replaceAll('\\', '/').replace(/^\/+/, '');

    if (
      (normalizedCandidate === normalizedTarget || normalizedCandidate.endsWith(`/${normalizedTarget}`)) &&
      file?.type === 'file' &&
      typeof file.content === 'string'
    ) {
      return file.content;
    }
  }

  return undefined;
}

function buildStaticPreviewHtml(files: FileMap, language: string, fallbackTitle: string) {
  const indexHtml = staticPreviewFileContent(files, 'index.html');

  if (!indexHtml) {
    return undefined;
  }

  let inlinedAnyModule = false;
  let canInlineModules = true;

  const html = indexHtml.replace(
    /<script\b([^>]*\btype=["']module["'][^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (match, beforeSrc: string, sourcePath: string, afterSrc: string) => {
      let decodedSourcePath = sourcePath;

      try {
        decodedSourcePath = decodeURIComponent(sourcePath);
      } catch {
        // malformed percent-encoding in the script src — fall back to the raw path
      }

      const normalizedSourcePath = decodedSourcePath.replace(/^\/+/, '');
      const source = staticPreviewFileContent(files, normalizedSourcePath);

      if (!source || /\b(?:import|export)\b/.test(source)) {
        canInlineModules = false;

        return match;
      }

      inlinedAnyModule = true;

      return `<script ${beforeSrc} ${afterSrc}>${source}</script>`;
    },
  );

  if (/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["'][^"']+["'][^>]*><\/script>/i.test(indexHtml)) {
    return inlinedAnyModule && canInlineModules ? html : buildBoltTemplateStaticPreview(files, language, fallbackTitle);
  }

  return indexHtml;
}

function buildBoltTemplateStaticPreview(files: FileMap, language: string, fallbackTitle: string) {
  const appSource =
    staticPreviewFileContent(files, 'src/App.tsx') ??
    staticPreviewFileContent(files, 'src/App.jsx') ??
    staticPreviewFileContent(files, 'src/App.ts') ??
    staticPreviewFileContent(files, 'src/App.js');

  if (!appSource || !appSource.includes('Created from Bolt template')) {
    return undefined;
  }

  const title = jsonLiteralFromJsxTextExpression(appSource.match(/<h1>\{([^}]+)\}<\/h1>/)?.[1]);
  const subtitle = jsonLiteralFromJsxTextExpression(appSource.match(/<p>\{([^}]+)\}<\/p>/)?.[1]);

  if (!title && !subtitle) {
    return undefined;
  }

  const styles = staticPreviewFileContent(files, 'src/styles.css') ?? '';

  return `<!doctype html>
<html lang="${language.startsWith('fr') ? 'fr' : 'en'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title ?? fallbackTitle)}</title>
    <style>${styles}</style>
  </head>
  <body>
    <main class="app-shell">
      <section class="hero">
        ${title ? `<h1>${escapeHtml(title)}</h1>` : ''}
        ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
      </section>
    </main>
  </body>
</html>`;
}

function jsonLiteralFromJsxTextExpression(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value.trim());

    return typeof parsed === 'string' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const Preview = memo(
  ({
    setSelectedElement,
    projectId,
    autoStart = true,
    previewDevice = 'desktop',
    onPreviewDeviceChange,
    onOpenLogsRight,
    onOpenSourceFile,
  }: PreviewProps) => {
    const { t, i18n } = useTranslation();
    const activeLanguage = i18n.resolvedLanguage ?? i18n.language;
    const windowSizes = useMemo(() => getWindowSizes(t), [t]);
    const previewBootSteps = useMemo(() => getPreviewBootSteps(t), [t]);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // One-shot guard: auto-reload a blank (served-but-never-mounted) preview at most once.
    const blankRecoveredRef = useRef(false);

    /*
     * How many times the boot loop has relaunched the dev server for the current
     * (portless) session — bounds the auto-retry so a dev-server-absent 502 keeps
     * relaunching but never hammers forever (see shouldRunPreviewBootLoop).
     */
    const bootAttemptsRef = useRef(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const previewReloadTimer = useRef<number | undefined>();
    const previewLoadRetryRef = useRef(0);
    const [activePreviewIndex, setActivePreviewIndex] = useState(0);
    const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const hasSelectedPreview = useRef(false);
    const previews = useStore(workbenchStore.previews);
    const workspaceLoading = useStore(workbenchStore.workspaceLoading);
    const workspaceStatus = useStore(workbenchStore.workspaceStatus);
    const workspaceLogs = useStore(workbenchStore.workspaceLogs);
    const workspaceError = useStore(workbenchStore.workspaceError);
    const files = useStore(workbenchStore.files);

    const normalizedActivePreviewIndex = previews[activePreviewIndex]
      ? activePreviewIndex
      : previews.length > 0
        ? 0
        : -1;

    const activePreview = normalizedActivePreviewIndex >= 0 ? previews[normalizedActivePreviewIndex] : undefined;
    const [displayPath, setDisplayPath] = useState('/');
    const [addressInput, setAddressInput] = useState('/');
    const [iframeUrl, setIframeUrl] = useState<string | undefined>();
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [isInspectorMode, setIsInspectorMode] = useState(false);
    const [isDeviceModeOn, setIsDeviceModeOn] = useState(false);
    const [widthPercent, setWidthPercent] = useState<number>(37.5);
    const [currentWidth, setCurrentWidth] = useState<number>(0);

    const resizingState = useRef({
      isResizing: false,
      side: null as ResizeSide,
      startX: 0,
      startWidthPercent: 37.5,
      windowWidth: window.innerWidth,
      pointerId: null as number | null,
    });

    /*
     * Mirror of resizingState.current.isResizing in React state so the resize
     * dimension overlay re-renders (the ref was read in JSX, which never triggers
     * a re-render → the opacity fade-in stuttered / didn't apply).
     */
    const [isResizing, setIsResizing] = useState(false);

    // Reduce scaling factor to make resizing less sensitive
    const SCALING_FACTOR = 1;

    const [isWindowSizeDropdownOpen, setIsWindowSizeDropdownOpen] = useState(false);
    const [selectedWindowSize, setSelectedWindowSize] = useState<WindowSize>(windowSizes[0]);
    const [isLandscape, setIsLandscape] = useState(false);
    const [showDeviceFrame, setShowDeviceFrame] = useState(true);
    const [showDeviceFrameInPreview, setShowDeviceFrameInPreview] = useState(false);
    const expoUrl = useStore(expoUrlAtom);
    const [isExpoQrModalOpen, setIsExpoQrModalOpen] = useState(false);
    const [isRefreshingPorts, setIsRefreshingPorts] = useState(false);
    const [isStartingPreview, setIsStartingPreview] = useState(false);
    const [previewStatus, setPreviewStatus] = useState<string | undefined>();
    const [previewRunFailed, setPreviewRunFailed] = useState(false);
    const [previewFrameLoaded, setPreviewFrameLoaded] = useState(false);
    const [loadedPreviewUrl, setLoadedPreviewUrl] = useState<string | undefined>();
    const previewLoadIdentityRef = useRef<string | undefined>();
    const [logsOpen, setLogsOpen] = useState(false);
    const [activeLogTab, setActiveLogTab] = useState<PreviewLogTab>('webview');
    const [devToolsOpen, setDevToolsOpen] = useState(false);
    const [capturingThumbnail, setCapturingThumbnail] = useState(false);
    const [activeDevToolsTab, setActiveDevToolsTab] = useState<PreviewDevToolsTab>('console');

    const [previewConsoleEvents, setPreviewConsoleEvents] = useState<
      Array<{ level: string; message: string; source?: { path: string; line: number } }>
    >([]);

    const [previewNetworkEvents, setPreviewNetworkEvents] = useState<
      Array<{ method: string; url: string; status: string; source: string }>
    >([]);

    const [selectedPreviewElement, setSelectedPreviewElement] = useState<ElementInfo | null>(null);

    const workspaceReady = !projectId || (!workspaceLoading && Boolean(workspaceStatus));

    const previewableFilesSignature = Object.keys(files)
      .filter((filePath) =>
        /(^|\/)(package\.json|index\.html|src\/App\.(tsx|ts|jsx|js)|app\/page\.(tsx|ts|jsx|js))$/.test(filePath),
      )
      .sort()
      .join('|');

    const staticPreviewHtml = useMemo(
      () => buildStaticPreviewHtml(files, activeLanguage, t('idePanels.preview.templateTitle')),
      [activeLanguage, files, t],
    );

    const hasStaticPreview = Boolean(staticPreviewHtml && !activePreview);
    const lastPreviewableFilesSignature = useRef(previewableFilesSignature);

    const visiblePreviewUrl =
      iframeUrl ??
      (activePreview ? `${activePreview.baseUrl}${displayPath.startsWith('/') ? displayPath : `/${displayPath}`}` : '');
    const previewBootProgress = useMemo(
      () =>
        resolvePreviewBootProgress({
          workspaceReady,
          previewsLength: previews.length,
          isStartingPreview,
          isRefreshingPorts,
          previewRunFailed,
          previewStatus,

          /*
           * Compared against the same translations the panel renders, so this
           * stays correct in every locale without a second source of truth.
           */
          upstreamNotReady:
            previewStatus === t('idePanels.preview.serverStartingRetry') ||
            previewStatus === t('idePanels.preview.serverUnreachableRetry'),
        }),
      [isRefreshingPorts, isStartingPreview, previews.length, previewRunFailed, previewStatus, t, workspaceReady],
    );
    const recentPreviewLogs = useMemo(
      () =>
        workspaceLogs
          .map((line) => line.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').trim())
          .filter(Boolean)
          .slice(-4),
      [workspaceLogs],
    );
    const shouldShowPreviewLoadingOverlay = Boolean(
      activePreview &&
        iframeUrl &&
        (activePreview.ready === false || !previewFrameLoaded || loadedPreviewUrl !== iframeUrl),
    );

    /*
     * Reopen resume vs cold rebuild. When the workspace pod is genuinely running
     * and a port is already serving, the iframe is only waiting to re-adopt a live
     * app — show the lightweight "Reattaching…" skeleton, NOT the from-scratch
     * install/boot progress. A cold boot (isStartingPreview / no live port) keeps
     * the full rebuild overlay.
     */
    const reattachingRunningPreview =
      shouldReattachRunningPreview(workspaceStatus, previews) && !isStartingPreview && !previewRunFailed;
    const previewLoadingOverlayMode = resolvePreviewBootOverlay({
      overlayVisible: shouldShowPreviewLoadingOverlay,
      reattaching: reattachingRunningPreview,
    });
    const shouldShowPreviewStartupOverlay = shouldShowStartupOverlay({
      hasActivePreview: Boolean(activePreview),
      hasStaticPreview,
      autoStart,
      previewRunFailed,
      hasWorkspaceError: Boolean(workspaceError),
      isStartingPreview,
      isRefreshingPorts,
      workspaceReady,
      previewStatus,
    });
    useEffect(() => {
      const previewLoadIdentity = iframeUrl ? `${projectId ?? 'local'}:${iframeUrl}` : undefined;

      if (previewLoadIdentityRef.current === previewLoadIdentity) {
        return;
      }

      previewLoadIdentityRef.current = previewLoadIdentity;
      previewLoadRetryRef.current = 0;
      setPreviewFrameLoaded(false);
      setLoadedPreviewUrl(undefined);

      if (previewLoadIdentity) {
        setPreviewStatus(t('idePanels.preview.loadingWebview'));
      }
    }, [iframeUrl, projectId, t]);

    const openPreviewLogs = useCallback(() => {
      setActiveLogTab('server');
      setLogsOpen(true);
      onOpenLogsRight?.();
    }, [onOpenLogsRight]);

    const copyPreviewUrl = useCallback(async () => {
      if (!visiblePreviewUrl) {
        return;
      }

      await navigator.clipboard?.writeText(visiblePreviewUrl);
      toast.success(t('idePanels.preview.urlCopied'));
    }, [t, visiblePreviewUrl]);

    const handleInspectorElementSelect = useCallback(
      (element: ElementInfo) => {
        setSelectedElement?.(element);
        setSelectedPreviewElement(element);
        setDevToolsOpen(true);
        setActiveDevToolsTab('elements');

        void navigator.clipboard?.writeText(element.displayText ?? '').catch(() => {
          // Selection must keep working even when the browser blocks clipboard access.
        });
      },
      [setSelectedElement],
    );

    const resolveSourceFileForElement = useCallback(
      (element: ElementInfo | null) => {
        if (!element) {
          return undefined;
        }

        const sourceFiles = Object.keys(files).filter(
          (filePath) =>
            !filePath.includes('/node_modules/') && /\.(tsx|ts|jsx|js|html|css|scss)$/i.test(filePath.split('?')[0]),
        );

        const terms = [
          element.id,
          element.className,
          ...element.className.split(/\s+/),
          element.textContent?.trim().slice(0, 80),
          element.tagName?.toLowerCase(),
        ].filter((term): term is string => Boolean(term && term.trim().length > 1));

        let bestMatch: { filePath: string; score: number } | undefined;

        for (const filePath of sourceFiles) {
          const file = files[filePath];
          const contents = file?.type === 'file' ? (file.content ?? '') : '';

          let score = 0;

          if (/src\/App\.(tsx|ts|jsx|js)$/i.test(filePath) || /index\.html$/i.test(filePath)) {
            score += 2;
          }

          for (const term of terms) {
            if (contents.includes(term)) {
              score += term.length > 12 ? 4 : 2;
            }
          }

          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { filePath, score };
          }
        }

        /*
         * sourceFiles may be empty — return undefined explicitly so the caller's
         * `!filePath` guard handles "no source" instead of leaking `undefined`.
         */
        return bestMatch && bestMatch.score > 0 ? bestMatch.filePath : (sourceFiles[0] ?? undefined);
      },
      [files],
    );

    const openSelectedElementSource = useCallback(() => {
      const element = selectedPreviewElement;

      /*
       * F3 — prefer the exact JSX source location (file:line) recovered from the
       * element's React fiber when the injected inspector script provided it.
       * This opens the precise line instead of the heuristic best-guess file.
       */
      const exactFile = element?.source?.fileName ? resolvePreviewSourcePath(element.source.fileName) : undefined;

      if (exactFile) {
        const line = element?.source?.lineNumber ?? 1;
        openPreviewSource(exactFile, line);
        toast.info(t('idePanels.preview.openedFileLine', { path: exactFile.replace(/^\/?/, ''), line }));

        return;
      }

      // Fallback: content-heuristic file match (no line) when no fiber source.
      const filePath = resolveSourceFileForElement(element);

      if (!filePath) {
        toast.info(t('idePanels.preview.noMatchingSource'));
        return;
      }

      onOpenSourceFile?.(filePath);
      toast.info(t('idePanels.preview.openedFile', { path: filePath.replace(/^\/?/, '') }));
    }, [onOpenSourceFile, resolveSourceFileForElement, selectedPreviewElement, t]);

    useEffect(() => {
      setPreviewRunFailed(false);
      setPreviewStatus(undefined);
    }, [projectId]);

    useEffect(() => {
      return () => {
        const iframe = iframeRef.current;

        if (iframe) {
          iframe.removeAttribute('src');
          iframe.src = 'about:blank';
        }
      };
    }, []);

    useEffect(() => {
      if (!projectId || previews.length === 0) {
        return undefined;
      }

      let cancelled = false;

      getProjectIdeMemory(projectId)
        .then((memory) => {
          if (cancelled) {
            return;
          }

          const previewIndex = memory.ui?.previewIndex;

          if (typeof previewIndex === 'number' && previews[previewIndex]) {
            setActivePreviewIndex(previewIndex);
            hasSelectedPreview.current = true;
          }

          if (memory.ui?.previewPath) {
            setDisplayPath(memory.ui.previewPath);
          }
        })
        .catch((error) => console.error('Failed to restore preview memory', error));

      return () => {
        cancelled = true;
      };
    }, [projectId, previews]);

    useEffect(() => {
      if (!projectId) {
        return undefined;
      }

      const saveTimer = window.setTimeout(() => {
        saveProjectIdeMemory(projectId, {
          ui: {
            previewIndex: Math.max(normalizedActivePreviewIndex, 0),
            previewPath: displayPath,
          },
        }).catch((error) => console.error('Failed to persist preview memory', error));
      }, 400);

      return () => window.clearTimeout(saveTimer);
    }, [projectId, normalizedActivePreviewIndex, displayPath]);

    useEffect(() => {
      if (!activePreview) {
        setIframeUrl(undefined);
        setDisplayPath('/');
        setAddressInput('/');

        return;
      }

      const { baseUrl } = activePreview;
      setPreviewRunFailed(false);
      setPreviewFrameLoaded(false);
      setLoadedPreviewUrl(undefined);
      setIframeUrl(baseUrl);
      setDisplayPath('/');
      setAddressInput(baseUrl);
      setPreviewNetworkEvents((events) =>
        [
          {
            method: 'GET',
            url: baseUrl,
            status: activePreview.ready === false ? 'detecting' : 'ready',
            source: `port:${activePreview.port}`,
          },
          ...events,
        ].slice(0, 80),
      );
    }, [activePreview]);

    useEffect(() => {
      if (!activePreview) {
        setAddressInput(displayPath || '/');

        return;
      }

      setAddressInput(`${activePreview.baseUrl}${displayPath.startsWith('/') ? displayPath : `/${displayPath}`}`);
    }, [activePreview, displayPath]);

    const findMinPortIndex = useCallback(
      (minIndex: number, preview: { port: number }, index: number, array: { port: number }[]) => {
        return preview.port < array[minIndex].port ? index : minIndex;
      },
      [],
    );

    useEffect(() => {
      if (previews.length > 1 && !hasSelectedPreview.current) {
        const minPortIndex = previews.reduce(findMinPortIndex, 0);
        setActivePreviewIndex(minPortIndex);
      }
    }, [previews, findMinPortIndex]);

    useEffect(() => {
      if (previews.length > 0 && !previews[activePreviewIndex]) {
        setActivePreviewIndex(0);
        hasSelectedPreview.current = false;
      }
    }, [activePreviewIndex, previews]);

    const refreshPorts = useCallback(async () => {
      setIsRefreshingPorts(true);
      setPreviewStatus(undefined);

      try {
        await workbenchStore.refreshRuntimePorts();
      } catch {
        setPreviewStatus(t('idePanels.preview.refreshPortsFailed'));
      } finally {
        setIsRefreshingPorts(false);
      }
    }, [t]);

    const reloadPreview = useCallback(
      (reason = 'manual') => {
        const iframe = iframeRef.current;

        if (!iframe) {
          void refreshPorts();
          return;
        }

        const currentSrc = iframe.src;
        const target = iframeUrl ?? (currentSrc && currentSrc !== 'about:blank' ? currentSrc : undefined);

        if (!target) {
          void refreshPorts();
          return;
        }

        try {
          iframe.contentWindow?.location.reload();
        } catch {
          /*
           * Cross-origin previews block contentWindow.location.reload(). A bare
           * `iframe.src = currentSrc` does NOT force a fresh navigation when the
           * frame is parked on a chrome-error page (e.g. it loaded a transient
           * 502 while the dev server was still starting) — the browser keeps the
           * error. Bounce through about:blank so the next assignment is always a
           * new navigation that picks up the now-healthy server.
           */
          iframe.src = 'about:blank';
          window.setTimeout(() => {
            if (iframeRef.current) {
              iframeRef.current.src = target;
            }
          }, 50);
        }

        setPreviewNetworkEvents((events) =>
          [
            {
              method: 'GET',
              url: target,
              status: 'reloaded',
              source: reason,
            },
            ...events,
          ].slice(0, 80),
        );
      },
      [refreshPorts, iframeUrl],
    );

    useEffect(() => {
      const unsubscribe = workspaceEvents.on('file:applied', ({ filePath }) => {
        if (previewReloadTimer.current) {
          window.clearTimeout(previewReloadTimer.current);
        }

        setPreviewStatus(t('idePanels.preview.refreshAfterFile', { path: filePath.replace(/^\/+/, '') }));
        previewReloadTimer.current = window.setTimeout(() => {
          reloadPreview('file:applied');
          previewReloadTimer.current = undefined;
        }, 150);
      });

      return () => {
        unsubscribe();

        if (previewReloadTimer.current) {
          window.clearTimeout(previewReloadTimer.current);
          previewReloadTimer.current = undefined;
        }
      };
    }, [reloadPreview, t]);

    /*
     * Auto-reload when the dev server's port transitions not-ready → ready. The
     * iframe is pointed at the preview URL as soon as a port is detected, so it
     * frequently loads the upstream "dev server is starting / 502" page (or a
     * transient error frame) before the server is actually serving. Without this
     * the frame stays frozen on that error even after the server is healthy and
     * the user must manually refresh. Watch activePreview.ready (mutated in place
     * by the port watcher; activePreview?.ready in deps catches the flip) and
     * reload once on the false → true edge.
     */
    const wasPreviewReadyRef = useRef<PreviewReadyEdgeState>({ key: undefined, ready: undefined });
    useEffect(() => {
      /*
       * Track readiness per active preview identity (baseUrl). A single shared boolean
       * leaks the false → true edge across unrelated ports: switching to a different,
       * already-ready port whose previously-seen state was false would otherwise trigger
       * a spurious full reload of the freshly-selected iframe.
       */
      const { next, shouldReload } = evaluatePreviewReadyEdge(
        wasPreviewReadyRef.current,
        activePreview?.baseUrl,
        activePreview?.ready,
      );
      wasPreviewReadyRef.current = next;

      /*
       * Suppress the reload once the iframe already shows the app for the current
       * URL: a readiness re-probe blip (probePortReady flapping false→true while the
       * dev server is up) must NOT reload a healthy frame — that is the flicker.
       */
      const frameRendered = previewFrameLoaded && loadedPreviewUrl === iframeUrl;

      if (shouldReloadPreviewOnReadyEdge({ readyEdgeReload: shouldReload, frameRendered })) {
        reloadPreview('runtime:ready');
      }
    }, [activePreview, activePreview?.ready, reloadPreview, previewFrameLoaded, loadedPreviewUrl, iframeUrl]);

    /*
     * P11 — automatic project thumbnail. When a preview becomes ready, tell the
     * API (once per preview identity) to capture it server-side via the
     * screenshotter. Fire-and-forget and best-effort: the backend is debounced
     * and inert unless the screenshotter is configured, so a failure or a
     * not-yet-deployed screenshotter is a silent no-op. No user gesture, no
     * bytes through the browser.
     */
    const thumbnailPingedRef = useRef<Set<string>>(new Set());
    useEffect(() => {
      const baseUrl = activePreview?.baseUrl;

      if (!projectId || !baseUrl || activePreview?.ready !== true || thumbnailPingedRef.current.has(baseUrl)) {
        return;
      }

      thumbnailPingedRef.current.add(baseUrl);
      void fetch(`/api/projects/${projectId}/thumbnail/refresh`, {
        method: 'POST',
        body: new URLSearchParams({ url: baseUrl }),
      }).catch(() => undefined);
    }, [projectId, activePreview?.baseUrl, activePreview?.ready]);

    const startPreviewServer = useCallback(async () => {
      setIsStartingPreview(true);
      setPreviewStatus(undefined);
      setPreviewRunFailed(false);

      try {
        const label = await workbenchStore.startPreviewServer();
        setPreviewStatus(t('idePanels.preview.startingCommand', { label }));
        toast.info(t('idePanels.preview.buildStarted', { label }), { toastId: 'preview-build-started' });
        window.setTimeout(() => setIsStartingPreview(false), 2500);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to start preview server';
        setPreviewStatus(t('idePanels.preview.startFailed'));

        /*
         * This wrapper is EXCLUSIVELY the auto boot-loop kick (the manual Run
         * button uses restartPreviewServer with its own latch). A cold-pod
         * transient failure here must NOT latch previewRunFailed — that would
         * kill the retry interval + 5-min budget and strand the user behind a
         * manual Run. Only a deterministic failure latches promptly.
         */
        if (shouldLatchPreviewStartFailure({ manual: false, message })) {
          setPreviewRunFailed(true);
          setIsStartingPreview(false);
        } else {
          /*
           * Transient failure: keep retrying. Hold the "starting" state for a
           * short cooldown (mirrors the success path) so this one-shot kick
           * effect doesn't instantly re-fire and busy-spin the cold agent; the
           * 2.5s retry interval below then drives the actual reattempts.
           */
          window.setTimeout(() => setIsStartingPreview(false), 2500);
        }
      }
    }, [t]);

    useEffect(() => {
      if (lastPreviewableFilesSignature.current === previewableFilesSignature) {
        return;
      }

      lastPreviewableFilesSignature.current = previewableFilesSignature;

      if (!previewableFilesSignature || previews.length > 0) {
        return;
      }

      if (hasStaticPreview) {
        setPreviewRunFailed(false);
        setPreviewStatus(t('idePanels.preview.staticReady'));
        setIsStartingPreview(false);

        return;
      }

      setPreviewRunFailed(false);
      setPreviewStatus(t('idePanels.preview.filesChanged'));
      setIsStartingPreview(false);
    }, [hasStaticPreview, previewableFilesSignature, previews.length, t]);

    useEffect(() => {
      if (
        isStartingPreview ||
        !shouldRunPreviewBootLoop({
          autoStart,
          workspaceReady,
          hasStaticPreview,
          previewsLength: previews.length,
          previewRunFailed,
          hasWorkspaceError: Boolean(workspaceError),
          bootAttempts: bootAttemptsRef.current,
        })
      ) {
        return;
      }

      void startPreviewServer();
    }, [
      autoStart,
      isStartingPreview,
      hasStaticPreview,
      previewableFilesSignature,
      previews.length,
      previewRunFailed,
      startPreviewServer,
      workspaceError,
      workspaceReady,
    ]);

    /*
     * Reopen auto-run (Replit parity). Landing on a desktop project whose workspace
     * pod was stopped or crashed (workspaceNeedsReprovision) must restart the pod AND
     * relaunch the preview automatically — not strand the user behind a manual Run.
     * The boot loop above deliberately bails on workspaceError (so a genuinely dead
     * agent surfaces the recovery UI instead of being hammered), which also means it
     * never fires for a reopened stopped/crashed workspace; startPreviewServer()
     * reprovisions via #ensureWorkspaceProvisioned, so kicking it here revives the
     * pod. Guarded to fire at most once per stopped/crashed session id: if the fresh
     * pod keeps failing it falls back to the manual recovery UI instead of looping.
     * Restart of an already-running preview stays manual by design.
     */
    const reopenKickedSessionRef = useRef<string | null>(null);
    useEffect(() => {
      if (!shouldKickReopenPreview({ autoStart, hasProject: Boolean(projectId), isStartingPreview, workspaceStatus })) {
        return;
      }

      const sessionKey = workspaceStatus?.id ?? 'unknown';

      if (reopenKickedSessionRef.current === sessionKey) {
        return;
      }

      reopenKickedSessionRef.current = sessionKey;
      setPreviewRunFailed(false);
      setIsStartingPreview(true);
      setPreviewStatus(t('idePanels.preview.reopening'));
      void workbenchStore
        .startPreviewServer()
        .catch(() => undefined)
        .finally(() => window.setTimeout(() => setIsStartingPreview(false), 2500));
    }, [autoStart, projectId, isStartingPreview, workspaceStatus, t]);

    /*
     * A detected port means the loop succeeded — reset the relaunch budget so a
     * later death gets its own full budget.
     */
    useEffect(() => {
      if (previews.length > 0) {
        bootAttemptsRef.current = 0;
      }
    }, [previews.length]);

    useEffect(() => {
      if (
        !shouldRunPreviewBootLoop({
          autoStart,
          workspaceReady,
          hasStaticPreview,
          previewsLength: previews.length,
          previewRunFailed,
          hasWorkspaceError: Boolean(workspaceError),
          bootAttempts: bootAttemptsRef.current,
        })
      ) {
        return undefined;
      }

      let tick = 0;

      const interval = window.setInterval(() => {
        tick += 1;
        void workbenchStore.refreshRuntimePorts().catch(() => undefined);

        if (workbenchStore.isPreviewServerStarting()) {
          setIsStartingPreview(true);
          setPreviewStatus(t('idePanels.preview.startingServer'));

          return;
        }

        /*
         * Bounded auto-retry: once the relaunch budget is spent, stop looping and
         * hand off to the manual recovery UI instead of hammering. previewRunFailed
         * does NOT stop the loop before this (a dev-server-absent 502 keeps
         * relaunching), so this cap is what terminates it.
         */
        if (bootAttemptsRef.current >= MAX_PREVIEW_BOOT_ATTEMPTS) {
          setPreviewStatus(t('idePanels.preview.startExhausted'));
          setPreviewRunFailed(true);
          setIsStartingPreview(false);
          window.clearInterval(interval);

          return;
        }

        if (tick % 6 === 0) {
          /*
           * Force a real dependency (re)install, not just a dev-server restart.
           * On a fresh generation the dev server can come up (port detected) but
           * serve nothing because node_modules never finished installing — a plain
           * restart re-runs the same dev command and stays broken. reinstall
           * (forceInstall) actually runs `npm install` first. Gated by the
           * isPreviewServerStarting() check above so it never overlaps an
           * in-flight install.
           */
          bootAttemptsRef.current += 1;
          setIsStartingPreview(true);
          setPreviewStatus(t('idePanels.preview.reinstallingServer'));
          void workbenchStore.reinstallDependencies().catch(() => undefined);
        } else if (tick % 2 === 0) {
          bootAttemptsRef.current += 1;
          setIsStartingPreview(true);
          setPreviewStatus(t('idePanels.preview.startingServer'));
          void workbenchStore.startPreviewServer().catch(() => undefined);
        }
      }, 2500);

      return () => window.clearInterval(interval);
    }, [autoStart, hasStaticPreview, previews.length, previewRunFailed, workspaceError, workspaceReady, t]);

    useEffect(() => {
      if (
        !shouldRunPreviewBootLoop({
          autoStart,
          workspaceReady,
          hasStaticPreview,
          previewsLength: previews.length,
          previewRunFailed,
          hasWorkspaceError: Boolean(workspaceError),
          bootAttempts: bootAttemptsRef.current,
        })
      ) {
        return undefined;
      }

      const timeout = window.setTimeout(() => {
        setPreviewStatus(t('idePanels.preview.noPort'));
        setPreviewRunFailed(true);
        setIsStartingPreview(false);
        setIsRefreshingPorts(false);
      }, 300000); // 5min: a fresh complex app's npm install + dev start can exceed 2min under gVisor/CPU contention

      return () => window.clearTimeout(timeout);
    }, [autoStart, hasStaticPreview, previews.length, previewRunFailed, workspaceError, workspaceReady, t]);

    const navigatePreviewHistory = (direction: 'back' | 'forward') => {
      try {
        iframeRef.current?.contentWindow?.history[direction]();
      } catch {
        // Cross-origin previews can block direct history access. In that case the click is safely ignored.
      }
    };

    /*
     * A cross-origin preview (external URL) blocks contentWindow.history access,
     * so Back/Forward would silently no-op. Detect that and disable the controls
     * with an explanatory tooltip instead of pretending they work.
     */
    const previewHistoryUnavailable = useMemo(() => {
      if (typeof window === 'undefined' || !iframeUrl) {
        return false;
      }

      try {
        return new URL(iframeUrl, window.location.href).origin !== window.location.origin;
      } catch {
        return false;
      }
    }, [iframeUrl]);

    const resolveAddressInput = () => {
      if (!activePreview) {
        return;
      }

      const isHttpUrl = /^https?:\/\//i.test(addressInput.trim() || '/');
      const resolution = resolvePreviewAddress(addressInput, activePreview.baseUrl);

      if (!resolution.iframeUrl) {
        /*
         * Malformed absolute URL: re-sync the address bar to the current path so the
         * input never strands the user on un-parseable text.
         */
        setAddressInput(`${activePreview.baseUrl}${displayPath.startsWith('/') ? displayPath : `/${displayPath}`}`);
        inputRef.current?.blur();

        return;
      }

      setIframeUrl(resolution.iframeUrl);
      setAddressInput(resolution.addressInput);

      /*
       * Only persist same-origin paths. resolvePreviewAddress returns
       * displayPath === undefined for cross-origin navigations so the full external
       * URL never leaks into the persisted previewPath and corrupts the restored
       * address after a reload.
       */
      if (resolution.displayPath !== undefined) {
        setDisplayPath(resolution.displayPath);
      }

      if (!isHttpUrl) {
        setPreviewNetworkEvents((events) =>
          [
            {
              method: 'GET',
              url: resolution.iframeUrl,
              status: 'navigated',
              source: 'address-bar',
            },
            ...events,
          ].slice(0, 80),
        );
      }

      inputRef.current?.blur();
    };

    useEffect(() => {
      if (!activePreview || !iframeUrl) {
        setPreviewFrameLoaded(false);
        setLoadedPreviewUrl(undefined);

        return;
      }

      setPreviewFrameLoaded(false);
      setLoadedPreviewUrl(undefined);
    }, [activePreview?.baseUrl, activePreview?.port, iframeUrl]);

    const toggleFullscreen = async () => {
      if (!isFullscreen && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    };

    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);

      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }, []);

    const toggleDeviceMode = () => {
      setIsDeviceModeOn((prev) => !prev);
    };

    const startResizing = (e: React.PointerEvent, side: ResizeSide) => {
      if (!isDeviceModeOn) {
        return;
      }

      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(e.pointerId);

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';

      resizingState.current = {
        isResizing: true,
        side,
        startX: e.clientX,
        startWidthPercent: widthPercent,
        windowWidth: window.innerWidth,
        pointerId: e.pointerId,
      };
      setIsResizing(true);
    };

    const ResizeHandle = ({ side }: { side: ResizeSide }) => {
      if (!side) {
        return null;
      }

      return (
        <div
          className={`resize-handle-${side}`}
          onPointerDown={(e) => startResizing(e, side)}
          style={{
            position: 'absolute',
            top: 0,
            ...(side === 'left' ? { left: 0, marginLeft: '-7px' } : { right: 0, marginRight: '-7px' }),
            width: '15px',
            height: '100%',
            cursor: 'ew-resize',
            background: 'var(--bolt-elements-background-depth-4, var(--vc-ide-bg-hover))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s',
            userSelect: 'none',
            touchAction: 'none',
            zIndex: 10,
          }}
          onMouseOver={(e) =>
            (e.currentTarget.style.background = 'var(--bolt-elements-background-depth-4, var(--vc-ide-bg-hover))')
          }
          onMouseOut={(e) =>
            (e.currentTarget.style.background = 'var(--bolt-elements-background-depth-3, var(--vc-ide-bg-card))')
          }
          title={t('idePanels.preview.resizeWidth')}
        >
          <GripIcon />
        </div>
      );
    };

    useEffect(() => {
      // Skip if not in device mode
      if (!isDeviceModeOn) {
        return;
      }

      const handlePointerMove = (e: PointerEvent) => {
        const state = resizingState.current;

        if (!state.isResizing || e.pointerId !== state.pointerId) {
          return;
        }

        const dx = e.clientX - state.startX;
        const dxPercent = (dx / state.windowWidth) * 100 * SCALING_FACTOR;

        let newWidthPercent = state.startWidthPercent;

        if (state.side === 'right') {
          newWidthPercent = state.startWidthPercent + dxPercent;
        } else if (state.side === 'left') {
          newWidthPercent = state.startWidthPercent - dxPercent;
        }

        // Limit width percentage between 10% and 90%
        newWidthPercent = Math.max(10, Math.min(newWidthPercent, 90));

        // Force a synchronous update to ensure the UI reflects the change immediately
        setWidthPercent(newWidthPercent);

        // Calculate and update the actual pixel width
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const newWidth = Math.round((containerWidth * newWidthPercent) / 100);
          setCurrentWidth(newWidth);

          // Apply the width directly to the container for immediate feedback
          const previewContainer = containerRef.current.querySelector('div[style*="width"]');

          if (previewContainer) {
            (previewContainer as HTMLElement).style.width = `${newWidthPercent}%`;
          }
        }
      };

      const handlePointerUp = (e: PointerEvent) => {
        const state = resizingState.current;

        if (!state.isResizing || e.pointerId !== state.pointerId) {
          return;
        }

        // Find all resize handles
        const handles = document.querySelectorAll('.resize-handle-left, .resize-handle-right');

        // Release pointer capture from any handle that has it
        handles.forEach((handle) => {
          if ((handle as HTMLElement).hasPointerCapture?.(e.pointerId)) {
            (handle as HTMLElement).releasePointerCapture(e.pointerId);
          }
        });

        // Reset state
        resizingState.current = {
          ...resizingState.current,
          isResizing: false,
          side: null,
          pointerId: null,
        };
        setIsResizing(false);

        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };

      // Add event listeners
      document.addEventListener('pointermove', handlePointerMove, { passive: false });
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('pointercancel', handlePointerUp);

      // Define cleanup function
      function cleanupResizeListeners() {
        document.removeEventListener('pointermove', handlePointerMove);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('pointercancel', handlePointerUp);

        // Release any lingering pointer captures
        if (resizingState.current.pointerId !== null) {
          const handles = document.querySelectorAll('.resize-handle-left, .resize-handle-right');
          handles.forEach((handle) => {
            if ((handle as HTMLElement).hasPointerCapture?.(resizingState.current.pointerId!)) {
              (handle as HTMLElement).releasePointerCapture(resizingState.current.pointerId!);
            }
          });

          // Reset state
          resizingState.current = {
            ...resizingState.current,
            isResizing: false,
            side: null,
            pointerId: null,
          };
          setIsResizing(false);

          document.body.style.userSelect = '';
          document.body.style.cursor = '';
        }
      }

      // Return the cleanup function
      // eslint-disable-next-line consistent-return
      return cleanupResizeListeners;
    }, [isDeviceModeOn, SCALING_FACTOR]);

    useEffect(() => {
      const handleWindowResize = () => {
        // Update the window width in the resizing state
        resizingState.current.windowWidth = window.innerWidth;

        // Update the current width in pixels
        if (containerRef.current && isDeviceModeOn) {
          const containerWidth = containerRef.current.clientWidth;
          setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
        }
      };

      window.addEventListener('resize', handleWindowResize);

      // Initial calculation of current width
      if (containerRef.current && isDeviceModeOn) {
        const containerWidth = containerRef.current.clientWidth;
        setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
      }

      return () => {
        window.removeEventListener('resize', handleWindowResize);
      };
    }, [isDeviceModeOn, widthPercent]);

    // Update current width when device mode is toggled
    useEffect(() => {
      if (containerRef.current && isDeviceModeOn) {
        const containerWidth = containerRef.current.clientWidth;
        setCurrentWidth(Math.round((containerWidth * widthPercent) / 100));
      }
    }, [isDeviceModeOn]);

    const GripIcon = () => (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            color: 'var(--bolt-elements-textSecondary, var(--vc-ide-text-secondary))',
            fontSize: '10px',
            lineHeight: '5px',
            userSelect: 'none',
            marginLeft: '1px',
          }}
        >
          ••• •••
        </div>
      </div>
    );

    const previewWindowTarget = (baseUrl: string) => {
      const match = baseUrl.match(/^https?:\/\/([^.]+)\.local-credentialless\.webcontainer-api\.io/);

      if (!match) {
        return { id: encodeURIComponent(baseUrl), url: baseUrl };
      }

      return { id: match[1], url: `/webcontainer/preview/${match[1]}` };
    };

    const openInNewWindow = (size: WindowSize) => {
      if (activePreview?.baseUrl) {
        const previewTarget = previewWindowTarget(activePreview.baseUrl);
        const previewUrl = previewTarget.url;

        // Adjust dimensions for landscape mode if applicable
        let width = size.width;
        let height = size.height;

        if (isLandscape && (size.frameType === 'mobile' || size.frameType === 'tablet')) {
          // Swap width and height for landscape mode
          width = size.height;
          height = size.width;
        }

        // Create a window with device frame if enabled
        if (showDeviceFrame && size.hasFrame) {
          // Calculate frame dimensions
          const frameWidth = size.frameType === 'mobile' ? (isLandscape ? 120 : 40) : 60; // Width padding on each side
          const frameHeight = size.frameType === 'mobile' ? (isLandscape ? 80 : 80) : isLandscape ? 60 : 100; // Height padding on top and bottom

          // Create a window with the correct dimensions first
          const newWindow = window.open(
            '',
            '_blank',
            `width=${width + frameWidth},height=${height + frameHeight + 40},menubar=no,toolbar=no,location=no,status=no`,
          );

          if (!newWindow) {
            console.error('Failed to open new window');
            toast.error(t('idePanels.preview.popupBlocked'));

            return;
          }

          // Create the HTML content for the frame
          const frameColor = getThemeColor('--vc-ide-bg-hover', '#111827');
          const frameDetailColor = getThemeColor('--vc-ide-bg-app', '#111827');
          const previewBackground = getThemeColor('--vc-ide-bg-panel', '#f6f8fb');
          const previewTextColor = getThemeColor('--vc-ide-text-primary', '#111827');
          const previewShadow = getThemeColor('--vc-ui-shadow-xl', '0 10px 30px rgb(15 23 42 / 0.16)');
          const frameRadius = size.frameType === 'mobile' ? '36px' : '20px';

          const framePadding =
            size.frameType === 'mobile'
              ? isLandscape
                ? '40px 60px'
                : '40px 20px'
              : isLandscape
                ? '30px 50px'
                : '50px 30px';

          // Position notch and home button based on orientation
          const notchTop = isLandscape ? '50%' : '20px';
          const notchLeft = isLandscape ? '30px' : '50%';
          const notchTransform = isLandscape ? 'translateY(-50%)' : 'translateX(-50%)';
          const notchWidth = isLandscape ? '8px' : size.frameType === 'mobile' ? '60px' : '80px';
          const notchHeight = isLandscape ? (size.frameType === 'mobile' ? '60px' : '80px') : '8px';

          const homeBottom = isLandscape ? '50%' : '15px';
          const homeRight = isLandscape ? '30px' : '50%';
          const homeTransform = isLandscape ? 'translateY(50%)' : 'translateX(50%)';
          const homeWidth = isLandscape ? '4px' : '40px';
          const homeHeight = isLandscape ? '40px' : '4px';

          // Create HTML content for the wrapper page
          const htmlContent = `
            <!DOCTYPE html>
            <html lang="${activeLanguage.startsWith('fr') ? 'fr' : 'en'}">
            <head>
              <meta charset="utf-8">
              <title>${escapeHtml(t('idePanels.preview.popupTitle', { device: size.name }))}</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  height: 100vh;
                  background: ${previewBackground};
                  overflow: hidden;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                }
                
                .device-container {
                  position: relative;
                }
                
                .device-name {
                  position: absolute;
                  top: -30px;
                  left: 0;
                  right: 0;
                  text-align: center;
                  font-size: 14px;
                  color: ${previewTextColor};
                }
                
                .device-frame {
                  position: relative;
                  border-radius: ${frameRadius};
                  background: ${frameColor};
                  padding: ${framePadding};
                  box-shadow: ${previewShadow};
                  overflow: hidden;
                }
                
                /* Notch */
                .device-frame:before {
                  content: '';
                  position: absolute;
                  top: ${notchTop};
                  left: ${notchLeft};
                  transform: ${notchTransform};
                  width: ${notchWidth};
                  height: ${notchHeight};
                  background: ${frameDetailColor};
                  border-radius: 4px;
                  z-index: 2;
                }
                
                /* Home button */
                .device-frame:after {
                  content: '';
                  position: absolute;
                  bottom: ${homeBottom};
                  right: ${homeRight};
                  transform: ${homeTransform};
                  width: ${homeWidth};
                  height: ${homeHeight};
                  background: ${frameDetailColor};
                  border-radius: 50%;
                  z-index: 2;
                }
                
                iframe {
                  border: none;
                  width: ${width}px;
                  height: ${height}px;
                  background: white;
                  display: block;
                }
              </style>
            </head>
            <body>
              <div class="device-container">
                <div class="device-name">${size.name} ${isLandscape ? '(Landscape)' : '(Portrait)'}</div>
                <div class="device-frame">
                  <iframe src="${previewUrl}" sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin" allow="cross-origin-isolated"></iframe>
                </div>
              </div>
            </body>
            </html>
          `;

          // Write the HTML content to the new window
          newWindow.document.open();
          newWindow.document.write(htmlContent);
          newWindow.document.close();
        } else {
          // Standard window without frame
          const newWindow = window.open(
            previewUrl,
            '_blank',
            `width=${width},height=${height},menubar=no,toolbar=no,location=no,status=no`,
          );

          if (newWindow) {
            newWindow.focus();
          }
        }
      }
    };

    const openInNewTab = () => {
      if (activePreview?.baseUrl) {
        /*
         * noopener,noreferrer: the preview runs untrusted user/AI-generated code —
         * deny it window.opener access to this origin and strip the Referer.
         */
        window.open(activePreview?.baseUrl, '_blank', 'noopener,noreferrer');
      }
    };

    // Function to get the correct frame padding based on orientation
    const getFramePadding = useCallback(() => {
      if (!selectedWindowSize) {
        return '40px 20px';
      }

      const isMobile = selectedWindowSize.frameType === 'mobile';

      if (isLandscape) {
        // Increase horizontal padding in landscape mode to ensure full device frame is visible
        return isMobile ? '40px 60px' : '30px 50px';
      }

      return isMobile ? '40px 20px' : '50px 30px';
    }, [isLandscape, selectedWindowSize]);

    // Function to get the scale factor for the device frame
    const getDeviceScale = useCallback(() => {
      // Always return 1 to ensure the device frame is shown at its exact size
      return 1;
    }, [isLandscape, selectedWindowSize, widthPercent]);

    // Update the device scale when needed
    useEffect(() => {
      /*
       * Intentionally disabled - we want to maintain scale of 1
       * No dynamic scaling to ensure device frame matches external window exactly
       */
      // Intentionally empty cleanup function - no cleanup needed
      return () => {
        // No cleanup needed
      };
    }, [isDeviceModeOn, showDeviceFrameInPreview, getDeviceScale, isLandscape, selectedWindowSize]);

    const getThemeColor = useCallback((token: string, fallback: string) => {
      const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim();

      return value || fallback;
    }, []);

    // Effect to handle color scheme changes
    useEffect(() => {
      const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

      const handleColorSchemeChange = () => {
        // Force a re-render when color scheme changes
        if (showDeviceFrameInPreview) {
          setShowDeviceFrameInPreview(true);
        }
      };

      darkModeMediaQuery.addEventListener('change', handleColorSchemeChange);

      return () => {
        darkModeMediaQuery.removeEventListener('change', handleColorSchemeChange);
      };
    }, [showDeviceFrameInPreview]);

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        /*
         * Ignore messages from anything other than our preview iframe, and any
         * payload that isn't a structured message (extensions/libraries spam
         * postMessage with strings/null that would throw on `.type`).
         */
        if (event.source !== iframeRef.current?.contentWindow) {
          return;
        }

        if (!event.data || typeof event.data !== 'object') {
          return;
        }

        /*
         * Inspector selection/hover events (INSPECTOR_CLICK / HOVER / LEAVE) are
         * owned exclusively by the Inspector component, which offsets the rect
         * into page coordinates. Skip them here to avoid double-handling and
         * storing un-offset coordinates.
         */
        if (!shouldPreviewHandleInspectorMessage(event.data.type)) {
          return;
        }

        if (event.data.type === 'INSPECTOR_READY') {
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              {
                type: 'INSPECTOR_ACTIVATE',
                active: isInspectorMode,
              },
              '*',
            );
          }
        } else if (event.data.type === 'PREVIEW_ERROR') {
          const rawFilename = typeof event.data.filename === 'string' ? event.data.filename : '';
          const lineno = typeof event.data.lineno === 'number' ? event.data.lineno : undefined;
          const filename = rawFilename ? ` (${rawFilename}:${lineno ?? '?'})` : '';

          const message = t('idePanels.preview.runtimeError', {
            message: event.data.message ?? t('idePanels.preview.unknownError'),
            location: filename,
          });

          const resolvedPath = rawFilename ? resolvePreviewSourcePath(rawFilename) : undefined;
          const source = resolvedPath && lineno ? { path: resolvedPath, line: lineno } : undefined;
          setPreviewConsoleEvents((events) =>
            [
              {
                level: 'error',
                message,
                source,
              },
              ...events,
            ].slice(0, 120),
          );
          workbenchStore.appendWorkspaceLog(message);

          if (event.data.stack) {
            setPreviewConsoleEvents((events) =>
              [
                {
                  level: 'trace',
                  message: String(event.data.stack),
                },
                ...events,
              ].slice(0, 120),
            );
            workbenchStore.appendWorkspaceLog(String(event.data.stack));
          }
        } else if (event.data.type === 'PREVIEW_UNHANDLED_REJECTION') {
          const message = t('idePanels.preview.unhandledRejection', {
            message: event.data.message ?? t('idePanels.preview.unknownError'),
          });
          setPreviewConsoleEvents((events) =>
            [
              {
                level: 'error',
                message,
              },
              ...events,
            ].slice(0, 120),
          );
          workbenchStore.appendWorkspaceLog(message);

          if (event.data.stack) {
            setPreviewConsoleEvents((events) =>
              [
                {
                  level: 'trace',
                  message: String(event.data.stack),
                },
                ...events,
              ].slice(0, 120),
            );
            workbenchStore.appendWorkspaceLog(String(event.data.stack));
          }
        } else if (event.data.type === 'PREVIEW_BLANK') {
          /*
           * The injected reporter detected a served page whose SPA root never
           * mounted (blank white screen). Surface it clearly instead of leaving a
           * silent blank, and auto-reload the frame ONCE — by then the agent's
           * serve-time entry repair has re-injected the missing entry script.
           */
          const message = t('idePanels.preview.blankPage');
          setPreviewConsoleEvents((events) => [{ level: 'warn', message }, ...events].slice(0, 120));
          workbenchStore.appendWorkspaceLog(message);

          if (!blankRecoveredRef.current) {
            blankRecoveredRef.current = true;
            reloadPreview('blank-preview:auto-recover');
          }
        }
      };

      window.addEventListener('message', handleMessage);

      return () => window.removeEventListener('message', handleMessage);
    }, [isInspectorMode, reloadPreview, t]);

    const toggleInspectorMode = () => {
      const newInspectorMode = !isInspectorMode;
      setIsInspectorMode(newInspectorMode);
      setDevToolsOpen(true);
      setActiveDevToolsTab('elements');

      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: 'INSPECTOR_ACTIVATE',
            active: newInspectorMode,
          },
          '*',
        );
      }
    };

    /*
     * P11 — capture the live preview and store it as the project thumbnail that
     * the Dashboard/Projects cards render. Uses the Screen Capture API (the only
     * real in-browser capture of the cross-origin preview) and PUTs the PNG to a
     * signed object-storage URL. Silently no-ops when object storage is disabled.
     */
    const captureThumbnail = useCallback(async () => {
      const iframe = iframeRef.current;

      if (!iframe || !projectId || capturingThumbnail) {
        return;
      }

      setCapturingThumbnail(true);

      try {
        const stored = await captureAndUploadThumbnail(projectId, iframe);

        if (stored) {
          toast.success(t('idePanels.preview.thumbnailSaved'));
        } else {
          toast.info(t('idePanels.preview.thumbnailStorageDisabled'));
        }
      } catch (error) {
        // A user cancelling the screen-share picker throws NotAllowedError — stay quiet.
        if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'AbortError')) {
          return;
        }

        toast.error(t('idePanels.preview.thumbnailFailed'));
      } finally {
        setCapturingThumbnail(false);
      }
    }, [projectId, capturingThumbnail, t]);

    const recordPreviewLoad = useCallback(
      (url?: string) => {
        const targetUrl = url ?? iframeRef.current?.src ?? visiblePreviewUrl;

        if (!targetUrl || targetUrl === 'about:blank') {
          return;
        }

        /*
         * The cross-origin preview iframe fires onLoad even for HTTP 5xx bodies,
         * so a "load" that lands while the runtime still reports the port as
         * not-ready is almost certainly the proxy's transient 502 holding page.
         * Don't dismiss the loading overlay on it — schedule a bounded
         * auto-reload (through about:blank) until a real render arrives.
         */
        const decision = decidePreviewLoadOutcome({
          attempt: previewLoadRetryRef.current,
          ready: activePreview?.ready,
          erroredLoad: false,
        });
        previewLoadRetryRef.current = decision.nextAttempt;

        if (!decision.treatAsRendered) {
          setPreviewNetworkEvents((events) =>
            [
              {
                method: 'GET',
                url: targetUrl,
                status: 'upstream-not-ready',
                source: 'iframe',
              },
              ...events,
            ].slice(0, 80),
          );

          if (decision.scheduleReload) {
            setPreviewStatus(t('idePanels.preview.serverStartingRetry'));

            if (previewReloadTimer.current !== undefined) {
              window.clearTimeout(previewReloadTimer.current);
            }

            previewReloadTimer.current = window.setTimeout(() => {
              previewReloadTimer.current = undefined;
              reloadPreview('upstream-retry');
            }, 1500);
          }

          return;
        }

        previewLoadRetryRef.current = 0;
        setPreviewNetworkEvents((events) =>
          [
            {
              method: 'GET',
              url: targetUrl,
              status: 'loaded',
              source: 'iframe',
            },
            ...events,
          ].slice(0, 80),
        );
        setPreviewFrameLoaded(true);
        setLoadedPreviewUrl(targetUrl);
        setIsStartingPreview(false);
        setPreviewStatus(t('idePanels.preview.rendered'));
      },
      [activePreview?.ready, reloadPreview, visiblePreviewUrl, t],
    );

    const handlePreviewFrameError = useCallback(() => {
      /*
       * The browser only fires `error` for network-level frame failures
       * (DNS/connection reset) — an HTTP 5xx still fires `load`. Treat it as a
       * transient upstream failure worth a bounded auto-reload rather than a
       * finished render, so the overlay stays up and the frame self-heals once
       * the dev server is reachable.
       */
      const decision = decidePreviewLoadOutcome({
        attempt: previewLoadRetryRef.current,
        ready: activePreview?.ready,
        erroredLoad: true,
      });
      previewLoadRetryRef.current = decision.nextAttempt;

      if (decision.scheduleReload) {
        setPreviewStatus(t('idePanels.preview.serverUnreachableRetry'));

        if (previewReloadTimer.current !== undefined) {
          window.clearTimeout(previewReloadTimer.current);
        }

        previewReloadTimer.current = window.setTimeout(() => {
          previewReloadTimer.current = undefined;
          reloadPreview('upstream-error-retry');
        }, 1500);
      } else {
        setPreviewStatus(t('idePanels.preview.serverNotResponding'));
        setPreviewRunFailed(true);
        setIsStartingPreview(false);
      }
    }, [activePreview?.ready, reloadPreview, t]);

    const previewViewportWidth = isDeviceModeOn
      ? showDeviceFrameInPreview
        ? '100%'
        : `${widthPercent}%`
      : previewDevice === 'tablet'
        ? 'min(768px, 100%)'
        : previewDevice === 'mobile'
          ? 'min(390px, 100%)'
          : previewDevice === 'custom'
            ? 'min(520px, 100%)'
            : '100%';

    const inspectToCodeHint = selectedPreviewElement
      ? t('idePanels.preview.inspectSelected')
      : t('idePanels.preview.inspectHint');

    return (
      <div ref={containerRef} className="bolt-project-webview-tool w-full h-full flex flex-col relative">
        {isPortDropdownOpen && (
          <div
            className="z-iframe-overlay w-full h-full absolute"
            aria-hidden="true"
            onClick={() => setIsPortDropdownOpen(false)}
          />
        )}
        <div className="bolt-project-webview-toolbar">
          <div className="flex items-center gap-1">
            <IconButton
              icon="i-ph:arrow-left"
              onClick={() => navigatePreviewHistory('back')}
              disabled={previewHistoryUnavailable}
              title={
                previewHistoryUnavailable ? t('idePanels.preview.historyUnavailable') : t('idePanels.preview.back')
              }
            />
            <IconButton
              icon="i-ph:arrow-right"
              onClick={() => navigatePreviewHistory('forward')}
              disabled={previewHistoryUnavailable}
              title={
                previewHistoryUnavailable ? t('idePanels.preview.historyUnavailable') : t('idePanels.preview.forward')
              }
            />
            <IconButton
              icon="i-ph:arrow-clockwise"
              onClick={() => reloadPreview()}
              title={t('idePanels.preview.refresh')}
            />
            <IconButton
              icon="i-ph:selection"
              onClick={() => setIsSelectionMode(!isSelectionMode)}
              className={isSelectionMode ? 'bg-bolt-elements-background-depth-3' : ''}
              title={isSelectionMode ? t('idePanels.preview.disableSelection') : t('idePanels.preview.selectArea')}
            />
            <IconButton
              icon={capturingThumbnail ? 'i-ph:circle-notch animate-spin' : 'i-ph:camera'}
              onClick={() => void captureThumbnail()}
              disabled={capturingThumbnail || !activePreview || !projectId}
              title={t('idePanels.preview.captureThumbnail')}
            />
          </div>

          <div className="bolt-preview-addressbar flex-grow flex items-center gap-1 bg-bolt-elements-preview-addressBar-background border border-bolt-elements-borderColor text-bolt-elements-preview-addressBar-text rounded-full px-1 py-1 text-sm hover:bg-bolt-elements-preview-addressBar-backgroundHover hover:focus-within:bg-bolt-elements-preview-addressBar-backgroundActive focus-within:bg-bolt-elements-preview-addressBar-backgroundActive focus-within-border-bolt-elements-borderColorActive focus-within:text-bolt-elements-preview-addressBar-textActive">
            <PortDropdown
              activePreviewIndex={Math.max(normalizedActivePreviewIndex, 0)}
              setActivePreviewIndex={setActivePreviewIndex}
              isDropdownOpen={isPortDropdownOpen}
              setHasSelectedPreview={(value) => (hasSelectedPreview.current = value)}
              setIsDropdownOpen={setIsPortDropdownOpen}
              previews={previews}
            />
            <input
              title={t('idePanels.preview.url')}
              aria-label={t('idePanels.preview.url')}
              data-vc-tooltip={t('idePanels.preview.url')}
              ref={inputRef}
              className="w-full bg-transparent outline-none"
              type="text"
              value={addressInput}
              onChange={(event) => {
                setAddressInput(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  resolveAddressInput();
                }
              }}
              disabled={!activePreview}
            />
            <button
              type="button"
              className="bolt-preview-toolbar-button"
              disabled={!visiblePreviewUrl}
              onClick={() => void copyPreviewUrl()}
              title={t('idePanels.preview.copyUrl')}
              aria-label={t('idePanels.preview.copyUrl')}
              data-vc-tooltip={t('idePanels.preview.copyUrl')}
            >
              <span className="i-ph:copy" aria-hidden />
              <span>{t('idePanels.preview.copy')}</span>
            </button>
          </div>

          <div className="flex items-center gap-1">
            <select
              aria-label={t('idePanels.preview.device')}
              value={previewDevice}
              onChange={(event) => onPreviewDeviceChange?.(event.currentTarget.value as PreviewDevice)}
              className="h-8 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 text-xs text-bolt-elements-textPrimary outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              <option value="desktop">{t('idePanels.preview.desktop')}</option>
              <option value="tablet">{t('idePanels.preview.tablet')}</option>
              <option value="mobile">{t('idePanels.preview.mobile')}</option>
              <option value="custom">{t('idePanels.preview.customWidth')}</option>
            </select>
            <IconButton
              icon="i-ph:devices"
              onClick={toggleDeviceMode}
              title={isDeviceModeOn ? t('idePanels.preview.responsiveMode') : t('idePanels.preview.deviceMode')}
            />

            {expoUrl && (
              <IconButton
                icon="i-ph:qr-code"
                onClick={() => setIsExpoQrModalOpen(true)}
                title={t('idePanels.preview.showQr')}
              />
            )}

            <ExpoQrModal open={isExpoQrModalOpen} onClose={() => setIsExpoQrModalOpen(false)} />

            {isDeviceModeOn && (
              <>
                <IconButton
                  icon="i-ph:device-rotate"
                  onClick={() => setIsLandscape(!isLandscape)}
                  title={isLandscape ? t('idePanels.preview.portrait') : t('idePanels.preview.landscape')}
                />
                <IconButton
                  icon={showDeviceFrameInPreview ? 'i-ph:device-mobile' : 'i-ph:device-mobile-slash'}
                  onClick={() => setShowDeviceFrameInPreview(!showDeviceFrameInPreview)}
                  title={showDeviceFrameInPreview ? t('idePanels.preview.hideFrame') : t('idePanels.preview.showFrame')}
                />
              </>
            )}
            <IconButton
              icon="i-ph:cursor-click"
              onClick={toggleInspectorMode}
              className={
                isInspectorMode ? 'bg-bolt-elements-background-depth-3 !text-bolt-elements-item-contentAccent' : ''
              }
              title={isInspectorMode ? t('idePanels.preview.disableInspect') : t('idePanels.preview.enableInspect')}
            />
            <button
              type="button"
              className="bolt-preview-toolbar-button"
              aria-pressed={devToolsOpen}
              onClick={() => {
                setDevToolsOpen((open) => !open);
                setActiveDevToolsTab('console');
              }}
              title={t('idePanels.preview.openDevTools')}
              aria-label={t('idePanels.preview.openDevTools')}
              data-vc-tooltip={t('idePanels.preview.openDevTools')}
            >
              <span className="i-ph:wrench" aria-hidden />
              <span>{t('idePanels.preview.devTools')}</span>
            </button>
            <button
              type="button"
              className="bolt-preview-toolbar-button"
              disabled={!selectedPreviewElement}
              onClick={openSelectedElementSource}
              title={inspectToCodeHint}
              aria-label={inspectToCodeHint}
              data-vc-tooltip={inspectToCodeHint}
            >
              <span className="i-ph:code" aria-hidden />
              <span>{t('idePanels.preview.inspectToCode')}</span>
            </button>
            <IconButton
              icon={isFullscreen ? 'i-ph:arrows-in' : 'i-ph:arrows-out'}
              onClick={toggleFullscreen}
              title={isFullscreen ? t('idePanels.preview.exitFullscreen') : t('idePanels.preview.fullscreen')}
            />
            <button
              type="button"
              className="bolt-preview-toolbar-button"
              onClick={openInNewTab}
              disabled={!activePreview}
              title={t('idePanels.preview.openBrowser')}
              aria-label={t('idePanels.preview.openBrowser')}
              data-vc-tooltip={t('idePanels.preview.openBrowser')}
            >
              <span className="i-ph:arrow-square-out" aria-hidden />
              <span>{t('idePanels.preview.open')}</span>
            </button>
            <IconButton
              icon="i-ph:terminal-window"
              onClick={() => {
                setActiveLogTab('webview');
                setLogsOpen((open) => !open);
              }}
              title={t('idePanels.preview.webviewLogs')}
            />

            <div className="flex items-center relative">
              <IconButton
                icon="i-ph:browser"
                onClick={() => setIsWindowSizeDropdownOpen(!isWindowSizeDropdownOpen)}
                title={t('idePanels.preview.windowOptions')}
              />

              {isWindowSizeDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-50"
                    aria-hidden="true"
                    onClick={() => setIsWindowSizeDropdownOpen(false)}
                  />
                  <div className="bolt-preview-window-menu">
                    <div className="bolt-preview-window-menu-header">
                      <div>
                        <strong>{t('idePanels.preview.window')}</strong>
                        <span>{t('idePanels.preview.windowBody')}</span>
                      </div>
                      <span className="i-ph:browser" aria-hidden />
                    </div>
                    <div className="bolt-preview-window-menu-actions">
                      <button onClick={openInNewTab}>
                        <span className="i-ph:arrow-square-out" aria-hidden />
                        <strong>{t('idePanels.preview.newTab')}</strong>
                      </button>
                      <button
                        onClick={() => {
                          if (!activePreview?.baseUrl) {
                            console.warn('[Preview] No active preview available');
                            return;
                          }

                          const previewTarget = previewWindowTarget(activePreview.baseUrl);

                          window.open(
                            previewTarget.url,
                            `preview-${previewTarget.id}`,
                            'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no,resizable=yes',
                          );
                        }}
                      >
                        <span className="i-ph:browser" aria-hidden />
                        <strong>{t('idePanels.preview.windowShort')}</strong>
                      </button>
                    </div>
                    <div className="bolt-preview-window-menu-section">
                      <button
                        type="button"
                        className="bolt-preview-window-menu-toggle"
                        aria-pressed={showDeviceFrame}
                        onClick={() => setShowDeviceFrame(!showDeviceFrame)}
                      >
                        <span>{t('idePanels.preview.showDeviceFrame')}</span>
                        <span className="bolt-preview-window-switch" aria-hidden>
                          <span />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="bolt-preview-window-menu-toggle"
                        aria-pressed={isLandscape}
                        onClick={() => setIsLandscape(!isLandscape)}
                      >
                        <span>{t('idePanels.preview.landscapeMode')}</span>
                        <span className="bolt-preview-window-switch" aria-hidden>
                          <span />
                        </span>
                      </button>
                    </div>
                    <div className="bolt-preview-window-menu-label">{t('idePanels.preview.responsivePresets')}</div>
                    <div className="bolt-preview-window-menu-sizes">
                      {windowSizes.map((size) => (
                        <button
                          key={size.name}
                          className="bolt-preview-window-size"
                          onClick={() => {
                            setSelectedWindowSize(size);
                            setIsWindowSizeDropdownOpen(false);
                            openInNewWindow(size);
                          }}
                        >
                          <span className={size.icon} aria-hidden />
                          <div>
                            <strong>{size.name}</strong>
                            <small>
                              {isLandscape && (size.frameType === 'mobile' || size.frameType === 'tablet')
                                ? `${size.height} × ${size.width}`
                                : `${size.width} × ${size.height}`}
                              {size.hasFrame && showDeviceFrame ? ` (${t('idePanels.preview.withFrame')})` : ''}
                            </small>
                          </div>
                          {selectedWindowSize.name === size.name && <span className="i-ph:check" aria-hidden />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div
          className="bolt-project-webview-frame flex-1 border-t border-bolt-elements-borderColor flex justify-center items-center overflow-auto"
          data-preview-device={previewDevice}
        >
          <div
            className="bolt-project-webview-viewport"
            style={{
              width: previewViewportWidth,
              height: '100%',
              overflow: 'auto',
              background: 'var(--bolt-elements-background-depth-1)',
              position: 'relative',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {activePreview || staticPreviewHtml ? (
              <>
                {/*
                 * Static-preview iframe sandbox deliberately omits allow-same-origin:
                 * srcDoc loads project-controlled HTML first-party, so granting it the
                 * IDE's own origin would expose our cookies/localStorage/IndexedDB and
                 * same-origin APIs (stored XSS / session theft). Without it the iframe
                 * runs at an opaque (null) origin — scripts still work, fully isolated.
                 */}
                {staticPreviewHtml && !activePreview ? (
                  <iframe
                    ref={iframeRef}
                    title={t('idePanels.preview.iframeTitle')}
                    className="border-none w-full h-full bg-white"
                    srcDoc={staticPreviewHtml}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
                    allow="cross-origin-isolated"
                    onLoad={() => recordPreviewLoad('static-preview')}
                    data-testid="preview-iframe"
                  />
                ) : isDeviceModeOn && showDeviceFrameInPreview ? (
                  <div
                    className="device-wrapper"
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                      height: '100%',
                      padding: '0',
                      overflow: 'auto',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                    }}
                  >
                    <div
                      className="device-frame-container"
                      style={{
                        position: 'relative',
                        borderRadius: selectedWindowSize.frameType === 'mobile' ? '36px' : '20px',
                        background: 'var(--vc-ide-bg-hover)',
                        padding: getFramePadding(),
                        boxShadow: 'var(--vc-ui-shadow-xl)',
                        overflow: 'hidden',
                        transform: 'scale(1)',
                        transformOrigin: 'center center',
                        transition: 'all 0.3s ease',
                        margin: '40px',
                        width: isLandscape
                          ? `${selectedWindowSize.height + (selectedWindowSize.frameType === 'mobile' ? 120 : 60)}px`
                          : `${selectedWindowSize.width + (selectedWindowSize.frameType === 'mobile' ? 40 : 60)}px`,
                        height: isLandscape
                          ? `${selectedWindowSize.width + (selectedWindowSize.frameType === 'mobile' ? 80 : 60)}px`
                          : `${selectedWindowSize.height + (selectedWindowSize.frameType === 'mobile' ? 80 : 100)}px`,
                      }}
                    >
                      {/* Notch - positioned based on orientation */}
                      <div
                        style={{
                          position: 'absolute',
                          top: isLandscape ? '50%' : '20px',
                          left: isLandscape ? '30px' : '50%',
                          transform: isLandscape ? 'translateY(-50%)' : 'translateX(-50%)',
                          width: isLandscape ? '8px' : selectedWindowSize.frameType === 'mobile' ? '60px' : '80px',
                          height: isLandscape ? (selectedWindowSize.frameType === 'mobile' ? '60px' : '80px') : '8px',
                          background: 'var(--vc-ide-bg-app)',
                          borderRadius: '4px',
                          zIndex: 2,
                        }}
                      />

                      {/* Home button - positioned based on orientation */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: isLandscape ? '50%' : '15px',
                          right: isLandscape ? '30px' : '50%',
                          transform: isLandscape ? 'translateY(50%)' : 'translateX(50%)',
                          width: isLandscape ? '4px' : '40px',
                          height: isLandscape ? '40px' : '4px',
                          background: 'var(--vc-ide-bg-app)',
                          borderRadius: '50%',
                          zIndex: 2,
                        }}
                      />

                      <iframe
                        ref={iframeRef}
                        title={t('idePanels.preview.iframeTitle')}
                        style={{
                          border: 'none',
                          width: isLandscape ? `${selectedWindowSize.height}px` : `${selectedWindowSize.width}px`,
                          height: isLandscape ? `${selectedWindowSize.width}px` : `${selectedWindowSize.height}px`,
                          background: 'white',
                          display: 'block',
                        }}
                        src={iframeUrl}
                        sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
                        allow="cross-origin-isolated"
                        onLoad={() => recordPreviewLoad(iframeUrl)}
                        onError={handlePreviewFrameError}
                        data-testid="preview-iframe"
                      />
                    </div>
                  </div>
                ) : (
                  <iframe
                    ref={iframeRef}
                    title={t('idePanels.preview.iframeTitle')}
                    className="border-none w-full h-full bg-bolt-elements-background-depth-1"
                    src={iframeUrl}
                    sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
                    allow="geolocation; ch-ua-full-version-list; cross-origin-isolated; screen-wake-lock; publickey-credentials-get; shared-storage-select-url; ch-ua-arch; bluetooth; compute-pressure; ch-prefers-reduced-transparency; deferred-fetch; usb; ch-save-data; publickey-credentials-create; shared-storage; deferred-fetch-minimal; run-ad-auction; ch-ua-form-factors; ch-downlink; otp-credentials; payment; ch-ua; ch-ua-model; ch-ect; autoplay; camera; private-state-token-issuance; accelerometer; ch-ua-platform-version; idle-detection; private-aggregation; interest-cohort; ch-viewport-height; local-fonts; ch-ua-platform; midi; ch-ua-full-version; xr-spatial-tracking; clipboard-read; gamepad; display-capture; keyboard-map; join-ad-interest-group; ch-width; ch-prefers-reduced-motion; browsing-topics; encrypted-media; gyroscope; serial; ch-rtt; ch-ua-mobile; window-management; unload; ch-dpr; ch-prefers-color-scheme; ch-ua-wow64; attribution-reporting; fullscreen; identity-credentials-get; private-state-token-redemption; hid; ch-ua-bitness; storage-access; sync-xhr; ch-device-memory; ch-viewport-width; picture-in-picture; magnetometer; clipboard-write; microphone"
                    onLoad={() => recordPreviewLoad(iframeUrl)}
                    onError={handlePreviewFrameError}
                    data-testid="preview-iframe"
                  />
                )}
                {previewLoadingOverlayMode === 'resume' ? (
                  <PreviewResumeSkeleton
                    currentTask={
                      activePreview?.ready === false
                        ? t('idePanels.preview.reconnecting')
                        : t('idePanels.preview.reattaching')
                    }
                  />
                ) : previewLoadingOverlayMode === 'rebuild' ? (
                  <PreviewLoadingOverlay
                    activeStep={previewBootProgress.activeStep}
                    currentTask={
                      previewStatus ??
                      (activePreview?.ready === false
                        ? t('idePanels.preview.waitingPort')
                        : t('idePanels.preview.loadingWebview'))
                    }
                    logs={recentPreviewLogs}
                    progress={Math.min(previewBootProgress.progress, activePreview?.ready === false ? 84 : 92)}
                    steps={previewBootSteps}
                    onViewLogs={openPreviewLogs}
                  />
                ) : null}
                <Inspector
                  isActive={isInspectorMode}
                  iframeRef={iframeRef}
                  onElementSelect={handleInspectorElementSelect}
                />
                <ScreenshotSelector
                  isSelectionMode={isSelectionMode}
                  setIsSelectionMode={setIsSelectionMode}
                  containerRef={iframeRef}
                />
              </>
            ) : (
              <>
                {previewRunFailed || workspaceError ? (
                  <PreviewNotRunningState
                    detail={previewStatus ?? (workspaceError ? t('idePanels.preview.workspaceFailed') : undefined)}
                    isRunning={isStartingPreview}
                    logs={workspaceLogs.slice(-8)}
                    onRun={() => {
                      setIsStartingPreview(true);
                      setPreviewRunFailed(false);
                      setPreviewStatus(t('idePanels.preview.restartStatus'));
                      toast.info(t('idePanels.preview.restartStarted'), { toastId: 'preview-build-restart' });
                      void workbenchStore
                        .restartPreviewServer()
                        .catch(() => {
                          setPreviewStatus(t('idePanels.preview.restartFailed'));
                          setPreviewRunFailed(true);
                        })
                        .finally(() => {
                          window.setTimeout(() => setIsStartingPreview(false), 2500);
                        });
                    }}
                    onReinstall={() => {
                      setIsStartingPreview(true);
                      setPreviewRunFailed(false);
                      setPreviewStatus(t('idePanels.preview.reinstallStatus'));
                      toast.info(t('idePanels.preview.reinstalling'), { toastId: 'preview-reinstall-deps' });
                      void workbenchStore
                        .reinstallDependencies()
                        .catch(() => {
                          setPreviewStatus(t('idePanels.preview.reinstallFailed'));
                          setPreviewRunFailed(true);
                        })
                        .finally(() => {
                          window.setTimeout(() => setIsStartingPreview(false), 2500);
                        });
                    }}
                  />
                ) : (
                  <>
                    {shouldShowPreviewStartupOverlay ? (
                      <iframe
                        title={t('idePanels.preview.iframeTitle')}
                        data-testid="preview-iframe"
                        className="bolt-preview-iframe bolt-preview-iframe--booting"
                        src="about:blank"
                      />
                    ) : null}
                    {!shouldShowPreviewStartupOverlay ? (
                      <PreviewSplashSequence
                        appName={projectId ? t('idePanels.preview.projectPreview') : undefined}
                        activeStep={previewBootProgress.activeStep}
                        currentTask={
                          previewStatus ??
                          (workspaceReady
                            ? t('idePanels.preview.startingServer')
                            : t('idePanels.preview.startingWorkspace'))
                        }
                        isBusy={isStartingPreview || isRefreshingPorts || autoStart || !workspaceReady}
                        progress={previewBootProgress.progress}
                        logs={recentPreviewLogs}
                        steps={previewBootSteps}
                        onViewLogs={openPreviewLogs}
                      />
                    ) : null}
                    {shouldShowPreviewStartupOverlay ? (
                      <PreviewLoadingOverlay
                        activeStep={previewBootProgress.activeStep}
                        currentTask={
                          previewStatus ??
                          (workspaceReady
                            ? t('idePanels.preview.startingServer')
                            : t('idePanels.preview.startingWorkspace'))
                        }
                        logs={recentPreviewLogs}
                        progress={Math.min(previewBootProgress.progress, 84)}
                        steps={previewBootSteps}
                        onViewLogs={openPreviewLogs}
                      />
                    ) : null}
                  </>
                )}
              </>
            )}

            {isDeviceModeOn && !showDeviceFrameInPreview && (
              <>
                {/* Width indicator */}
                <div
                  style={{
                    position: 'absolute',
                    top: '-25px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--bolt-elements-background-depth-3, var(--vc-ide-bg-card))',
                    color: 'var(--bolt-elements-textPrimary, white)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    pointerEvents: 'none',
                    opacity: isResizing ? 1 : 0,
                    transition: 'opacity 0.3s',
                  }}
                >
                  {currentWidth} {t('idePanels.preview.pixelUnit')}
                </div>

                <ResizeHandle side="left" />
                <ResizeHandle side="right" />
              </>
            )}
          </div>
        </div>
        {logsOpen && (
          <section className="bolt-preview-logs-panel" aria-label={t('idePanels.preview.logsLabel')}>
            <header>
              <div role="tablist" aria-label={t('idePanels.preview.logType')}>
                {(['webview', 'server'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeLogTab === tab}
                    onClick={() => setActiveLogTab(tab)}
                  >
                    {tab === 'webview' ? t('idePanels.preview.webviewLogs') : t('idePanels.preview.serverLogs')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={t('idePanels.preview.openLogsRight')}
                onClick={() => {
                  setLogsOpen(false);
                  onOpenLogsRight?.();
                }}
              >
                <span className="i-ph:sidebar-simple" aria-hidden />
                {t('idePanels.preview.dockRight')}
              </button>
            </header>
            <pre>
              {(activeLogTab === 'webview'
                ? [
                    t('idePanels.preview.logUrl', {
                      url: iframeUrl ?? t('idePanels.preview.notRunning'),
                    }),
                    t('idePanels.preview.logPort', {
                      port: activePreview?.port ?? t('idePanels.preview.none'),
                    }),
                    t('idePanels.preview.logDevice', { device: previewDeviceLabel(previewDevice, t) }),
                    t('idePanels.preview.logStatus', {
                      status: previewStatus ?? t('idePanels.preview.ready'),
                    }),
                  ]
                : workspaceLogs.length
                  ? workspaceLogs.slice(-120)
                  : [t('idePanels.preview.noServerLogs')]
              ).join('\n')}
            </pre>
          </section>
        )}
        {devToolsOpen && (
          <section className="bolt-preview-devtools-panel" aria-label={t('idePanels.preview.devToolsLabel')}>
            <header>
              <div role="tablist" aria-label={t('idePanels.preview.devToolsTabs')}>
                {(['console', 'network', 'elements'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={activeDevToolsTab === tab}
                    onClick={() => setActiveDevToolsTab(tab)}
                  >
                    {tab === 'console'
                      ? t('idePanels.preview.console')
                      : tab === 'network'
                        ? t('idePanels.preview.network')
                        : t('idePanels.preview.elements')}
                  </button>
                ))}
              </div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    /*
                     * Clear the ACTIVE tab's data. Previously this only cleared
                     * the console list, so on the Network/Elements tabs the
                     * button did nothing.
                     */
                    if (activeDevToolsTab === 'network') {
                      setPreviewNetworkEvents([]);
                    } else if (activeDevToolsTab === 'elements') {
                      setSelectedPreviewElement(null);
                    } else {
                      setPreviewConsoleEvents([]);
                    }
                  }}
                >
                  {t('idePanels.common.clear')}
                </button>
                <button
                  type="button"
                  aria-label={t('idePanels.preview.closeDevTools')}
                  onClick={() => setDevToolsOpen(false)}
                >
                  <span className="i-ph:x" aria-hidden />
                </button>
              </div>
            </header>
            {activeDevToolsTab === 'console' && (
              <div className="bolt-preview-devtools-body" role="log" aria-live="polite">
                {previewConsoleEvents.length ? (
                  previewConsoleEvents.map((event, index) => {
                    const source = event.source;

                    return (
                      <div key={`${event.level}-${index}`} data-level={event.level}>
                        <strong>{previewConsoleLevel(event.level, t)}</strong>
                        <span>{renderConsoleMessage(event.message, t)}</span>
                        {source ? (
                          <button
                            type="button"
                            className="bolt-preview-console-open"
                            onClick={() => openPreviewSource(source.path, source.line)}
                            title={t('idePanels.preview.openLocation', {
                              location: `${source.path}:${source.line}`,
                            })}
                            aria-label={t('idePanels.preview.openFileLine', {
                              path: source.path,
                              line: source.line,
                            })}
                          >
                            <span className="i-ph:arrow-square-out" aria-hidden />
                            {source.path.split('/').pop()}:{source.line}
                          </button>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    variant="compact"
                    icon="i-ph:check-circle"
                    title={t('idePanels.preview.noConsoleErrors')}
                    description={t('idePanels.preview.consoleEmptyBody')}
                  />
                )}
              </div>
            )}
            {activeDevToolsTab === 'network' && (
              <div className="bolt-preview-devtools-body">
                {previewNetworkEvents.length ? (
                  previewNetworkEvents.map((event, index) => (
                    <div key={`${event.url}-${index}`} data-level={event.status === 'ready' ? 'info' : 'trace'}>
                      <strong>{event.method}</strong>
                      <span title={event.url}>{event.url}</span>
                      <em>{previewNetworkStatus(event.status, t)}</em>
                      <small>{previewNetworkSource(event.source, t)}</small>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    variant="compact"
                    icon="i-ph:globe-simple"
                    title={t('idePanels.preview.noNavigations')}
                    description={t('idePanels.preview.noNavigationsBody')}
                  />
                )}
              </div>
            )}
            {activeDevToolsTab === 'elements' && (
              <div className="bolt-preview-devtools-body">
                {selectedPreviewElement ? (
                  <>
                    <div data-level="info">
                      <strong>{selectedPreviewElement.tagName.toLowerCase()}</strong>
                      <span>
                        {selectedPreviewElement.id ? `#${selectedPreviewElement.id}` : ''}
                        {selectedPreviewElement.className
                          ? `.${selectedPreviewElement.className.split(/\s+/).filter(Boolean).join('.')}`
                          : ''}
                      </span>
                    </div>
                    <div data-level="trace">
                      <strong>{t('idePanels.preview.text')}</strong>
                      <span>{selectedPreviewElement.textContent?.trim() || t('idePanels.preview.noText')}</span>
                    </div>
                    {selectedPreviewElement.source?.fileName ? (
                      <div data-level="info">
                        <strong>{t('idePanels.preview.source')}</strong>
                        <span>
                          {selectedPreviewElement.source.fileName.split('/').pop()}:
                          {selectedPreviewElement.source.lineNumber ?? '?'}
                        </span>
                      </div>
                    ) : null}
                    <button type="button" className="bolt-preview-devtools-primary" onClick={openSelectedElementSource}>
                      {selectedPreviewElement.source?.fileName
                        ? t('idePanels.preview.openSource', {
                            location: `${selectedPreviewElement.source.fileName.split('/').pop()}:${selectedPreviewElement.source.lineNumber ?? '?'}`,
                          })
                        : t('idePanels.preview.openMatchingSource')}
                    </button>
                  </>
                ) : (
                  <EmptyState
                    variant="compact"
                    icon="i-ph:cursor-click"
                    title={t('idePanels.preview.noElement')}
                    description={t('idePanels.preview.noElementBody')}
                  />
                )}
              </div>
            )}
          </section>
        )}
      </div>
    );
  },
);

function previewDeviceLabel(device: PreviewDevice, t: Translate): string {
  const keyByDevice: Record<PreviewDevice, string> = {
    desktop: 'idePanels.preview.desktop',
    tablet: 'idePanels.preview.tablet',
    mobile: 'idePanels.preview.mobile',
    custom: 'idePanels.preview.customWidth',
  };

  return t(keyByDevice[device]);
}

function previewConsoleLevel(level: string, t: Translate): string {
  const keyByLevel: Record<string, string> = {
    error: 'idePanels.preview.levelError',
    warn: 'idePanels.preview.levelWarning',
    warning: 'idePanels.preview.levelWarning',
    info: 'idePanels.preview.levelInfo',
    log: 'idePanels.preview.levelLog',
  };

  return t(keyByLevel[level.toLowerCase()] ?? 'idePanels.common.unavailable');
}

function previewNetworkStatus(status: string, t: Translate): string {
  const keyByStatus: Record<string, string> = {
    detecting: 'idePanels.preview.networkDetecting',
    ready: 'idePanels.preview.networkReady',
    reloaded: 'idePanels.preview.networkReloaded',
    'upstream-not-ready': 'idePanels.preview.networkWaiting',
    loaded: 'idePanels.preview.networkLoaded',
    navigated: 'idePanels.preview.networkNavigated',
  };

  return t(keyByStatus[status] ?? 'idePanels.preview.networkUnavailable');
}

function previewNetworkSource(source: string, t: Translate): string {
  if (source.startsWith('port:')) {
    return t('idePanels.preview.sourcePort', { port: source.slice('port:'.length) });
  }

  if (source === 'address-bar') {
    return t('idePanels.preview.sourceAddress');
  }

  if (source === 'iframe') {
    return t('idePanels.preview.sourceIframe');
  }

  return t('idePanels.preview.sourceSystem');
}

/*
 * Live `prefers-reduced-motion: reduce` state. Users who ask for reduced motion
 * should not get auto-advancing carousels; returns false during SSR / when
 * matchMedia is unavailable so the default (animated) behaviour is unchanged.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    setReduced(mql.matches);
    mql.addEventListener('change', onChange);

    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function PreviewSplashSequence({
  appName,
  activeStep,
  currentTask,
  isBusy,
  logs,
  onViewLogs,
  progress,
  steps,
}: {
  appName?: string;
  activeStep: PreviewBootStepId;
  currentTask: string;
  isBusy: boolean;
  logs?: string[];
  onViewLogs?: () => void;
  progress: number;
  steps: Array<{ id: PreviewBootStepId; label: string; description: string }>;
}) {
  const { t } = useTranslation();
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const previewSplashSlides = useMemo(() => getPreviewSplashSlides(t), [t]);

  useEffect(() => {
    // Freeze the carousel for reduced-motion users and while hovered/focused.
    if (reducedMotion || paused) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setActiveSlide((slide) => (slide + 1) % previewSplashSlides.length);
    }, 3600);

    return () => window.clearInterval(interval);
  }, [reducedMotion, paused]);

  const slide = previewSplashSlides[activeSlide];

  return (
    <div
      className="bolt-preview-splash"
      data-testid="preview-splash-sequence"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="bolt-preview-splash-shell">
        <div className="bolt-preview-splash-chrome">
          <span />
          <span />
          <span />
          <div />
        </div>
        {/* Decorative marketing carousel — hidden from assistive tech so its
            auto-rotation doesn't spam a screen reader every few seconds. The
            meaningful boot step/task below stays announced via role="status". */}
        <div key={slide.headline} className="bolt-preview-splash-slide" aria-hidden>
          <PreviewSplashSlide slide={slide} />
        </div>
        <div className="bolt-preview-splash-task">
          {isBusy ? <span className="i-ph:circle-notch animate-spin" aria-hidden /> : null}
          <span>
            <strong>{steps.find((step) => step.id === activeStep)?.label ?? t('idePanels.preview.preparing')}</strong>
            <small>{currentTask}</small>
          </span>
          {onViewLogs ? (
            <button type="button" onClick={onViewLogs}>
              {t('idePanels.preview.viewLogs')}
            </button>
          ) : null}
        </div>
        <div
          className="bolt-preview-splash-progress"
          role="progressbar"
          aria-label={t('idePanels.preview.startupProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ backgroundColor: slide.color, width: `${Math.max(8, Math.min(progress, 100))}%` }} />
        </div>
        <div className="bolt-preview-splash-steps" aria-label={t('idePanels.preview.startupSteps')}>
          {steps.map((step) => {
            const stepIndex = steps.findIndex((item) => item.id === step.id);
            const activeIndex = steps.findIndex((item) => item.id === activeStep);
            const state = stepIndex < activeIndex ? 'complete' : stepIndex === activeIndex ? 'active' : 'pending';

            return (
              <div key={step.id} data-state={state} title={step.description}>
                <span aria-hidden>{state === 'complete' ? '✓' : stepIndex + 1}</span>
                <strong>{step.label}</strong>
              </div>
            );
          })}
        </div>
        <div className="bolt-preview-splash-footer">
          <div className="bolt-preview-splash-dots" aria-label={t('idePanels.preview.preparationSlides')}>
            {previewSplashSlides.map((item, index) => (
              <button
                key={item.headline}
                type="button"
                className={index === activeSlide ? 'active' : undefined}
                onClick={() => setActiveSlide(index)}
                aria-label={t('idePanels.preview.showSlide', { headline: item.headline })}
              />
            ))}
          </div>
          {appName ? <p>{t('idePanels.preview.preparingApp', { app: appName })}</p> : null}
        </div>
        {logs?.length ? <pre className="bolt-preview-splash-log">{logs.join('\n')}</pre> : null}
      </div>
    </div>
  );
}

/*
 * Lightweight resume skeleton shown while re-adopting an already-running
 * workspace on reopen. Deliberately NOT the install/boot progress overlay — the
 * pod is up and serving, so the user is only reconnecting, not rebuilding from
 * scratch. Uses E-Code IDE tokens (accent-action) so it matches the shell.
 */
function PreviewResumeSkeleton({ currentTask }: { currentTask: string }) {
  const { t } = useTranslation();

  return (
    <div className="bolt-preview-resume-overlay" data-testid="preview-resume-skeleton" role="status" aria-live="polite">
      <div className="bolt-preview-resume-card">
        <span className="bolt-preview-resume-spinner i-ph:circle-notch animate-spin" aria-hidden />
        <div className="bolt-preview-resume-copy">
          <span>{t('idePanels.preview.resuming')}</span>
          <h3>{t('idePanels.preview.reattachingTitle')}</h3>
          <p>{currentTask}</p>
        </div>
        <div className="bolt-preview-resume-skeleton-lines" aria-hidden>
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}

function PreviewLoadingOverlay({
  activeStep,
  currentTask,
  logs,
  onViewLogs,
  progress,
  steps,
}: {
  activeStep: PreviewBootStepId;
  currentTask: string;
  logs: string[];
  onViewLogs?: () => void;
  progress: number;
  steps: Array<{ id: PreviewBootStepId; label: string; description: string }>;
}) {
  const { t } = useTranslation();
  const activeLabel = steps.find((step) => step.id === activeStep)?.label ?? t('idePanels.preview.preparing');

  return (
    <div
      className="bolt-preview-loading-overlay"
      data-testid="preview-loading-overlay"
      role="status"
      aria-live="polite"
    >
      <div className="bolt-preview-loading-card">
        <span className="bolt-preview-loading-spinner i-ph:circle-notch animate-spin" aria-hidden />
        <div className="bolt-preview-loading-copy">
          <span>{t('idePanels.preview.webviewStartup')}</span>
          <h3 data-testid="preview-loading-current-step">{activeLabel}</h3>
          <p>{currentTask}</p>
        </div>
        <div
          className="bolt-preview-loading-progress"
          role="progressbar"
          aria-label={t('idePanels.preview.webviewProgress')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }} />
        </div>
        <ol className="bolt-preview-loading-steps" aria-label={t('idePanels.preview.webviewSteps')}>
          {steps.map((step) => {
            const stepIndex = steps.findIndex((item) => item.id === step.id);
            const activeIndex = steps.findIndex((item) => item.id === activeStep);
            const state = stepIndex < activeIndex ? 'complete' : stepIndex === activeIndex ? 'active' : 'pending';

            return (
              <li key={step.id} data-state={state}>
                <span aria-hidden>{state === 'complete' ? '✓' : stepIndex + 1}</span>
                <strong>{step.label}</strong>
              </li>
            );
          })}
        </ol>
        {logs.length ? <pre data-testid="preview-loading-log">{logs.join('\n')}</pre> : null}
        {onViewLogs ? (
          <button type="button" onClick={onViewLogs}>
            {t('idePanels.preview.viewLogs')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewNotRunningState({
  detail,
  isRunning,
  logs,
  onRun,
  onReinstall,
}: {
  detail?: string;
  isRunning: boolean;
  logs: string[];
  onRun: () => void;
  onReinstall?: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="bolt-preview-not-running" data-testid="preview-not-running-state">
      <div className="bolt-preview-not-running-card">
        <div className="bolt-preview-not-running-orbit" aria-hidden>
          <span />
          <span />
          <span />
          <Zap />
        </div>
        <div className="bolt-preview-not-running-copy">
          <span>{t('idePanels.preview.status')}</span>
          <h3>{t('idePanels.preview.notRunningTitle')}</h3>
          <p>{detail ?? t('idePanels.preview.notRunningBody')}</p>
          {logs.length > 0 ? <pre className="bolt-preview-not-running-log">{logs.join('\n')}</pre> : null}
        </div>
        <button type="button" onClick={onRun} disabled={isRunning} className="bolt-preview-not-running-run">
          {isRunning ? <span className="i-ph:circle-notch animate-spin" aria-hidden /> : <Zap aria-hidden />}
          <span>{isRunning ? t('idePanels.preview.startingPreview') : t('idePanels.preview.runPreview')}</span>
        </button>
        {onReinstall ? (
          <button
            type="button"
            onClick={onReinstall}
            disabled={isRunning}
            className="bolt-preview-not-running-secondary"
            title={t('idePanels.preview.reinstallHelp')}
          >
            <span className="i-ph:arrows-clockwise" aria-hidden />
            <span>{t('idePanels.preview.reinstallDependencies')}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PreviewSplashSlide({ slide }: { slide: SplashSlide }) {
  const SlideIcon = slide.icon;

  if (slide.layout === 'tips-carousel') {
    return (
      <div className="bolt-preview-splash-content">
        {SlideIcon ? (
          <div className="bolt-preview-splash-icon" style={{ color: slide.color, backgroundColor: `${slide.color}18` }}>
            <SlideIcon aria-hidden />
          </div>
        ) : null}
        <h3>{slide.headline}</h3>
        <p>{slide.subtitle}</p>
        <RotatingPreviewTips color={slide.color} />
      </div>
    );
  }

  if (slide.layout === 'icon-grid') {
    return (
      <div className="bolt-preview-splash-content">
        <h3>{slide.headline}</h3>
        <p>{slide.subtitle}</p>
        <div className="bolt-preview-splash-grid">
          {slide.gridItems?.map((item) => {
            const ItemIcon = item.icon;

            return (
              <div key={item.label}>
                <ItemIcon style={{ color: slide.color }} aria-hidden />
                <span>{item.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bolt-preview-splash-content">
      {SlideIcon ? (
        <div className="bolt-preview-splash-icon" style={{ color: slide.color, backgroundColor: `${slide.color}18` }}>
          <SlideIcon aria-hidden />
        </div>
      ) : null}
      <h3>{slide.headline}</h3>
      <p>{slide.subtitle}</p>
      {slide.stats ? (
        <div className="bolt-preview-splash-stats">
          {slide.stats.map((stat) => (
            <div key={stat.label}>
              <strong style={{ color: slide.color }}>{stat.value}</strong>
              <span>{stat.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RotatingPreviewTips({ color }: { color: string }) {
  const { t } = useTranslation();
  const [tipIndex, setTipIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const previewTips = useMemo(() => getPreviewTips(t), [t]);

  useEffect(() => {
    // Freeze the tip rotation for reduced-motion users and while hovered.
    if (reducedMotion || paused) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setTipIndex((index) => (index + 1) % previewTips.length);
    }, 2400);

    return () => window.clearInterval(interval);
  }, [reducedMotion, paused]);

  return (
    <div
      className="bolt-preview-splash-tips"
      aria-hidden
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {[0, 1, 2].map((offset) => {
        const tip = previewTips[(tipIndex + offset) % previewTips.length];
        const TipIcon = tip.icon;

        return (
          <div key={`${tip.text}-${offset}`} className={offset === 0 ? 'active' : undefined}>
            <TipIcon style={{ color: offset === 0 ? color : undefined }} aria-hidden />
            <span>{tip.text}</span>
          </div>
        );
      })}
    </div>
  );
}
