// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The tested browser helper lives outside the app-only ~/ alias.
// eslint-disable-next-line no-restricted-imports
import { observeWorkbenchView } from '../e2e/helpers/workbench-view-settled';

function fixture(transform = 'none') {
  document.body.innerHTML = `<section data-testid="mobile-workbench-keepalive"><div data-testid="workbench-view-viewport"><div class="absolute inset-0" style="transform:${transform}"><div><button>Action</button></div></div></div></section>`;
  return {
    target: document.querySelector('button')!,
    view: document.querySelector('.absolute')!,
    viewport: document.querySelector('[data-testid="workbench-view-viewport"]')!,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));

  /*
   * jsdom has no native matrix geometry. Browser spec exercises native
   * DOMMatrixReadOnly; these unit tests cover lifecycle and deadline only.
   */
  vi.stubGlobal(
    'DOMMatrixReadOnly',
    class {
      isIdentity: boolean;
      constructor(value: string) {
        this.isIdentity = value === 'matrix(1, 0, 0, 1, 0, 0)';
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('observation-only Workbench settlement', () => {
  it('accepts a captured View at identity', async () => {
    const { target } = fixture();
    await expect(observeWorkbenchView([target])).resolves.toBe('settled');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('waits for translation, then releases at identity without an action', async () => {
    const { target, view } = fixture('translateX(39.9897%)');
    const pending = observeWorkbenchView([target]);
    await vi.advanceTimersByTimeAsync(32);
    (view as HTMLElement).style.transform = 'none';
    await vi.advanceTimersByTimeAsync(16);
    await expect(pending).resolves.toBe('settled');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not release when a transition is interrupted and reversed', async () => {
    const { target, view } = fixture('translateX(39%)');

    let result: string | undefined;

    const pending = observeWorkbenchView([target]).then((value) => {
      result = value;
    });

    for (const position of ['70%', '20%']) {
      (view as HTMLElement).style.transform = `translateX(${position})`;
      await vi.advanceTimersByTimeAsync(32);
      expect(result).toBeUndefined();
    }
    (view as HTMLElement).style.transform = 'none';
    await vi.advanceTimersByTimeAsync(16);
    await pending;
    expect(result).toBe('settled');
  });
  it('rejects zero or ambiguous targets immediately', async () => {
    const { target } = fixture();
    await expect(observeWorkbenchView([])).resolves.toBe('invalid-target');
    await expect(observeWorkbenchView([target, target])).resolves.toBe('invalid-target');
  });
  it('rejects wrong direct ancestor even when an outer ancestor has identity', async () => {
    const { target, view } = fixture();
    view.className = 'wrong-view';
    await expect(observeWorkbenchView([target])).resolves.toBe('invalid-view');
  });
  it('does not adopt a replacement action', async () => {
    const { target } = fixture('translateX(50%)');
    const pending = observeWorkbenchView([target]);
    target.replaceWith(target.cloneNode(true));
    await vi.advanceTimersByTimeAsync(16);
    await expect(pending).resolves.toBe('detached');
  });
  it('rejects reparenting a still-connected target', async () => {
    const { target, viewport } = fixture('translateX(50%)');
    const pending = observeWorkbenchView([target]);
    viewport.append(target);
    await vi.advanceTimersByTimeAsync(16);
    await expect(pending).resolves.toBe('invalid-view');
  });
  it('bounds permanent translation to exactly 5s', async () => {
    const { target } = fixture('translateX(0.00001%)');

    let result: string | undefined;

    const pending = observeWorkbenchView([target]).then((value) => {
      result = value;
    });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(result).toBe('timed-out');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps the deadline if RAF never runs', async () => {
    vi.stubGlobal('requestAnimationFrame', () => 1);

    const { target } = fixture('translateX(50%)');
    const pending = observeWorkbenchView([target]);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBe('timed-out');
  });
  it('does not wait for an overlay or inspect hit-testing', async () => {
    const { target } = fixture();
    document.body.insertAdjacentHTML(
      'beforeend',
      '<div style="position:fixed;inset:0;z-index:9999">Persistent overlay</div>',
    );
    await expect(observeWorkbenchView([target])).resolves.toBe('settled');
    expect(document.body.textContent).toContain('Persistent overlay');
  });
});
