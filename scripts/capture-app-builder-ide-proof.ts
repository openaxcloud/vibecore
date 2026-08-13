import { createHash, randomBytes } from 'node:crypto';
import { access, chmod, cp, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, resolve } from 'node:path';

import { chromium, expect, type FrameLocator, type Locator, type Page, type Request } from '@playwright/test';
import sharp from 'sharp';

import {
  EMPTY_PROJECT_FILE_STABILITY,
  findPersistedPromptEvidence,
  matchCompleteSubmittedPrompt,
  normalizeCaptureProofText,
  observeProjectFileRevision,
  projectFilesAreStable,
  projectFilesRevisionFromEntries,
  type PersistedPromptChatState,
  type PersistedPromptEvidence,
  type ProjectFileEntry,
} from './solution-capture-state.js';
import {
  generatedSolutionPackageContractFor,
  validateGeneratedSolutionPackageJson,
} from './solution-generated-package-policy.js';
import {
  buildRuntimePreviewProvenance,
  isNativeWebviewFallbackEligible,
  selectOfficialRuntimePreviewUrl,
  type RuntimePreviewProvenance,
} from './solution-runtime-preview-proof.js';
import {
  observeRuntimeWriteFence,
  reconcileRuntimeFileSnapshot,
  shouldCompleteTrackedIdeRequest,
  shouldReloadAfterPostChatRuntimeChurn,
  verifyRuntimeFileSnapshotStable,
  type RuntimeFileSnapshot,
  type RuntimeRequestCompletionDiagnostic,
  type RuntimeReconciliationEvent,
  type RuntimeReconciliationOperations,
  type TrackedIdeRequestEndSource,
  type RuntimeWriteQuiescenceDiagnostic,
} from './solution-runtime-reconciliation.js';
import { applyOfficialRuntimeCaptureTheme, pressIdeCommandPaletteShortcut } from './solution-runtime-theme-control.js';

type CaptureLocale = 'en' | 'fr';
type CaptureSlug =
  | 'app-builder'
  | 'website-builder'
  | 'game-builder'
  | 'dashboard-builder'
  | 'chatbot-builder'
  | 'internal-ai-builder'
  | 'startups'
  | 'freelancers'
  | 'enterprise';

type CaptureTheme = 'light' | 'dark';

type SolutionScenario = {
  prompt: string;
  iterationPrompt: string;
  accountName: string;
  organizationName: string;
  expectedTerms: readonly string[];
  requiredSourceTerms?: readonly string[];
  requiresDarkCanvas?: boolean;
  interaction: {
    role: 'button' | 'link';
    name: string;
    expectedResult: string | RegExp;
  };
};

type PreviewImageLike = {
  complete: boolean;
  currentSrc: string;
  decode: () => Promise<unknown>;
  getBoundingClientRect: () => { height: number; width: number };
  naturalHeight: number;
  naturalWidth: number;
  src: string;
};

type RuntimeWorkspace = {
  id: string;
  status?: string;
};

type PersistedRuntimeFile = Readonly<
  ProjectFileEntry & {
    path: string;
    content: string;
    encoding?: 'utf8' | 'base64';
  }
>;

type PersistedRuntimeSnapshot = RuntimeFileSnapshot<PersistedRuntimeFile>;

type RuntimePreviewPort = {
  port?: number;
  processId?: string;
  ready?: boolean;
  type?: string;
  notReadyReason?: string;
  url?: string;
};

type CaptureSession = {
  email: string;
  password: string;
  projectId?: string;
};

type PreviewRuntimeErrorRecord = {
  kind: 'console' | 'pageerror' | 'requestfailed';
  message: string;
  url?: string;
};

type PreviewSurfaceState = {
  directPage?: Page;
  mode: 'native-webview' | 'official-runtime-direct';
  officialRuntimeUrl?: string;
  provenance?: RuntimePreviewProvenance;
  runtimeErrors: PreviewRuntimeErrorRecord[];
};

const previewSurfaceStates = new WeakMap<Page, PreviewSurfaceState>();

type RuntimeWriteActivityState = {
  inflight: Set<Request>;
  lastActivityAtMs: number;
  lastCompletion?: RuntimeRequestCompletionDiagnostic;
  mutationCount: number;
};

type RuntimeWriteActivityTracker = {
  waitForQuiescence: (
    workspaceId: string,
    quietForMs: number,
    deadlineMs: number,
  ) => Promise<RuntimeWriteQuiescenceDiagnostic>;
};

type TrackedIdeRequest =
  | { kind: 'chat'; startedAtMs: number }
  | {
      filePath?: string;
      kind: 'runtime';
      method: string;
      pathname: string;
      startedAtMs: number;
      workspaceId: string;
    };

class GeneratedSolutionPackagePolicyError extends Error {
  override readonly name = 'GeneratedSolutionPackagePolicyError';
}

const runtimeWriteActivityTrackers = new WeakMap<Page, RuntimeWriteActivityTracker>();

function runtimeMutationWorkspaceId(request: Request) {
  if (request.method() === 'GET' || request.method() === 'HEAD' || request.method() === 'OPTIONS') {
    return undefined;
  }

  let pathname: string;

  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    return undefined;
  }

  const match = pathname.match(
    /^\/api\/runtime\/workspaces\/([^/]+)\/(?:files(?:\/write|\/move)?|directories|patch|import)(?:\/|$)/,
  );

  if (!match) {
    return undefined;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function isAgentChatRequest(request: Request) {
  if (request.method() !== 'POST') {
    return false;
  }

  try {
    return /^\/api\/chat\/?$/.test(new URL(request.url()).pathname);
  } catch {
    return false;
  }
}

function runtimeMutationDescriptor(
  request: Request,
  workspaceId: string,
): Extract<TrackedIdeRequest, { kind: 'runtime' }> {
  let pathname = '';

  try {
    pathname = new URL(request.url()).pathname;
  } catch {
    pathname = request.url();
  }

  let filePath: string | undefined;

  try {
    const body = request.postDataJSON() as { path?: unknown } | null;

    if (typeof body?.path === 'string' && body.path.trim()) {
      filePath = body.path;
    }
  } catch {
    // A non-JSON mutation remains fully tracked by method + endpoint.
  }

  return {
    kind: 'runtime',
    workspaceId,
    method: request.method(),
    pathname,
    ...(filePath ? { filePath } : {}),
    startedAtMs: Date.now(),
  };
}

/**
 * Track mutations emitted by the real IDE page while Agent actions are still
 * streaming. Project ide-state can already look stable and the composer can look
 * idle while a final lane keeps PUTing partial file bodies directly to runtime.
 */
function registerRuntimeWriteActivityTracker(page: Page) {
  const states = new Map<string, RuntimeWriteActivityState>();
  const trackedRequests = new Map<Request, TrackedIdeRequest>();
  const chatInflight = new Set<Request>();

  let chatRequestCount = 0;
  let lastChatActivityAtMs = Date.now();
  let postChatChurnReloadCount = 0;

  const stateFor = (workspaceId: string) => {
    const existing = states.get(workspaceId);

    if (existing) {
      return existing;
    }

    const created: RuntimeWriteActivityState = {
      inflight: new Set(),
      lastActivityAtMs: Date.now(),
      mutationCount: 0,
    };
    states.set(workspaceId, created);

    return created;
  };

  page.on('request', (request) => {
    if (isAgentChatRequest(request)) {
      const startedAtMs = Date.now();
      chatInflight.add(request);
      chatRequestCount += 1;
      lastChatActivityAtMs = startedAtMs;
      trackedRequests.set(request, { kind: 'chat', startedAtMs });

      return;
    }

    const workspaceId = runtimeMutationWorkspaceId(request);

    if (!workspaceId) {
      return;
    }

    const state = stateFor(workspaceId);
    state.inflight.add(request);
    state.lastActivityAtMs = Date.now();
    state.mutationCount += 1;
    trackedRequests.set(request, runtimeMutationDescriptor(request, workspaceId));
  });

  const complete = (request: Request, endSource: TrackedIdeRequestEndSource, status?: number) => {
    const tracked = trackedRequests.get(request);

    if (!tracked || !shouldCompleteTrackedIdeRequest(tracked.kind, endSource)) {
      return;
    }

    trackedRequests.delete(request);

    const endedAtMs = Date.now();

    if (tracked.kind === 'chat') {
      chatInflight.delete(request);
      lastChatActivityAtMs = endedAtMs;

      return;
    }

    const state = stateFor(tracked.workspaceId);
    state.inflight.delete(request);
    state.lastActivityAtMs = endedAtMs;
    state.lastCompletion = {
      durationMs: Math.max(0, endedAtMs - tracked.startedAtMs),
      endedAtMs,
      endSource,
      ...(tracked.filePath ? { filePath: tracked.filePath } : {}),
      method: tracked.method,
      pathname: tracked.pathname,
      ...(status !== undefined ? { status } : {}),
    };
  };

  page.on('response', (response) => complete(response.request(), 'response', response.status()));
  page.on('requestfinished', (request) => complete(request, 'requestfinished'));
  page.on('requestfailed', (request) => complete(request, 'requestfailed'));

  const tracker: RuntimeWriteActivityTracker = {
    waitForQuiescence: async (workspaceId, quietForMs, deadlineMs) => {
      /*
       * Always observe a NEW quiet window from this call onward. Merely seeing a
       * last write older than the threshold is not a fence: a falsely-idle Agent
       * lane can resume later. Any request start/finish resets the window.
       */
      const waitStartedAtMs = Date.now();

      while (Date.now() < deadlineMs) {
        const state = states.get(workspaceId);
        const observedAtMs = Date.now();

        const fence = observeRuntimeWriteFence({
          chatInflight: chatInflight.size,
          lastChatActivityAtMs,
          lastRuntimeActivityAtMs: state?.lastActivityAtMs ?? waitStartedAtMs,
          minimumQuietForMs: quietForMs,
          observedAtMs,
          runtimeMutationInflight: state?.inflight.size ?? 0,
          waitStartedAtMs,
        });

        if (fence.ready) {
          return {
            chatInflight: 0,
            chatRequestCount,
            ...(state?.lastCompletion ? { lastRuntimeRequest: state.lastCompletion } : {}),
            quietForMs: fence.quietForMs,
            runtimeMutationCount: state?.mutationCount ?? 0,
            runtimeMutationInflight: 0,
          };
        }

        if (
          state &&
          shouldReloadAfterPostChatRuntimeChurn({
            chatInflight: chatInflight.size,
            chatRequestCount,
            lastChatActivityAtMs,
            lastRuntimeActivityAtMs: state.lastActivityAtMs,
            maximumRuntimeSilenceMs: RUNTIME_POST_CHAT_CHURN_RECENCY_MS,
            minimumPostChatChurnMs: RUNTIME_POST_CHAT_CHURN_RELOAD_MS,
            observedAtMs,
            reloadCount: postChatChurnReloadCount,
            runtimeMutationCount: state.mutationCount,
          })
        ) {
          postChatChurnReloadCount += 1;

          process.stdout.write(
            `${JSON.stringify({
              status: 'runtime-post-chat-churn-reload-requested',
              workspaceId,
              chatRequestCount,
              postChatChurnForMs: observedAtMs - lastChatActivityAtMs,
              runtimeMutationCount: state.mutationCount,
              runtimeMutationInflight: state.inflight.size,
              runtimeSilentForMs: observedAtMs - state.lastActivityAtMs,
              ...(state.lastCompletion ? { lastRuntimeRequest: state.lastCompletion } : {}),
            })}\n`,
          );

          const reloadBudgetMs = deadlineMs - Date.now();

          if (reloadBudgetMs <= 0) {
            break;
          }

          await page.reload({
            waitUntil: 'domcontentloaded',
            timeout: Math.min(180_000, reloadBudgetMs),
          });

          const restoredAgentPanel = page.getByTestId('ide-agent-panel');
          const restoredPromptBubble = restoredAgentPanel.locator('.bolt-chat-message-row-user[data-message-id]');
          const restoreBudgetMs = deadlineMs - Date.now();

          if (restoreBudgetMs <= 0) {
            break;
          }

          await expect(restoredAgentPanel).toBeVisible({ timeout: Math.min(60_000, restoreBudgetMs) });
          await expect(
            restoredPromptBubble.first(),
            'The post-chat churn reload must restore a real persisted Agent user bubble',
          ).toBeVisible({ timeout: Math.min(60_000, Math.max(1, deadlineMs - Date.now())) });

          process.stdout.write(
            `${JSON.stringify({
              status: 'runtime-post-chat-churn-reload-completed',
              workspaceId,
              runtimeMutationCount: state.mutationCount,
            })}\n`,
          );

          continue;
        }

        const remainingBudgetMs = deadlineMs - Date.now();
        const remainingQuietMs = Math.max(1, quietForMs - fence.quietForMs);

        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, Math.min(1_000, remainingQuietMs, remainingBudgetMs)),
        );
      }

      const state = states.get(workspaceId);

      const inflightRuntimeRequests = [...(state?.inflight ?? [])].flatMap((request) => {
        const tracked = trackedRequests.get(request);

        if (!tracked || tracked.kind !== 'runtime') {
          return [];
        }

        return [
          {
            filePath: tracked.filePath,
            inflightForMs: Math.max(0, Date.now() - tracked.startedAtMs),
            method: tracked.method,
            pathname: tracked.pathname,
          },
        ];
      });

      throw new Error(
        `IDE runtime writes did not become quiescent for ${quietForMs}ms` +
          ` (workspace=${workspaceId}, chatInflight=${chatInflight.size},` +
          ` runtimeInflight=${state?.inflight.size ?? 0}, chatRequests=${chatRequestCount},` +
          ` runtimeMutations=${state?.mutationCount ?? 0}, reloads=${postChatChurnReloadCount},` +
          ` lastRuntimeRequest=${JSON.stringify(state?.lastCompletion ?? null)},` +
          ` inflightRuntimeRequests=${JSON.stringify(inflightRuntimeRequests)})`,
      );
    },
  };

  runtimeWriteActivityTrackers.set(page, tracker);

  return tracker;
}

function previewSurfaceState(page: Page): PreviewSurfaceState {
  return (
    previewSurfaceStates.get(page) ?? {
      mode: 'native-webview',
      runtimeErrors: [],
    }
  );
}

function previewScope(page: Page): Page | FrameLocator {
  const state = previewSurfaceState(page);

  return state.mode === 'official-runtime-direct' && state.directPage
    ? state.directPage
    : page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last();
}

function previewBody(page: Page): Locator {
  return previewScope(page).locator('body');
}

async function previewPixels(page: Page) {
  const state = previewSurfaceState(page);

  return state.mode === 'official-runtime-direct' && state.directPage
    ? state.directPage.screenshot({ animations: 'disabled', type: 'png' })
    : page
        .locator('iframe[data-testid="preview-iframe"]:visible')
        .last()
        .screenshot({ animations: 'disabled', type: 'png' });
}

function directPreviewViewport(device: 'desktop' | 'tablet' | 'mobile') {
  switch (device) {
    case 'mobile':
      return { height: 844, width: 390 };
    case 'tablet':
      return { height: 1024, width: 768 };
    default:
      return { height: 900, width: 1440 };
  }
}

async function applyDirectPreviewViewport(page: Page, device: 'desktop' | 'tablet' | 'mobile') {
  const state = previewSurfaceState(page);

  if (state.mode === 'official-runtime-direct' && state.directPage) {
    await state.directPage.setViewportSize(directPreviewViewport(device));
  }
}

function assertDirectRuntimeStayedClean(page: Page) {
  const state = previewSurfaceState(page);

  if (state.mode !== 'official-runtime-direct' || state.runtimeErrors.length === 0) {
    return;
  }

  const details = state.runtimeErrors
    .slice(0, 5)
    .map((record) => `${record.kind}${record.url ? ` ${record.url}` : ''}: ${record.message}`)
    .join(' | ');

  throw new Error(
    `The official runtime page emitted ${state.runtimeErrors.length} capture-blocking errors: ${details}`,
  );
}

function positiveDurationFromEnv(name: string, fallbackMs: number) {
  const configuredValue = process.env[name]?.trim();

  if (!configuredValue) {
    return fallbackMs;
  }

  const duration = Number(configuredValue);

  if (!Number.isSafeInteger(duration) || duration <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds`);
  }

  return duration;
}

const APP_BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173';
const API_BASE_URL = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const GENERATION_TIMEOUT_MS = 12 * 60 * 1000;
const PROJECT_SETTLE_TIMEOUT_MS = positiveDurationFromEnv('SOLUTION_PROOF_SETTLE_TIMEOUT_MS', 18 * 60 * 1000);
const PROJECT_FILES_STABLE_MS = positiveDurationFromEnv('SOLUTION_PROOF_FILES_STABLE_MS', 60_000);

const PROJECT_FILES_MAX_OBSERVATION_GAP_MS = positiveDurationFromEnv(
  'SOLUTION_PROOF_FILES_MAX_OBSERVATION_GAP_MS',
  15_000,
);

const PROJECT_FILES_MIN_UNCHANGED_READS = 8;
const PROJECT_UI_MIN_IDLE_READS = 2;
const AGENT_IDLE_TIMEOUT_MS = positiveDurationFromEnv('SOLUTION_PROOF_AGENT_IDLE_TIMEOUT_MS', 3 * 60 * 1000);
const AGENT_SUBMIT_ACTION_TIMEOUT_MS = positiveDurationFromEnv('SOLUTION_PROOF_AGENT_SUBMIT_ACTION_TIMEOUT_MS', 15_000);
const AGENT_SUBMIT_PROOF_TIMEOUT_MS = positiveDurationFromEnv('SOLUTION_PROOF_AGENT_SUBMIT_PROOF_TIMEOUT_MS', 60_000);
const PREVIEW_TIMEOUT_MS = positiveDurationFromEnv('SOLUTION_PROOF_PREVIEW_TIMEOUT_MS', 5 * 60 * 1000);
const PREVIEW_RESTART_TIMEOUT_MS = 3 * 60 * 1000;
const RUNTIME_SYNC_GRACE_MS = positiveDurationFromEnv('SOLUTION_PROOF_RUNTIME_SYNC_GRACE_MS', 20_000);
const RUNTIME_SYNC_BUDGET_MS = positiveDurationFromEnv('SOLUTION_PROOF_RUNTIME_SYNC_BUDGET_MS', 6 * 60 * 1000);
const RUNTIME_SYNC_STABLE_MS = positiveDurationFromEnv('SOLUTION_PROOF_RUNTIME_SYNC_STABLE_MS', 12_000);
const RUNTIME_SYNC_POLL_MS = positiveDurationFromEnv('SOLUTION_PROOF_RUNTIME_SYNC_POLL_MS', 4_000);
const RUNTIME_WRITE_QUIESCENCE_MS = positiveDurationFromEnv('SOLUTION_PROOF_RUNTIME_WRITE_QUIESCENCE_MS', 30_000);

const RUNTIME_POST_CHAT_CHURN_RELOAD_MS = positiveDurationFromEnv(
  'SOLUTION_PROOF_RUNTIME_POST_CHAT_CHURN_RELOAD_MS',
  60_000,
);
const RUNTIME_POST_CHAT_CHURN_RECENCY_MS = positiveDurationFromEnv(
  'SOLUTION_PROOF_RUNTIME_POST_CHAT_CHURN_RECENCY_MS',
  5_000,
);

const RUNTIME_SYNC_MIN_MATCHING_READS = 4;
const RUNTIME_SYNC_MAX_WRITE_CYCLES = 3;

const PREVIEW_RUNTIME_ERROR_PATTERN =
  /internal server error|failed to resolve import|cannot find module|vite error|unexpected token|uncaught typeerror|plugin:vite|preview_upstream_unreachable|dev server on port .*not reachable|starting, or it crashed/i;
const PREVIEW_RECOVERABLE_NOT_RUNNING_PATTERN =
  /preview_upstream_unreachable|dev server on port .*not reachable|starting, or it crashed/i;

const SOLUTION_SCENARIOS = {
  'app-builder': {
    en: {
      prompt:
        'Create SalonFlow, a fictional local booking demo for a hair salon, with a calendar, customer profiles, and reminder previews. Display this persistent disclosure: Fictional local demo — no emails are sent; no real authentication or persistence. Add an Appointments navigation link that opens a dedicated view headed Upcoming appointments. Use realistic fictional local data only.',
      iterationPrompt:
        'Keep the SalonFlow booking demo fully testable in Webview. Preserve the Appointments link and its Upcoming appointments view. Keep the fictional-local-demo disclosure visible. Use orange for every primary action, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'App Builder proof EN',
      organizationName: 'App Builder proof EN',
      expectedTerms: ['SalonFlow', 'Fictional local demo'],
      interaction: { role: 'link', name: 'Appointments', expectedResult: 'Upcoming appointments' },
    },
    fr: {
      prompt:
        'SalonFlow : créez une démonstration locale fictive de réservation pour un salon de coiffure, avec agenda, profils clients et aperçus de rappels. Affichez en permanence cette mention : Démo locale fictive — aucun email n’est envoyé ; aucune authentification ni persistance réelles. Ajoutez un lien Rendez-vous qui ouvre une vue dédiée titrée Prochains rendez-vous. Utilisez uniquement des données locales fictives réalistes.',
      iterationPrompt:
        'Gardez la démonstration de réservation SalonFlow entièrement testable dans la Webview. Préservez le lien Rendez-vous et sa vue Prochains rendez-vous. Laissez visible la mention de démo locale fictive. Réservez l’orange aux actions principales, retirez tout violet, lancez le typecheck et vérifiez la vraie Webview.',
      accountName: 'Preuve App Builder FR',
      organizationName: 'Preuve App Builder FR',
      expectedTerms: ['SalonFlow', 'Démo locale fictive'],
      interaction: { role: 'link', name: 'Rendez-vous', expectedResult: 'Prochains rendez-vous' },
    },
  },
  'website-builder': {
    en: {
      prompt:
        'Meridian Studio: create a bespoke public presentation for a fictional architecture practice as one compact React and TypeScript interface in src/main.tsx and src/styles.css. Display a persistent Fictional local demo label on every view. Build five working views—Home, Projects, Studio, Journal, and Contact—with an architecture project gallery, practice profile, project notes, and a contact form using realistic fictional local content only. The contact form shows a local confirmation and never claims to send email. Use timeless fictional project entries without founding dates, awards, real clients, completed-client claims, or operational history. Keep the content entirely about buildings, materials, the practice, and its project process; omit developer biographies, résumés, skill lists, service packages, and technology showcases. Use a concrete, warm limestone, black ink, and orange editorial direction. No purple.',
      iterationPrompt:
        'Refine Meridian Studio for the Webview proof. Add a Projects navigation link that opens a dedicated view headed Selected work, with working project filters and project detail links. Keep the Fictional local demo label and local-only contact confirmation visible. Make orange the action color, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'Website proof EN',
      organizationName: 'Website proof EN',
      expectedTerms: ['Meridian Studio', 'Fictional local demo', 'Contact'],
      interaction: { role: 'link', name: 'Projects', expectedResult: 'Selected work' },
    },
    fr: {
      prompt:
        'Meridian Studio : créez une présentation publique sur mesure pour un cabinet d’architecture fictif dans une interface React et TypeScript compacte, contenue dans src/main.tsx et src/styles.css. Affichez la mention persistante Démo locale fictive sur chaque vue. Construisez cinq vues fonctionnelles — Accueil, Projets, Studio, Journal et Contact — avec une galerie de projets d’architecture, le profil du cabinet, des notes de projet et un formulaire de contact fondés uniquement sur des contenus locaux fictifs réalistes. Le formulaire affiche une confirmation locale et ne prétend jamais envoyer un email. Utilisez des projets fictifs intemporels, sans date de fondation, prix, vrais clients, réalisations présentées comme réelles ni historique d’activité. Consacrez tout le contenu aux bâtiments, aux matériaux, au cabinet et à sa démarche ; écartez biographies de développeur, CV, listes de compétences, forfaits de services et présentations technologiques. Adoptez une direction éditoriale béton, pierre chaude, encre noire et orange. Aucun violet.',
      iterationPrompt:
        'Affinez Meridian Studio pour la preuve Webview. Ajoutez un lien Projets qui ouvre une vue dédiée titrée Projets sélectionnés, avec filtres fonctionnels et fiches projet. Gardez visibles la mention Démo locale fictive et la confirmation locale du contact. Réservez l’orange aux actions, retirez tout violet, lancez le typecheck et vérifiez la vraie Webview.',
      accountName: 'Preuve Website FR',
      organizationName: 'Preuve Website FR',
      expectedTerms: ['Meridian Studio', 'Démo locale fictive', 'Contact'],
      interaction: { role: 'link', name: 'Projets', expectedResult: 'Projets sélectionnés' },
    },
  },
  'game-builder': {
    en: {
      prompt:
        'Create TriviaClash, a multiplayer-style quiz game demo with a lobby, timed questions, live local score updates, and a leaderboard. Use realistic fictional players and local in-memory data only; state clearly that no network multiplayer backend is connected. Build the working game flow in React and TypeScript. Use a dark-first arcade art direction with cyan, lime, and orange actions, plus a coherent bright-arcade light palette through the required application theme control. No purple.',
      iterationPrompt:
        'Make the TriviaClash demo fully testable in Webview. Add a Start quiz button that opens Question 1, a working answer selection, countdown, score update, and final leaderboard using local state. Keep the no-network-backend disclosure visible. Make primary actions orange, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'Game proof EN',
      organizationName: 'Game proof EN',
      expectedTerms: ['TriviaClash', 'local'],
      requiredSourceTerms: ['Leaderboard'],
      requiresDarkCanvas: true,
      interaction: {
        role: 'button',
        name: 'Start quiz',
        expectedResult: /(?:question\s*1|1\s*\/\s*\d|what planet)/i,
      },
    },
    fr: {
      prompt:
        'TriviaClash : créez une démo de quiz multijoueur avec salle d’attente, questions chronométrées, score local en temps réel et classement. Utilisez des joueurs fictifs réalistes et uniquement des données en mémoire ; indiquez clairement qu’aucun backend multijoueur réseau n’est connecté. Construisez le parcours fonctionnel en React et TypeScript. Adoptez une direction artistique arcade d’abord sombre, cyan, vert lime et actions orange, avec une palette arcade claire lumineuse et cohérente via le contrôle de thème applicatif exigé. Aucun violet.',
      iterationPrompt:
        'Rendez la démo TriviaClash entièrement testable dans la Webview. Ajoutez un bouton Démarrer le quiz qui ouvre Question 1, un choix de réponse fonctionnel, un compte à rebours, la mise à jour du score et le classement final en état local. Gardez visible la mention indiquant qu’aucun backend réseau n’est connecté. Réservez l’orange aux actions principales, retirez tout violet, lancez le typecheck puis vérifiez la vraie Webview.',
      accountName: 'Preuve Game FR',
      organizationName: 'Preuve Game FR',
      expectedTerms: ['TriviaClash', 'local'],
      requiredSourceTerms: ['Classement'],
      requiresDarkCanvas: true,
      interaction: {
        role: 'button',
        name: 'Démarrer le quiz',
        expectedResult: /(?:question\s*1|1\s*\/\s*\d|quelle planète)/i,
      },
    },
  },
  'dashboard-builder': {
    en: {
      prompt:
        'Create PipelineIQ, a sales dashboard connected to a clearly labeled local sample dataset, with revenue charts, pipeline stages, date and region filters, and a deals table. Do not claim a real external database connection. Build responsive accessible React and TypeScript views with a dense graphite, blue, green, and orange data theme. No purple.',
      iterationPrompt:
        'Improve PipelineIQ in Webview. Add working date and region controls plus an Apply filters button that updates every KPI and chart from local sample data and shows Filters applied. Include a target variance table. Keep the local-dataset disclosure visible. Make actions orange, remove every purple accent, run typecheck, and verify the real Webview.',
      accountName: 'Dashboard proof EN',
      organizationName: 'Dashboard proof EN',
      expectedTerms: ['PipelineIQ', 'Revenue', 'local sample'],
      interaction: { role: 'button', name: 'Apply filters', expectedResult: 'Filters applied' },
    },
    fr: {
      prompt:
        'PipelineIQ : créez un tableau de bord commercial connecté à un jeu de données local clairement indiqué, avec graphiques de chiffre d’affaires, étapes du pipeline, filtres de date et de région, et tableau des opportunités commerciales. Ne prétendez pas être connecté à une vraie base externe. Construisez une interface accessible et adaptative en React et TypeScript, avec un thème dense graphite, bleu, vert et orange. Aucun violet.',
      iterationPrompt:
        'Améliorez PipelineIQ dans la Webview. Ajoutez des contrôles fonctionnels de date et de région puis un bouton Appliquer les filtres qui met à jour les KPI et graphiques depuis les données locales et affiche Filtres appliqués. Ajoutez un tableau des écarts aux objectifs. Gardez visible la limite des données locales. Actions orange, aucun violet, typecheck puis vérification de la vraie Webview.',
      accountName: 'Preuve Dashboard FR',
      organizationName: 'Preuve Dashboard FR',
      expectedTerms: ['PipelineIQ', 'Données locales'],
      interaction: { role: 'button', name: 'Appliquer les filtres', expectedResult: 'Filtres appliqués' },
    },
  },
  'chatbot-builder': {
    en: {
      prompt:
        'Create HelpDesk Copilot, a customer support assistant that answers from a small fictional product documentation set stored locally. Include suggested questions, a conversation view, cited source cards, and an escalation state. Do not claim a live LLM, vector database, or external helpdesk connection. Build it in accessible responsive React and TypeScript with blue, warm gray, and orange actions. No purple.',
      iterationPrompt:
        'Make HelpDesk Copilot demonstrably interactive in Webview. Add the suggested question button How do I reset my password?; clicking it must produce a deterministic local answer with a cited Account access source and an escalation option. Keep the local-documentation limitation visible. Actions orange, no purple, typecheck, then verify the actual Webview.',
      accountName: 'Chatbot proof EN',
      organizationName: 'Chatbot proof EN',
      expectedTerms: ['HelpDesk Copilot', 'Sources', 'local'],
      interaction: { role: 'button', name: 'How do I reset my password?', expectedResult: 'Account access' },
    },
    fr: {
      prompt:
        'HelpDesk Copilot : créez un assistant d’assistance client qui répond depuis une petite documentation produit fictive stockée localement. Ajoutez des questions suggérées, une conversation, des cartes sources citées et un mécanisme de transfert vers un humain. Ne prétendez pas utiliser un LLM actif, une base vectorielle ou un outil d’assistance externe. Construisez une interface accessible et adaptative en React et TypeScript, avec du bleu, du gris chaud et des actions orange. Aucun violet.',
      iterationPrompt:
        'Rendez HelpDesk Copilot réellement interactif dans la Webview. Ajoutez le bouton suggéré Comment réinitialiser mon mot de passe ? ; son clic produit une réponse locale déterministe avec la source citée Accès au compte et une option de transfert à un humain. Gardez visible la limite de documentation locale. Actions orange, aucun violet, typecheck puis vérification de la vraie Webview.',
      accountName: 'Preuve Chatbot FR',
      organizationName: 'Preuve Chatbot FR',
      expectedTerms: ['HelpDesk Copilot', 'Sources', 'local'],
      interaction: {
        role: 'button',
        name: 'Comment réinitialiser mon mot de passe ?',
        expectedResult: 'Accès au compte',
      },
    },
  },
  'internal-ai-builder': {
    en: {
      prompt:
        'Create PeopleOps, an internal HR procedure search workspace for employees. Use a fictional local policy library with permissions shown only as a UI demo, cited procedure cards, search history, and a feedback state. Do not claim real authentication, RAG, SSO, or external document connections. Build accessible responsive React and TypeScript with forest green, warm neutral, and orange actions. No purple.',
      iterationPrompt:
        'Make PeopleOps verifiable in Webview. Add an Annual leave policy suggestion; clicking it must show a deterministic local answer with cited procedure HR-04 and a feedback control. Keep the local-library and demo-permissions limitation visible. Actions orange, remove all purple, run typecheck, and verify the real Webview.',
      accountName: 'Internal AI proof EN',
      organizationName: 'Internal AI proof EN',
      expectedTerms: ['PeopleOps', 'HR-04', 'local'],
      interaction: { role: 'button', name: 'Annual leave policy', expectedResult: 'HR-04' },
    },
    fr: {
      prompt:
        'PeopleOps : créez un espace interne de recherche dans les procédures RH pour les salariés. Utilisez une bibliothèque fictive locale, des permissions présentées uniquement comme démo d’interface, des cartes de procédures citées, un historique et un mécanisme de retour utilisateur. Ne prétendez pas avoir une authentification, un RAG, un SSO ou des documents externes réels. Construisez une interface accessible et adaptative en React et TypeScript, avec du vert forêt, des tons chauds et des actions orange. Aucun violet.',
      iterationPrompt:
        'Rendez PeopleOps vérifiable dans la Webview. Ajoutez la suggestion Politique de congés annuels ; son clic affiche une réponse locale déterministe avec la procédure citée RH-04 et un contrôle de retour utilisateur. Gardez visibles les limites de la bibliothèque locale et des permissions de démonstration. Réservez l’orange aux actions, retirez tout violet, lancez le typecheck puis vérifiez la vraie Webview.',
      accountName: 'Preuve Internal AI FR',
      organizationName: 'Preuve Internal AI FR',
      expectedTerms: ['PeopleOps', 'RH-04', 'locale'],
      interaction: { role: 'button', name: 'Politique de congés annuels', expectedResult: 'RH-04' },
    },
  },
  startups: {
    en: {
      prompt:
        'Create Launchpad, a launch cockpit for an early-stage startup team. Include onboarding funnel, waitlist, experiment board, customer interview notes, product milestones, and runway inputs using realistic fictional local sample data. Do not claim live analytics, billing, email, or database integrations. Build accessible responsive React and TypeScript with coral, teal, graphite, and orange actions. No purple.',
      iterationPrompt:
        'Make Launchpad interactive in Webview. Add an Add experiment button that opens a New experiment form, saves a local experiment card, and updates the board count. Keep all external integrations explicitly unconnected. Make actions orange, remove purple, run typecheck, and verify the actual Webview.',
      accountName: 'Startups proof EN',
      organizationName: 'Startups proof EN',
      expectedTerms: ['Launchpad', 'Experiments', 'local'],
      interaction: { role: 'button', name: 'Add experiment', expectedResult: 'New experiment' },
    },
    fr: {
      prompt:
        'Launchpad : créez un cockpit de lancement pour une équipe de startup en amorçage. Ajoutez un parcours d’intégration, une liste d’attente, un tableau d’expériences, des notes d’entretiens clients, des jalons produit et des paramètres de trésorerie avec des données locales fictives réalistes. Ne prétendez pas avoir d’outils d’analyse, de facturation, d’emails ou de base externe actifs. Construisez une interface accessible et adaptative en React et TypeScript, avec du corail, du bleu sarcelle, du graphite et des actions orange. Aucun violet.',
      iterationPrompt:
        'Rendez Launchpad interactif dans la Webview. Ajoutez un bouton Ajouter une expérience qui ouvre un formulaire Nouvelle expérience, enregistre une carte locale et met à jour le compteur. Gardez toutes les intégrations externes explicitement déconnectées. Actions orange, aucun violet, typecheck puis vérification de la vraie Webview.',
      accountName: 'Preuve Startups FR',
      organizationName: 'Preuve Startups FR',
      expectedTerms: ['Launchpad', 'Expériences', 'locales'],
      interaction: { role: 'button', name: 'Ajouter une expérience', expectedResult: 'Nouvelle expérience' },
    },
  },
  freelancers: {
    en: {
      prompt:
        'Create Studio Ferro, a client delivery workspace for a freelance designer. Include project status, deliverables, feedback threads, proposal, invoice status, time log, and a client approval flow using realistic fictional local data. Do not claim real payments, signatures, emails, or client authentication. Build accessible responsive React and TypeScript with clay, ink, sage, and orange actions. No purple.',
      iterationPrompt:
        'Make Studio Ferro demonstrably interactive in Webview. Add a Review delivery button that opens a deliverable panel headed Approval requested with local approve and request-changes controls. Keep payments, signatures, email, and auth explicitly unconnected. Make actions orange, remove purple, run typecheck, and verify the actual Webview.',
      accountName: 'Freelancers proof EN',
      organizationName: 'Freelancers proof EN',
      expectedTerms: ['Studio Ferro', 'Deliverables', 'local'],
      interaction: { role: 'button', name: 'Review delivery', expectedResult: 'Approval requested' },
    },
    fr: {
      prompt:
        'Studio Ferro : créez un espace de livraison client pour un designer freelance. Ajoutez le statut du projet, les livrables, les fils de commentaires, la proposition, le statut de la facture, le suivi du temps et le parcours de validation client avec des données locales fictives réalistes. Ne prétendez pas avoir de paiements, de signatures, d’emails ou d’authentification client réels. Construisez une interface accessible et adaptative en React et TypeScript, avec des tons argile, encre et sauge, et des actions orange. Aucun violet.',
      iterationPrompt:
        'Rendez Studio Ferro réellement interactif dans la Webview. Ajoutez un bouton Examiner le livrable qui ouvre un panneau titré Validation demandée avec des contrôles locaux pour approuver ou demander des modifications. Indiquez explicitement que les paiements, signatures, emails et l’authentification ne sont pas connectés. Réservez l’orange aux actions, retirez tout violet, lancez le typecheck puis vérifiez la vraie Webview.',
      accountName: 'Preuve Freelancers FR',
      organizationName: 'Preuve Freelancers FR',
      expectedTerms: ['Studio Ferro', 'Livrables', 'locales'],
      interaction: { role: 'button', name: 'Examiner le livrable', expectedResult: 'Validation demandée' },
    },
  },
  enterprise: {
    en: {
      prompt:
        'Create Northwind Control, a governed organization console for a fictional platform engineering team. Include members, role boundaries, an audit event feed, deployment approvals, SSO and SCIM readiness, and private-runtime planning using realistic fictional local data only. Clearly state that identity, provisioning, audit export, and deployment integrations are demonstrations and require tenant validation before production enablement. Do not claim a live identity provider, directory, runtime, or deployment connection. Build accessible responsive React and TypeScript with navy, slate, green, and orange actions. No purple.',
      iterationPrompt:
        'Make Northwind Control verifiable in Webview. Add an Export audit log button that opens a local Export ready panel listing the fictional event scope, and a Review access button that opens a role-review view. Keep every integration limitation visible. Make primary actions orange, remove every purple accent, run typecheck, and verify the actual Webview.',
      accountName: 'Enterprise proof EN',
      organizationName: 'Enterprise proof EN',
      expectedTerms: ['Northwind Control', 'Audit', 'local'],
      requiredSourceTerms: ['SSO', 'SCIM'],
      interaction: { role: 'button', name: 'Export audit log', expectedResult: 'Export ready' },
    },
    fr: {
      prompt:
        'Northwind Control : créez une console de gouvernance pour une équipe plateforme fictive. Ajoutez les membres, les limites de rôles, un journal d’audit, les approbations de déploiement, l’état de préparation SSO et SCIM, et la planification d’un runtime privé, uniquement avec des données locales fictives réalistes. Indiquez clairement que l’identité, le provisionnement, l’export d’audit et les intégrations de déploiement sont des démonstrations qui exigent une validation du tenant avant activation en production. Ne prétendez pas être connecté à un fournisseur d’identité, un annuaire, un runtime ou une plateforme de déploiement réels. Construisez une interface React et TypeScript accessible et adaptative, bleu nuit, ardoise, verte, avec des actions orange. Aucun violet.',
      iterationPrompt:
        'Rendez Northwind Control vérifiable dans la Webview. Ajoutez un bouton Exporter le journal qui ouvre un panneau Export prêt listant le périmètre fictif des événements, et un bouton Examiner les accès qui ouvre la revue des rôles. Gardez visibles toutes les limites d’intégration. Réservez l’orange aux actions principales, retirez tout violet, lancez le typecheck et vérifiez la vraie Webview.',
      accountName: 'Preuve Enterprise FR',
      organizationName: 'Preuve Enterprise FR',
      expectedTerms: ['Northwind Control', 'Audit', 'locales'],
      requiredSourceTerms: ['SSO', 'SCIM'],
      interaction: { role: 'button', name: 'Exporter le journal', expectedResult: 'Export prêt' },
    },
  },
} as const satisfies Record<CaptureSlug, Record<CaptureLocale, SolutionScenario>>;

function readSlug(): CaptureSlug {
  const solutionValue = process.argv.find((argument) => argument.startsWith('--solution='))?.split('=')[1];
  const slugValue = process.argv.find((argument) => argument.startsWith('--slug='))?.split('=')[1];

  if (solutionValue && slugValue && solutionValue !== slugValue) {
    throw new Error(`Conflicting solution arguments: --solution=${solutionValue} and --slug=${slugValue}`);
  }

  const value = solutionValue ?? slugValue ?? 'app-builder';

  if (value in SOLUTION_SCENARIOS) {
    return value as CaptureSlug;
  }

  throw new Error(`Unknown solution ${value}`);
}

function appBuilderFallback(slug: CaptureSlug, value: string | undefined) {
  return slug === 'app-builder' ? value?.trim() : undefined;
}

function errorMessageChain(error: unknown) {
  const messages: string[] = [];
  const seen = new Set<unknown>();

  let current = error;

  while (current instanceof Error && !seen.has(current) && messages.length < 8) {
    seen.add(current);
    messages.push(current.message);
    current = current.cause;
  }

  if (messages.length === 0) {
    messages.push(String(error));
  }

  return messages.join(' <- ');
}

function errorStackChain(error: unknown) {
  const stacks: string[] = [];
  const seen = new Set<unknown>();

  let current = error;

  while (current instanceof Error && !seen.has(current) && stacks.length < 8) {
    seen.add(current);
    stacks.push(current.stack ?? current.message);
    current = current.cause;
  }

  if (stacks.length === 0) {
    stacks.push(String(error));
  }

  return stacks.join('\nCaused by: ');
}

function generatedAppThemeContractFor(locale: CaptureLocale, scenario: SolutionScenario) {
  const gameDirection = scenario.requiresDarkCanvas
    ? locale === 'fr'
      ? ' Pour TriviaClash, gardez la palette sombre comme direction arcade principale. Sa palette claire doit être une vraie variante arcade lumineuse, avec surfaces neutres claires, encre sombre et la même hiérarchie cyan, vert lime et orange ; ne forcez jamais la surface sombre lorsque le thème clair est actif.'
      : ' For TriviaClash, keep the dark palette as the primary arcade art direction. Its light palette must be a deliberate bright-arcade variant with pale neutral surfaces, dark ink, and the same cyan, lime, and orange hierarchy; never force the dark canvas while light theme is active.'
    : '';

  return locale === 'fr'
    ? ` Implémentez deux thèmes applicatifs complets et réellement distincts, clair et sombre, sur toutes les surfaces et tous les contrôles, avec des variables ou règles CSS propres à chaque thème : fonds clairs et texte sombre en mode clair, fonds sombres et texte clair en mode sombre. Ne simulez jamais la variante en inversant, filtrant, recolorant ou modifiant l’opacité d’une capture. Au chargement, initialisez le thème depuis window.matchMedia('(prefers-color-scheme: dark)').matches. Affichez sur chaque vue un vrai élément button avec type="button" et data-testid="app-theme-toggle", visible et utilisable au clavier, dont le texte visible, aria-label et title valent exactement Passer en mode clair lorsque le thème actif est sombre, puis Passer en mode sombre lorsqu’il est clair. Son clic doit basculer le thème de cette application sans rechargement, mettre immédiatement document.documentElement.dataset.theme à exactement light ou dark, mettre à jour son libellé et aria-pressed, et conserver le contrôle visible sans troncature sur ordinateur, tablette et mobile.${gameDirection}`
    : ` Implement two complete, genuinely distinct application themes, light and dark, across every surface and control, using theme-specific CSS variables or rules: light backgrounds with dark text in light mode, and dark backgrounds with light text in dark mode. Never fake the variant by inverting, filtering, recoloring, or changing the opacity of a capture. On load, initialize the theme from window.matchMedia('(prefers-color-scheme: dark)').matches. On every view, render a real button element with type="button" and data-testid="app-theme-toggle" that is visible and keyboard accessible, with visible text, aria-label, and title set exactly to Switch to light mode while dark theme is active, then Switch to dark mode while light theme is active. Clicking it must switch this application’s theme without a reload, immediately set document.documentElement.dataset.theme to exactly light or dark, update its label and aria-pressed, and keep the control visible without clipping on desktop, tablet, and mobile.${gameDirection}`;
}

function generatedOrangeActionContractFor(locale: CaptureLocale, scenario: SolutionScenario) {
  const { name, role } = scenario.interaction;

  return locale === 'fr'
    ? ` Dès le premier rendu, avant toute saisie, tout clic, survol ou focus, l’action métier de rôle ${role} dont le nom accessible exact est « ${name} » doit se trouver dans la fenêtre initiale, être visible, activée et réellement exécuter le parcours demandé. Appliquez un accent orange saturé directement sur cet élément interactif dans son état initial activé : au moins une de ses propriétés CSS calculées background-color, border-color ou color doit être orange. Une variable CSS déclarée mais non rendue, un parent ou enfant décoratif, un pseudo-élément, un état désactivé, ou un style uniquement :hover/:focus ne satisfait pas ce contrat. Il doit donc exister au premier rendu au moins une action orange visible, activée et utilisable, tout en conservant un contraste WCAG AA.`
    : ` On the first render, before any typing, click, hover, or focus, the ${role} whose exact accessible name is “${name}” must be inside the initial viewport, visible, enabled, and actually perform the required workflow. Apply a saturated orange accent directly to that interactive element in its initial enabled state: at least one of its computed CSS background-color, border-color, or color properties must be orange. A declared-but-unrendered CSS variable, decorative parent or child, pseudo-element, disabled state, or hover/focus-only style does not satisfy this contract. The first render must therefore expose at least one visible, enabled, usable orange action while retaining WCAG AA contrast.`;
}

function creationPromptFor(
  slug: CaptureSlug,
  locale: CaptureLocale,
  scenario: SolutionScenario,
  { includeInteractionAcceptance = false }: { includeInteractionAcceptance?: boolean } = {},
) {
  const packageContract = generatedSolutionPackageContractFor(locale);

  const runtimeContract =
    locale === 'fr'
      ? `${packageContract} Gardez le reste du runtime généré volontairement fiable : une interface Vite, React et TypeScript avec index.html, src/main.tsx et src/styles.css. Conservez toute l’interface fonctionnelle et son état local dans src/main.tsx et src/styles.css ; ne créez ni App.tsx ni fichier de composant supplémentaire. Gardez src/main.tsx sous 350 lignes et src/styles.css sous 300 lignes, avec une source compacte et sans commentaires explicatifs. N’ajoutez ni tests, ni backend, ni package de routage, ni bibliothèque de composants. Enregistrez uniquement des fichiers source complets et valides ; si l’espace manque, simplifiez la décoration au lieu de tronquer ou poursuivre un fichier. N’insérez jamais de balises antml, boltArtifact, boltAction, XML ou Markdown dans un fichier enregistré. La première route rendue doit afficher immédiatement le produit nommé.`
      : `${packageContract} Keep the rest of the generated runtime deliberately reliable: a Vite React TypeScript frontend with index.html, src/main.tsx, and src/styles.css. Keep the entire working UI and local state in src/main.tsx and src/styles.css; do not create App.tsx or extra component files. Keep src/main.tsx under 350 lines and src/styles.css under 300 lines, with compact source and no explanatory comments. Do not add tests, a backend, a router package, or a component library. Save only complete valid source files; if space is tight, simplify decoration rather than truncating or continuing a file. Never include antml, boltArtifact, boltAction, XML, or markdown wrappers in a saved file. Make the first rendered route immediately show the named product.`;

  const interactionContract = includeInteractionAcceptance
    ? locale === 'fr'
      ? ` La génération initiale doit aussi satisfaire entièrement ce critère d’interaction : ${scenario.iterationPrompt}`
      : ` The initial build must also satisfy this complete interaction acceptance requirement: ${scenario.iterationPrompt}`
    : '';

  const authenticityContract =
    slug === 'website-builder'
      ? locale === 'fr'
        ? ' Respectez exclusivement l’identité et le contenu architectural de Meridian Studio. Rédigez en français professionnel tous les textes visibles, sauf les marques, le code et les termes techniques explicitement demandés, et vouvoyez toujours l’utilisateur. Dessinez les visuels de l’interface dans le code ou utilisez uniquement des ressources locales incluses. N’intégrez aucune image, banque d’images, police, script ou feuille de style distante.'
        : ' Keep every visible name, section, and interaction specific to the Meridian Studio architecture practice. Write every visible interface string in professional English, except code and explicitly requested technical terms. Draw interface visuals in code or use bundled local assets only. Do not hotlink remote images, stock-photo services, fonts, scripts, or stylesheets.'
      : locale === 'fr'
        ? ' Ne laissez pas de modèle de départ générique et ne réutilisez pas le contenu d’un gabarit sans rapport : le nom du produit, le contenu et les parcours visibles doivent respecter ce brief. Rédigez en français professionnel tous les textes visibles de l’interface, sauf les marques, le code et les termes techniques explicitement demandés, et vouvoyez toujours l’utilisateur. Dessinez les visuels de l’interface dans le code ou utilisez uniquement des ressources locales incluses. N’intégrez aucune image, banque d’images, police, script ou feuille de style distante.'
        : ' Do not leave a generic starter or reuse unrelated template copy; the visible product name, content, and workflows must match this brief. Write every visible interface string in professional English, except brands, code, and explicitly requested technical terms. Draw interface visuals in code or use bundled local assets only. Do not hotlink remote images, stock-photo services, fonts, scripts, or stylesheets.';

  const appThemeContract = generatedAppThemeContractFor(locale, scenario);
  const orangeActionContract = generatedOrangeActionContractFor(locale, scenario);

  return `${scenario.prompt}${interactionContract}${authenticityContract}${orangeActionContract}${appThemeContract}${runtimeContract}`;
}

function repairPromptFor(slug: CaptureSlug, locale: CaptureLocale, scenario: SolutionScenario, attempt: number) {
  const configuredPrompt =
    process.env.SOLUTION_PROOF_REPAIR_PROMPT?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_REPAIR_PROMPT);

  const appIdentity = scenario.expectedTerms.join(', ');

  const basePrompt =
    configuredPrompt ??
    (locale === 'fr'
      ? `La Webview réelle est vide ou contient une erreur de runtime. Inspectez les fichiers exacts enregistrés dans le projet, les diagnostics Vite actuels et chaque entrée du panneau IDE Problems. Remplacez tout fichier runtime vide ou tronqué, retirez la prose accidentelle ainsi que les enveloppes markdown, boltArtifact et boltAction des fichiers source, puis corrigez chaque erreur TypeScript, d’import, de syntaxe, de test et de runtime jusqu’à ce que Problems affiche zéro erreur. Préservez l’identité de cette app et son périmètre local vérifié : ${appIdentity}. Supprimez les URLs distantes d’images, de polices, de scripts et de feuilles de style ; utilisez des ressources dessinées dans le code ou incluses localement. Lancez le typecheck et le serveur de développement, puis n’annoncez la réussite qu’après avoir vérifié que la Webview réelle contient l’app. N’ajoutez aucun service externe, secret ou affirmation non étayée.`
      : `The actual Webview is blank or contains a runtime error. Inspect the exact saved project files, current Vite diagnostics, and every entry in the IDE Problems panel. Replace every empty or truncated runtime file, remove accidental prose, markdown, boltArtifact, and boltAction wrappers from source files, then fix every TypeScript, import, syntax, test, and runtime error until Problems shows zero errors. Preserve this app's identity and verified local-only scope: ${appIdentity}. Remove remote image, font, script, and stylesheet URLs; use code-drawn or bundled local assets. Run typecheck, start the dev server, and only report success after the actual Webview contains the app. Do not add any external service, secret, or unsupported claim.`);

  if (attempt === 1) {
    return basePrompt;
  }

  return locale === 'fr'
    ? `${basePrompt} Il s’agit de la tentative de réparation ${attempt} ; la réparation précédente a laissé la Webview invalide. Ne vous fiez pas au précédent message de réussite. Relisez le contenu exact des fichiers actuels et vérifiez le texte visible dans la Webview avant de répondre.`
    : `${basePrompt} This is repair attempt ${attempt}; the previous repair still left the Webview invalid. Do not trust the previous success message. Re-read the exact current file contents and verify visible Webview text before answering.`;
}

function identityRepairPromptFor(locale: CaptureLocale, scenario: SolutionScenario, iterationBrief: string) {
  return locale === 'fr'
    ? `${iterationBrief}La Webview visible affiche encore une interface générique sans rapport et n’implémente pas le produit ${scenario.expectedTerms[0]} demandé. Remplacez toute identité, tout texte, toute donnée d’exemple et tout parcours génériques par le brief dédié de mon prompt initial. L’interface rendue doit contenir visiblement les termes exacts suivants : ${scenario.expectedTerms.join(', ')}. Utilisez uniquement des exemples locaux fictifs réalistes, signalez clairement les limites et retirez toute affirmation inventée sur la performance, l’adoption, le chiffre d’affaires, les clients ou les délais de livraison. Gardez chaque ressource locale, réservez l’orange aux actions principales et n’utilisez aucun violet. Vérifiez la Webview réelle avant de répondre.`
    : `${iterationBrief}The visible Webview is still an unrelated generic template and does not implement the requested ${scenario.expectedTerms[0]} product. Replace all generic starter branding, copy, sample metrics, and workflows with the dedicated brief from my original prompt. The rendered interface must visibly contain these exact theme terms: ${scenario.expectedTerms.join(', ')}. Use only realistic fictional local sample content, label limitations clearly, and remove fabricated performance, adoption, revenue, customer, or delivery claims. Keep every asset local, keep primary actions orange, and use no purple. Verify the actual Webview before answering.`;
}

function themeRepairPromptFor(locale: CaptureLocale, scenario: SolutionScenario, iterationBrief: string) {
  const darkCanvasInstruction = scenario.requiresDarkCanvas
    ? locale === 'fr'
      ? ' En mode sombre, affichez toute l’application sur une surface sombre intentionnelle qui couvre la Webview, avec des contrôles stylés ; ne laissez aucune interface blanche par défaut du navigateur.'
      : ' In dark mode, render the entire application on a deliberate dark full-canvas surface with styled controls; do not leave browser-default white UI.'
    : '';

  const appThemeContract = generatedAppThemeContractFor(locale, scenario);
  const orangeActionContract = generatedOrangeActionContractFor(locale, scenario);

  return locale === 'fr'
    ? `${iterationBrief}La Webview réelle de ${scenario.expectedTerms[0]} ne respecte pas la palette demandée. Préservez chaque parcours existant et chaque limite locale, retirez tout accent violet, mauve ou rose et utilisez l’orange pour les actions principales visibles.${darkCanvasInstruction}${orangeActionContract}${appThemeContract} Gardez toutes les images, polices, scripts et feuilles de style en local. Vérifiez les deux thèmes dans la Webview rendue avant d’annoncer la réussite.`
    : `${iterationBrief}The actual Webview for ${scenario.expectedTerms[0]} does not match the requested palette. Preserve every existing workflow and local-only limitation, remove every purple, violet, mauve, and pink accent, and use orange for visible primary actions.${darkCanvasInstruction}${orangeActionContract}${appThemeContract} Keep all images, fonts, scripts, and styles local. Verify both themes in the rendered Webview before reporting success.`;
}

function escapedPattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function selectCreationModel(page: Page) {
  const providerName = process.env.SOLUTION_PROOF_AI_PROVIDER?.trim();
  const modelName = process.env.SOLUTION_PROOF_AI_MODEL?.trim();

  if (!providerName && !modelName) {
    return;
  }

  if (providerName) {
    const providerCombobox = page
      .getByTestId('ai-provider-dropdown')
      .getByRole('combobox', { name: /^(?:AI provider|Fournisseur d[’']IA)$/i });

    const providerSelectorAvailable = await providerCombobox
      .waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (!providerSelectorAvailable) {
      process.stdout.write(`${JSON.stringify({ status: 'creation-model-selector-unavailable' })}\n`);

      return;
    }

    await providerCombobox.click();
    await page
      .getByRole('option', { name: new RegExp(escapedPattern(providerName), 'i') })
      .first()
      .click();
    await expect(providerCombobox).toContainText(new RegExp(escapedPattern(providerName), 'i'));
  }

  if (modelName) {
    const modelCombobox = page
      .getByTestId('ai-model-dropdown')
      .getByRole('combobox', { name: /^(?:AI model|Modèle d[’']IA)$/i });

    await expect(modelCombobox).toBeVisible({ timeout: 30_000 });
    await modelCombobox.click();
    await page
      .getByRole('option', { name: new RegExp(escapedPattern(modelName), 'i') })
      .first()
      .click();
    await expect(modelCombobox).toContainText(new RegExp(escapedPattern(modelName), 'i'));
  }
}

async function appendCreationModelFormFields(page: Page) {
  const providerName = process.env.SOLUTION_PROOF_AI_PROVIDER?.trim();
  const modelName = process.env.SOLUTION_PROOF_AI_MODEL?.trim();

  if (!providerName && !modelName) {
    return;
  }

  const form = page.getByRole('form', {
    name: /^(?:Create project form|Formulaire de création de projet)$/i,
  });

  await expect(form).toBeVisible({ timeout: 30_000 });
  await form.evaluate(
    (formElement, values) => {
      type EvaluatedInput = { name: string; type: string; value: string };

      const evaluatedForm = formElement as unknown as {
        appendChild: (input: EvaluatedInput) => void;
        ownerDocument: { createElement: (tagName: string) => EvaluatedInput };
        querySelector: (selector: string) => EvaluatedInput | null;
      };

      for (const [name, value] of Object.entries(values)) {
        if (!value) {
          continue;
        }

        let input = evaluatedForm.querySelector(`input[name="${name}"]`);

        if (!input) {
          input = evaluatedForm.ownerDocument.createElement('input');
          input.type = 'hidden';
          input.name = name;
          evaluatedForm.appendChild(input);
        }

        input.value = value;
      }
    },
    {
      model: process.env.SOLUTION_PROOF_AI_MODEL?.trim(),
      provider: process.env.SOLUTION_PROOF_AI_PROVIDER?.trim(),
    },
  );

  if (providerName) {
    await expect(form.locator('input[name="provider"]')).toHaveValue(providerName);
  }

  if (modelName) {
    await expect(form.locator('input[name="model"]')).toHaveValue(modelName);
  }

  process.stdout.write(
    `${JSON.stringify({ status: 'creation-model-form-fields-applied', provider: providerName, model: modelName })}\n`,
  );
}

function readLocale(): CaptureLocale {
  const value = process.argv.find((argument) => argument.startsWith('--locale='))?.split('=')[1];

  if (value === 'en' || value === 'fr') {
    return value;
  }

  throw new Error('Pass --locale=en or --locale=fr');
}

async function waitForRateLimitReset(responseText: string, retryAfter: string | undefined, fallbackMs = 10_000) {
  const bodySeconds = Number(responseText.match(/retry in (\d+) seconds/i)?.[1]);
  const headerSeconds = Number(retryAfter);
  const headerDateMs = retryAfter && !Number.isFinite(headerSeconds) ? Date.parse(retryAfter) - Date.now() : Number.NaN;

  const waitMs = Number.isFinite(headerSeconds)
    ? (headerSeconds + 1) * 1000
    : Number.isFinite(headerDateMs)
      ? Math.max(headerDateMs + 1_000, 1_000)
      : Number.isFinite(bodySeconds)
        ? (bodySeconds + 1) * 1000
        : fallbackMs;

  await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));
}

async function authenticate(
  page: Page,
  slug: CaptureSlug,
  locale: CaptureLocale,
  copy: SolutionScenario,
  resumeSession?: CaptureSession,
) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const existingEmail =
    resumeSession?.email ??
    process.env.SOLUTION_PROOF_EMAIL?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_EMAIL);

  const existingPassword =
    resumeSession?.password ??
    process.env.SOLUTION_PROOF_PASSWORD?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_PASSWORD);

  const registrationPassword = `Ecode-${randomBytes(24).toString('base64url')}-9a!`;

  if (existingEmail && !existingPassword) {
    throw new Error('SOLUTION_PROOF_PASSWORD is required when SOLUTION_PROOF_EMAIL is set');
  }

  let responseText = '';
  let payload: { token: string } | undefined;
  let authenticatedEmail = existingEmail;
  let authenticatedPassword = existingPassword;

  if (existingEmail) {
    const response = await page.request.post(`${API_BASE_URL}/auth/login`, {
      data: { email: existingEmail, password: existingPassword },
    });

    responseText = await response.text();

    if (!response.ok()) {
      throw new Error(`Login failed (${response.status()}): ${responseText}`);
    }

    payload = JSON.parse(responseText) as { token: string };
  }

  for (let attempt = 0; !payload && attempt < 4; attempt += 1) {
    const registrationEmail = `${slug}-proof-${locale}-${suffix}-${attempt}@local.test`;

    const response = await page.request.post(`${API_BASE_URL}/auth/register`, {
      data: {
        email: registrationEmail,
        password: registrationPassword,
        name: copy.accountName,
        organizationName: `${copy.organizationName} ${suffix}-${attempt}`,
      },
    });

    responseText = await response.text();

    if (response.ok()) {
      payload = JSON.parse(responseText) as { token: string };
      authenticatedEmail = registrationEmail;
      authenticatedPassword = registrationPassword;
      break;
    }

    if (response.status() === 429 && attempt < 3) {
      await waitForRateLimitReset(responseText, response.headers()['retry-after']);
      continue;
    }

    throw new Error(`Registration failed (${response.status()}): ${responseText}`);
  }

  if (!payload) {
    throw new Error(`Registration did not return a session: ${responseText}`);
  }

  if (!authenticatedEmail || !authenticatedPassword) {
    throw new Error('Authentication did not retain resumable proof credentials');
  }

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      url: APP_BASE_URL,
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'vibecore-lang',
      value: locale,
      url: APP_BASE_URL,
      sameSite: 'Lax',
    },
  ]);

  return { token: payload.token, email: authenticatedEmail, password: authenticatedPassword };
}

async function readCaptureSession(path: string) {
  const payload = JSON.parse(await readFile(path, 'utf8')) as Partial<CaptureSession>;

  if (!payload.email || !payload.password || !payload.projectId) {
    throw new Error('The local proof session is incomplete and cannot be resumed');
  }

  return payload as CaptureSession & { projectId: string };
}

async function persistCaptureSession(path: string, session: CaptureSession & { projectId: string }) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(session)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600);
}

async function resolveProjectId(page: Page, token: string) {
  const url = new URL(page.url());
  const legacyProjectId = url.pathname.match(/\/projects\/([^/]+)\/ide/)?.[1];

  if (legacyProjectId) {
    return legacyProjectId;
  }

  const canonicalMatch = url.pathname.match(/^\/@([^/]+)\/([^/?]+)\/?$/);

  if (!canonicalMatch) {
    throw new Error(`Could not read project route from ${page.url()}`);
  }

  const [, accountSlug, projectSlug] = canonicalMatch;

  const response = await page.request.get(
    `${API_BASE_URL}/projects/resolve?accountSlug=${encodeURIComponent(decodeURIComponent(accountSlug))}&projectSlug=${encodeURIComponent(decodeURIComponent(projectSlug))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );

  if (!response.ok()) {
    throw new Error(`Project resolution failed (${response.status()}): ${await response.text()}`);
  }

  const payload = (await response.json()) as { project?: { id?: string } };

  if (!payload.project?.id) {
    throw new Error(`Project resolution returned no id for ${page.url()}`);
  }

  return payload.project.id;
}

async function waitForGeneratedFiles(
  page: Page,
  projectId: string,
  token: string,
  { requireApplication = true }: { requireApplication?: boolean } = {},
) {
  let lastPaths: string[] = [];

  await expect
    .poll(
      async () => {
        const projectState = await readProjectIdeState(page, projectId, token);

        if (!projectState) {
          return false;
        }

        lastPaths = projectState.files.flatMap((file) => (file.path ? [file.path] : []));

        const hasPackage = lastPaths.some((path) => /(^|\/)package\.json$/.test(path));
        const hasApplication = lastPaths.some((path) => /(^|\/)(App\.(?:tsx|jsx)|main\.(?:tsx|jsx|js))$/.test(path));

        return hasPackage && (!requireApplication || hasApplication);
      },
      {
        message: requireApplication
          ? 'The real agent run must create package.json and application source files'
          : 'The repairable agent run must persist at least package.json',
        intervals: [1_000, 2_000, 3_000],
        timeout: GENERATION_TIMEOUT_MS,
      },
    )
    .toBe(true);

  return lastPaths;
}

type ProjectIdeState = {
  chat?: PersistedPromptChatState;
  files: ProjectFileEntry[];
  version?: number;
};

async function readProjectIdeState(page: Page, projectId: string, token: string): Promise<ProjectIdeState | undefined> {
  try {
    const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/ide-state`, {
      headers: { authorization: `Bearer ${token}` },
      timeout: 20_000,
    });

    if (!response.ok()) {
      return undefined;
    }

    const payload = (await response.json()) as {
      ideState?: {
        version?: number;
        state?: {
          chat?: PersistedPromptChatState;
          files?: {
            entries?: ProjectFileEntry[];
          };
        };
      } | null;
    };

    if (!payload.ideState) {
      return undefined;
    }

    return {
      chat: payload.ideState.state?.chat,
      version: payload.ideState.version,
      files: payload.ideState.state?.files?.entries ?? [],
    };
  } catch {
    return undefined;
  }
}

async function assertGeneratedSourcesAreUnwrapped(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new Error('The generated IDE state is unavailable before preview verification');
  }

  const invalidPaths = projectState.files.flatMap((file) => {
    const path = file.path ?? '';
    const content = file.content ?? '';
    const isRuntimeSource = /(?:^|\/)(?:package|tsconfig(?:\.node)?)\.json$|\.(?:css|html|jsx?|tsx?)$/i.test(path);

    return isRuntimeSource &&
      /<\/?antml(?::[\w-]+)?\b|<\/?bolt(?:Artifact|Action)\b|<\/?(?:function_calls|invoke|parameter)\b|```/i.test(
        content,
      )
      ? [path]
      : [];
  });

  if (invalidPaths.length > 0) {
    throw new Error(`Generated source contains response-wrapper markers: ${invalidPaths.join(', ')}`);
  }
}

async function assertGeneratedSolutionPackagePolicy(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new GeneratedSolutionPackagePolicyError(
      'The persisted IDE state is unavailable for the generated package policy gate',
    );
  }

  const packageFiles = projectState.files.filter((file) => /(?:^|\/)package\.json$/u.test(file.path ?? ''));
  const rootPackageFiles = packageFiles.filter((file) => file.path === 'package.json');

  if (rootPackageFiles.length !== 1) {
    const discoveredPaths = packageFiles.flatMap((file) => (file.path ? [file.path] : []));
    const detail = discoveredPaths.length > 0 ? discoveredPaths.join(', ') : 'none';

    throw new GeneratedSolutionPackagePolicyError(
      `Generated package policy requires exactly one root package.json (found root=${rootPackageFiles.length}; discovered=${detail})`,
    );
  }

  if (packageFiles.length !== 1) {
    throw new GeneratedSolutionPackagePolicyError(
      `Generated package policy forbids nested or additional manifests: ${packageFiles
        .flatMap((file) => (file.path ? [file.path] : []))
        .join(', ')}`,
    );
  }

  const source = rootPackageFiles[0].content;

  if (typeof source !== 'string') {
    throw new GeneratedSolutionPackagePolicyError('The persisted root package.json has no textual content');
  }

  const result = validateGeneratedSolutionPackageJson(source);

  if (!result.valid) {
    throw new GeneratedSolutionPackagePolicyError(
      `Generated root package.json violates the closed Solutions dependency policy:\n- ${result.errors.join('\n- ')}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({ status: 'generated-package-policy-verified', projectId, packagePath: 'package.json' })}\n`,
  );
}

async function assertScenarioSourceTerms(page: Page, projectId: string, token: string, scenario: SolutionScenario) {
  if (!scenario.requiredSourceTerms?.length) {
    return;
  }

  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new Error('The generated IDE state is unavailable before source-content verification');
  }

  const sourceText = projectState.files
    .filter((file) => /\.(?:css|html|jsx?|tsx?)$/i.test(file.path ?? ''))
    .map((file) => file.content ?? '')
    .join('\n')
    .toLocaleLowerCase();

  const missingTerms = scenario.requiredSourceTerms.filter((term) => !sourceText.includes(term.toLocaleLowerCase()));

  if (missingTerms.length > 0) {
    throw new Error(`Generated source is missing required product behavior terms: ${missingTerms.join(', ')}`);
  }
}

async function resolveRuntimeWorkspace(page: Page, projectId: string, token: string) {
  const response = await page.request.get(`${API_BASE_URL}/projects/${encodeURIComponent(projectId)}/workspaces`, {
    headers: { authorization: `Bearer ${token}` },
    timeout: 20_000,
  });

  if (!response.ok()) {
    return undefined;
  }

  const payload = (await response.json()) as { workspaces?: RuntimeWorkspace[] };

  const candidates =
    payload.workspaces?.filter((workspace): workspace is RuntimeWorkspace => Boolean(workspace.id)) ?? [];

  for (const workspace of candidates) {
    const statusResponse = await page.request
      .get(`${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/status`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      })
      .catch(() => undefined);

    if (!statusResponse?.ok()) {
      continue;
    }

    const statusPayload = (await statusResponse.json()) as { status?: string };

    if (statusPayload.status === 'running') {
      return workspace;
    }
  }

  return candidates.find((workspace) => workspace.status === 'RUNNING') ?? candidates[0];
}

async function runtimeFileContent(page: Page, workspaceId: string, token: string, path: string) {
  const response = await page.request
    .get(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 45_000,
      },
    )
    .catch((error: unknown) => {
      const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);

      process.stdout.write(`${JSON.stringify({ status: 'runtime-file-read-unavailable', path, reason })}\n`);

      return undefined;
    });

  if (!response?.ok()) {
    return undefined;
  }

  const payload = (await response.json()) as { content?: string; encoding?: string };

  if (typeof payload.content !== 'string') {
    return undefined;
  }

  return {
    content: payload.content,
    encoding: payload.encoding === 'base64' ? ('base64' as const) : ('utf8' as const),
  };
}

async function readPersistedRuntimeSnapshot(
  page: Page,
  projectId: string,
  token: string,
): Promise<PersistedRuntimeSnapshot> {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new Error('The authoritative persisted files are unavailable for runtime reconciliation');
  }

  const files = projectState.files.flatMap((file): PersistedRuntimeFile[] => {
    const entry = file as ProjectFileEntry & { encoding?: unknown };

    if (
      typeof entry.path !== 'string' ||
      entry.path.length === 0 ||
      typeof entry.content !== 'string' ||
      (entry.encoding !== undefined && entry.encoding !== 'utf8' && entry.encoding !== 'base64')
    ) {
      return [];
    }

    return [
      Object.freeze({
        path: entry.path,
        content: entry.content,
        ...(entry.encoding === 'base64' || entry.encoding === 'utf8' ? { encoding: entry.encoding } : {}),
      }),
    ];
  });

  if (files.length === 0) {
    throw new Error('The authoritative persisted project contains no files for runtime reconciliation');
  }

  /*
   * Deliberately hash FILES only. ideState.version also changes for chat/UI
   * persistence and must not invalidate an otherwise immutable runtime write.
   */
  const revision = projectFilesRevisionFromEntries(files);

  if (!revision) {
    throw new Error('The authoritative persisted project has no file revision');
  }

  return Object.freeze({ revision, files: Object.freeze(files) });
}

async function runtimeStatus(page: Page, workspaceId: string, token: string) {
  const response = await page.request
    .get(`${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/status`, {
      headers: { authorization: `Bearer ${token}` },
      timeout: 20_000,
    })
    .catch(() => undefined);

  if (!response?.ok()) {
    return 'unavailable';
  }

  const payload = (await response.json()) as { status?: string };

  return payload.status?.toLocaleLowerCase() ?? 'unknown';
}

async function runtimeSnapshotMismatches(
  page: Page,
  workspaceId: string,
  token: string,
  snapshot: PersistedRuntimeSnapshot,
) {
  const mismatches: string[] = [];

  /*
   * Reads stay sequential: concurrent proof projects can cold-start the runtime,
   * and a burst obscures whether a failure is a real byte mismatch or a transient
   * agent timeout. Compare every persisted file, including base64 bytes.
   */
  for (const file of snapshot.files) {
    const runtimeFile = await runtimeFileContent(page, workspaceId, token, file.path);
    const expectedBytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');

    const runtimeBytes = runtimeFile
      ? Buffer.from(runtimeFile.content, runtimeFile.encoding === 'base64' ? 'base64' : 'utf8')
      : undefined;

    if (!runtimeBytes || !runtimeBytes.equals(expectedBytes)) {
      mismatches.push(file.path);
    }
  }

  return mismatches;
}

async function writePersistedSnapshotToRuntime(
  page: Page,
  workspaceId: string,
  token: string,
  snapshot: PersistedRuntimeSnapshot,
) {
  process.stdout.write(
    `${JSON.stringify({
      status: 'runtime-authoritative-write-requested',
      fileCount: snapshot.files.length,
      projectFilesRevision: snapshot.revision,
    })}\n`,
  );

  for (const file of snapshot.files) {
    const response = await page.request.put(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/files/write`,
      {
        data: { path: file.path, content: file.content, encoding: file.encoding },
        headers: { authorization: `Bearer ${token}` },
        timeout: 60_000,
      },
    );

    if (!response.ok()) {
      throw new Error(`Runtime reconciliation failed for ${file.path} with HTTP ${response.status()}`);
    }
  }

  process.stdout.write(
    `${JSON.stringify({
      status: 'runtime-authoritative-write-completed',
      fileCount: snapshot.files.length,
      projectFilesRevision: snapshot.revision,
    })}\n`,
  );
}

function runtimeReconciliationOptions(overrides: Partial<{ budgetMs: number; preRestartGraceMs: number }> = {}) {
  return {
    budgetMs: overrides.budgetMs ?? RUNTIME_SYNC_BUDGET_MS,
    maxWriteCycles: RUNTIME_SYNC_MAX_WRITE_CYCLES,
    minimumWriteQuiescenceMs: RUNTIME_WRITE_QUIESCENCE_MS,
    minimumMatchingReads: RUNTIME_SYNC_MIN_MATCHING_READS,
    minimumStableForMs: RUNTIME_SYNC_STABLE_MS,
    pollIntervalMs: RUNTIME_SYNC_POLL_MS,
    preRestartGraceMs: overrides.preRestartGraceMs ?? RUNTIME_SYNC_GRACE_MS,
  };
}

function reportRuntimeReconciliationEvent(event: RuntimeReconciliationEvent) {
  process.stdout.write(`${JSON.stringify({ status: `runtime-${event.type}`, ...event })}\n`);
}

function runtimeReconciliationOperations(
  page: Page,
  projectId: string,
  workspaceId: string,
  token: string,
): RuntimeReconciliationOperations<PersistedRuntimeFile> {
  const writeActivity = runtimeWriteActivityTrackers.get(page);

  if (!writeActivity) {
    throw new Error('Runtime write activity tracking was not registered before opening the IDE');
  }

  return {
    now: () => Date.now(),
    sleep: (durationMs) => new Promise((resolveDelay) => setTimeout(resolveDelay, durationMs)),
    readSnapshot: () => readPersistedRuntimeSnapshot(page, projectId, token),
    readStatus: () => runtimeStatus(page, workspaceId, token),
    observeRuntime: async (snapshot) => {
      const status = await runtimeStatus(page, workspaceId, token);

      return {
        status,
        mismatches: status === 'running' ? await runtimeSnapshotMismatches(page, workspaceId, token, snapshot) : [],
      };
    },
    restart: async () => {
      const response = await page.request.post(
        `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspaceId)}/restart`,
        {
          headers: { authorization: `Bearer ${token}` },
          timeout: PREVIEW_RESTART_TIMEOUT_MS,
        },
      );

      if (!response.ok()) {
        throw new Error(`Runtime reseed restart failed with HTTP ${response.status()}`);
      }

      const payload = (await response.json().catch(() => undefined)) as { status?: string } | undefined;

      if (!payload?.status) {
        throw new Error('Runtime reseed restart returned no lifecycle status');
      }

      return payload.status.toLocaleLowerCase();
    },
    waitForWriteQuiescence: (quietForMs, deadlineMs) =>
      writeActivity.waitForQuiescence(workspaceId, quietForMs, deadlineMs),
    writeSnapshot: (snapshot) => writePersistedSnapshotToRuntime(page, workspaceId, token, snapshot),
    onEvent: reportRuntimeReconciliationEvent,
  };
}

async function waitForRuntimeFilesToMatchPersisted(page: Page, projectId: string, token: string) {
  /* Pin one workspace id for the entire restart/write/verify transaction. */
  const workspace = await resolveRuntimeWorkspace(page, projectId, token);

  if (!workspace?.id) {
    throw new Error('Runtime file synchronization failed: no workspace is available');
  }

  const result = await reconcileRuntimeFileSnapshot(
    runtimeReconciliationOperations(page, projectId, workspace.id, token),
    runtimeReconciliationOptions(),
  );

  process.stdout.write(
    `${JSON.stringify({
      status: 'runtime-files-synchronized',
      workspaceId: workspace.id,
      projectFilesRevision: result.snapshot.revision,
      matchingReads: result.matchingReads,
      stableForMs: result.stableForMs,
      restartCount: result.restartCount,
      writeCycles: result.writeCycles,
    })}\n`,
  );
}

async function verifyRuntimeFilesBeforePromotion(page: Page, projectId: string, token: string) {
  const workspace = await resolveRuntimeWorkspace(page, projectId, token);

  if (!workspace?.id) {
    throw new Error('Runtime promotion gate failed: no workspace is available');
  }

  const result = await verifyRuntimeFileSnapshotStable(
    runtimeReconciliationOperations(page, projectId, workspace.id, token),
    runtimeReconciliationOptions({
      budgetMs: Math.max(2 * 60 * 1000, RUNTIME_WRITE_QUIESCENCE_MS + RUNTIME_SYNC_STABLE_MS + 60_000),
      preRestartGraceMs: 0,
    }),
  );

  const proof = {
    workspaceId: workspace.id,
    projectFilesRevision: result.snapshot.revision,
    matchingReads: result.matchingReads,
    stableForMs: result.stableForMs,
  };

  process.stdout.write(`${JSON.stringify({ status: 'runtime-files-stable-before-promotion', ...proof })}\n`);

  return proof;
}

async function readRuntimePreviewPorts(page: Page, projectId: string, token: string) {
  try {
    const workspace = await resolveRuntimeWorkspace(page, projectId, token);

    if (!workspace?.id) {
      return [];
    }

    const portsResponse = await page.request.get(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/ports`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      },
    );

    if (!portsResponse.ok()) {
      return [];
    }

    const portsPayload = (await portsResponse.json()) as RuntimePreviewPort[] | { ports?: RuntimePreviewPort[] };
    const ports = Array.isArray(portsPayload) ? portsPayload : (portsPayload.ports ?? []);

    return ports.filter((port) => port.ready === true && typeof port.port === 'number');
  } catch {
    return [];
  }
}

function officialRuntimePreviewUrl(ports: RuntimePreviewPort[], port = 5173) {
  return selectOfficialRuntimePreviewUrl(ports, port);
}

async function probeRuntimePreview(page: Page, projectId: string, token: string, port = 5173) {
  try {
    const [workspace, readyPorts] = await Promise.all([
      resolveRuntimeWorkspace(page, projectId, token),
      readRuntimePreviewPorts(page, projectId, token),
    ]);

    if (!workspace?.id || !readyPorts.some((entry) => entry.port === port)) {
      return false;
    }

    const response = await page.request.get(
      `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/preview/${port}/proxy`,
      {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      },
    );

    if (!response.ok()) {
      return false;
    }

    const html = await response.text();

    return (
      /<html|<div[^>]+id=["']root["']|<script/i.test(html) &&
      html.length > 120 &&
      !/preview_upstream_unreachable|preview is starting|starting preview|loading e-code/i.test(html)
    );
  } catch {
    return false;
  }
}

async function runtimeDiagnosticSummary(page: Page, projectId: string, token: string) {
  const workspace = await resolveRuntimeWorkspace(page, projectId, token);

  if (!workspace?.id) {
    return { workspace: 'unavailable' };
  }

  const requestJson = async (endpoint: string) => {
    const response = await page.request
      .get(`${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/${endpoint}`, {
        headers: { authorization: `Bearer ${token}` },
        timeout: 20_000,
      })
      .catch(() => undefined);

    return response?.ok() ? response.json().catch(() => undefined) : undefined;
  };

  const [status, portsPayload, processesPayload, diagnostics] = await Promise.all([
    requestJson('status'),
    requestJson('ports'),
    requestJson('processes'),
    requestJson('diagnostics'),
  ]);
  const ports = Array.isArray(portsPayload)
    ? portsPayload
    : ((portsPayload as { ports?: RuntimePreviewPort[] } | undefined)?.ports ?? []);
  const processes = Array.isArray(processesPayload)
    ? processesPayload
    : ((processesPayload as { processes?: unknown[] } | undefined)?.processes ?? []);
  const lifecycle = (diagnostics as { lifecycle?: Array<{ state?: string; reason?: string; at?: string }> } | undefined)
    ?.lifecycle;

  return {
    workspaceId: workspace.id,
    runtimeStatus: (status as { status?: string } | undefined)?.status,
    ports: ports.map((entry: RuntimePreviewPort) => ({
      port: entry.port,
      ready: entry.ready,
      process: Boolean(entry.processId),
      notReadyReason: entry.notReadyReason,
    })),
    processCount: processes.length,
    lastLifecycle: lifecycle?.at(-1),
    postMortemCount: (diagnostics as { postMortems?: unknown[] } | undefined)?.postMortems?.length ?? 0,
  };
}

type PreviewAssetAudit = {
  brokenImages: string[];
  remoteImages: string[];
  visibleImageCount: number;
};

async function auditPreviewAssets(body: Locator): Promise<PreviewAssetAudit> {
  return body.evaluate(async (previewBody) => {
    const previewDocument = previewBody.ownerDocument;
    const previewWindow = previewDocument.defaultView;

    await previewDocument.fonts?.ready;

    const images = Array.from(previewDocument.querySelectorAll('img')) as unknown as PreviewImageLike[];

    const visibleImages = images.filter((image) => {
      const bounds = image.getBoundingClientRect();
      const style = previewWindow?.getComputedStyle(image as never);

      return bounds.width > 0 && bounds.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none';
    });

    await Promise.all(
      visibleImages.map(async (image) => {
        if (image.complete) {
          return;
        }

        await Promise.race([
          image.decode().catch(() => undefined),
          new Promise((resolveImage) => setTimeout(resolveImage, 10_000)),
        ]);
      }),
    );

    const brokenImages = visibleImages
      .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
      .map((image) => image.currentSrc || image.src);
    const remoteImages = visibleImages
      .map((image) => image.currentSrc || image.src)
      .filter((source) => {
        try {
          const url = new URL(source, previewDocument.location.href);

          return /^https?:$/.test(url.protocol) && url.origin !== previewDocument.location.origin;
        } catch {
          return true;
        }
      });

    return { brokenImages, remoteImages, visibleImageCount: visibleImages.length };
  });
}

async function resolveRunningRuntimeProofGate(page: Page, projectId: string, token: string) {
  const workspace = await resolveRuntimeWorkspace(page, projectId, token);

  if (!workspace?.id) {
    throw new Error('The official E-Code runtime workspace is unavailable');
  }

  const statusResponse = await page.request.get(
    `${API_BASE_URL}/api/runtime/workspaces/${encodeURIComponent(workspace.id)}/status`,
    {
      headers: { authorization: `Bearer ${token}` },
      timeout: 20_000,
    },
  );

  if (!statusResponse.ok()) {
    throw new Error(`The official E-Code runtime status returned HTTP ${statusResponse.status()}`);
  }

  const runtimeStatus = ((await statusResponse.json()) as { status?: string }).status;

  if (runtimeStatus?.toLocaleLowerCase() !== 'running') {
    throw new Error(`The official E-Code runtime is ${runtimeStatus ?? 'unavailable'}, not running`);
  }

  const ports = await readRuntimePreviewPorts(page, projectId, token);
  const officialRuntimeUrl = officialRuntimePreviewUrl(ports);

  if (!officialRuntimeUrl) {
    throw new Error('Port 5173 has no ready allowlisted official E-Code runtime URL');
  }

  if (!(await probeRuntimePreview(page, projectId, token))) {
    throw new Error('The authenticated official E-Code runtime proxy does not serve a real application document');
  }

  return { officialRuntimeUrl, runtimeStatus, workspaceId: workspace.id };
}

async function verifyOfficialRuntimeDirectPreview(
  idePage: Page,
  projectId: string,
  token: string,
  expectedIdentity: string | undefined,
  nativeFallbackReason: string,
) {
  const { officialRuntimeUrl, runtimeStatus, workspaceId } = await resolveRunningRuntimeProofGate(
    idePage,
    projectId,
    token,
  );

  const previousState = previewSurfaceStates.get(idePage);

  if (previousState?.mode === 'official-runtime-direct' && previousState.directPage) {
    await previousState.directPage.close().catch(() => undefined);
  }

  const directPage = await idePage.context().newPage();
  const runtimeErrors: PreviewRuntimeErrorRecord[] = [];

  const state: PreviewSurfaceState = {
    directPage,
    mode: 'official-runtime-direct',
    officialRuntimeUrl,
    runtimeErrors,
  };

  directPage.on('console', (message) => {
    if (message.type() === 'error') {
      runtimeErrors.push({
        kind: 'console',
        message: message.text(),
        url: message.location().url || undefined,
      });
    }
  });
  directPage.on('pageerror', (error) => runtimeErrors.push({ kind: 'pageerror', message: error.message }));
  directPage.on('requestfailed', (request) => {
    runtimeErrors.push({
      kind: 'requestfailed',
      message: request.failure()?.errorText ?? 'request failed',
      url: request.url(),
    });
  });

  previewSurfaceStates.set(idePage, state);
  directPage.setDefaultNavigationTimeout(180_000);
  await directPage.setViewportSize(directPreviewViewport('desktop'));

  try {
    const response = await directPage.goto(officialRuntimeUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });

    if (!response?.ok()) {
      throw new Error(`The official runtime document returned HTTP ${response?.status() ?? 'unavailable'}`);
    }

    if (new URL(directPage.url()).origin !== new URL(officialRuntimeUrl).origin) {
      throw new Error(`The official runtime redirected outside its allowlisted origin to ${directPage.url()}`);
    }

    const body = directPage.locator('body');

    let previewText = '';

    await expect
      .poll(
        async () => {
          previewText = (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

          return PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText) ? 0 : previewText.length;
        },
        {
          message: 'The official E-Code runtime URL must render substantial application text',
          intervals: [500, 1_000, 2_000],
          timeout: PREVIEW_TIMEOUT_MS,
        },
      )
      .toBeGreaterThan(120);

    if (PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText)) {
      throw new Error(`The official runtime contains a runtime error: ${previewText.slice(0, 500)}`);
    }

    if (expectedIdentity && !previewText.toLocaleLowerCase().includes(expectedIdentity.toLocaleLowerCase())) {
      throw new Error(`The official runtime is missing the required ${expectedIdentity} identity`);
    }

    const assetAudit = await auditPreviewAssets(body);

    if (assetAudit.brokenImages.length > 0) {
      throw new Error(`The official runtime contains ${assetAudit.brokenImages.length} broken visible images`);
    }

    if (assetAudit.remoteImages.length > 0) {
      throw new Error(`The official runtime hotlinks ${assetAudit.remoteImages.length} remote images`);
    }

    const previewShot = await directPage.screenshot({ animations: 'disabled', type: 'png' });
    const previewEntropy = (await sharp(previewShot).stats()).entropy;

    if (previewShot.byteLength < 6_000 || previewEntropy < 0.15) {
      throw new Error(
        `The official runtime screenshot lacks visual substance (${previewShot.byteLength} bytes, entropy ${previewEntropy.toFixed(3)})`,
      );
    }

    assertDirectRuntimeStayedClean(idePage);

    state.provenance = buildRuntimePreviewProvenance({
      mode: 'official-runtime-direct',
      nativeFallbackReason,
      officialRuntimeUrl,
      runtimeStatus,
      workspaceId,
    });

    process.stdout.write(
      `${JSON.stringify({
        status: 'preview-official-runtime-direct-verified',
        origin: new URL(officialRuntimeUrl).origin,
        workspaceId,
      })}\n`,
    );

    return { assetAudit, iframe: undefined, previewText, provenance: state.provenance };
  } catch (error) {
    previewSurfaceStates.delete(idePage);
    await directPage.close().catch(() => undefined);
    throw error;
  }
}

async function waitForProjectToSettle(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
  message: string,
) {
  let fileStability = EMPTY_PROJECT_FILE_STABILITY;
  let consecutiveIdleReads = 0;
  let lastReportedStableBucket = -1;

  await expect
    .poll(
      async () => {
        const projectState = await readProjectIdeState(page, projectId, token);
        const revision = projectState ? projectFilesRevisionFromEntries(projectState.files) : undefined;
        const observedAtMs = Date.now();

        fileStability = observeProjectFileRevision(
          fileStability,
          revision,
          observedAtMs,
          PROJECT_FILES_MAX_OBSERVATION_GAP_MS,
        );

        const composer = agentPanel.getByRole('textbox', {
          name: /^(?:Agent prompt|Prompt de l[’']agent)$/i,
        });

        const composerReady = await composer.isEnabled().catch(() => false);

        const stopGenerationButton = agentPanel
          .getByRole('button', {
            name: /^(?:Stop (?:generation|Claude|agent)|Arrêter (?:la génération|Claude|l[’']agent))$/i,
          })
          .first();

        const generationStillRunning = await stopGenerationButton.isVisible().catch(() => false);

        const activeProgressVisible = await agentPanel
          .locator('.bolt-agent-statusline[data-active-work="true"]')
          .last()
          .isVisible()
          .catch(() => false);

        const uiIdle = composerReady && !generationStillRunning && !activeProgressVisible;

        consecutiveIdleReads = uiIdle ? consecutiveIdleReads + 1 : 0;

        const stableBucket = Math.floor(fileStability.stableForMs / 15_000);

        if (stableBucket > 0 && stableBucket !== lastReportedStableBucket) {
          lastReportedStableBucket = stableBucket;
          process.stdout.write(
            `${JSON.stringify({
              status: 'project-files-stable',
              stableForMs: fileStability.stableForMs,
              unchangedReads: fileStability.unchangedReads,
              uiIdleReads: consecutiveIdleReads,
            })}\n`,
          );
        }

        /*
         * Do not trust persisted agentExecution annotations here: `/api/chat`
         * can mark an execution complete before the final lane writes its last
         * files. Capture readiness requires an uninterrupted persisted-file
         * quiet window plus repeated evidence that the real Agent UI is idle.
         */
        return (
          projectFilesAreStable(fileStability, PROJECT_FILES_STABLE_MS, PROJECT_FILES_MIN_UNCHANGED_READS) &&
          consecutiveIdleReads >= PROJECT_UI_MIN_IDLE_READS
        );
      },
      {
        message,
        intervals: [2_000, 3_000, 5_000],
        timeout: PROJECT_SETTLE_TIMEOUT_MS,
      },
    )
    .toBe(true);
}

async function projectFilesRevision(page: Page, projectId: string, token: string) {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState?.files.length) {
    return undefined;
  }

  return projectFilesRevisionFromEntries(projectState.files);
}

async function submitAgentPrompt(agentPanel: ReturnType<Page['getByTestId']>, prompt: string) {
  const composer = agentPanel.getByRole('textbox', { name: /^(?:Agent prompt|Prompt de l[’']agent)$/i });

  const stopButton = agentPanel
    .getByRole('button', {
      name: /^(?:Stop (?:generation|Claude|agent)|Arrêter (?:la génération|Claude|l[’']agent))$/i,
    })
    .first();

  const sendButton = agentPanel.getByRole('button', { name: /^(?:Send message|Envoyer le message)$/i }).last();

  const quotaBlock = agentPanel
    .getByText(
      /quota exceeded|usage limit reached|insufficient credits|quota dépassé|limite d.utilisation atteinte|crédits insuffisants/i,
    )
    .last();

  const preferredAgentMode = process.env.SOLUTION_PROOF_AGENT_MODE?.trim();

  await expect(composer).toBeVisible({ timeout: 60_000 });

  if (await quotaBlock.isVisible().catch(() => false)) {
    throw new Error('The proof account has no remaining Agent quota');
  }

  if (
    (await stopButton.isVisible().catch(() => false)) ||
    (await agentPanel
      .locator('.bolt-agent-statusline[data-active-work="true"]')
      .last()
      .isVisible()
      .catch(() => false))
  ) {
    await expect
      .poll(
        async () => {
          const stopVisible = await stopButton.isVisible().catch(() => false);

          const activeProgressVisible = await agentPanel
            .locator('.bolt-agent-statusline[data-active-work="true"]')
            .last()
            .isVisible()
            .catch(() => false);

          return !stopVisible && !activeProgressVisible;
        },
        {
          message: 'The previous Agent run must settle before submitting another prompt',
          intervals: [500, 1_000, 2_000],
          timeout: AGENT_IDLE_TIMEOUT_MS,
        },
      )
      .toBe(true);
  }

  if (preferredAgentMode) {
    const modeButton = agentPanel.getByText(preferredAgentMode, { exact: true }).first();

    await expect(modeButton).toBeVisible({ timeout: 60_000 });
    await modeButton.click();
  }

  await composer.fill(prompt);
  await expect(composer).toHaveValue(prompt);

  /*
   * Locator.press('Enter') can remain attached to a runtime-restart navigation
   * waiter after React has already submitted the message. Click the real,
   * localized Send control instead and require a new matching user bubble. A
   * cleared textarea alone is not proof that the server accepted the prompt.
   */
  const bubbles = agentPanel.locator('.bolt-chat-message-row-user');
  const previousUserBubbleCount = await bubbles.count();
  const expectedPromptSnippet = normalizeCaptureProofText(prompt).slice(0, 80);

  await expect(sendButton).toBeVisible({ timeout: 30_000 });
  await expect(sendButton).toBeEnabled({ timeout: 30_000 });
  await sendButton.click({ timeout: AGENT_SUBMIT_ACTION_TIMEOUT_MS });
  await expect
    .poll(
      async () => {
        const bubbleCount = await bubbles.count();

        if (bubbleCount <= previousUserBubbleCount) {
          return false;
        }

        const lastBubbleText = normalizeCaptureProofText(
          await bubbles
            .last()
            .innerText()
            .catch(() => ''),
        );

        return lastBubbleText.includes(expectedPromptSnippet);
      },
      {
        message: 'The Agent must render a new user bubble containing the submitted prompt',
        intervals: [250, 500, 1_000],
        timeout: AGENT_SUBMIT_PROOF_TIMEOUT_MS,
      },
    )
    .toBe(true);

  if (
    await quotaBlock
      .waitFor({ state: 'visible', timeout: 10_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    throw new Error('The proof account exhausted its Agent quota before updating the project');
  }

  return bubbles.last();
}

async function repairGeneratedPreview(
  page: Page,
  agentPanel: ReturnType<Page['getByTestId']>,
  projectId: string,
  token: string,
  repairPrompt: string,
) {
  const initialRevision = await projectFilesRevision(page, projectId, token);

  const repairBubble = await submitAgentPrompt(agentPanel, repairPrompt);

  await expect(repairBubble).toBeVisible({ timeout: 60_000 });
  await expect(repairBubble).toContainText(normalizeCaptureProofText(repairPrompt).slice(0, 80), {
    timeout: 60_000,
  });

  const stopButton = agentPanel.getByRole('button', { name: /^(?:Stop|Arrêter)/i }).first();

  await stopButton.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => undefined);

  await expect
    .poll(() => projectFilesRevision(page, projectId, token), {
      message: 'The repair prompt must update at least one generated project file',
      intervals: [1_000, 2_000, 3_000],
      timeout: GENERATION_TIMEOUT_MS,
    })
    .not.toBe(initialRevision);

  await waitForProjectToSettle(
    page,
    agentPanel,
    projectId,
    token,
    'Repair files must stabilize and the agent must report completion',
  );

  return repairBubble;
}

async function waitForPreview(
  page: Page,
  evidenceRoot: string,
  projectId: string,
  token: string,
  expectedIdentity?: string,
) {
  await assertGeneratedSolutionPackagePolicy(page, projectId, token);
  await assertGeneratedSourcesAreUnwrapped(page, projectId, token);
  await waitForRuntimeFilesToMatchPersisted(page, projectId, token);

  const webviewButton = page.getByRole('button', { name: 'Webview' }).first();

  await expect(webviewButton).toBeVisible({ timeout: 60_000 });
  await webviewButton.click();

  const previewNotRunningState = page.getByTestId('preview-not-running-state');
  const previewLoadingStep = page.getByTestId('preview-loading-current-step');
  const previewLoadingLog = page.getByTestId('preview-loading-log');
  const iframe = page.locator('iframe[data-testid="preview-iframe"]:visible').last();
  const body = page.frameLocator('iframe[data-testid="preview-iframe"]:visible').last().locator('body');

  let previewText = '';

  const readPreviewText = async () => {
    previewText = (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

    return PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText) ? 0 : previewText.length;
  };

  const throwIfVisiblePreviewError = async () => {
    const detail = (
      await Promise.all([
        previewNotRunningState.innerText().catch(() => ''),
        previewLoadingStep.innerText().catch(() => ''),
        previewLoadingLog.innerText().catch(() => ''),
      ])
    )
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (PREVIEW_RUNTIME_ERROR_PATTERN.test(detail) && !PREVIEW_RECOVERABLE_NOT_RUNNING_PATTERN.test(detail)) {
      throw new Error(`The IDE surfaced a Preview Error before rendering the app: ${detail.slice(0, 500)}`);
    }
  };

  const waitForAttachedIframe = async (timeout: number) =>
    expect
      .poll(
        async () => {
          const source = await iframe.getAttribute('src').catch(() => null);

          return (await iframe.isVisible().catch(() => false)) && Boolean(source && source !== 'about:blank');
        },
        {
          message: 'The native Preview boot flow must attach a non-blank Webview iframe',
          timeout,
        },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);

  const waitForRenderedPreview = async (timeout: number) => {
    const observation: { state: 'waiting' | 'ready' | 'not-running' | 'runtime-error' } = { state: 'waiting' };

    await expect
      .poll(
        async () => {
          const source = await iframe.getAttribute('src').catch(() => null);
          const textLength = await readPreviewText();

          observation.state = PREVIEW_RECOVERABLE_NOT_RUNNING_PATTERN.test(previewText)
            ? 'not-running'
            : PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText)
              ? 'runtime-error'
              : source &&
                  source !== 'about:blank' &&
                  textLength > 120 &&
                  (await probeRuntimePreview(page, projectId, token))
                ? 'ready'
                : 'waiting';

          return observation.state;
        },
        {
          message: 'The native Preview boot flow must render the real application or expose its runtime error',
          intervals: [1_000, 2_000, 3_000],
          timeout,
        },
      )
      .not.toBe('waiting')
      .catch(() => undefined);

    if (observation.state === 'runtime-error') {
      throw new Error(`Preview contains a runtime error: ${previewText.slice(0, 500)}`);
    }

    return observation.state === 'ready';
  };

  const refreshNativeIframeForOfficialRuntime = async () => {
    const officialUrl = officialRuntimePreviewUrl(await readRuntimePreviewPorts(page, projectId, token));

    if (!officialUrl) {
      return false;
    }

    const refreshPreviewButton = page.getByRole('button', { name: 'Refresh preview' }).first();

    if (!(await refreshPreviewButton.isVisible().catch(() => false))) {
      return false;
    }

    await refreshPreviewButton.click({ noWaitAfter: true });

    process.stdout.write(
      `${JSON.stringify({ status: 'preview-native-runtime-refresh-requested', origin: new URL(officialUrl).origin })}\n`,
    );

    const rendered = await waitForRenderedPreview(60_000);

    if (!rendered) {
      return false;
    }

    const iframeSource = await iframe.getAttribute('src').catch(() => null);

    try {
      return Boolean(iframeSource && new URL(iframeSource).origin === new URL(officialUrl).origin);
    } catch {
      return false;
    }
  };

  const startPreviewFromTerminal = async () => {
    if (await probeRuntimePreview(page, projectId, token)) {
      process.stdout.write(`${JSON.stringify({ status: 'preview-terminal-recovery-skipped-runtime-ready' })}\n`);

      return;
    }

    const dependencyInstallCommand = 'npm install --include=dev --prefer-offline --no-audit --no-fund';
    const viteVersionCommand = 'node_modules/.bin/vite --version';
    const terminalTabs = page.getByTestId('terminal-tabs-bar');
    const openedTerminal = !(await terminalTabs.isVisible().catch(() => false));

    if (openedTerminal) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
    }

    await expect(terminalTabs).toBeVisible({ timeout: 60_000 });

    const terminalScreen = page.locator('.xterm-screen:visible').last();
    const terminalRows = page.locator('.xterm-rows:visible').last();

    await expect(terminalScreen).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(
        async () => {
          const rows = await terminalRows.innerText().catch(() => '');

          return /[$#]\s*$/.test(rows.trimEnd());
        },
        {
          message: 'The IDE Terminal must expose an interactive workspace prompt before starting Vite',
          timeout: PREVIEW_RESTART_TIMEOUT_MS,
        },
      )
      .toBe(true);

    const terminalInput = page.locator('.xterm:visible').last().locator('textarea.xterm-helper-textarea');

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();

    await page.keyboard.type(dependencyInstallCommand);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must echo the dependency installation command before execution',
        timeout: 30_000,
      })
      .toContain(dependencyInstallCommand);
    await page.keyboard.press('Enter');
    process.stdout.write(`${JSON.stringify({ status: 'preview-terminal-install-requested' })}\n`);

    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The real IDE Terminal must complete the project dependency installation',
        timeout: PREVIEW_TIMEOUT_MS,
      })
      .toMatch(/(?:(?:added|changed|removed)\s+\d+\s+packages?|up to date)/i);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must return to an interactive prompt after installing dependencies',
        timeout: 60_000,
      })
      .toMatch(/[$#]\s*$/);

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();
    await page.keyboard.type(viteVersionCommand);
    await page.keyboard.press('Enter');
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The installed project must expose a real Vite executable before Preview starts',
        timeout: 60_000,
      })
      .toMatch(/(?:vite\/|vite\s+v)\d+\.\d+\.\d+/i);
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must return after verifying Vite',
        timeout: 60_000,
      })
      .toMatch(/[$#]\s*$/);
    process.stdout.write(`${JSON.stringify({ status: 'preview-vite-executable-verified' })}\n`);

    await terminalInput.focus();
    await expect(terminalInput).toBeFocused();
    await page.keyboard.type('npm run dev -- --host 0.0.0.0');
    await expect
      .poll(() => terminalRows.innerText().catch(() => ''), {
        message: 'The IDE Terminal must echo the requested Vite command before execution',
        timeout: 30_000,
      })
      .toContain('npm run dev -- --host 0.0.0.0');
    await page.keyboard.press('Enter');
    process.stdout.write(`${JSON.stringify({ status: 'preview-terminal-start-requested' })}\n`);

    await expect
      .poll(
        async () => {
          const rows = await terminalRows.innerText().catch(() => '');

          return (
            /(?:VITE\s+v\d|Local:\s+https?:\/\/|ready in\s+\d+\s*ms|Port 5173 is already in use|\[vite\]\s+hmr update)/i.test(
              rows,
            ) || (await probeRuntimePreview(page, projectId, token))
          );
        },
        {
          message: 'The real IDE Terminal or runtime proxy must confirm a running Vite server',
          timeout: PREVIEW_RESTART_TIMEOUT_MS,
        },
      )
      .toBe(true);

    const readyRuntimePorts = await readRuntimePreviewPorts(page, projectId, token);

    process.stdout.write(
      `${JSON.stringify({ status: 'preview-terminal-command-settled', runtimeReadyPortCount: readyRuntimePorts.length })}\n`,
    );

    if (openedTerminal) {
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
      await expect(terminalTabs).toBeHidden({ timeout: 60_000 });
    }

    await webviewButton.click();
  };

  try {
    const waitForPreviewSurface = () =>
      expect
        .poll(
          async () =>
            (await iframe.isVisible().catch(() => false)) ||
            (await previewNotRunningState.isVisible().catch(() => false)),
          {
            message: 'Webview must expose either its running iframe or the explicit preview start state',
            timeout: 60_000,
          },
        )
        .toBe(true);

    const startPreviewIfStopped = async () => {
      if (!(await previewNotRunningState.isVisible().catch(() => false))) {
        return false;
      }

      const previewRunButton = previewNotRunningState.getByRole('button', { name: 'Run to preview your app' }).first();

      if (await previewRunButton.isVisible().catch(() => false)) {
        await previewRunButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-start-requested' })}\n`);

        return true;
      }

      return false;
    };

    await waitForPreviewSurface();
    await startPreviewIfStopped();

    const attachedAfterStart = await waitForAttachedIframe(PREVIEW_TIMEOUT_MS);

    if (!attachedAfterStart) {
      const reinstallDependenciesButton = previewNotRunningState
        .getByRole('button', { name: 'Reinstall dependencies' })
        .first();

      if (await reinstallDependenciesButton.isVisible().catch(() => false)) {
        await reinstallDependenciesButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-dependencies-reinstall-requested' })}\n`);
      }

      await expect
        .poll(
          async () =>
            (await iframe.isVisible().catch(() => false)) ||
            (await previewNotRunningState
              .getByRole('button', { name: 'Run to preview your app' })
              .isVisible()
              .catch(() => false)),
          {
            message: 'Dependency recovery must expose a runnable preview or attach its iframe',
            timeout: PREVIEW_RESTART_TIMEOUT_MS,
          },
        )
        .toBe(true);

      await startPreviewIfStopped();

      const attachedAfterDependencyRecovery = await waitForAttachedIframe(PREVIEW_RESTART_TIMEOUT_MS);

      if (!attachedAfterDependencyRecovery) {
        const renderedAfterNativeRefresh = await refreshNativeIframeForOfficialRuntime();

        if (!renderedAfterNativeRefresh) {
          await startPreviewFromTerminal();
        }

        const attachedAfterTerminalRecovery =
          renderedAfterNativeRefresh || (await waitForAttachedIframe(PREVIEW_RESTART_TIMEOUT_MS));

        if (!attachedAfterTerminalRecovery && !(await refreshNativeIframeForOfficialRuntime())) {
          throw new Error('The native Webview iframe did not attach after terminal recovery');
        }
      }
    }

    const renderedOnFirstAttach = await waitForRenderedPreview(PREVIEW_TIMEOUT_MS);

    if (!renderedOnFirstAttach) {
      await throwIfVisiblePreviewError();

      const iframeSource = await iframe.getAttribute('src').catch(() => null);
      const runtimePreviewReachable = await probeRuntimePreview(page, projectId, token);

      if (
        !runtimePreviewReachable &&
        (!iframeSource || iframeSource === 'about:blank' || (await readPreviewText()) === 0)
      ) {
        await startPreviewFromTerminal();
      }

      const refreshPreviewButton = page.getByRole('button', { name: 'Refresh preview' }).first();

      if (await refreshPreviewButton.isVisible().catch(() => false)) {
        await refreshPreviewButton.click({ noWaitAfter: true });
        process.stdout.write(`${JSON.stringify({ status: 'preview-refresh-requested' })}\n`);
      }

      const renderedAfterRefresh = await expect
        .poll(readPreviewText, {
          message: 'The refreshed Webview must render substantial application content',
          timeout: 30_000,
        })
        .toBeGreaterThan(120)
        .then(() => true)
        .catch(() => false);

      if (!renderedAfterRefresh) {
        await throwIfVisiblePreviewError();
        process.stdout.write(`${JSON.stringify({ status: 'preview-final-attach-wait-requested' })}\n`);

        const refreshedAfterReloadButton = page.getByRole('button', { name: 'Refresh preview' }).first();

        if (await refreshedAfterReloadButton.isVisible().catch(() => false)) {
          await refreshedAfterReloadButton.click({ noWaitAfter: true });
        }

        const renderedAfterFinalReload = await expect
          .poll(readPreviewText, {
            message: 'The reloaded IDE must attach the running application to Webview',
            timeout: PREVIEW_TIMEOUT_MS,
          })
          .toBeGreaterThan(120)
          .then(() => true)
          .catch(() => false);

        if (!renderedAfterFinalReload && !(await refreshNativeIframeForOfficialRuntime())) {
          await throwIfVisiblePreviewError();
          throw new Error('The native Webview stayed empty after refresh and official runtime URL recovery');
        }
      }
    }
  } catch (error) {
    const nativeFailure = errorMessageChain(error);

    if (isNativeWebviewFallbackEligible(nativeFailure)) {
      try {
        return await verifyOfficialRuntimeDirectPreview(page, projectId, token, expectedIdentity, nativeFailure);
      } catch (directRuntimeError) {
        process.stdout.write(
          `${JSON.stringify({
            status: 'preview-official-runtime-direct-rejected',
            nativeFailure,
            directRuntimeFailure: errorMessageChain(directRuntimeError),
          })}\n`,
        );
        error = new Error(
          `Native Webview fallback was rejected. Native failure: ${nativeFailure}. Official runtime failure: ${errorMessageChain(directRuntimeError)}`,
          { cause: directRuntimeError },
        );
      }
    }

    await mkdir(evidenceRoot, { recursive: true });

    if (!page.isClosed()) {
      await page.screenshot({
        path: resolve(evidenceRoot, '02-preview-failed.png'),
        animations: 'disabled',
        caret: 'hide',
      });
    }

    const diagnosticSummary = await runtimeDiagnosticSummary(page, projectId, token).catch(() => undefined);

    if (diagnosticSummary) {
      await writeFile(
        resolve(evidenceRoot, '02-preview-failed.json'),
        `${JSON.stringify(diagnosticSummary, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
        },
      );
      process.stdout.write(`${JSON.stringify({ status: 'preview-failed-diagnostics', ...diagnosticSummary })}\n`);
    }

    const previewStatus = await page
      .getByTestId('preview-not-running-state')
      .innerText()
      .catch(() => 'No visible preview status');

    const underlyingFailure = errorMessageChain(error);

    throw new Error(
      `Preview stayed empty. Visible status: ${previewStatus.replace(/\s+/g, ' ').trim()}. Underlying failure: ${underlyingFailure}`,
      { cause: error },
    );
  }

  if (PREVIEW_RUNTIME_ERROR_PATTERN.test(previewText)) {
    throw new Error(`Preview contains a runtime error: ${previewText.slice(0, 500)}`);
  }

  let assetAudit: { brokenImages: string[]; remoteImages: string[]; visibleImageCount: number } = {
    brokenImages: [],
    remoteImages: [],
    visibleImageCount: 0,
  };

  await expect
    .poll(
      async () => {
        try {
          assetAudit = await body.evaluate(async (previewBody) => {
            const previewDocument = previewBody.ownerDocument;
            const previewWindow = previewDocument.defaultView;

            await previewDocument.fonts?.ready;

            const images = Array.from(previewDocument.querySelectorAll('img')) as unknown as PreviewImageLike[];

            const visibleImages = images.filter((image) => {
              const bounds = image.getBoundingClientRect();
              const style = previewWindow?.getComputedStyle(image as never);

              return (
                bounds.width > 0 && bounds.height > 0 && style?.visibility !== 'hidden' && style?.display !== 'none'
              );
            });

            await Promise.all(
              visibleImages.map(async (image) => {
                if (image.complete) {
                  return;
                }

                await Promise.race([
                  image.decode().catch(() => undefined),
                  new Promise((resolveImage) => setTimeout(resolveImage, 10_000)),
                ]);
              }),
            );

            const brokenImages = visibleImages
              .filter((image) => image.naturalWidth === 0 || image.naturalHeight === 0)
              .map((image) => image.currentSrc || image.src);
            const remoteImages = visibleImages
              .map((image) => image.currentSrc || image.src)
              .filter((source) => {
                try {
                  const url = new URL(source, previewDocument.location.href);

                  return /^https?:$/.test(url.protocol) && url.origin !== previewDocument.location.origin;
                } catch {
                  return true;
                }
              });

            return { brokenImages, remoteImages, visibleImageCount: visibleImages.length };
          });

          return true;
        } catch {
          return false;
        }
      },
      {
        message: 'The rendered Webview must stay attached while local asset integrity is audited',
        intervals: [500, 1_000, 2_000],
        timeout: 60_000,
      },
    )
    .toBe(true);

  if (assetAudit.brokenImages.length > 0) {
    throw new Error(`Preview contains ${assetAudit.brokenImages.length} broken visible images`);
  }

  if (assetAudit.remoteImages.length > 0) {
    throw new Error(`Preview hotlinks ${assetAudit.remoteImages.length} remote images instead of local assets`);
  }

  let previewShot = Buffer.alloc(0);
  let previewEntropy = 0;

  const waitForVisualSubstance = async (timeout: number) =>
    expect
      .poll(
        async () => {
          try {
            previewShot = await iframe.screenshot({ animations: 'disabled', type: 'png' });
            previewEntropy = (await sharp(previewShot).stats()).entropy;

            return previewShot.byteLength >= 6_000 && previewEntropy >= 0.15;
          } catch {
            return false;
          }
        },
        {
          message: 'The attached Webview must render visually substantial application pixels',
          intervals: [1_000, 2_000, 3_000],
          timeout,
        },
      )
      .toBe(true)
      .then(() => true)
      .catch(() => false);

  let visuallySubstantial = await waitForVisualSubstance(60_000);

  if (!visuallySubstantial && (await refreshNativeIframeForOfficialRuntime())) {
    visuallySubstantial = await waitForVisualSubstance(60_000);
  }

  if (!visuallySubstantial) {
    await mkdir(evidenceRoot, { recursive: true });

    if (previewShot.byteLength > 0) {
      await writeFile(resolve(evidenceRoot, '02-preview-low-substance.png'), previewShot);
    }

    const nativeFailure = `The native Webview did not render substantial application pixels (${previewShot.byteLength} bytes, entropy ${previewEntropy.toFixed(3)})`;

    return verifyOfficialRuntimeDirectPreview(page, projectId, token, expectedIdentity, nativeFailure);
  }

  if (expectedIdentity && !previewText.toLocaleLowerCase().includes(expectedIdentity.toLocaleLowerCase())) {
    if (await refreshNativeIframeForOfficialRuntime()) {
      await readPreviewText();
    }

    if (!previewText.toLocaleLowerCase().includes(expectedIdentity.toLocaleLowerCase())) {
      throw new Error(`Preview is missing the required ${expectedIdentity} identity after native runtime refresh`);
    }
  }

  const runningRuntime = await resolveRunningRuntimeProofGate(page, projectId, token);

  const provenance = buildRuntimePreviewProvenance({
    mode: 'native-webview',
    runtimeStatus: runningRuntime.runtimeStatus,
    workspaceId: runningRuntime.workspaceId,
  });

  const previousSurface = previewSurfaceStates.get(page);

  if (previousSurface?.mode === 'official-runtime-direct' && previousSurface.directPage) {
    await previousSurface.directPage.close().catch(() => undefined);
  }

  previewSurfaceStates.set(page, { mode: 'native-webview', provenance, runtimeErrors: [] });

  return { iframe, previewText, assetAudit, provenance };
}

async function waitForOrangePreview(
  page: Page,
  evidenceRoot: string,
  timeoutMs = PREVIEW_TIMEOUT_MS,
  requireOrangeAction = true,
) {
  let lastAudit = { orangeActionCount: 0, orangeCount: 0, purpleCount: 0 };

  try {
    await expect
      .poll(
        async () => {
          const body = previewBody(page);

          lastAudit = await body.evaluate((previewBody) => {
            const previewDocument = previewBody.ownerDocument;
            const previewWindow = previewDocument.defaultView;

            if (!previewWindow) {
              return { orangeActionCount: 0, orangeCount: 0, purpleCount: 0 };
            }

            const colors = new Set<string>();
            const interactiveColors = new Set<string>();

            for (const element of previewDocument.querySelectorAll('*')) {
              const style = previewWindow.getComputedStyle(element);
              const bounds = element.getBoundingClientRect();

              const isEffectivelyVisible =
                typeof element.checkVisibility !== 'function' ||
                element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });

              if (
                bounds.width <= 0 ||
                bounds.height <= 0 ||
                bounds.right <= 0 ||
                bounds.bottom <= 0 ||
                bounds.left >= previewWindow.innerWidth ||
                bounds.top >= previewWindow.innerHeight ||
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                Number(style.opacity) === 0 ||
                !isEffectivelyVisible
              ) {
                continue;
              }

              const styles = [style];

              for (const pseudo of ['::before', '::after']) {
                const pseudoStyle = previewWindow.getComputedStyle(element, pseudo);

                if (
                  pseudoStyle.content !== 'none' &&
                  pseudoStyle.display !== 'none' &&
                  pseudoStyle.visibility !== 'hidden' &&
                  Number(pseudoStyle.opacity) !== 0
                ) {
                  styles.push(pseudoStyle);
                }
              }

              const styleValues = styles.flatMap((candidateStyle) => [
                candidateStyle.color,
                candidateStyle.backgroundColor,
                candidateStyle.backgroundImage,
                candidateStyle.borderTopColor,
                candidateStyle.borderRightColor,
                candidateStyle.borderBottomColor,
                candidateStyle.borderLeftColor,
                candidateStyle.outlineColor,
                candidateStyle.boxShadow,
                candidateStyle.textShadow,
                candidateStyle.filter,
                candidateStyle.fill,
                candidateStyle.stroke,
              ]);

              const isInteractive =
                element.matches('button, a[href], [role="button"], input[type="submit"]') &&
                !element.matches(':disabled, [aria-disabled="true"]');

              for (const value of styleValues) {
                if (!value || value === 'none' || value === 'transparent') {
                  continue;
                }

                const tokens = value.match(/rgba?\([^)]*\)/gi) ?? [value];

                for (const token of tokens) {
                  colors.add(token);

                  if (isInteractive) {
                    interactiveColors.add(token);
                  }
                }
              }
            }

            let orangeCount = 0;
            let orangeActionCount = 0;
            let purpleCount = 0;

            for (const [colorSet, interactive] of [
              [colors, false],
              [interactiveColors, true],
            ] as const) {
              for (const color of colorSet) {
                const match = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*\/\s*([\d.]+)|[,\s]+([\d.]+))?/i);

                if (!match || Number(match[4] ?? match[5] ?? 1) === 0) {
                  continue;
                }

                const red = Number(match[1]) / 255;
                const green = Number(match[2]) / 255;
                const blue = Number(match[3]) / 255;
                const max = Math.max(red, green, blue);
                const min = Math.min(red, green, blue);
                const delta = max - min;

                if (delta === 0) {
                  continue;
                }

                let hue = 0;

                if (max === red) {
                  hue = ((green - blue) / delta) % 6;
                } else if (max === green) {
                  hue = (blue - red) / delta + 2;
                } else {
                  hue = (red - green) / delta + 4;
                }

                hue = Math.round(hue * 60);

                if (hue < 0) {
                  hue += 360;
                }

                const lightness = (max + min) / 2;
                const saturation = delta / (1 - Math.abs(2 * lightness - 1));

                if (saturation < 0.38 || lightness < 0.2 || lightness > 0.82) {
                  continue;
                }

                if (hue >= 10 && hue <= 42) {
                  if (interactive) {
                    orangeActionCount += 1;
                  } else {
                    orangeCount += 1;
                  }
                }

                if (!interactive && hue >= 255 && hue <= 345) {
                  purpleCount += 1;
                }
              }
            }

            return { orangeActionCount, orangeCount, purpleCount };
          });

          return (
            (!requireOrangeAction || (lastAudit.orangeActionCount > 0 && lastAudit.orangeCount > 0)) &&
            lastAudit.purpleCount === 0
          );
        },
        {
          message: requireOrangeAction
            ? 'The refreshed Preview must contain an orange interactive action and no purple, violet, mauve, or pink accents'
            : 'The interacted Preview must contain no purple, violet, mauve, or pink accents',
          timeout: timeoutMs,
        },
      )
      .toBe(true);
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '04-orange-preview-audit-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    throw new Error(
      `Preview accent audit failed (orange actions=${lastAudit.orangeActionCount}, orange=${lastAudit.orangeCount}, purple=${lastAudit.purpleCount})`,
      { cause: error },
    );
  }

  return lastAudit;
}

async function verifyScenarioPreview(page: Page, scenario: SolutionScenario, evidenceRoot: string) {
  const frame = previewScope(page);
  const body = frame.locator('body');
  const identity = scenario.expectedTerms[0];
  const initialBodyText = (await body.innerText()).replace(/\s+/g, ' ').trim();

  if (!initialBodyText.toLocaleLowerCase().includes(identity.toLocaleLowerCase())) {
    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '05-theme-verification-failed.png'),
      animations: 'disabled',
      caret: 'hide',
    });
    throw new Error(`Generated Preview is missing its theme-specific identity: ${identity}`);
  }

  const alternateRole = scenario.interaction.role === 'button' ? 'link' : 'button';

  const preferredTarget = frame
    .getByRole(scenario.interaction.role, { name: scenario.interaction.name, exact: true })
    .first();

  const alternateTarget = frame.getByRole(alternateRole, { name: scenario.interaction.name, exact: true }).first();

  const preferredTargetWithDecoration = frame
    .getByRole(scenario.interaction.role, { name: scenario.interaction.name })
    .first();

  const alternateTargetWithDecoration = frame.getByRole(alternateRole, { name: scenario.interaction.name }).first();

  let actualRole: 'button' | 'link' | undefined;
  let target = preferredTarget;

  await expect
    .poll(
      async () => {
        if (await preferredTarget.isVisible().catch(() => false)) {
          actualRole = scenario.interaction.role;
          target = preferredTarget;

          return true;
        }

        if (await alternateTarget.isVisible().catch(() => false)) {
          actualRole = alternateRole;
          target = alternateTarget;

          return true;
        }

        if (await preferredTargetWithDecoration.isVisible().catch(() => false)) {
          actualRole = scenario.interaction.role;
          target = preferredTargetWithDecoration;

          return true;
        }

        if (await alternateTargetWithDecoration.isVisible().catch(() => false)) {
          actualRole = alternateRole;
          target = alternateTargetWithDecoration;

          return true;
        }

        return false;
      },
      {
        message: `${scenario.interaction.name} must be exposed as an accessible link or button`,
        timeout: 60_000,
      },
    )
    .toBe(true);

  const beforeInteraction = await body.evaluate((previewBody) => ({
    html: previewBody.innerHTML,
    location: previewBody.ownerDocument.defaultView?.location.href ?? '',
  }));

  await target.click();
  await expect(body).toContainText(scenario.interaction.expectedResult, { timeout: 60_000 });

  await expect
    .poll(
      () =>
        body.evaluate((previewBody, before) => {
          const location = previewBody.ownerDocument.defaultView?.location.href ?? '';

          return previewBody.innerHTML !== before.html || location !== before.location;
        }, beforeInteraction),
      {
        message: `Clicking ${scenario.interaction.name} must change the rendered app state or route`,
        timeout: 60_000,
      },
    )
    .toBe(true);

  const interactedBodyText = (await body.innerText()).replace(/\s+/g, ' ').trim();

  const completeInteractionText = `${initialBodyText} ${interactedBodyText}`.toLocaleLowerCase();

  const missingTerms = scenario.expectedTerms.filter(
    (term) => !completeInteractionText.includes(term.toLocaleLowerCase()),
  );

  if (missingTerms.length > 0) {
    throw new Error(`Interacted Preview is missing theme-specific terms: ${missingTerms.join(', ')}`);
  }

  const interactiveCount = await frame
    .locator(
      'button:visible:not([disabled]), a:visible[href], input:visible:not([disabled]), select:visible:not([disabled])',
    )
    .count();

  if (interactiveCount < 3) {
    throw new Error(`Generated Preview exposes only ${interactiveCount} interactive controls`);
  }

  return {
    interaction: `${actualRole}:${scenario.interaction.name}`,
    expectedResult:
      typeof scenario.interaction.expectedResult === 'string'
        ? scenario.interaction.expectedResult
        : scenario.interaction.expectedResult.source,
    interactiveCount,
  };
}

async function verifyScenarioIdentity(page: Page, scenario: SolutionScenario, timeout = 10_000) {
  const body = previewBody(page);
  const identity = scenario.expectedTerms[0];

  await expect(body).toContainText(new RegExp(escapedPattern(identity), 'i'), { timeout });
}

async function verifyPreviewResponsiveState(
  page: Page,
  scenario: SolutionScenario,
  evidenceRoot: string,
  stage: string,
  device: 'desktop' | 'tablet' | 'mobile',
) {
  const body = previewBody(page);
  const identity = scenario.expectedTerms[0];

  await applyDirectPreviewViewport(page, device);

  let lastAudit = {
    stage,
    device,
    textLength: 0,
    imageBytes: 0,
    entropy: 0,
    horizontalOverflow: Number.POSITIVE_INFINITY,
    identityVisible: false,
  };

  try {
    await expect
      .poll(
        async () => {
          const text = (await body.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();

          const layout = await body
            .evaluate((previewBody) => {
              const previewDocument = previewBody.ownerDocument;
              const root = previewDocument.documentElement;
              const rootOverflow = Math.max(0, root.scrollWidth - root.clientWidth);
              const bodyOverflow = Math.max(0, previewBody.scrollWidth - previewBody.clientWidth);

              return {
                horizontalOverflow: Math.max(rootOverflow, bodyOverflow),
              };
            })
            .catch(() => ({ horizontalOverflow: Number.POSITIVE_INFINITY }));

          const image = await previewPixels(page).catch(() => Buffer.alloc(0));

          const entropy = image.byteLength > 0 ? (await sharp(image).stats()).entropy : 0;

          lastAudit = {
            stage,
            device,
            textLength: text.length,
            imageBytes: image.byteLength,
            entropy,
            horizontalOverflow: layout.horizontalOverflow,
            identityVisible: text.toLocaleLowerCase().includes(identity.toLocaleLowerCase()),
          };

          return (
            lastAudit.identityVisible &&
            lastAudit.textLength >= 80 &&
            lastAudit.imageBytes >= 6_000 &&
            lastAudit.entropy >= 0.15 &&
            lastAudit.horizontalOverflow <= 1
          );
        },
        {
          message: `${stage} ${device} Preview must remain substantial, identified, and free of horizontal overflow`,
          intervals: [500, 1_000, 2_000],
          timeout: 60_000,
        },
      )
      .toBe(true);
  } catch (error) {
    await mkdir(evidenceRoot, { recursive: true });

    const safeStage = stage.replace(/[^a-z0-9-]+/gi, '-').toLocaleLowerCase();

    await page.screenshot({
      path: resolve(evidenceRoot, `07-responsive-${safeStage}-${device}-failed.png`),
      animations: 'disabled',
      caret: 'hide',
    });

    throw new Error(
      `Responsive Preview audit failed for ${stage}/${device} (identity=${lastAudit.identityVisible}, text=${lastAudit.textLength}, bytes=${lastAudit.imageBytes}, entropy=${lastAudit.entropy.toFixed(3)}, overflow=${lastAudit.horizontalOverflow})`,
      { cause: error },
    );
  }

  return lastAudit;
}

async function verifyScenarioAppearance(page: Page, scenario: SolutionScenario, theme: CaptureTheme) {
  if (!scenario.requiresDarkCanvas) {
    return;
  }

  const body = previewBody(page);

  const surfaceAudit = await body.evaluate((previewBody) => {
    const previewDocument = previewBody.ownerDocument;
    const previewWindow = previewDocument.defaultView;

    if (!previewWindow) {
      return { darkSurfaceCount: 0, lightSurfaceCount: 0, surfaces: [] };
    }

    let darkSurfaceCount = 0;
    let lightSurfaceCount = 0;

    const surfaces: Array<{ backgroundColor: string; element: string; luminance: number }> = [];

    for (const element of previewDocument.querySelectorAll('body, #root, main, [data-app-shell]')) {
      const bounds = element.getBoundingClientRect();
      const style = previewWindow.getComputedStyle(element);
      const channels = style.backgroundColor.match(/[\d.]+/g)?.map(Number);

      if (
        !channels ||
        channels.length < 3 ||
        (channels[3] ?? 1) < 0.5 ||
        bounds.width < previewWindow.innerWidth * 0.7 ||
        bounds.height < previewWindow.innerHeight * 0.5
      ) {
        continue;
      }

      const red = channels[0] / 255;
      const green = channels[1] / 255;
      const blue = channels[2] / 255;
      const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

      surfaces.push({
        backgroundColor: style.backgroundColor,
        element: element.id
          ? `${element.tagName.toLocaleLowerCase()}#${element.id}`
          : element.tagName.toLocaleLowerCase(),
        luminance,
      });

      if (luminance <= 0.3) {
        darkSurfaceCount += 1;
      }

      if (luminance >= 0.65) {
        lightSurfaceCount += 1;
      }
    }

    return { darkSurfaceCount, lightSurfaceCount, surfaces };
  });

  if (theme === 'dark' && surfaceAudit.darkSurfaceCount === 0) {
    throw new Error(
      `The ${scenario.expectedTerms[0]} Preview does not render the requested dark full-canvas theme: ${JSON.stringify(surfaceAudit)}`,
    );
  }

  if (theme === 'light' && (surfaceAudit.lightSurfaceCount === 0 || surfaceAudit.darkSurfaceCount > 0)) {
    throw new Error(
      `The ${scenario.expectedTerms[0]} Preview does not render a genuine light full-canvas theme: ${JSON.stringify(surfaceAudit)}`,
    );
  }
}

type ResumedPromptProvenance = {
  evidence: PersistedPromptEvidence;
  ideStateVersion?: number;
};

async function waitForExactAgentUserPromptBubble(
  agentPanel: ReturnType<Page['getByTestId']>,
  creationPrompt: string,
  timeout: number,
  required: boolean,
) {
  const userBubbles = agentPanel.locator('.bolt-chat-message-row-user');
  const expectedPrompt = normalizeCaptureProofText(creationPrompt);

  let matchingBubbleIndex = -1;

  try {
    await expect
      .poll(
        async () => {
          const bubbleTexts = await userBubbles.allInnerTexts().catch(() => []);

          matchingBubbleIndex = bubbleTexts.findIndex((bubbleText) =>
            Boolean(matchCompleteSubmittedPrompt(bubbleText, expectedPrompt)),
          );

          return matchingBubbleIndex >= 0;
        },
        {
          message: 'The Agent must render a real user-message row containing the complete submitted prompt',
          intervals: [250, 500, 1_000],
          timeout,
        },
      )
      .toBe(true);
  } catch (error) {
    if (required) {
      throw error;
    }

    return undefined;
  }

  const promptBubble = userBubbles.nth(matchingBubbleIndex);

  await expect(promptBubble).toBeVisible({ timeout: Math.min(timeout, 30_000) });

  return promptBubble;
}

async function resolveResumedPromptProvenance(
  page: Page,
  projectId: string,
  token: string,
  creationPrompt: string,
): Promise<ResumedPromptProvenance> {
  const projectState = await readProjectIdeState(page, projectId, token);

  if (!projectState) {
    throw new Error(
      'The resumed Agent transcript is absent from the DOM and authenticated ide-state is unavailable. ' +
        'Rerun without --resume; the harness will not invent a prompt surface.',
    );
  }

  const evidence = findPersistedPromptEvidence(projectState.chat, creationPrompt);

  if (!evidence) {
    throw new Error(
      'The resumed Agent transcript is absent from the DOM and authenticated ide-state does not contain the complete submitted user prompt. ' +
        'Rerun without --resume; a product-name match or generated files alone are not prompt provenance.',
    );
  }

  return { evidence, ideStateVersion: projectState.version };
}

async function restoreResumedPromptBubbleFromHistory(
  page: Page,
  creationPrompt: string,
  provenance: ResumedPromptProvenance,
) {
  const historyButton = page
    .getByRole('button', { name: /^(?:Conversation history|Historique des conversations)$/i })
    .first();

  await expect(
    historyButton,
    `Authenticated ide-state proves the prompt through ${provenance.evidence.source}, but the real Conversation history control must be available to restore its Agent bubble`,
  ).toBeVisible({ timeout: 60_000 });
  await historyButton.click();

  const historyDialog = page
    .getByRole('dialog', { name: /^(?:Project agent history|Historique des agents de projet)$/i })
    .first();

  await expect(historyDialog).toBeVisible({ timeout: 60_000 });

  const historySearch = historyDialog.getByRole('searchbox', {
    name: /^(?:Search agent checkpoints|Points de contrôle des agents de recherche)$/i,
  });

  const searchFragment = creationPrompt.trim().split(/\r?\n/u)[0]?.slice(0, 160) ?? '';

  if (searchFragment.length < 40) {
    throw new Error('The submitted prompt is too short to restore unambiguously from Conversation history');
  }

  await expect(historySearch).toBeVisible({ timeout: 30_000 });
  await historySearch.fill(searchFragment);

  const checkpointTitleFragment = normalizeCaptureProofText(creationPrompt).slice(0, 100);

  const matchingCheckpoints = historyDialog.locator('.bolt-project-history-checkpoint').filter({
    has: page.locator('strong').filter({
      hasText: new RegExp(`^${escapedPattern(checkpointTitleFragment)}`, 'i'),
    }),
  });

  await expect(
    matchingCheckpoints.first(),
    `Authenticated ide-state proves the resumed prompt through ${provenance.evidence.source}, but Conversation history exposes no checkpoint containing the submitted prompt. Rerun without --resume.`,
  ).toBeVisible({ timeout: 60_000 });

  const viewChatButton = matchingCheckpoints.first().getByRole('button', {
    name: /^(?:View Chat|Afficher le chat|View chat at checkpoint .+|Afficher le chat au point de contrôle .+)$/i,
  });

  await expect(viewChatButton).toBeVisible({ timeout: 30_000 });

  const mainFrameNavigation = page
    .waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 15_000,
    })
    .then(() => true)
    .catch(() => false);

  const [, restoredWithNavigation] = await Promise.all([viewChatButton.click(), mainFrameNavigation]);

  if (restoredWithNavigation) {
    await page.waitForLoadState('domcontentloaded');
  }

  const restoredAgentPanel = page.getByTestId('ide-agent-panel');

  await expect(restoredAgentPanel).toBeVisible({ timeout: 60_000 });

  const promptBubble = await waitForExactAgentUserPromptBubble(restoredAgentPanel, creationPrompt, 60_000, true).catch(
    (error) => {
      throw new Error(
        `Conversation history did not restore a real user bubble containing the complete submitted prompt ` +
          `(ide-state source=${provenance.evidence.source}). Rerun without --resume; no substitute surface is publishable as ide-agent-prompt.`,
        { cause: error },
      );
    },
  );

  if (!promptBubble) {
    throw new Error(
      `Conversation history did not restore a real user bubble containing the complete submitted prompt ` +
        `(ide-state source=${provenance.evidence.source}). Rerun without --resume; no substitute surface is publishable as ide-agent-prompt.`,
    );
  }

  await expect(promptBubble).toBeVisible({ timeout: 30_000 });
  await expect(
    promptBubble,
    'The restored Agent prompt must be a persisted message row with a stable message id',
  ).toHaveAttribute('data-message-id', /\S+/u);
  await promptBubble.scrollIntoViewIfNeeded();

  process.stdout.write(
    `${JSON.stringify({
      status: 'resumed-agent-prompt-restored-from-history',
      source: provenance.evidence.source,
      ideStateVersion: provenance.ideStateVersion,
    })}\n`,
  );

  return promptBubble;
}

async function prepareIdeCapture(page: Page, bubble: ReturnType<Page['locator']>) {
  const dismissPreviewError = page.getByTestId('ide-agent-panel').getByRole('button', { name: 'Dismiss' }).last();

  if (await dismissPreviewError.isVisible().catch(() => false)) {
    const alert = dismissPreviewError.locator('xpath=ancestor::*[@role="alert"][1]');
    const detail = (await alert.innerText().catch(() => 'Preview or terminal error')).replace(/\s+/g, ' ').trim();

    throw new Error(`IDE error alert must be resolved before capture: ${detail}`);
  }

  const hideLogsButton = page.getByRole('button', { name: /Hide workspace logs/i }).first();

  if (await hideLogsButton.isVisible().catch(() => false)) {
    await hideLogsButton.click();
  }

  const closePreviewLogsButton = page.getByRole('button', { name: 'Close right panel' }).first();

  if (await closePreviewLogsButton.isVisible().catch(() => false)) {
    await closePreviewLogsButton.click();
  }

  await bubble.evaluate((element) => element.scrollIntoView({ block: 'start', inline: 'nearest' }));
  await page.evaluate(`document.activeElement && document.activeElement.blur();`);
  await page.evaluate(`document.fonts && document.fonts.ready`);
}

function previewDeviceSelect(page: Page) {
  /*
   * The accessible label is localized by the IDE. Identify this native select
   * by its stable semantic option values so EN and FR exercise the same real
   * toolbar without depending on translated chrome copy.
   */
  return page
    .locator(
      '.bolt-project-webview-tool select:visible:has(option[value="desktop"]):has(option[value="tablet"]):has(option[value="mobile"])',
    )
    .last();
}

async function selectPreviewDevice(page: Page, device: 'desktop' | 'tablet' | 'mobile') {
  const deviceSelect = previewDeviceSelect(page);

  await expect(deviceSelect).toBeVisible({ timeout: 60_000 });
  await deviceSelect.selectOption(device);
  await expect(deviceSelect).toHaveValue(device);
  await expect(page.locator(`.bolt-project-webview-frame[data-preview-device="${device}"]:visible`).last()).toBeVisible(
    {
      timeout: 60_000,
    },
  );
  await applyDirectPreviewViewport(page, device);
}

const CAPTURE_THEMES = ['light', 'dark'] as const satisfies readonly CaptureTheme[];

const COMMAND_PALETTE_LABEL = /^(?:Command palette|Palette de commandes)$/i;
const THEME_COMMAND_LABEL = /^(?:Toggle theme|Changer de thème)$/i;

async function captureThemeControlDiagnostics(page: Page) {
  return page.evaluate(`(() => {
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);

      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    };
    const describe = (element) =>
      element
        ? {
            ariaLabel: element.getAttribute('aria-label'),
            role: element.getAttribute('role'),
            tag: element.tagName.toLowerCase(),
            testId: element.getAttribute('data-testid'),
          }
        : null;

    return {
      activeElement: describe(document.activeElement),
      appliedTheme: document.documentElement.getAttribute('data-theme'),
      commandPaletteSearchCount: document.querySelectorAll('[data-testid="project-command-palette-search"]').length,
      persistedTheme: localStorage.getItem('bolt_theme'),
      url: window.location.href,
      visibleDialogs: Array.from(document.querySelectorAll('[role="dialog"]'))
        .filter(isVisible)
        .slice(0, 8)
        .map(describe),
    };
  })()`);
}

async function activateThemeCommand(page: Page, expectedTheme: CaptureTheme) {
  const palette = page.getByRole('dialog', { name: COMMAND_PALETTE_LABEL }).last();
  const search = page.getByTestId('project-command-palette-search').last();

  try {
    /*
     * Cmd/Ctrl+Shift+P is the production IDE's global, terminal-safe command
     * palette shortcut. It is independent from the compact Agent header and
     * remains available in both EN and FR. Selecting the real command invokes
     * toggleTheme(), exactly as a user would.
     */
    await pressIdeCommandPaletteShortcut(page);
    await expect(search).toBeVisible({ timeout: 30_000 });
    await expect(palette).toBeVisible({ timeout: 30_000 });

    const themeLabel = page.getByText(THEME_COMMAND_LABEL, { exact: true });
    const themeOption = palette.getByRole('option').filter({ has: themeLabel });

    await expect(themeOption, 'The command palette must expose exactly one localized theme command').toHaveCount(1);
    await expect(themeOption).toBeVisible({ timeout: 30_000 });
    await themeOption.click();
  } catch (error) {
    const diagnostics = await captureThemeControlDiagnostics(page).catch((diagnosticError) => ({
      diagnosticError: errorMessageChain(diagnosticError),
      url: page.url(),
    }));

    throw new Error(
      `The production IDE theme command is unavailable while switching to ${expectedTheme}. ` +
        `Expected Ctrl+Shift+P -> Command palette/Palette de commandes -> Toggle theme/Changer de thème. ` +
        `Diagnostics: ${JSON.stringify(diagnostics)}`,
      { cause: error },
    );
  }
}

async function applyCaptureTheme(page: Page, theme: CaptureTheme) {
  const html = page.locator('html');

  await expect
    .poll(
      async () => {
        const value = await html.getAttribute('data-theme');

        return value === 'light' || value === 'dark';
      },
      {
        message: 'The hydrated production IDE must expose its applied light/dark theme',
        intervals: [100, 250, 500],
        timeout: 30_000,
      },
    )
    .toBe(true);

  let activeTheme = (await html.getAttribute('data-theme')) as CaptureTheme;

  const persistedTheme = await page.evaluate(() => localStorage.getItem('bolt_theme'));
  const toggleCount = activeTheme === theme ? (persistedTheme === theme ? 0 : 2) : 1;

  if (toggleCount > 0) {
    /*
     * Use the production IDE's existing command palette. Mutating
     * <html data-theme> directly is not a valid theme switch: the nanostore in
     * App() remains authoritative and its effect immediately restores the old
     * value. The real command calls toggleTheme(), updating the store,
     * persistence, cookie and document through the same path a user exercises.
     */
    for (let toggleIndex = 0; toggleIndex < toggleCount; toggleIndex += 1) {
      const expectedAfterToggle: CaptureTheme = activeTheme === 'dark' ? 'light' : 'dark';

      await activateThemeCommand(page, expectedAfterToggle);
      await expect
        .poll(() => html.getAttribute('data-theme'), {
          message: `The production command palette theme control must switch to ${expectedAfterToggle}`,
          intervals: [100, 250, 500],
          timeout: 30_000,
        })
        .toBe(expectedAfterToggle);
      activeTheme = expectedAfterToggle;
    }
  }

  await expect
    .poll(() => html.getAttribute('data-theme'), {
      message: `The production IDE must settle in ${theme} mode through its command palette theme control`,
      intervals: [100, 250, 500, 1_000],
      timeout: 30_000,
    })
    .toBe(theme);
  await expect
    .poll(
      () =>
        page.evaluate(`(() => ({
          applied: document.documentElement.getAttribute('data-theme'),
          darkClass: document.documentElement.classList.contains('dark'),
          lightClass: document.documentElement.classList.contains('light'),
          persisted: localStorage.getItem('bolt_theme'),
        }))()`),
      {
        message: `The real command palette theme control must apply and persist ${theme} consistently`,
        intervals: [100, 250, 500],
        timeout: 30_000,
      },
    )
    .toEqual({
      applied: theme,
      darkClass: theme === 'dark',
      lightClass: theme === 'light',
      persisted: theme,
    });
  await page.evaluate(`document.fonts && document.fonts.ready`);

  const state = previewSurfaceState(page);

  let applicationTheme: Awaited<ReturnType<typeof applyOfficialRuntimeCaptureTheme>>;

  if (state.mode === 'official-runtime-direct' && state.directPage) {
    applicationTheme = await applyOfficialRuntimeCaptureTheme(state.directPage, theme, {
      requireVisibleControl: true,
    });
    assertDirectRuntimeStayedClean(page);
  } else {
    const iframe = page.locator('iframe[data-testid="preview-iframe"]:visible').last();

    await expect(iframe).toBeVisible({ timeout: 30_000 });

    const iframeHandle = await iframe.elementHandle();
    const nativePreviewFrame = await iframeHandle?.contentFrame();

    if (!nativePreviewFrame) {
      throw new Error(`The native Webview iframe is unavailable while applying the generated ${theme} theme`);
    }

    applicationTheme = await applyOfficialRuntimeCaptureTheme(nativePreviewFrame, theme, {
      requireVisibleControl: true,
    });
  }

  return applicationTheme;
}

type IdeShellAudit = {
  alertsVisible: string[];
  connected: boolean;
  overlaysVisible: string[];
  problemErrors: number | null;
  problemsSummary: string;
  problemWarnings: number | null;
  runtimeSummary: string;
  workspaceSummary: string;
};

type ThemedCaptureAudit = {
  filename: string;
  states: Array<{
    accent: { orangeActionCount: number; orangeCount: number; purpleCount: number };
    applicationTheme: Awaited<ReturnType<typeof applyOfficialRuntimeCaptureTheme>>;
    captureSurface: 'ide-shell-native-webview' | 'ide-shell-official-runtime-verified' | 'official-runtime-direct';
    device: 'desktop' | 'tablet' | 'mobile';
    provenance?: RuntimePreviewProvenance;
    responsive: Awaited<ReturnType<typeof verifyPreviewResponsiveState>>;
    shell: IdeShellAudit;
    theme: CaptureTheme;
  }>;
  themeDifference: {
    changedPixelRatio: number;
    meanAbsoluteDifference: number;
  };
};

async function readIdeShellAudit(page: Page): Promise<IdeShellAudit> {
  const overlayTestIds = [
    'preview-splash-sequence',
    'preview-resume-skeleton',
    'preview-loading-overlay',
    'preview-not-running-state',
  ];
  const connectionStatus = page
    .locator('.bolt-project-statusbar-primary .bolt-project-statusbar-pill[role="status"]')
    .first();

  const runtimeStatus = page.locator('.bolt-project-statusbar-runtime').first();
  const workspaceStatus = page.locator('.bolt-project-statusbar-workspace').first();

  const problemsButton = page
    .locator(
      '.bolt-project-statusbar-primary button:has(.bolt-project-statusbar-error-count):has(.bolt-project-statusbar-warning-count)',
    )
    .first();

  const problemErrorCount = problemsButton.locator('.bolt-project-statusbar-error-count');
  const problemWarningCount = problemsButton.locator('.bolt-project-statusbar-warning-count');

  const visibleErrorAlerts = page.locator(
    '[role="alert"][aria-label*="Error"]:visible, [role="alert"][aria-label*="Erreur"]:visible',
  );

  const [
    alertTexts,
    overlayVisibility,
    connectedText,
    runtimeSummary,
    workspaceSummary,
    problemsSummary,
    problemErrorText,
    problemWarningText,
  ] = await Promise.all([
    visibleErrorAlerts.allInnerTexts().catch(() => []),
    Promise.all(
      overlayTestIds.map(async (testId) => ({
        testId,
        visible: await page
          .getByTestId(testId)
          .isVisible()
          .catch(() => false),
      })),
    ),
    connectionStatus.innerText().catch(() => ''),
    runtimeStatus.getAttribute('aria-label').catch(() => null),
    workspaceStatus.innerText().catch(() => ''),
    problemsButton.getAttribute('aria-label').catch(() => null),
    problemErrorCount.innerText().catch(() => ''),
    problemWarningCount.innerText().catch(() => ''),
  ]);

  const parseProblemCount = (value: string) => {
    const match = value.match(/\d+/);

    return match ? Number(match[0]) : null;
  };

  return {
    alertsVisible: alertTexts.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean),
    connected: /^(?:Connected|Connecté)$/i.test(connectedText.trim()),
    overlaysVisible: overlayVisibility.filter(({ visible }) => visible).map(({ testId }) => testId),
    problemErrors: parseProblemCount(problemErrorText),
    problemsSummary: problemsSummary ?? '',
    problemWarnings: parseProblemCount(problemWarningText),
    runtimeSummary: runtimeSummary ?? '',
    workspaceSummary: workspaceSummary.replace(/\s+/g, ' ').trim(),
  };
}

function isIdeShellAuditReady(audit: IdeShellAudit) {
  return (
    audit.alertsVisible.length === 0 &&
    audit.connected &&
    audit.overlaysVisible.length === 0 &&
    /^(?:Running on|Exécuté sur)\s+\S+/i.test(audit.runtimeSummary) &&
    /(?:Workspace\s*Running|Espace de travail\s*Actif)/i.test(audit.workspaceSummary) &&
    audit.problemErrors === 0 &&
    audit.problemWarnings === 0
  );
}

async function waitForStableIdeCaptureShell(page: Page, timeout = 120_000) {
  let consecutiveReadySamples = 0;

  let lastAudit: IdeShellAudit = {
    alertsVisible: [],
    connected: false,
    overlaysVisible: [],
    problemErrors: null,
    problemsSummary: '',
    problemWarnings: null,
    runtimeSummary: '',
    workspaceSummary: '',
  };

  try {
    await expect
      .poll(
        async () => {
          lastAudit = await readIdeShellAudit(page);
          consecutiveReadySamples = isIdeShellAuditReady(lastAudit) ? consecutiveReadySamples + 1 : 0;

          return consecutiveReadySamples >= 3;
        },
        {
          message: 'The IDE shell must remain Connected with a running runtime, zero Problems, and no preview overlay',
          intervals: [250, 500, 750],
          timeout,
        },
      )
      .toBe(true);
  } catch (error) {
    const problemsButton = page
      .locator(
        '.bolt-project-statusbar-primary button:has(.bolt-project-statusbar-error-count):has(.bolt-project-statusbar-warning-count)',
      )
      .first();

    const problemsPanel = page.locator('.bolt-project-problems-panel');

    if ((lastAudit.problemErrors ?? 0) > 0 || (lastAudit.problemWarnings ?? 0) > 0) {
      await problemsButton.click().catch(() => undefined);
      await problemsPanel.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
    }

    const problemCounts = await problemsPanel
      .locator('.bolt-project-problems-counts')
      .getAttribute('aria-label')
      .catch(() => null);

    const problemDetails = (
      await problemsPanel
        .locator('.bolt-project-problem-item')
        .allInnerTexts()
        .catch(() => [])
    )
      .map((detail) => detail.replace(/\s+/g, ' ').trim())
      .filter(Boolean);

    const diagnostic = { ...lastAudit, problemCounts, problemDetails };

    throw new Error(`The IDE shell did not stabilize before capture: ${JSON.stringify(diagnostic)}`, {
      cause: error,
    });
  }

  return lastAudit;
}

async function beginIdeScreenshotGuard(page: Page) {
  await page.evaluate(`(() => {
    const overlayIds = [
      'preview-splash-sequence',
      'preview-resume-skeleton',
      'preview-loading-overlay',
      'preview-not-running-state',
    ];
    const state = { violations: [], observer: null, interval: 0, check: null };
    const check = () => {
      const visibleOverlays = overlayIds.filter((testId) => {
        const element = document.querySelector('[data-testid="' + testId + '"]');

        if (!element) return false;

        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();

        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0;
      });
      const alertsVisible = Array.from(
        document.querySelectorAll(
          '[role="alert"][aria-label*="Error"], [role="alert"][aria-label*="Erreur"]',
        ),
      )
        .filter((element) => {
          const style = getComputedStyle(element);
          const bounds = element.getBoundingClientRect();

          return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && bounds.width > 0 && bounds.height > 0;
        })
        .map((element) => (element.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const connection = document.querySelector('.bolt-project-statusbar-primary .bolt-project-statusbar-pill[role="status"]')?.textContent?.trim() || '';
      const runtime = document.querySelector('.bolt-project-statusbar-runtime')?.getAttribute('aria-label') || '';
      const workspace = (document.querySelector('.bolt-project-statusbar-workspace')?.textContent || '').replace(/\\s+/g, ' ').trim();
      const problemErrorText = document.querySelector('.bolt-project-statusbar-error-count')?.textContent || '';
      const problemWarningText = document.querySelector('.bolt-project-statusbar-warning-count')?.textContent || '';
      const problemErrors = Number((problemErrorText.match(/\\d+/) || ['NaN'])[0]);
      const problemWarnings = Number((problemWarningText.match(/\\d+/) || ['NaN'])[0]);
      const problems = document.querySelector(
        '.bolt-project-statusbar-primary button:has(.bolt-project-statusbar-error-count):has(.bolt-project-statusbar-warning-count)',
      )?.getAttribute('aria-label') || '';
      const ready =
        alertsVisible.length === 0 &&
        visibleOverlays.length === 0 &&
        /^(?:Connected|Connecté)$/i.test(connection) &&
        /^(?:Running on|Exécuté sur)\\s+\\S+/i.test(runtime) &&
        /(?:Workspace\\s*Running|Espace de travail\\s*Actif)/i.test(workspace) &&
        problemErrors === 0 &&
        problemWarnings === 0;

      if (!ready && state.violations.length < 5) {
        state.violations.push(JSON.stringify({
          alertsVisible,
          visibleOverlays,
          connection,
          runtime,
          workspace,
          problems,
          problemErrors,
          problemWarnings,
        }));
      }
    };

    state.check = check;
    state.observer = new MutationObserver(check);
    state.observer.observe(document.documentElement, { attributes: true, childList: true, characterData: true, subtree: true });
    state.interval = window.setInterval(check, 50);
    window.__ecodeProofCaptureGuard = state;
    check();
  })()`);
}

async function endIdeScreenshotGuard(page: Page) {
  return page.evaluate<string[]>(`(() => {
    const state = window.__ecodeProofCaptureGuard;

    if (!state) return ['capture guard missing'];

    state.check();
    state.observer.disconnect();
    window.clearInterval(state.interval);
    delete window.__ecodeProofCaptureGuard;

    return state.violations;
  })()`);
}

async function compareCaptureThemes(stagingRoot: string, filename: string) {
  const light = await sharp(resolve(stagingRoot, 'light', filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const dark = await sharp(resolve(stagingRoot, 'dark', filename))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (
    light.info.width !== dark.info.width ||
    light.info.height !== dark.info.height ||
    light.info.channels !== dark.info.channels ||
    light.data.byteLength !== dark.data.byteLength
  ) {
    throw new Error(`Light and dark captures for ${filename} must have identical pixel dimensions`);
  }

  let absoluteDifference = 0;
  let changedPixels = 0;

  const channels = light.info.channels;
  const pixelCount = light.info.width * light.info.height;

  for (let offset = 0; offset < light.data.byteLength; offset += channels) {
    let pixelDifference = 0;

    for (let channel = 0; channel < Math.min(3, channels); channel += 1) {
      const difference = Math.abs(light.data[offset + channel] - dark.data[offset + channel]);

      absoluteDifference += difference;
      pixelDifference += difference;
    }

    if (pixelDifference >= 24) {
      changedPixels += 1;
    }
  }

  const changedPixelRatio = changedPixels / pixelCount;
  const meanAbsoluteDifference = absoluteDifference / (pixelCount * 3);

  if (changedPixelRatio < 0.02 || meanAbsoluteDifference < 2) {
    throw new Error(
      `Light and dark captures for ${filename} are not visually distinct (changed pixels=${changedPixelRatio.toFixed(4)}, mean difference=${meanAbsoluteDifference.toFixed(3)})`,
    );
  }

  return { changedPixelRatio, meanAbsoluteDifference };
}

async function captureThemedIdeState(
  page: Page,
  stagingRoot: string,
  filename: string,
  options: {
    evidenceRoot: string;
    scenario: SolutionScenario;
    verifySurface?: () => Promise<void>;
  },
): Promise<ThemedCaptureAudit> {
  const states: ThemedCaptureAudit['states'] = [];

  const directRuntimePreviewFilenames = new Set([
    'ide-agent-preview.png',
    'ide-webview-overview.png',
    'ide-webview-iteration.png',
  ]);

  for (const theme of CAPTURE_THEMES) {
    const applicationTheme = await applyCaptureTheme(page, theme);
    await options.verifySurface?.();

    const shell = await waitForStableIdeCaptureShell(page);
    const selectedDevice = await previewDeviceSelect(page).inputValue();

    if (selectedDevice !== 'desktop' && selectedDevice !== 'tablet' && selectedDevice !== 'mobile') {
      throw new Error(`Unknown Preview device before ${theme}/${filename} capture: ${selectedDevice || 'missing'}`);
    }

    await verifyScenarioAppearance(page, options.scenario, theme);

    const accent = await waitForOrangePreview(page, options.evidenceRoot, 60_000, false);

    const responsive = await verifyPreviewResponsiveState(
      page,
      options.scenario,
      options.evidenceRoot,
      `${basename(filename, extname(filename))}-${theme}`,
      selectedDevice,
    );

    const themeRoot = resolve(stagingRoot, theme);
    const surfaceState = previewSurfaceState(page);

    const captureDirectRuntime =
      surfaceState.mode === 'official-runtime-direct' &&
      Boolean(surfaceState.directPage) &&
      directRuntimePreviewFilenames.has(filename);

    await mkdir(themeRoot, { recursive: true });
    await options.verifySurface?.();
    await waitForStableIdeCaptureShell(page, 30_000);

    let captureSurface: ThemedCaptureAudit['states'][number]['captureSurface'];

    if (captureDirectRuntime) {
      const directPage = surfaceState.directPage!;

      await directPage.setViewportSize(directPreviewViewport('desktop'));
      await expect(previewBody(page)).toContainText(
        new RegExp(escapedPattern(options.scenario.expectedTerms[0]), 'i'),
        { timeout: 60_000 },
      );
      assertDirectRuntimeStayedClean(page);

      const screenshot = await directPage.screenshot({
        path: resolve(themeRoot, filename),
        animations: 'disabled',
        caret: 'hide',
        type: 'png',
      });

      const entropy = (await sharp(screenshot).stats()).entropy;

      if (screenshot.byteLength < 6_000 || entropy < 0.15) {
        throw new Error(
          `The official runtime direct ${theme}/${filename} capture lacks visual substance (${screenshot.byteLength} bytes, entropy ${entropy.toFixed(3)})`,
        );
      }

      await applyDirectPreviewViewport(page, selectedDevice);
      captureSurface = 'official-runtime-direct';
    } else {
      await beginIdeScreenshotGuard(page);
      await page.screenshot({
        path: resolve(themeRoot, filename),
        animations: 'disabled',
        caret: 'hide',
      });

      const screenshotViolations = await endIdeScreenshotGuard(page);

      if (screenshotViolations.length > 0) {
        throw new Error(`IDE shell changed during ${theme}/${filename} capture: ${screenshotViolations.join(' | ')}`);
      }

      captureSurface =
        surfaceState.mode === 'official-runtime-direct'
          ? 'ide-shell-official-runtime-verified'
          : 'ide-shell-native-webview';
    }

    await options.verifySurface?.();
    await waitForStableIdeCaptureShell(page, 30_000);

    states.push({
      accent,
      applicationTheme,
      captureSurface,
      device: selectedDevice,
      provenance: surfaceState.provenance,
      responsive,
      shell,
      theme,
    });
  }

  const themeDifference = await compareCaptureThemes(stagingRoot, filename);

  /*
   * The production IDE defaults to dark. Restore it so subsequent assertions
   * and interactions run against the same deterministic state as generation.
   */
  await applyCaptureTheme(page, 'dark');

  return { filename, states, themeDifference };
}

async function promoteVerifiedThemedAssets(stagingRoot: string, outputRoot: string, filenames: readonly string[]) {
  const outputParent = dirname(outputRoot);

  await mkdir(outputParent, { recursive: true });

  const transactionRoot = await mkdtemp(resolve(outputParent, `.${basename(outputRoot)}-promotion-`));
  const replacementRoot = resolve(transactionRoot, 'next');
  const previousRoot = resolve(transactionRoot, 'previous');

  const outputExists = await access(outputRoot)
    .then(() => true)
    .catch(() => false);

  const promotedRelativePaths: string[] = [];

  let previousMoved = false;
  let replacementPublished = false;

  try {
    if (outputExists) {
      await cp(outputRoot, replacementRoot, { recursive: true });
    } else {
      await mkdir(replacementRoot, { recursive: true });
    }

    for (const theme of CAPTURE_THEMES) {
      const themeReplacementRoot = resolve(replacementRoot, theme);

      await mkdir(themeReplacementRoot, { recursive: true });

      for (const filename of filenames) {
        const source = resolve(stagingRoot, theme, filename);
        const extension = extname(filename);
        const stem = basename(filename, extension);
        const metadata = await sharp(source).metadata();

        if (metadata.width !== 1440 || metadata.height !== 900) {
          throw new Error(
            `The verified ${theme} capture ${filename} must be 1440x900, received ${metadata.width ?? 0}x${metadata.height ?? 0}`,
          );
        }

        const compactName = `${stem}-720.webp`;
        const fullName = `${stem}-1440.webp`;
        const compactReplacement = resolve(themeReplacementRoot, compactName);
        const fullReplacement = resolve(themeReplacementRoot, fullName);

        await sharp(source)
          .resize({ width: 720, withoutEnlargement: true })
          .webp({ effort: 6, quality: 80, smartSubsample: true })
          .toFile(compactReplacement);
        await sharp(source).webp({ effort: 6, quality: 84, smartSubsample: true }).toFile(fullReplacement);

        for (const [candidate, width, height] of [
          [compactReplacement, 720, 450],
          [fullReplacement, 1440, 900],
        ] as const) {
          const [candidateMetadata, candidateBytes] = await Promise.all([
            sharp(candidate).metadata(),
            readFile(candidate).then((contents) => contents.byteLength),
          ]);

          if (
            candidateMetadata.format !== 'webp' ||
            candidateMetadata.width !== width ||
            candidateMetadata.height !== height ||
            candidateBytes < 5_000
          ) {
            throw new Error(
              `Prepared asset ${candidate} failed validation (${candidateMetadata.format ?? 'unknown'}, ${candidateMetadata.width ?? 0}x${candidateMetadata.height ?? 0}, ${candidateBytes} bytes)`,
            );
          }
        }

        promotedRelativePaths.push(`${theme}/${compactName}`, `${theme}/${fullName}`);
      }
    }

    if (outputExists) {
      await rename(outputRoot, previousRoot);
      previousMoved = true;
    }

    try {
      await rename(replacementRoot, outputRoot);
      replacementPublished = true;
    } catch (error) {
      if (previousMoved) {
        await rename(previousRoot, outputRoot);
        previousMoved = false;
      }

      throw error;
    }

    return promotedRelativePaths.map((relativePath) => resolve(outputRoot, relativePath));
  } finally {
    if (!replacementPublished && previousMoved) {
      const currentOutputExists = await access(outputRoot)
        .then(() => true)
        .catch(() => false);

      if (!currentOutputExists) {
        await rename(previousRoot, outputRoot).catch(() => undefined);
      }
    }

    await rm(transactionRoot, { recursive: true, force: true });
  }
}

async function main() {
  const slug = readSlug();
  const locale = readLocale();
  const copy: SolutionScenario = SOLUTION_SCENARIOS[slug][locale];
  const repairOnly = process.argv.includes('--repair-only');
  const iterationOnly = process.argv.includes('--iteration-only');
  const singleGeneration = process.argv.includes('--single-generation');
  const resume = process.argv.includes('--resume');

  const creationPrompt = creationPromptFor(slug, locale, copy, {
    includeInteractionAcceptance: singleGeneration,
  });

  const outputRoot = resolve(process.cwd(), 'public/assets/solutions', slug, locale);
  const evidenceRoot = resolve(process.cwd(), 'outputs/solutions', slug, 'ide-proof', locale);
  await mkdir(evidenceRoot, { recursive: true });
  await Promise.all([
    unlink(resolve(evidenceRoot, 'capture-result.json')).catch(() => undefined),
    unlink(resolve(evidenceRoot, 'capture-failure.txt')).catch(() => undefined),
  ]);

  /*
   * Partial or rejected captures remain under ignored diagnostics. Nothing is
   * published to public/assets until every runtime, interaction, console and
   * Problems assertion below has passed.
   */
  const stagingRoot = await mkdtemp(resolve(evidenceRoot, '.asset-staging-'));
  const captureSessionPath = resolve(evidenceRoot, '.capture-session.json');
  const resumeSession = resume ? await readCaptureSession(captureSessionPath) : undefined;

  const configuredEmail =
    process.env.SOLUTION_PROOF_EMAIL?.trim() ?? appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_EMAIL);

  const existingProjectId =
    process.env.SOLUTION_PROOF_PROJECT_ID?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_PROJECT_ID) ??
    resumeSession?.projectId;
  const iterationPrompt =
    process.env.SOLUTION_PROOF_ITERATION_PROMPT?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_ITERATION_PROMPT) ??
    copy.iterationPrompt;
  const browserProfile =
    process.env.SOLUTION_PROOF_BROWSER_PROFILE?.trim() ??
    appBuilderFallback(slug, process.env.APP_BUILDER_PROOF_BROWSER_PROFILE);

  if (existingProjectId && !configuredEmail && !resumeSession) {
    throw new Error('SOLUTION_PROOF_EMAIL is required when SOLUTION_PROOF_PROJECT_ID is provided');
  }

  if ((repairOnly || iterationOnly) && !existingProjectId) {
    throw new Error('--repair-only and --iteration-only require an existing SOLUTION_PROOF_PROJECT_ID');
  }

  if (singleGeneration && (repairOnly || iterationOnly)) {
    throw new Error('--single-generation cannot be combined with repair or Agent iteration modes');
  }

  const contextOptions = {
    baseURL: APP_BASE_URL,
    colorScheme: 'dark' as const,
    locale: locale === 'fr' ? 'fr-FR' : 'en-US',
    reducedMotion: 'reduce' as const,
    timezoneId: 'Europe/Paris',
    viewport: { width: 1440, height: 900 },
  };
  const chromiumArgs = [
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-renderer-backgrounding',
    '--renderer-process-limit=2',
  ];

  const browserLaunchTimeout = Number(process.env.SOLUTION_PROOF_BROWSER_LAUNCH_TIMEOUT_MS ?? 5 * 60 * 1000);

  const browser = browserProfile
    ? undefined
    : await chromium.launch({ args: chromiumArgs, headless: true, timeout: browserLaunchTimeout });

  let context = browserProfile
    ? await chromium.launchPersistentContext(resolve(browserProfile), {
        args: chromiumArgs,
        headless: true,
        timeout: browserLaunchTimeout,
        ...contextOptions,
      })
    : await browser!.newContext(contextOptions);

  try {
    await context.addInitScript(`
      localStorage.setItem('bolt_theme', 'dark');
      localStorage.setItem('vibecore-project-ide-guided-tour-v1', 'complete');
    `);

    const page = await context.newPage();
    registerRuntimeWriteActivityTracker(page);

    const consoleErrors: string[] = [];

    const consoleErrorRecords: Array<{
      columnNumber?: number;
      lineNumber?: number;
      message: string;
      url: string;
    }> = [];

    const previewConsoleErrors: string[] = [];
    const unscopedConsoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.setDefaultNavigationTimeout(180_000);
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());

        const location = message.location();
        const locationUrl = location.url;

        consoleErrorRecords.push({
          columnNumber: location.columnNumber,
          lineNumber: location.lineNumber,
          message: message.text(),
          url: locationUrl,
        });

        if (!locationUrl) {
          unscopedConsoleErrors.push(message.text());
        } else if (!locationUrl.startsWith(APP_BASE_URL) && !locationUrl.startsWith(API_BASE_URL)) {
          previewConsoleErrors.push(message.text());
        }
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const { token, email, password } = await authenticate(page, slug, locale, copy, resumeSession);

    let projectId = existingProjectId;

    if (projectId) {
      await page.goto(`/projects/${encodeURIComponent(projectId)}/ide`, {
        waitUntil: 'domcontentloaded',
        timeout: 180_000,
      });
    } else {
      await page.goto('/projects/new', { waitUntil: 'domcontentloaded', timeout: 180_000 });

      await mkdir(evidenceRoot, { recursive: true });
      await page.screenshot({
        path: resolve(evidenceRoot, '00-project-new.png'),
        animations: 'disabled',
        caret: 'hide',
      });

      const promptField = page.locator('textarea[name="prompt"]');

      await expect(promptField).toBeVisible({ timeout: 120_000 });

      const dismissOnboarding = page.getByRole('button', { name: 'Not now' });

      if (await dismissOnboarding.isVisible().catch(() => false)) {
        await dismissOnboarding.click();
      }

      const providerDropdown = page.getByTestId('ai-provider-dropdown').getByRole('combobox', { name: 'AI provider' });

      if (await providerDropdown.isVisible().catch(() => false)) {
        await expect(providerDropdown).toContainText(/Anthropic|OpenAI|Google/, { timeout: 30_000 });
        await expect(
          page.getByTestId('ai-model-dropdown').getByRole('combobox', { name: 'AI model' }),
        ).not.toContainText('No option available');
      }

      await selectCreationModel(page);
      await appendCreationModelFormFields(page);

      await promptField.fill(creationPrompt);
      await page.getByRole('button', { name: /^(?:Create project|Créer le projet)$/i }).click();
      await page.waitForURL(/(?:\/projects\/[^/]+\/ide|\/@[^/]+\/[^/?]+)(?:\?.*)?$/, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });

      projectId = await resolveProjectId(page, token);
    }

    if (!projectId) {
      throw new Error('No project id available for capture');
    }

    if (!configuredEmail) {
      await persistCaptureSession(captureSessionPath, { email, password, projectId });
    }

    process.stdout.write(`${JSON.stringify({ status: 'project-ready', slug, locale, projectId })}\n`);

    const agentPanel = page.getByTestId('ide-agent-panel');

    const agentPanelVisible = await agentPanel
      .waitFor({ state: 'visible', timeout: 180_000 })
      .then(() => true)
      .catch(() => false);

    if (!agentPanelVisible) {
      await mkdir(evidenceRoot, { recursive: true });

      if (!page.isClosed()) {
        await page.screenshot({
          path: resolve(evidenceRoot, '01-agent-panel-missing.png'),
          animations: 'disabled',
          caret: 'hide',
        });
      }

      const surfaceText = (
        await page
          .locator('body')
          .innerText()
          .catch(() => '')
      )
        .replace(/\s+/g, ' ')
        .trim();

      throw new Error(`The E-Code IDE Agent panel did not load at ${page.url()}: ${surfaceText.slice(0, 500)}`);
    }

    await selectCreationModel(page);

    const initialPromptBubble = await waitForExactAgentUserPromptBubble(agentPanel, creationPrompt, 10_000, false);

    let promptBubble = initialPromptBubble ?? agentPanel.locator('.bolt-chat-message-row-user').first();
    let promptBubbleAvailable = Boolean(initialPromptBubble);

    let promptSurfaceProvenance:
      | {
          exactMatch: true;
          matchForm: 'exact' | 'server-project-contract';
          messageId: string;
          promptSha256: string;
          slot: 'prompt';
          surface: 'agent-user-bubble';
          verified: true;
          visiblePrompt: string;
          visiblePromptLength: number;
          visiblePromptSha256: string;
        }
      | undefined;

    if (!promptBubbleAvailable && !iterationOnly) {
      if (!resume) {
        const generatedPromptBubble = await waitForExactAgentUserPromptBubble(
          agentPanel,
          creationPrompt,
          180_000,
          true,
        );

        if (!generatedPromptBubble) {
          throw new Error('The fresh Agent run did not render its persisted user prompt row');
        }

        promptBubble = generatedPromptBubble;
        promptBubbleAvailable = true;
      } else {
        const resumedPromptProvenance = await resolveResumedPromptProvenance(page, projectId, token, creationPrompt);

        promptBubble = await restoreResumedPromptBubbleFromHistory(page, creationPrompt, resumedPromptProvenance);
        promptBubbleAvailable = true;
        await selectCreationModel(page);
      }
    } else if (!promptBubbleAvailable) {
      process.stdout.write(`${JSON.stringify({ status: 'agent-conversation-restarts-with-iteration' })}\n`);
    }

    const verifyPromptBubbleSurface = async () => {
      await expect(promptBubble).toBeVisible({ timeout: 60_000 });
      await expect(
        promptBubble,
        'The publishable Agent prompt capture must retain a persisted user-message id',
      ).toHaveAttribute('data-message-id', /\S+/u);

      const visiblePrompt = normalizeCaptureProofText(await promptBubble.innerText());
      const expectedPrompt = normalizeCaptureProofText(creationPrompt);

      const promptMatch = matchCompleteSubmittedPrompt(visiblePrompt, expectedPrompt);

      if (!promptMatch) {
        throw new Error(
          `The publishable Agent prompt bubble does not contain the complete submitted prompt ` +
            `(visible length=${visiblePrompt.length}, expected length=${expectedPrompt.length})`,
        );
      }

      const messageId = await promptBubble.getAttribute('data-message-id');

      if (!messageId?.trim()) {
        throw new Error('The publishable Agent prompt bubble lost its persisted message id');
      }

      promptSurfaceProvenance = {
        exactMatch: true,
        matchForm: promptMatch.matchForm,
        messageId,
        promptSha256: createHash('sha256').update(expectedPrompt).digest('hex'),
        slot: 'prompt',
        surface: 'agent-user-bubble',
        verified: true,
        visiblePrompt: promptMatch.normalizedCandidate,
        visiblePromptLength: promptMatch.candidateLength,
        visiblePromptSha256: createHash('sha256').update(promptMatch.normalizedCandidate).digest('hex'),
      };

      await promptBubble.scrollIntoViewIfNeeded();
    };

    if (!iterationOnly) {
      await verifyPromptBubbleSurface();
    }

    await mkdir(evidenceRoot, { recursive: true });
    await page.screenshot({
      path: resolve(evidenceRoot, '01-agent-started.png'),
      animations: 'disabled',
      caret: 'hide',
    });

    const generatedFiles = await waitForGeneratedFiles(page, projectId, token, {
      requireApplication: !repairOnly,
    });

    process.stdout.write(
      `${JSON.stringify({ status: 'generated-files-ready', locale, generatedFiles: generatedFiles.length })}\n`,
    );

    if (!repairOnly && !iterationOnly && !existingProjectId) {
      await waitForProjectToSettle(
        page,
        agentPanel,
        projectId,
        token,
        'Generated files must stabilize and the agent composer must become active again',
      );
    } else if (existingProjectId) {
      process.stdout.write(
        `${JSON.stringify({ status: 'existing-project-generation-settle-skipped', locale, projectId })}\n`,
      );
    }

    process.stdout.write(
      `${JSON.stringify({ status: 'initial-generation-settled', locale, generatedFiles: generatedFiles.length })}\n`,
    );

    await assertScenarioSourceTerms(page, projectId, token, copy);

    if (repairOnly) {
      const repairPrompt = repairPromptFor(slug, locale, copy, 1);
      const repairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, repairPrompt);
      const { previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]);

      await repairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          locale,
          projectId,
          repairPrompt,
          generatedFilesUpdated: true,
          previewVerified: true,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
      await context.close();
      context = undefined!;

      return;
    }

    let previewText = '';
    let lastRepairBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let lastRepairPrompt: string | undefined;
    let iterationRepairBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let iterationRepairPrompt: string | undefined;

    const iterationBrief = iterationPrompt ? `${iterationPrompt} ` : '';

    const maximumPreviewRepairAttempts = singleGeneration ? 0 : 3;

    for (let attempt = 0; attempt <= maximumPreviewRepairAttempts; attempt += 1) {
      try {
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));
        break;
      } catch (previewError) {
        if (previewError instanceof GeneratedSolutionPackagePolicyError) {
          throw previewError;
        }

        if (iterationOnly || attempt === maximumPreviewRepairAttempts) {
          throw previewError;
        }

        lastRepairPrompt = repairPromptFor(slug, locale, copy, attempt + 1);
        lastRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, lastRepairPrompt);
      }
    }

    if (lastRepairBubble && lastRepairPrompt) {
      await lastRepairBubble.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(evidenceRoot, '03-agent-repair-finished.png'),
        animations: 'disabled',
        caret: 'hide',
      });
      process.stdout.write(
        `${JSON.stringify({
          status: 'preview-repaired',
          locale,
          projectId,
          repairPrompt: lastRepairPrompt,
          previewTextSample: previewText.slice(0, 240),
        })}\n`,
      );
    }

    try {
      await verifyScenarioIdentity(page, copy, 60_000);
    } catch (identityError) {
      if (singleGeneration) {
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));

        try {
          await verifyScenarioIdentity(page, copy, 60_000);
        } catch {
          throw new Error(
            `The single-generation Preview does not contain the required ${copy.expectedTerms[0]} identity after a second official runtime recovery`,
            { cause: identityError },
          );
        }
      } else {
        const identityRepairPrompt = identityRepairPromptFor(locale, copy, iterationBrief);

        iterationRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, identityRepairPrompt);
        iterationRepairPrompt = identityRepairPrompt;
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));
        await verifyScenarioIdentity(page, copy, 60_000);
      }
    }

    const promptFilename = 'ide-agent-prompt.png';
    const previewFilename = 'ide-agent-preview.png';
    const webviewOverviewFilename = 'ide-webview-overview.png';
    const promptOutput = resolve(outputRoot, 'dark', 'ide-agent-prompt-1440.webp');
    const previewOutput = resolve(outputRoot, 'dark', 'ide-agent-preview-1440.webp');
    const webviewOverviewOutput = resolve(outputRoot, 'dark', 'ide-webview-overview-1440.webp');
    const verifiedCaptureFilenames: string[] = [];

    let initialAccentAudit: { orangeActionCount: number; orangeCount: number; purpleCount: number } | undefined;

    const responsiveAccentAudits: Array<{
      stage: string;
      device: 'desktop' | 'tablet' | 'mobile';
      audit: { orangeActionCount: number; orangeCount: number; purpleCount: number };
    }> = [];

    const responsiveStateAudits: Array<Awaited<ReturnType<typeof verifyPreviewResponsiveState>>> = [];
    const themedCaptureAudits: ThemedCaptureAudit[] = [];

    if (!iterationOnly) {
      try {
        await verifyScenarioAppearance(page, copy, 'dark');
        initialAccentAudit = await waitForOrangePreview(page, evidenceRoot, 60_000);
      } catch (error) {
        if (singleGeneration) {
          const detail = error instanceof Error ? error.message : String(error);

          throw new Error(
            `The single-generation ${copy.expectedTerms[0]} Preview failed the appearance audit: ${detail}`,
            { cause: error },
          );
        }

        const themeRepairPrompt = themeRepairPromptFor(locale, copy, iterationBrief);

        iterationRepairBubble = await repairGeneratedPreview(page, agentPanel, projectId, token, themeRepairPrompt);
        iterationRepairPrompt = themeRepairPrompt;
        ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));
        await verifyScenarioAppearance(page, copy, 'dark');
        initialAccentAudit = await waitForOrangePreview(page, evidenceRoot);
      }

      responsiveAccentAudits.push({ stage: 'initial', device: 'desktop', audit: initialAccentAudit });

      await selectPreviewDevice(page, 'desktop');
      responsiveStateAudits.push(await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'initial', 'desktop'));
      await prepareIdeCapture(page, promptBubble);
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, promptFilename, {
          scenario: copy,
          evidenceRoot,
          verifySurface: verifyPromptBubbleSurface,
        }),
      );
      verifiedCaptureFilenames.push(promptFilename);

      const completedAgentBubble = agentPanel.locator('.bolt-chat-message-row-assistant').last();

      const previewBubble =
        locale === 'fr'
          ? promptBubble
          : (await completedAgentBubble.isVisible().catch(() => false))
            ? completedAgentBubble
            : promptBubble;

      if (locale === 'fr') {
        await selectPreviewDevice(page, 'tablet');
        await verifyScenarioAppearance(page, copy, 'dark');
        responsiveAccentAudits.push({
          stage: 'preview',
          device: 'tablet',
          audit: await waitForOrangePreview(page, evidenceRoot, 60_000, false),
        });
        responsiveStateAudits.push(await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'preview', 'tablet'));
      }

      await prepareIdeCapture(page, previewBubble);
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, previewFilename, { scenario: copy, evidenceRoot }),
      );
      verifiedCaptureFilenames.push(previewFilename);

      const overviewDevice = locale === 'fr' ? 'mobile' : 'tablet';

      await selectPreviewDevice(page, overviewDevice);
      await verifyScenarioAppearance(page, copy, 'dark');
      responsiveAccentAudits.push({
        stage: 'overview',
        device: overviewDevice,
        audit: await waitForOrangePreview(page, evidenceRoot, 60_000, false),
      });
      responsiveStateAudits.push(
        await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'overview', overviewDevice),
      );
      await prepareIdeCapture(page, promptBubble);
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, webviewOverviewFilename, {
          scenario: copy,
          evidenceRoot,
        }),
      );
      verifiedCaptureFilenames.push(webviewOverviewFilename);
      await selectPreviewDevice(page, 'desktop');
    }

    let iterationBubble: ReturnType<typeof agentPanel.locator> | undefined;
    let accentAudit = initialAccentAudit;
    let interactionAccentAudit: { orangeActionCount: number; orangeCount: number; purpleCount: number } | undefined;
    let scenarioAudit: Awaited<ReturnType<typeof verifyScenarioPreview>>;
    let iterationOutput: string | undefined;
    let webviewIterationOutput: string | undefined;

    if (iterationPrompt && !singleGeneration) {
      if (iterationRepairBubble && iterationRepairPrompt) {
        iterationBubble = iterationRepairBubble;
        await expect(iterationBubble).toBeVisible({ timeout: 60_000 });
        await expect(iterationBubble).toContainText(iterationPrompt.slice(0, 80), { timeout: 60_000 });
      } else {
        const initialRevision = await projectFilesRevision(page, projectId, token);
        const previousLastBubble = agentPanel.locator('.bolt-chat-message-row-user').last();

        const previousIterationText = (await previousLastBubble.innerText().catch(() => ''))
          .replace(/\s+/g, ' ')
          .trim();

        if (!previousIterationText.includes(iterationPrompt.slice(0, 80))) {
          await submitAgentPrompt(agentPanel, iterationPrompt);
          await expect
            .poll(() => projectFilesRevision(page, projectId, token), {
              message: 'The orange-theme iteration must update at least one generated project file',
              intervals: [1_000, 2_000, 3_000],
              timeout: GENERATION_TIMEOUT_MS,
            })
            .not.toBe(initialRevision);
        }

        iterationBubble = agentPanel.locator('.bolt-chat-message-row-user').last();
        await expect(iterationBubble).toBeVisible({ timeout: 60_000 });
        await expect(iterationBubble).toContainText(iterationPrompt.slice(0, 80), { timeout: 60_000 });

        await waitForProjectToSettle(
          page,
          agentPanel,
          projectId,
          token,
          'Orange-theme files must stabilize and the agent composer must become active again',
        );
      }

      process.stdout.write(`${JSON.stringify({ status: 'orange-iteration-settled', locale })}\n`);

      ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));
      await verifyScenarioAppearance(page, copy, 'dark');
      accentAudit = await waitForOrangePreview(page, evidenceRoot);
      scenarioAudit = await verifyScenarioPreview(page, copy, evidenceRoot);
      await verifyScenarioAppearance(page, copy, 'dark');
      interactionAccentAudit = await waitForOrangePreview(page, evidenceRoot, 60_000, false);
      responsiveAccentAudits.push({ stage: 'interaction', device: 'desktop', audit: interactionAccentAudit });
      responsiveStateAudits.push(
        await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'interaction', 'desktop'),
      );
      await prepareIdeCapture(page, iterationBubble);

      const iterationFilename = 'ide-agent-iteration.png';
      iterationOutput = resolve(outputRoot, 'dark', 'ide-agent-iteration-1440.webp');
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, iterationFilename, { scenario: copy, evidenceRoot }),
      );
      verifiedCaptureFilenames.push(iterationFilename);

      await selectPreviewDevice(page, 'mobile');
      await verifyScenarioAppearance(page, copy, 'dark');
      responsiveAccentAudits.push({
        stage: 'interaction',
        device: 'mobile',
        audit: await waitForOrangePreview(page, evidenceRoot, 60_000, false),
      });
      responsiveStateAudits.push(await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'interaction', 'mobile'));
      await prepareIdeCapture(page, iterationBubble);

      const webviewIterationFilename = 'ide-webview-iteration.png';
      webviewIterationOutput = resolve(outputRoot, 'dark', 'ide-webview-iteration-1440.webp');
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, webviewIterationFilename, {
          scenario: copy,
          evidenceRoot,
        }),
      );
      verifiedCaptureFilenames.push(webviewIterationFilename);
      await selectPreviewDevice(page, 'desktop');
    } else if (singleGeneration) {
      ({ previewText } = await waitForPreview(page, evidenceRoot, projectId, token, copy.expectedTerms[0]));
      scenarioAudit = await verifyScenarioPreview(page, copy, evidenceRoot);
      await verifyScenarioAppearance(page, copy, 'dark');
      interactionAccentAudit = await waitForOrangePreview(page, evidenceRoot, 60_000, false);
      responsiveAccentAudits.push({ stage: 'interaction', device: 'desktop', audit: interactionAccentAudit });
      responsiveStateAudits.push(
        await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'interaction', 'desktop'),
      );
      process.stdout.write(`${JSON.stringify({ status: 'single-generation-interaction-verified', locale })}\n`);

      await prepareIdeCapture(page, promptBubble);

      const interactionFilename = 'ide-agent-iteration.png';
      iterationOutput = resolve(outputRoot, 'dark', 'ide-agent-iteration-1440.webp');
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, interactionFilename, { scenario: copy, evidenceRoot }),
      );
      verifiedCaptureFilenames.push(interactionFilename);

      await selectPreviewDevice(page, 'mobile');
      await verifyScenarioAppearance(page, copy, 'dark');
      responsiveAccentAudits.push({
        stage: 'interaction',
        device: 'mobile',
        audit: await waitForOrangePreview(page, evidenceRoot, 60_000, false),
      });
      responsiveStateAudits.push(await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'interaction', 'mobile'));
      await prepareIdeCapture(page, promptBubble);

      const webviewInteractionFilename = 'ide-webview-iteration.png';
      webviewIterationOutput = resolve(outputRoot, 'dark', 'ide-webview-iteration-1440.webp');
      themedCaptureAudits.push(
        await captureThemedIdeState(page, stagingRoot, webviewInteractionFilename, {
          scenario: copy,
          evidenceRoot,
        }),
      );
      verifiedCaptureFilenames.push(webviewInteractionFilename);
      await selectPreviewDevice(page, 'desktop');
    } else {
      scenarioAudit = await verifyScenarioPreview(page, copy, evidenceRoot);
      await verifyScenarioAppearance(page, copy, 'dark');
      interactionAccentAudit = await waitForOrangePreview(page, evidenceRoot, 60_000, false);
      responsiveStateAudits.push(
        await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'interaction', 'desktop'),
      );
    }

    const addTabButton = page.getByTestId('tab-add').first();

    await expect(addTabButton).toBeVisible({ timeout: 60_000 });
    await addTabButton.click();

    const filesTool = page.getByTestId('feature-files').first();

    await expect(filesTool).toBeVisible({ timeout: 60_000 });
    await filesTool.click();

    const collapsedSourceFolder = page.locator('.bolt-file-tree-node[title$="/src"][aria-expanded="false"]').first();

    if (await collapsedSourceFolder.isVisible().catch(() => false)) {
      await collapsedSourceFolder.click();
    }

    const appFile = page
      .locator(
        '.bolt-file-tree-name[title="App.tsx"], .bolt-file-tree-name[title="App.jsx"], .bolt-file-tree-name[title="main.tsx"], .bolt-file-tree-name[title="main.jsx"]',
      )
      .first();

    await expect(appFile).toBeVisible({ timeout: 60_000 });

    await verifyScenarioAppearance(page, copy, 'dark');
    responsiveAccentAudits.push({
      stage: 'files',
      device: 'desktop',
      audit: await waitForOrangePreview(page, evidenceRoot, 60_000, false),
    });
    responsiveStateAudits.push(await verifyPreviewResponsiveState(page, copy, evidenceRoot, 'files', 'desktop'));

    await (iterationBubble ?? promptBubble).scrollIntoViewIfNeeded();

    const filesFilename = 'ide-agent-files.png';

    const verifyFilesSurface = async () => {
      const libraryPanel = page
        .locator('aside.bolt-project-right-panel-shell:visible:has(.bolt-project-file-tree)')
        .last();

      const libraryHeader = libraryPanel.locator('.bolt-project-right-files-header');

      const fileTree = libraryPanel.locator('.bolt-project-file-tree:visible').last();
      const filesView = fileTree.locator('.bolt-file-tree-view-switcher button[aria-pressed="true"]');
      const sourceFolder = fileTree.locator('.bolt-file-tree-node[title$="/src"]:visible').first();

      const visibleAppFile = fileTree
        .locator(
          '.bolt-file-tree-name[title="App.tsx"], .bolt-file-tree-name[title="App.jsx"], .bolt-file-tree-name[title="main.tsx"], .bolt-file-tree-name[title="main.jsx"]',
        )
        .first();

      await expect(libraryPanel).toBeVisible({ timeout: 30_000 });
      await expect(libraryHeader).toBeVisible();
      await expect(fileTree).toBeVisible();
      await expect(filesView).toHaveAttribute('aria-pressed', 'true');
      await expect(sourceFolder).toHaveAttribute('aria-expanded', 'true');
      await expect(visibleAppFile).toBeVisible();
    };

    await verifyFilesSurface();
    themedCaptureAudits.push(
      await captureThemedIdeState(page, stagingRoot, filesFilename, {
        scenario: copy,
        evidenceRoot,
        verifySurface: verifyFilesSurface,
      }),
    );
    verifiedCaptureFilenames.push(filesFilename);

    const problemsButton = page
      .locator(
        '.bolt-project-statusbar-primary button:has(.bolt-project-statusbar-error-count):has(.bolt-project-statusbar-warning-count)',
      )
      .first();
    await expect(problemsButton).toBeVisible({ timeout: 60_000 });

    const problemsSummary = await problemsButton.getAttribute('aria-label');
    const statusbarErrorText = await problemsButton.locator('.bolt-project-statusbar-error-count').innerText();
    const statusbarWarningText = await problemsButton.locator('.bolt-project-statusbar-warning-count').innerText();
    const statusbarErrors = Number(statusbarErrorText.match(/\d+/)?.[0] ?? Number.NaN);
    const statusbarWarnings = Number(statusbarWarningText.match(/\d+/)?.[0] ?? Number.NaN);

    await problemsButton.click();

    const problemsPanel = page.locator('.bolt-project-problems-panel');
    await expect(problemsPanel).toBeVisible({ timeout: 60_000 });

    const problemItems = problemsPanel.locator('.bolt-project-problem-item');
    const problemDetailCount = await problemItems.count();
    const problemDetails = (await problemItems.allInnerTexts()).map((detail) => detail.replace(/\s+/g, ' ').trim());
    const panelCounts = await problemsPanel.locator('.bolt-project-problems-counts').getAttribute('aria-label');

    const emptyStateVisible = await problemsPanel
      .locator('.bolt-project-problems-empty')
      .isVisible()
      .catch(() => false);
    const problemsAreClear =
      statusbarErrors === 0 && statusbarWarnings === 0 && problemDetailCount === 0 && emptyStateVisible;

    if (!problemsAreClear) {
      await page.screenshot({
        path: resolve(evidenceRoot, '06-problems-failed.png'),
        animations: 'disabled',
        caret: 'hide',
      });

      throw new Error(
        `Generated project Problems gate failed (summary=${problemsSummary ?? 'missing'}, panel=${panelCounts ?? 'missing'}, errors=${statusbarErrors}, warnings=${statusbarWarnings}, items=${problemDetailCount}, empty=${emptyStateVisible}): ${problemDetails.join(' | ') || 'details unavailable'}`,
      );
    }

    assertDirectRuntimeStayedClean(page);

    if (consoleErrorRecords.length > 0) {
      const details = consoleErrorRecords
        .slice(0, 5)
        .map(
          ({ columnNumber, lineNumber, message, url }) =>
            `${url || 'no-url'}:${lineNumber ?? 0}:${columnNumber ?? 0} ${message.replace(/\s+/g, ' ').trim().slice(0, 300)}`,
        )
        .join(' | ');

      throw new Error(
        `The E-Code proof emitted ${consoleErrorRecords.length} console errors: ${details || 'details unavailable'}`,
      );
    }

    if (pageErrors.length > 0) {
      throw new Error(`The E-Code capture page emitted ${pageErrors.length} uncaught page errors: ${pageErrors[0]}`);
    }

    const expectedCaptureCount = iterationOnly ? 3 : 6;

    if (verifiedCaptureFilenames.length !== expectedCaptureCount) {
      throw new Error(
        `Expected ${expectedCaptureCount} verified capture states, received ${verifiedCaptureFilenames.length}`,
      );
    }

    const publishableCaptureFilenames =
      slug === 'app-builder'
        ? verifiedCaptureFilenames.filter(
            (filename) => filename === 'ide-agent-preview.png' || filename === 'ide-agent-iteration.png',
          )
        : verifiedCaptureFilenames;

    /*
     * Captures can take several minutes. Prove the exact persisted file revision
     * still runs in the official E-Code workspace immediately before the atomic
     * public-asset promotion; this gate is read-only and cannot hide a late race
     * by restarting or rewriting the runtime.
     */
    const runtimePromotionProof = await verifyRuntimeFilesBeforePromotion(page, projectId, token);

    const promotedAssets = await promoteVerifiedThemedAssets(stagingRoot, outputRoot, publishableCaptureFilenames);

    if (slug !== 'app-builder') {
      for (const filename of verifiedCaptureFilenames) {
        await unlink(resolve(outputRoot, filename)).catch(() => undefined);
      }
    }

    await rm(stagingRoot, { recursive: true, force: true });

    const finalPreviewSurface = previewSurfaceState(page);

    const captureResult = {
      locale,
      projectId,
      prompt: creationPrompt,
      promptSurfaceProvenance,
      generatedFileCount: generatedFiles.length,
      previewTextSample: previewText.slice(0, 240),
      consoleErrorCount: consoleErrors.length,
      consoleErrorDetails: consoleErrorRecords,
      previewConsoleErrorCount: previewConsoleErrors.length,
      unscopedConsoleErrorCount: unscopedConsoleErrors.length,
      pageErrorCount: pageErrors.length,
      previewProvenance: finalPreviewSurface.provenance,
      runtimePromotionProof,
      previewRuntimeErrors: finalPreviewSurface.runtimeErrors,
      previewOutput,
      promptOutput,
      webviewOverviewOutput,
      iterationOutput,
      webviewIterationOutput,
      accentAudit,
      interactionAccentAudit,
      responsiveAccentAudits,
      responsiveStateAudits,
      themedCaptureAudits,
      scenarioAudit,
      problemsSummary,
      problemDetailCount,
      problemDetails,
      promotedAssetCount: promotedAssets.length,
      promotedAssets,
    };

    const serializedCaptureResult = JSON.stringify(captureResult, null, 2);

    await writeFile(resolve(evidenceRoot, 'capture-result.json'), `${serializedCaptureResult}\n`, 'utf8');
    process.stdout.write(`${serializedCaptureResult}\n`);

    await context.close();
    context = undefined!;

    if (process.env.SOLUTION_PROOF_KEEP_SESSION !== '1') {
      await unlink(captureSessionPath).catch(() => undefined);
    }
  } finally {
    await context?.close();
    await browser?.close();
  }
}

try {
  await main();
} catch (error) {
  const failure = errorStackChain(error);

  const redactedFailure = failure
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/^\s*- cookie:.*$/gim, '    - cookie: [REDACTED]')
    .replace(/session_[A-Za-z0-9_-]+/g, 'session_[REDACTED]');

  try {
    const failureSlug = readSlug();
    const failureLocale = readLocale();
    const failureRoot = resolve(process.cwd(), 'outputs/solutions', failureSlug, 'ide-proof', failureLocale);

    await mkdir(failureRoot, { recursive: true });
    await unlink(resolve(failureRoot, 'capture-result.json')).catch(() => undefined);
    await writeFile(resolve(failureRoot, 'capture-failure.txt'), `${redactedFailure}\n`, 'utf8');
  } catch {
    // The stderr output below remains authoritative if even failure persistence cannot be initialized.
  }

  process.stderr.write(`${redactedFailure}\n`);

  process.exitCode = 1;
}
