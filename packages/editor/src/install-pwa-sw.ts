/*
 * Standalone leaf module — MUST stay dependency-free.
 *
 * `app/root.tsx` calls this on every page, marketing pages included. Importing
 * it from the package barrel (`@vibecore/editor`) pulled the barrel's whole
 * static graph — every `@codemirror/*` value import — into the ROOT route's
 * module graph, so React Router emitted `<link rel="modulepreload">` for the
 * editor vendor chunks on every single page. Measured on prod 2026-08-12:
 * 104 preloads / 2 113 KB transferred / `load` at 6 062 ms on `e-code.ai/`,
 * of which ~912 KB was IDE-only code (monaco 573 KB, codemirror 257 KB,
 * xterm 82 KB) that a marketing visitor never runs. See BUG-PERF-LOAD.
 *
 * Keep this file free of imports so the root route's graph stays small.
 */
export function installEditorPwaServiceWorker(scriptUrl = '/sw.js') {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  const register = () => {
    navigator.serviceWorker.register(scriptUrl).catch(() => undefined);
  };

  /*
   * This is typically called from a React effect, which runs *after* the
   * document 'load' event has already fired on a normal hard page load. In
   * that case adding a 'load' listener would never invoke the callback and the
   * service worker would never register. Register immediately when the
   * document has finished loading; otherwise defer until 'load'.
   */
  if (typeof document === 'undefined' || document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}
