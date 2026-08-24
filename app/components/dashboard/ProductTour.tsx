import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import {
  formatProductTourStepCounter,
  getProductTourCopy,
  type ProductTourKey,
} from '~/lib/i18n/catalogs/product-tour';
import { classNames } from '~/utils/classNames';

export const PRODUCT_TOUR_STORAGE_KEY = 'ecode:user-area-tour:v1';

export const PRODUCT_TOUR_STEPS = [
  {
    target: 'navigation',
    titleKey: 'productTour.step.navigation.title',
    descriptionKey: 'productTour.step.navigation.description',
  },
  {
    target: 'create-project',
    fallbackTarget: 'navigation',
    titleKey: 'productTour.step.createProject.title',
    descriptionKey: 'productTour.step.createProject.description',
  },
  {
    target: 'tools',
    titleKey: 'productTour.step.tools.title',
    descriptionKey: 'productTour.step.tools.description',
  },
  {
    target: 'help',
    titleKey: 'productTour.step.help.title',
    descriptionKey: 'productTour.step.help.description',
  },
] as const satisfies ReadonlyArray<{
  target: string;
  fallbackTarget?: string;
  titleKey: ProductTourKey;
  descriptionKey: ProductTourKey;
}>;

export type ProductTourStatus = 'new' | 'in_progress' | 'dismissed' | 'completed';

export type ProductTourProgress = {
  status: ProductTourStatus;
  step: number;
};

type PersistedProductTourProgress = {
  status: Exclude<ProductTourStatus, 'new'>;
  step: number;
};

type ProductTourStorage = Pick<Storage, 'getItem' | 'setItem'>;

const DEFAULT_PROGRESS: ProductTourProgress = { status: 'new', step: 0 };
const PERSISTED_STATUSES = new Set<ProductTourStatus>(['in_progress', 'dismissed', 'completed']);

function clampStep(step: unknown): number {
  if (typeof step !== 'number' || !Number.isInteger(step)) {
    return 0;
  }

  return Math.min(Math.max(step, 0), PRODUCT_TOUR_STEPS.length - 1);
}

export function readProductTourProgress(storage: ProductTourStorage | null | undefined): ProductTourProgress {
  if (!storage) {
    return DEFAULT_PROGRESS;
  }

  try {
    const raw = storage.getItem(PRODUCT_TOUR_STORAGE_KEY);

    if (!raw) {
      return DEFAULT_PROGRESS;
    }

    const parsed = JSON.parse(raw) as { version?: unknown; status?: unknown; step?: unknown };

    if (parsed.version !== 1 || typeof parsed.status !== 'string') {
      return DEFAULT_PROGRESS;
    }

    const status = parsed.status as ProductTourStatus;

    if (!PERSISTED_STATUSES.has(status)) {
      return DEFAULT_PROGRESS;
    }

    return { status, step: clampStep(parsed.step) };
  } catch {
    return DEFAULT_PROGRESS;
  }
}

export function persistProductTourProgress(
  storage: ProductTourStorage | null | undefined,
  progress: PersistedProductTourProgress,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(PRODUCT_TOUR_STORAGE_KEY, JSON.stringify({ version: 1, ...progress }));
  } catch {
    // Storage can be unavailable in private browsing; the tour remains usable for the current page.
  }
}

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/*
 * BUG-UX-TOUR-REAPPEARS: localStorage alone was the only persistence, so the
 * tour came back on every page/project open whenever the cache could not hold
 * the verdict — quota-saturated or private-mode storage (setItem throws and is
 * swallowed), storage evicted by the browser, or simply another device. The
 * dismissal/completion is now ALSO stored in the signed-in user's server
 * preferences blob (`/api/user/preferences`, key `productTour`, shallow-merged
 * server-side), and the component asks the server before auto-opening.
 * localStorage remains the fast local cache; unauthenticated/offline sessions
 * keep the previous localStorage-only behavior.
 */
export const PRODUCT_TOUR_PREFERENCE_KEY = 'productTour';

const USER_PREFERENCES_ENDPOINT = '/api/user/preferences';

function canReachServer(): boolean {
  return typeof globalThis.window !== 'undefined' && typeof globalThis.fetch === 'function';
}

function parseServerProgress(value: unknown): PersistedProductTourProgress | undefined {
  const parsed = value as { version?: unknown; status?: unknown; step?: unknown } | undefined;

  if (!parsed || parsed.version !== 1 || typeof parsed.status !== 'string') {
    return undefined;
  }

  const status = parsed.status as ProductTourStatus;

  if (!PERSISTED_STATUSES.has(status)) {
    return undefined;
  }

  return { status: status as PersistedProductTourProgress['status'], step: clampStep(parsed.step) };
}

/*
 * Fetch the persisted verdict at most once per page load (every SaaSLayout mount
 * shares the promise). Resolves `undefined` when the user has no stored value,
 * is unauthenticated (401), or the backend is unreachable — the caller then
 * falls back to the localStorage verdict.
 */
let serverProgressPromise: Promise<PersistedProductTourProgress | undefined> | undefined;

export function fetchProductTourProgressFromServer(): Promise<PersistedProductTourProgress | undefined> {
  if (serverProgressPromise) {
    return serverProgressPromise;
  }

  if (!canReachServer()) {
    serverProgressPromise = Promise.resolve(undefined);

    return serverProgressPromise;
  }

  serverProgressPromise = globalThis
    .fetch(USER_PREFERENCES_ENDPOINT, { headers: { accept: 'application/json' } })
    .then((response) => (response.ok ? response.json() : undefined))
    .then((payload) =>
      parseServerProgress(
        (payload as { preferences?: Record<string, unknown> } | undefined)?.preferences?.[PRODUCT_TOUR_PREFERENCE_KEY],
      ),
    )
    .catch(() => undefined);

  return serverProgressPromise;
}

/**
 * Best-effort push of the verdict into the server preferences blob. Never
 * throws — a 401 / offline session is a no-op and localStorage remains the
 * local source of truth.
 */
export function pushProductTourProgressToServer(progress: PersistedProductTourProgress): void {
  // Later mounts in the same page load must see the fresh verdict, not a stale fetch.
  serverProgressPromise = Promise.resolve(progress);

  if (!canReachServer()) {
    return;
  }

  try {
    void globalThis
      .fetch(USER_PREFERENCES_ENDPOINT, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ preferences: { [PRODUCT_TOUR_PREFERENCE_KEY]: { version: 1, ...progress } } }),
      })
      .catch(() => undefined);
  } catch {
    // Offline / no backend account — keep the localStorage value.
  }
}

/** Test-only: drop the memoized server fetch so each case starts clean. */
export function __resetProductTourServerCache(): void {
  serverProgressPromise = undefined;
}

function isVisibleTarget(element: HTMLElement): boolean {
  const styles = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();

  return (
    styles.display !== 'none' &&
    styles.visibility !== 'hidden' &&
    !element.closest('[aria-hidden="true"]') &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.right > 0 &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.top < window.innerHeight
  );
}

function findVisibleTarget(target: string, fallbackTarget?: string): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('[data-vc-tour-target]'));
  const match = candidates.find((element) => element.dataset.vcTourTarget === target && isVisibleTarget(element));

  if (match || !fallbackTarget) {
    return match ?? null;
  }

  return (
    candidates.find((element) => element.dataset.vcTourTarget === fallbackTarget && isVisibleTarget(element)) ?? null
  );
}

export function ProductTour({ restartToken }: { restartToken: number }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getProductTourCopy(language);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = PRODUCT_TOUR_STEPS[stepIndex];
  const stepTitle = copy[step.titleKey];
  const stepDescription = copy[step.descriptionKey];

  useEffect(() => {
    const progress = readProductTourProgress(getBrowserStorage());

    setStepIndex(progress.step);
    setReady(true);

    // A local verdict is definitive: never auto-reopen a dismissed/completed tour.
    if (progress.status === 'dismissed' || progress.status === 'completed') {
      return undefined;
    }

    /*
     * No local verdict (or an in-progress one): ask the backend before opening,
     * so a dismissal recorded on another device — or recorded while localStorage
     * was full/unavailable — keeps the tour closed (BUG-UX-TOUR-REAPPEARS).
     */
    let cancelled = false;

    void fetchProductTourProgressFromServer().then((serverProgress) => {
      if (cancelled) {
        return;
      }

      if (serverProgress && (serverProgress.status === 'dismissed' || serverProgress.status === 'completed')) {
        // Heal the local cache so the next open doesn't need the network.
        persistProductTourProgress(getBrowserStorage(), serverProgress);
        setOpen(false);

        return;
      }

      setStepIndex((current) => serverProgress?.step ?? current);
      setOpen(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || restartToken === 0) {
      return;
    }

    const progress = readProductTourProgress(getBrowserStorage());

    setStepIndex(progress.status === 'completed' ? 0 : progress.step);
    setOpen(true);
  }, [ready, restartToken]);

  useEffect(() => {
    if (!ready || !open) {
      return;
    }

    persistProductTourProgress(getBrowserStorage(), { status: 'in_progress', step: stepIndex });
  }, [open, ready, stepIndex]);

  useEffect(() => {
    if (!ready || !open) {
      return undefined;
    }

    let target: HTMLElement | null = null;

    const activateVisibleTarget = () => {
      target?.removeAttribute('data-vc-tour-active');
      target = findVisibleTarget(step.target, 'fallbackTarget' in step ? step.fallbackTarget : undefined);
      target?.setAttribute('data-vc-tour-active', 'true');
    };

    activateVisibleTarget();
    window.addEventListener('resize', activateVisibleTarget);

    return () => {
      window.removeEventListener('resize', activateVisibleTarget);
      target?.removeAttribute('data-vc-tour-active');
    };
  }, [open, ready, step]);

  const dismiss = useCallback(() => {
    const progress = { status: 'dismissed', step: stepIndex } as const;

    persistProductTourProgress(getBrowserStorage(), progress);
    pushProductTourProgressToServer(progress);
    setOpen(false);
  }, [stepIndex]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss, open]);

  if (!ready || !open) {
    return null;
  }

  const isLastStep = stepIndex === PRODUCT_TOUR_STEPS.length - 1;

  const complete = () => {
    const progress = { status: 'completed', step: 0 } as const;

    persistProductTourProgress(getBrowserStorage(), progress);
    pushProductTourProgressToServer(progress);
    setOpen(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-end px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+8px)] sm:px-4 sm:pt-4 sm:pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <aside
        className="vc-product-tour pointer-events-auto max-h-[min(78dvh,480px)] w-full max-w-[380px] overflow-x-hidden overflow-y-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-bolt-elements-textPrimary shadow-2xl"
        role="dialog"
        aria-modal="false"
        aria-labelledby="vc-product-tour-title"
        aria-describedby="vc-product-tour-description"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-words text-xs font-medium uppercase leading-5 text-bolt-elements-textTertiary">
              {formatProductTourStepCounter(language, stepIndex + 1, PRODUCT_TOUR_STEPS.length)}
            </p>
            <h2 id="vc-product-tour-title" className="mt-1 break-words text-lg font-semibold leading-6">
              {stepTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
            aria-label={copy['productTour.close']}
            aria-keyshortcuts="Escape"
            title={copy['productTour.close']}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          className="mt-3 grid grid-cols-4 gap-1.5"
          role="progressbar"
          aria-label={copy['productTour.progress']}
          aria-valuemin={1}
          aria-valuemax={PRODUCT_TOUR_STEPS.length}
          aria-valuenow={stepIndex + 1}
        >
          {PRODUCT_TOUR_STEPS.map((item, index) => (
            <span
              key={item.target}
              className={classNames(
                'h-1.5 rounded-full',
                index <= stepIndex ? 'bg-[var(--vc-action-primary)]' : 'bg-bolt-elements-background-depth-4',
              )}
              aria-hidden
            />
          ))}
        </div>

        <p
          id="vc-product-tour-description"
          className="mt-4 break-words text-sm leading-6 text-bolt-elements-textSecondary"
          aria-live="polite"
        >
          {stepDescription}
        </p>

        <div className="mt-5 flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            type="button"
            variant="ghost"
            className="min-h-[44px] w-full min-w-0 justify-center whitespace-normal px-3 text-center leading-snug sm:w-auto"
            onClick={dismiss}
          >
            {copy['productTour.action.later']}
          </Button>
          <div className="grid w-full min-w-0 grid-cols-2 items-stretch gap-2 sm:flex sm:w-auto sm:items-center">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] min-w-0 justify-center whitespace-normal px-3 text-center leading-snug"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              {copy['productTour.action.back']}
            </Button>
            <Button
              type="button"
              variant="primary"
              className="min-h-[44px] min-w-0 justify-center whitespace-normal px-3 text-center leading-snug"
              onClick={isLastStep ? complete : () => setStepIndex((current) => current + 1)}
            >
              {isLastStep ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  {copy['productTour.action.finish']}
                </>
              ) : (
                <>
                  {copy['productTour.action.next']}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </>
              )}
            </Button>
          </div>
        </div>
      </aside>
    </div>
  );
}
