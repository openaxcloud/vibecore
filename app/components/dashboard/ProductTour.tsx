import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '~/components/ui/Button';
import { classNames } from '~/utils/classNames';

export const PRODUCT_TOUR_STORAGE_KEY = 'ecode:user-area-tour:v1';

export const PRODUCT_TOUR_STEPS = [
  {
    target: 'navigation',
    title: 'Navigate your workspace',
    description: 'Projects, usage, billing, team controls, and account settings stay together in the main menu.',
  },
  {
    target: 'create-project',
    fallbackTarget: 'navigation',
    title: 'Build from a prompt',
    description: 'Choose New project, describe what you need, then add advanced options only when they are useful.',
  },
  {
    target: 'tools',
    title: 'Find work and updates',
    description: 'Search opens any workspace destination, while notifications keep recent activity close at hand.',
  },
  {
    target: 'help',
    title: 'Return whenever you need it',
    description: 'Open Help to resume this guide, read the documentation, or contact support.',
  },
] as const;

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
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const step = PRODUCT_TOUR_STEPS[stepIndex];

  useEffect(() => {
    const progress = readProductTourProgress(getBrowserStorage());

    setStepIndex(progress.step);
    setOpen(progress.status === 'new' || progress.status === 'in_progress');
    setReady(true);
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
    persistProductTourProgress(getBrowserStorage(), { status: 'dismissed', step: stepIndex });
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
    persistProductTourProgress(getBrowserStorage(), { status: 'completed', step: 0 });
    setOpen(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex justify-end p-3 pb-[calc(env(safe-area-inset-bottom)+12px)] sm:p-4">
      <aside
        className="vc-product-tour pointer-events-auto max-h-[min(70dvh,430px)] w-full max-w-[380px] overflow-y-auto rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-bolt-elements-textPrimary shadow-2xl"
        role="dialog"
        aria-modal="false"
        aria-labelledby="vc-product-tour-title"
        aria-describedby="vc-product-tour-description"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-bolt-elements-textTertiary">
              Guided tour - Step {stepIndex + 1} of {PRODUCT_TOUR_STEPS.length}
            </p>
            <h2 id="vc-product-tour-title" className="mt-1 text-lg font-semibold leading-6">
              {step.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-action-primary)]"
            aria-label="Close guided tour"
            aria-keyshortcuts="Escape"
            title="Close guided tour"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          className="mt-3 grid grid-cols-4 gap-1.5"
          role="progressbar"
          aria-label="Guided tour progress"
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
          className="mt-4 text-sm leading-6 text-bolt-elements-textSecondary"
          aria-live="polite"
        >
          {step.description}
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" className="min-h-[44px] px-3" onClick={dismiss}>
            Not now
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] px-3"
              disabled={stepIndex === 0}
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Back
            </Button>
            <Button
              type="button"
              variant="primary"
              className="min-h-[44px] px-3"
              onClick={isLastStep ? complete : () => setStepIndex((current) => current + 1)}
            >
              {isLastStep ? (
                <>
                  <Check className="h-4 w-4" aria-hidden />
                  Finish
                </>
              ) : (
                <>
                  Next
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
