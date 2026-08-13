/*
 * VibeCore preview error reporter.
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

  window.addEventListener('error', (event) => {
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

  window.addEventListener('unhandledrejection', (event) => {
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
      message,
      stack,
      ts: Date.now(),
    });
  });

  /*
   * Serialize a single console argument to a stable string. Mirrors
   * serializeConsoleArg in preview-reporter-format.ts (kept in sync because a
   * static <script> cannot import the TS module). Never throws.
   */
  function serializeConsoleArg(value) {
    if (typeof value === 'string') {
      return value;
    }

    if (value === undefined) {
      return 'undefined';
    }

    if (value === null) {
      return 'null';
    }

    if (value instanceof Error) {
      return value.stack ? String(value.stack) : value.name + ': ' + value.message;
    }

    var valueType = typeof value;

    if (valueType === 'number' || valueType === 'boolean' || valueType === 'bigint' || valueType === 'symbol') {
      return String(value);
    }

    if (valueType === 'function') {
      return '[Function' + (value.name ? ': ' + value.name : '') + ']';
    }

    try {
      var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
      var json = JSON.stringify(value, (_key, nested) => {
        if (typeof nested === 'object' && nested !== null && seen) {
          if (seen.has(nested)) {
            return '[Circular]';
          }

          seen.add(nested);
        }

        if (typeof nested === 'bigint') {
          return String(nested);
        }

        return nested;
      });

      return json === undefined ? String(value) : json;
    } catch (error) {
      try {
        return String(value);
      } catch (stringifyError) {
        return '[Unserializable]';
      }
    }
  }

  var MAX_CONSOLE_MESSAGE_LENGTH = 8000;

  function formatConsoleMessage(args) {
    var parts = [];

    for (var i = 0; i < args.length; i++) {
      parts.push(serializeConsoleArg(args[i]));
    }
    var message = parts.join(' ');

    if (message.length > MAX_CONSOLE_MESSAGE_LENGTH) {
      return message.slice(0, MAX_CONSOLE_MESSAGE_LENGTH) + '… (truncated)';
    }

    return message;
  }

  /*
   * Wrap console.log/info/warn/error/debug so the running app's ordinary
   * console output is forwarded to the parent IDE Console tab, not just
   * uncaught errors. The original console method is always invoked so the
   * app's own devtools experience is unchanged.
   */
  var consoleLevels = ['log', 'info', 'warn', 'error', 'debug'];

  for (var levelIndex = 0; levelIndex < consoleLevels.length; levelIndex++) {
    (function (level) {
      if (!window.console || typeof window.console[level] !== 'function') {
        return;
      }

      var original = window.console[level];

      window.console[level] = function () {
        var args = Array.prototype.slice.call(arguments);

        try {
          send({
            type: 'PREVIEW_CONSOLE',
            level,
            message: formatConsoleMessage(args),
            ts: Date.now(),
          });
        } catch (reportError) {
          // Reporting must never break the app's own logging.
        }

        return original.apply(this, args);
      };
    })(consoleLevels[levelIndex]);
  }
})();
