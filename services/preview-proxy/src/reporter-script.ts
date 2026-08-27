/*
 * Preview error reporter, injected into remote (Kubernetes) preview HTML by the
 * preview-proxy so the IDE's Console DevTools tab receives runtime errors for
 * remote previews the same way it does for WebContainer previews. The script
 * hooks `window 'error'` / `'unhandledrejection'` and `console.*` and forwards
 * them to the parent IDE (cross-origin via postMessage(..., '*')) as
 * PREVIEW_ERROR / PREVIEW_UNHANDLED_REJECTION / PREVIEW_CONSOLE messages.
 *
 * It also carries a blank-preview fail-safe: when the app is served (HTTP 200)
 * but never renders (an uncaught error at module-eval — e.g. a stray
 * "Cannot redefine property: process" from a colliding polyfill/extension — or a
 * missing entry script), the SPA mount node stays empty and the user sees a
 * SILENT white screen. That is invisible with no error state, which is exactly
 * the recurring "Webview blanc" launch-blocker. To make it never invisible the
 * reporter (a) reports promptly (~1.5s after a load-time uncaught error, instead
 * of only the slow 18s silent-blank watchdog) and (b) renders a visible in-frame
 * overlay naming the real error — so the failure is diagnosable from inside the
 * iframe regardless of how the parent IDE surfaces it. The overlay ONLY draws
 * when the mount is genuinely empty and is fully try/catch-guarded, so it can
 * never cover or break a working app.
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

  /*
   * Remember the last uncaught error message so the blank-preview overlay can
   * name the real cause (e.g. "Cannot redefine property: process") instead of a
   * generic "never rendered". Set by the error/unhandledrejection handlers.
   */
  var lastErrorMessage = '';

  window.addEventListener('error', function (event) {
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

  window.addEventListener('unhandledrejection', function (event) {
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
      message: message,
      stack: stack,
      ts: Date.now(),
    });
    scheduleLoadErrorBlankCheck();
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

  /*
   * Fail-safe visible overlay. Turns a silent white screen into a diagnosable
   * state by drawing a minimal error card INTO the blank frame, naming the real
   * error when we have one. Guards: draws at most once, only while the mount is
   * genuinely empty (never covers a working app), and everything is wrapped so a
   * DOM failure here can never throw into — or break — the page it is protecting.
   */
  var OVERLAY_ID = '__vibecorePreviewBlankOverlay';
  function renderBlankOverlay(detail) {
    try {
      if (!document.body || document.getElementById(OVERLAY_ID) || !mountIsEmpty()) {
        return;
      }
      var wrap = document.createElement('div');
      wrap.id = OVERLAY_ID;
      wrap.setAttribute('role', 'alert');
      wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:#0d1117;color:#c9d1d9;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;';
      var card = document.createElement('div');
      card.style.cssText = 'max-width:520px;width:100%;';
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
      var h = document.createElement('div');
      h.style.cssText = 'font-size:15px;font-weight:600;margin:0 0 8px;color:#f0f6fc;';
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
        pre.style.cssText = 'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.45;color:#ffa198;background:#161b22;border:1px solid #30363d;border-radius:6px;padding:10px 12px;margin:0 0 14px;white-space:pre-wrap;word-break:break-word;';
        pre.textContent = detail;
        card.appendChild(pre);
      }
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = fr ? 'Recharger l\u2019aperçu' : 'Reload preview';
      btn.style.cssText = 'font:inherit;font-size:13px;font-weight:500;color:#fff;background:#238636;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;';
      btn.addEventListener('click', function () {
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

  /*
   * Relay a readiness signal to the preview-proxy (which persists it for the api's
   * /ports readiness check). status is 'blank' (never mounted) or 'error' (a broken
   * app that DID render a DOM, so the blank watchdog can't see it — a failed
   * stylesheet/script). Best-effort; never throws into the page.
   */
  function beaconPreviewState(status, url, detail) {
    try {
      if (navigator && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/__vibecore/preview-blank',
          JSON.stringify({ url: url, ts: Date.now(), status: status, detail: detail || undefined }),
        );
      }
    } catch (error) {
      // best-effort server log; never break the page.
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
    var payload = { type: 'PREVIEW_BLANK', message: message, url: location.href, ts: Date.now() };
    send(payload);
    beaconPreviewState('blank', payload.url, lastErrorMessage);
    renderBlankOverlay(lastErrorMessage);
  }

  /*
   * BLOCKER #5 — failed critical assets. A 404'd stylesheet or entry script does NOT
   * bubble and leaves the DOM rendered-but-broken (the documented "JavaScript
   * rendered without its stylesheet"), so it is invisible to the bubble-phase window
   * handler above AND to the blank watchdog. Beacon 'error' so /ports stops reporting
   * the port ready. Reported at most once.
   */
  var assetErrorReported = false;
  function reportAssetError(detail) {
    if (assetErrorReported) {
      return;
    }
    assetErrorReported = true;
    beaconPreviewState('error', location.href, detail);
  }

  /*
   * (a) Capture-phase element 'error' — catches a <script> failure and any asset
   * that fails AFTER this reporter has installed (dynamically inserted links, etc.).
   */
  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;
      if (!target || target === window || typeof target.tagName !== 'string') {
        return;
      }
      var tag = target.tagName.toUpperCase();
      var isStylesheet = tag === 'LINK' && String(target.rel || '').toLowerCase().indexOf('stylesheet') !== -1;
      var isScript = tag === 'SCRIPT';
      if (!isStylesheet && !isScript) {
        return;
      }
      reportAssetError('Failed to load ' + (isStylesheet ? 'stylesheet' : 'script') + ': ' + (target.href || target.src || ''));
    },
    true,
  );

  /*
   * (b) Load-time stylesheet sweep — the RELIABLE path. The external reporter
   * script can install too late to catch a stylesheet that failed near-instantly
   * (a refused/404 link fires its error before this script even downloads, and a
   * capture listener never sees an event that already fired). But the window 'load'
   * event fires only AFTER every <link rel=stylesheet> has settled (loaded OR
   * failed), and a FAILED stylesheet has a null link.sheet at that point — a
   * timing-independent signal. Skip disabled links and media queries that don't
   * apply (their null sheet is legitimate).
   */
  function sweepFailedStylesheets() {
    try {
      var links = document.querySelectorAll('link[rel~="stylesheet"]');
      for (var i = 0; i < links.length; i += 1) {
        var link = links[i];
        if (link.disabled || !link.href) {
          continue;
        }
        if (link.media && window.matchMedia && !window.matchMedia(link.media).matches) {
          continue;
        }
        if (!link.sheet) {
          reportAssetError('Failed to load stylesheet: ' + link.href);
          return;
        }
      }
    } catch (error) {
      // never break the page for a diagnostic sweep.
    }
  }

  if (document.readyState === 'complete') {
    sweepFailedStylesheets();
  } else {
    window.addEventListener('load', function () {
      // a 500ms cushion lets a just-settled sheet attach before we read link.sheet.
      setTimeout(sweepFailedStylesheets, 500);
    });
  }

  /*
   * When an uncaught error fires, the app is likely already dead — but give a
   * slow/late mount a short grace before deciding. If the mount is STILL empty
   * ~1.5s after a load-time error, it is definitively broken, so surface it now
   * instead of waiting for the 18s silent-blank watchdog. Scheduled at most once.
   */
  var loadErrorCheckScheduled = false;
  function scheduleLoadErrorBlankCheck() {
    if (loadErrorCheckScheduled) {
      return;
    }
    loadErrorCheckScheduled = true;
    setTimeout(reportBlank, 1500);
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
