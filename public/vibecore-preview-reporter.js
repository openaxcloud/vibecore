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

  /*
   * Last uncaught error message, so the blank-preview overlay can name the real
   * cause instead of a generic "never rendered". Kept in sync with the preview-proxy
   * reporter (services/preview-proxy/src/reporter-script.ts).
   */
  var lastErrorMessage = '';

  window.addEventListener('error', (event) => {
    if (event.message) {
      lastErrorMessage = String(event.message);
    } else if (event.error && event.error.message) {
      lastErrorMessage = String(event.error.message);
    }

    send({
      type: 'PREVIEW_ERROR',
      message: event.message || undefined,
      filename: event.filename || undefined,
      lineno: event.lineno || undefined,
      colno: event.colno || undefined,
      stack: event.error && event.error.stack ? String(event.error.stack) : undefined,
      ts: Date.now(),
    });

    scheduleLoadErrorBlankCheck();
  });

  window.addEventListener('unhandledrejection', (event) => {
    var reason = event.reason;
    var message;
    var stack;

    if (reason && typeof reason === 'object') {
      message = reason.message ? String(reason.message) : message;
      stack = reason.stack ? String(reason.stack) : undefined;
    } else if (reason !== undefined) {
      message = String(reason);
    }

    lastErrorMessage = message;

    send({
      type: 'PREVIEW_UNHANDLED_REJECTION',
      message,
      stack,
      ts: Date.now(),
    });

    scheduleLoadErrorBlankCheck();
  });

  /*
   * Blank-preview fail-safe (mirrors services/preview-proxy/src/reporter-script.ts).
   * A page served HTTP 200 whose SPA root never mounts — a stale/empty entry, an
   * app that throws on load — is a SILENT white screen. Report it (so the IDE gets
   * PREVIEW_BLANK) and render a visible in-frame overlay naming the real error, so
   * a blank is never invisible even when this reporter is the only thing injected
   * (the api-origin preview fallback). The overlay ONLY draws when the mount is
   * genuinely empty and is fully try/catch-guarded, so it can never cover or break
   * a working app.
   */
  function mountIsEmpty() {
    var mount = document.getElementById('root') || document.getElementById('app');

    if (!mount) {
      return false; // no SPA mount node → a static/multi-page doc, not our case.
    }

    var bodyText = ((document.body && document.body.innerText) || '').trim();

    return mount.children.length === 0 && bodyText.length === 0;
  }

  var OVERLAY_ID = '__vibecorePreviewBlankOverlay';

  function renderBlankOverlay(detail) {
    try {
      if (!document.body || document.getElementById(OVERLAY_ID) || !mountIsEmpty()) {
        return;
      }

      var wrap = document.createElement('div');
      wrap.id = OVERLAY_ID;
      wrap.setAttribute('role', 'alert');
      wrap.style.cssText =
        'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:#0d1117;color:#c9d1d9;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;';

      var card = document.createElement('div');
      card.style.cssText = 'max-width:520px;width:100%;';

      var h = document.createElement('div');
      h.style.cssText = 'font-size:15px;font-weight:600;margin:0 0 8px;color:#f0f6fc;';

      /*
       * Cet overlay est injecté DANS la page de l'application : il n'a ni React
       * ni le catalogue i18n de la plateforme. Il choisit donc sa langue à la
       * source la plus fiable disponible ici — la langue du document si le
       * gabarit en déclare une, sinon celle du navigateur.
       */
      var fr = false;

      try {
        var tag = (document.documentElement.getAttribute('lang') || navigator.language || '').toLowerCase();
        fr = tag.indexOf('fr') === 0;
      } catch (error) {
        fr = false;
      }

      h.textContent = fr ? 'Cet aperçu n\u2019a pas pu se charger' : 'This preview failed to load';

      var p = document.createElement('div');
      p.style.cssText = 'font-size:13px;line-height:1.5;color:#8b949e;margin:0 0 14px;';
      p.textContent = fr
        ? 'Le serveur de développement tourne, mais l\u2019application ne s\u2019est jamais affichée \u2014 une erreur dans son code l\u2019a arrêtée avant qu\u2019elle ne démarre.'
        : 'The dev server is running but the app never rendered — an error in the app code stopped it before it could mount.';

      card.appendChild(h);
      card.appendChild(p);

      if (detail) {
        var pre = document.createElement('div');
        pre.style.cssText =
          'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;color:#ffa198;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;margin:0 0 14px;white-space:pre-wrap;word-break:break-word;';
        pre.textContent = detail;
        card.appendChild(pre);
      }

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = fr ? 'Recharger l\u2019aperçu' : 'Reload preview';
      btn.style.cssText =
        'font:inherit;font-size:13px;font-weight:500;color:#fff;background:#238636;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btn.addEventListener('click', () => {
        try {
          location.reload();
        } catch (error) {
          // ignore; a reload failure must not throw out of the click handler.
        }
      });
      card.appendChild(btn);

      wrap.appendChild(card);
      document.body.appendChild(wrap);
    } catch (error) {
      // fail-safe: the overlay must never break the page it is trying to explain.
    }
  }

  var blankReported = false;

  function reportBlank() {
    if (blankReported || !mountIsEmpty()) {
      return;
    }

    blankReported = true;

    var message = lastErrorMessage
      ? 'Preview served but the app never mounted: ' + lastErrorMessage
      : 'Preview served but the app never mounted';

    send({ type: 'PREVIEW_BLANK', message, url: location.href, ts: Date.now() });
    renderBlankOverlay(lastErrorMessage);
  }

  var loadErrorCheckScheduled = false;

  function scheduleLoadErrorBlankCheck() {
    if (loadErrorCheckScheduled) {
      return;
    }

    loadErrorCheckScheduled = true;

    /*
     * Give a slow/late mount a short grace; if still empty after a load-time error,
     * it is definitively broken → surface now instead of at the slow watchdog.
     */
    setTimeout(reportBlank, 1500);
  }

  setTimeout(() => {
    if (mountIsEmpty()) {
      setTimeout(reportBlank, 8000);
    }
  }, 10000);

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
