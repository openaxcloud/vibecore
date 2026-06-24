import { afterEach, describe, expect, it, vi } from 'vitest';
import { installEditorPwaServiceWorker } from './index.js';

type LoadListener = () => void;

function setupBrowserEnv(readyState: DocumentReadyState) {
  const register = vi.fn(() => Promise.resolve(undefined));
  const loadListeners: LoadListener[] = [];

  const addEventListener = vi.fn((type: string, listener: LoadListener) => {
    if (type === 'load') {
      loadListeners.push(listener);
    }
  });

  vi.stubGlobal('navigator', { serviceWorker: { register } });
  vi.stubGlobal('document', { readyState });
  vi.stubGlobal('window', { addEventListener });

  return {
    register,
    addEventListener,
    fireLoad: () => loadListeners.forEach((listener) => listener()),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('installEditorPwaServiceWorker', () => {
  it('registers immediately when the document has already finished loading', () => {
    const { register, addEventListener } = setupBrowserEnv('complete');

    installEditorPwaServiceWorker();

    /*
     * The common case: called from a React effect after the document 'load'
     * event has already fired. Registration must happen synchronously rather
     * than waiting for a 'load' event that will never come again.
     */
    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js');
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it('defers registration to the load event while the document is still loading', () => {
    const { register, addEventListener, fireLoad } = setupBrowserEnv('loading');

    installEditorPwaServiceWorker();

    expect(register).not.toHaveBeenCalled();
    expect(addEventListener).toHaveBeenCalledWith('load', expect.any(Function), { once: true });

    fireLoad();

    expect(register).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledWith('/sw.js');
  });

  it('passes a custom script url through to register', () => {
    const { register } = setupBrowserEnv('complete');

    installEditorPwaServiceWorker('/custom-sw.js');

    expect(register).toHaveBeenCalledWith('/custom-sw.js');
  });

  it('is a no-op when service workers are unsupported', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { readyState: 'complete' });

    const addEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener });

    expect(() => installEditorPwaServiceWorker()).not.toThrow();
    expect(addEventListener).not.toHaveBeenCalled();
  });
});
