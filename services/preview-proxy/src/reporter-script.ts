/*
 * Preview error reporter, injected into remote (Kubernetes) preview HTML by the
 * preview-proxy so the IDE's Console DevTools tab receives runtime errors for
 * remote previews the same way it does for WebContainer previews. The script
 * hooks `window 'error'` / `'unhandledrejection'` and `console.*` and forwards
 * them to the parent IDE (cross-origin via postMessage(..., '*')) as
 * PREVIEW_ERROR / PREVIEW_UNHANDLED_REJECTION / PREVIEW_CONSOLE messages.
 *
 * Kept byte-compatible with public/vibecore-preview-reporter.js (the WebContainer
 * copy) for the error/unhandledrejection payloads so the IDE handler in
 * app/components/workbench/Preview.tsx treats both transports identically.
 */
export const REPORTER_SCRIPT = `(function () {
  if (window.__vibecorePreviewReporterInstalled) {
    return;
  }
  window.__vibecorePreviewReporterInstalled = true;

  function send(payload) {
    try {
      window.parent.postMessage(payload, '*');
    } catch (error) {
      // parent may have closed; nothing to do.
    }
  }

  window.addEventListener('error', function (event) {
    send({
      type: 'PREVIEW_ERROR',
      message: event.message || 'Unknown runtime error',
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
      colno: event.colno || undefined,
      stack: event.error && event.error.stack ? String(event.error.stack) : undefined,
      ts: Date.now(),
    });
  });

  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    var message = 'Unhandled promise rejection';
    var stack;
    if (reason && typeof reason === 'object') {
      message = reason.message ? String(reason.message) : message;
      stack = reason.stack ? String(reason.stack) : undefined;
    } else if (reason !== undefined) {
      message = String(reason);
    }
    send({
      type: 'PREVIEW_UNHANDLED_REJECTION',
      message: message,
      stack: stack,
      ts: Date.now(),
    });
  });

  function formatArg(arg) {
    if (typeof arg === 'string') {
      return arg;
    }
    if (arg instanceof Error) {
      return arg.stack ? String(arg.stack) : String(arg.message || arg);
    }
    try {
      return JSON.stringify(arg);
    } catch (error) {
      return String(arg);
    }
  }

  /*
   * Blank-preview watchdog. A page that is served (HTTP 200) but never mounts —
   * a generated index.html missing its entry script, an entry that throws on
   * mount, etc. — leaves the SPA mount node empty and shows a silent white
   * screen. Detect it and report ONCE (to the parent IDE for a clear message +
   * one auto-reload, and to the proxy for a server-side log) so a blank preview
   * is never invisible. Two-stage (empty at ~10s AND still empty ~8s later) to
   * avoid false-positives on a slow-but-fine cold boot.
   */
  function mountIsEmpty() {
    var mount = document.getElementById('root') || document.getElementById('app');
    if (!mount) {
      return false; // no SPA mount node → a static/multi-page doc, not our case.
    }
    var bodyText = ((document.body && document.body.innerText) || '').trim();
    return mount.children.length === 0 && bodyText.length === 0;
  }

  var blankReported = false;
  function reportBlank() {
    if (blankReported || !mountIsEmpty()) {
      return;
    }
    blankReported = true;
    var payload = { type: 'PREVIEW_BLANK', message: 'Preview served but the app never mounted', url: location.href, ts: Date.now() };
    send(payload);
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon('/__vibecore/preview-blank', JSON.stringify({ url: payload.url, ts: payload.ts }));
      }
    } catch (error) {
      // best-effort server log; never break the page.
    }
  }
  setTimeout(function () {
    if (mountIsEmpty()) {
      setTimeout(reportBlank, 8000);
    }
  }, 10000);

  var levels = ['log', 'info', 'warn', 'error', 'debug'];
  levels.forEach(function (level) {
    var original = console[level];
    if (typeof original !== 'function') {
      return;
    }
    console[level] = function () {
      try {
        var args = Array.prototype.slice.call(arguments);
        send({
          type: 'PREVIEW_CONSOLE',
          level: level,
          message: args.map(formatArg).join(' '),
          ts: Date.now(),
        });
      } catch (error) {
        // never let reporting break the app's own console call.
      }
      return original.apply(console, arguments);
    };
  });
})();`;
