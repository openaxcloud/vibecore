/* VibeCore preview error reporter.
 * Drop this file into the <head> of any preview entry HTML to forward
 * runtime errors and unhandled rejections to the parent IDE.
 *
 *   <script src="/vibecore-preview-reporter.js"></script>
 *
 * The script is intentionally tiny and uses postMessage("*") so it works
 * across same-origin and webcontainer cross-origin previews.
 */
(function () {
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
})();
