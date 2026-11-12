import type { Locator } from '@playwright/test';

export type ViewSettlement = 'settled' | 'invalid-target' | 'invalid-view' | 'detached' | 'timed-out';

/*
 * Self-contained: Playwright serializes this callback into the page. Observe
 * only the captured node and its owning View, never hit targets or overlays.
 */
export function observeWorkbenchView(nodes: Element[]): Promise<ViewSettlement> {
  if (nodes.length !== 1 || !nodes[0].isConnected) {
    return Promise.resolve('invalid-target');
  }

  const target = nodes[0];
  const viewport = target.closest('[data-testid="workbench-view-viewport"]');
  const shell = viewport?.closest('[data-testid="mobile-workbench-keepalive"]');

  if (!viewport || !shell) {
    return Promise.resolve('invalid-view');
  }

  let view: Element = target;

  while (view.parentElement && view.parentElement !== viewport) {
    view = view.parentElement;
  }

  if (view.parentElement !== viewport || !view.matches('.absolute.inset-0') || view === target) {
    return Promise.resolve('invalid-view');
  }

  const capturedView = view;

  return new Promise((resolve) => {
    let frame: number | undefined;
    let done = false;

    /*
     * Independent timer also bounds a backgrounded/throttled RAF. This is a
     * separate observation deadline matching the suite's 5s assertion budget.
     * It is not a sleep or an implicit action timeout.
     */
    const deadline = setTimeout(() => finish('timed-out'), 5_000);

    function finish(result: ViewSettlement) {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(deadline);

      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }

      resolve(result);
    }

    function sample() {
      if (done) {
        return;
      }

      if (!target.isConnected || !capturedView.isConnected || !viewport!.isConnected || !shell!.isConnected) {
        finish('detached');
        return;
      }

      if (
        capturedView.parentElement !== viewport ||
        !capturedView.contains(target) ||
        target.closest('[data-testid="workbench-view-viewport"]') !== viewport ||
        viewport!.closest('[data-testid="mobile-workbench-keepalive"]') !== shell ||
        !capturedView.matches('.absolute.inset-0')
      ) {
        finish('invalid-view');
        return;
      }

      /*
       * Trace evidence: Framer Motion writes `transform: none` at rest.
       * CSS may expose an equivalent exact identity matrix; no epsilon that
       * could accept a nearly-finished translation is used.
       */
      const transform = getComputedStyle(capturedView).transform;

      let identity = transform === 'none';

      if (!identity) {
        try {
          identity = new DOMMatrixReadOnly(transform).isIdentity;
        } catch {
          /* fail closed */
        }
      }

      if (identity) {
        finish('settled');
      } else {
        frame = requestAnimationFrame(sample);
      }
    }
    sample();
  });
}

export function waitForWorkbenchViewSettled(action: Locator): Promise<ViewSettlement> {
  /*
   * evaluateAll resolves the current match set without locator auto-waiting.
   * It pins DOM identity for the entire observation, including disappearance.
   */
  return action.evaluateAll(observeWorkbenchView);
}
