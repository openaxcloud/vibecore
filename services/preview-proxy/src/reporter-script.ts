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
   * A per-document token lets the parent reject a delayed message from the
   * previous document. iframe.contentWindow is a persistent WindowProxy and
   * therefore cannot, on its own, prove which navigation emitted a message.
   */
  var previewDocumentId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  var parentEpoch = '';
  var currentLifecycleState = 'document';
  function sendLifecycle(type, extra) {
    currentLifecycleState = type === 'PREVIEW_DOCUMENT' ? currentLifecycleState : type;
    if (type !== 'PREVIEW_DOCUMENT') {
      send({
        type: 'PREVIEW_DOCUMENT',
        documentId: previewDocumentId,
        epoch: parentEpoch,
        url: location.href,
        ts: Date.now(),
      });
    }
    send(
      Object.assign(
        { type: type, documentId: previewDocumentId, epoch: parentEpoch, url: location.href, ts: Date.now() },
        extra,
      ),
    );
  }
  sendLifecycle('PREVIEW_DOCUMENT');
  window.addEventListener('message', function (event) {
    if (
      event.source !== window.parent ||
      !event.data ||
      event.data.type !== 'PREVIEW_EPOCH' ||
      typeof event.data.epoch !== 'string'
    ) {
      return;
    }
    parentEpoch = event.data.epoch;
    sendLifecycle(currentLifecycleState);
  });

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
    return !mountIsSubstantial();
  }

  function transformIsCollapsed(transform) {
    var normalized = String(transform || '').replace(/\\s/g, '').toLowerCase();
    if (!normalized || normalized === 'none') {
      return false;
    }
    if (/^scale(?:3d|x|y)?\\(0(?:[,)]|$)/.test(normalized)) {
      return true;
    }
    var matrix = normalized.match(/^matrix\\(([^)]*)\\)$/);
    if (matrix) {
      var values = matrix[1].split(',').map(Number);
      return values.length === 6 && Math.abs(values[0] * values[3] - values[1] * values[2]) < 0.000001;
    }
    var matrix3d = normalized.match(/^matrix3d\\(([^)]*)\\)$/);
    if (matrix3d) {
      var entries = matrix3d[1].split(',').map(Number);
      return entries.length === 16 && Math.abs(entries[0] * entries[5] * entries[10]) < 0.000001;
    }
    return false;
  }

  function transformIsOffscreen(transform) {
    var normalized = String(transform || '').replace(/\\s/g, '').toLowerCase();
    var translated = normalized.match(/translate(?:3d|x|y)?\\(([-+]?\\d+(?:\\.\\d+)?)px/);
    return Boolean(translated && Math.abs(Number(translated[1])) > Math.max(window.innerWidth || 0, window.innerHeight || 0));
  }

  function elementCssIsVisible(element) {
    try {
      if (typeof element.checkVisibility === 'function' && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) {
        return false;
      }
      var current = element;
      while (current && current.nodeType !== 9) {
        if (window.getComputedStyle) {
          var currentStyle = window.getComputedStyle(current);
          if (
            currentStyle.display === 'none' ||
            currentStyle.visibility === 'hidden' ||
            Number(currentStyle.opacity) === 0 ||
            transformIsCollapsed(currentStyle.transform || '') ||
            transformIsOffscreen(currentStyle.transform || '') ||
            /opacity\\(\\s*(?:0(?:\\.0+)?|0%)\\s*\\)/i.test(currentStyle.filter || '') ||
            /rect\\(\\s*0(?:px)?(?:\\s*,?\\s*0(?:px)?){3}\\s*\\)/i.test(currentStyle.clip || '') ||
            /(?:circle|ellipse)\\(\\s*0(?:px|%|em|rem)?(?:\\s+0(?:px|%|em|rem)?)?/i.test(
              currentStyle.clipPath || '',
            ) ||
            /inset\\(\\s*(?:100%|[5-9]\\d(?:\\.\\d+)?%)(?:\\s+(?:100%|[5-9]\\d(?:\\.\\d+)?%)){0,3}\\s*\\)/i.test(
              currentStyle.clipPath || '',
            ) ||
            maskIsFullyTransparent(currentStyle.maskImage || currentStyle.webkitMaskImage || '')
          ) {
            return false;
          }
        }
        current = current.parentElement || current.parentNode;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function colorTokenIsTransparent(token) {
    var normalized = String(token || '').replace(/\\s/g, '').toLowerCase();
    return (
      normalized === 'transparent' ||
      /rgba\\([^)]*,0(?:\\.0+)?\\)$/.test(normalized) ||
      /hsla\\([^)]*,0(?:\\.0+)?\\)$/.test(normalized) ||
      /(?:rgb|hsl)\\([^)]*\\/0(?:\\.0+)?\\)$/.test(normalized)
    );
  }

  function maskIsFullyTransparent(maskImage) {
    var normalized = String(maskImage || '').trim().toLowerCase();
    if (!normalized || normalized === 'none') {
      return false;
    }
    var colors = normalized.match(/transparent|rgba?\\([^)]*\\)|hsla?\\([^)]*\\)/g) || [];
    return colors.length > 0 && colors.every(colorTokenIsTransparent);
  }

  function rectHasPaintedArea(element, rect, includeElementClip, positionOverride) {
    try {
      if (!elementCssIsVisible(element) || !rect) {
        return false;
      }
      var left = Number.isFinite(Number(rect.left)) ? Number(rect.left) : Number(rect.x) || 0;
      var top = Number.isFinite(Number(rect.top)) ? Number(rect.top) : Number(rect.y) || 0;
      var right = Number.isFinite(Number(rect.right)) ? Number(rect.right) : left + (Number(rect.width) || 0);
      var bottom = Number.isFinite(Number(rect.bottom)) ? Number(rect.bottom) : top + (Number(rect.height) || 0);
      var viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : Number.POSITIVE_INFINITY;
      var viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : Number.POSITIVE_INFINITY;
      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, viewportWidth);
      bottom = Math.min(bottom, viewportHeight);
      if (right <= left || bottom <= top) {
        return false;
      }

      var elementStyle = window.getComputedStyle ? window.getComputedStyle(element) : null;
      var fixedEscapesAncestors = positionOverride === 'fixed' || Boolean(elementStyle && elementStyle.position === 'fixed');
      var ancestor = includeElementClip ? element : element.parentElement || element.parentNode;
      while (ancestor && ancestor.nodeType !== 9) {
        if (window.getComputedStyle && typeof ancestor.getBoundingClientRect === 'function') {
          var ancestorStyle = window.getComputedStyle(ancestor);
          if (fixedEscapesAncestors) {
            var establishesFixedContainingBlock =
              (ancestorStyle.transform && ancestorStyle.transform !== 'none') ||
              (ancestorStyle.perspective && ancestorStyle.perspective !== 'none') ||
              (ancestorStyle.filter && ancestorStyle.filter !== 'none') ||
              (ancestorStyle.backdropFilter && ancestorStyle.backdropFilter !== 'none') ||
              /(^|\\s)(layout|paint|strict|content)(\\s|$)/.test(ancestorStyle.contain || '') ||
              /(^|,|\\s)(transform|perspective|filter)(,|\\s|$)/.test(ancestorStyle.willChange || '');
            if (!establishesFixedContainingBlock) {
              ancestor = ancestor.parentElement || ancestor.parentNode;
              continue;
            }
            fixedEscapesAncestors = false;
          }
            var overflowX = ancestorStyle.overflowX || ancestorStyle.overflow || 'visible';
            var overflowY = ancestorStyle.overflowY || ancestorStyle.overflow || 'visible';
            var clipsX = /^(auto|clip|hidden|scroll)$/.test(overflowX);
            var clipsY = /^(auto|clip|hidden|scroll)$/.test(overflowY);
            if (clipsX || clipsY) {
              var ancestorRect = ancestor.getBoundingClientRect();
              var ancestorLeft = Number.isFinite(Number(ancestorRect.left))
                ? Number(ancestorRect.left)
                : Number(ancestorRect.x) || 0;
              var ancestorTop = Number.isFinite(Number(ancestorRect.top))
                ? Number(ancestorRect.top)
                : Number(ancestorRect.y) || 0;
              var ancestorRight = Number.isFinite(Number(ancestorRect.right))
                ? Number(ancestorRect.right)
                : ancestorLeft + (Number(ancestorRect.width) || 0);
              var ancestorBottom = Number.isFinite(Number(ancestorRect.bottom))
                ? Number(ancestorRect.bottom)
                : ancestorTop + (Number(ancestorRect.height) || 0);
              if (clipsX) {
                left = Math.max(left, ancestorLeft);
                right = Math.min(right, ancestorRight);
              }
              if (clipsY) {
                top = Math.max(top, ancestorTop);
                bottom = Math.min(bottom, ancestorBottom);
              }
              if (right <= left || bottom <= top) {
                return false;
              }
            }
        }
        ancestor = ancestor.parentElement || ancestor.parentNode;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  function elementHasPaintedArea(element) {
    if (!element || typeof element.getBoundingClientRect !== 'function') {
      return false;
    }
    return rectHasPaintedArea(element, element.getBoundingClientRect());
  }

  function elementHasPaintedText(element) {
    try {
      if (!elementCssIsVisible(element)) {
        return false;
      }
      if (window.getComputedStyle) {
        var textStyle = window.getComputedStyle(element);
        var textColor = String(textStyle.color || '').replace(/\\s/g, '').toLowerCase();
        var textFillColor = String(textStyle.webkitTextFillColor || '').replace(/\\s/g, '').toLowerCase();
        var transparentColor = colorTokenIsTransparent(textColor);
        var transparentFill = colorTokenIsTransparent(textFillColor);
        var gradientText =
          String(textStyle.backgroundClip || textStyle.webkitBackgroundClip || '').indexOf('text') !== -1 &&
          textStyle.backgroundImage &&
          textStyle.backgroundImage !== 'none';
        var effectiveTextIsTransparent = textFillColor ? transparentFill : transparentColor;
        if (effectiveTextIsTransparent && !gradientText) {
          return false;
        }
      }
      var childNodes = element.childNodes;
      if (childNodes && typeof document.createRange === 'function') {
        for (var nodeIndex = 0; nodeIndex < childNodes.length; nodeIndex += 1) {
          var node = childNodes[nodeIndex];
          if (node.nodeType !== 3 || !String(node.textContent || '').trim()) {
            continue;
          }
          var range = document.createRange();
          range.selectNodeContents(node);
          var rects = range.getClientRects();
          for (var rectIndex = 0; rectIndex < rects.length; rectIndex += 1) {
            if (rectHasPaintedArea(element, rects[rectIndex], true)) {
              return true;
            }
          }
        }
        return false;
      }
      return Boolean(String(element.textContent || '').trim()) && elementHasPaintedArea(element);
    } catch (error) {
      return false;
    }
  }

  function colorHasVisibleAlpha(color) {
    return Boolean(String(color || '').trim()) && !colorTokenIsTransparent(color);
  }

  function styleHasPaint(style) {
    if (!style) {
      return false;
    }
    var backgroundImage = String(style.backgroundImage || '').trim().toLowerCase();
    var backgroundSize = String(style.backgroundSize || '').replace(/\\s/g, '').toLowerCase();
    var hasBackgroundImage =
      backgroundImage &&
      backgroundImage !== 'none' &&
      !maskIsFullyTransparent(backgroundImage) &&
      !/^(?:0(?:px|%)?)(?:0(?:px|%)?)?$/.test(backgroundSize);
    var hasBackgroundColor = colorHasVisibleAlpha(style.backgroundColor);
    var shadow = String(style.boxShadow || '').trim().toLowerCase();
    var hasShadow = shadow !== '' && shadow !== 'none' && !maskIsFullyTransparent(shadow);
    var sides = ['Top', 'Right', 'Bottom', 'Left'];
    var hasBorder = sides.some(function (side) {
      var width = parseFloat(style['border' + side + 'Width'] || '0');
      var borderStyle = String(style['border' + side + 'Style'] || '').toLowerCase();
      return width > 0 && borderStyle !== 'none' && borderStyle !== 'hidden' && colorHasVisibleAlpha(style['border' + side + 'Color']);
    });
    return Boolean(hasBackgroundImage || hasBackgroundColor || hasShadow || hasBorder);
  }

  function pseudoHasPaint(element, pseudo) {
    try {
      if (!window.getComputedStyle || !elementCssIsVisible(element)) {
        return false;
      }
      var style = window.getComputedStyle(element, pseudo);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        Number(style.opacity) === 0 ||
        transformIsCollapsed(style.transform || '') ||
        transformIsOffscreen(style.transform || '') ||
        /opacity\\(\\s*(?:0(?:\\.0+)?|0%)\\s*\\)/i.test(style.filter || '') ||
        /rect\\(\\s*0(?:px)?(?:\\s*,?\\s*0(?:px)?){3}\\s*\\)/i.test(style.clip || '') ||
        /(?:circle|ellipse)\\(\\s*0(?:px|%|em|rem)?(?:\\s+0(?:px|%|em|rem)?)?/i.test(style.clipPath || '') ||
        /inset\\(\\s*(?:100%|[5-9]\\d(?:\\.\\d+)?%)(?:\\s+(?:100%|[5-9]\\d(?:\\.\\d+)?%)){0,3}\\s*\\)/i.test(
          style.clipPath || '',
        ) ||
        maskIsFullyTransparent(style.maskImage || style.webkitMaskImage || '')
      ) {
        return false;
      }
      var content = String(style.content || '').trim();
      if (!content || content === 'none' || content === 'normal') {
        return false;
      }
      var gradientText =
        String(style.backgroundClip || style.webkitBackgroundClip || '').indexOf('text') !== -1 &&
        style.backgroundImage &&
        style.backgroundImage !== 'none';
      var fill = String(style.webkitTextFillColor || '').trim();
      var visibleText = fill ? colorHasVisibleAlpha(fill) : colorHasVisibleAlpha(style.color);
      var hasPaint = Boolean(
        styleHasPaint(style) || ((content !== '""' && content !== "''") && (visibleText || gradientText)),
      );
      if (!hasPaint) {
        return false;
      }
      if (style.position !== 'fixed' && style.position !== 'absolute') {
        return elementHasPaintedArea(element);
      }
      var viewportWidth = typeof window.innerWidth === 'number' ? window.innerWidth : 0;
      var viewportHeight = typeof window.innerHeight === 'number' ? window.innerHeight : 0;
      var hostRect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
      var originLeft = style.position === 'absolute' && hostRect ? Number(hostRect.left || hostRect.x || 0) : 0;
      var originTop = style.position === 'absolute' && hostRect ? Number(hostRect.top || hostRect.y || 0) : 0;
      var left = Number.parseFloat(style.left);
      var right = Number.parseFloat(style.right);
      var top = Number.parseFloat(style.top);
      var bottom = Number.parseFloat(style.bottom);
      left = originLeft + (Number.isFinite(left) ? left : 0);
      right = Number.isFinite(right) ? right : 0;
      top = originTop + (Number.isFinite(top) ? top : 0);
      bottom = Number.isFinite(bottom) ? bottom : 0;
      var width = Number.parseFloat(style.width);
      var height = Number.parseFloat(style.height);
      var containingWidth = style.position === 'absolute' && hostRect ? Number(hostRect.width) || viewportWidth : viewportWidth;
      var containingHeight = style.position === 'absolute' && hostRect ? Number(hostRect.height) || viewportHeight : viewportHeight;
      width = Number.isFinite(width) && width > 0 ? width : Math.max(0, containingWidth - (left - originLeft) - right);
      height = Number.isFinite(height) && height > 0 ? height : Math.max(0, containingHeight - (top - originTop) - bottom);
      return rectHasPaintedArea(
        element,
        { left: left, top: top, right: left + width, bottom: top + height, width: width, height: height },
        true,
        style.position,
      );
    } catch (error) {
      return false;
    }
  }

  function elementHasPaintedDecoration(element) {
    if (!window.getComputedStyle) {
      return false;
    }
    var style = window.getComputedStyle(element);
    return (
      (elementHasPaintedArea(element) && styleHasPaint(style)) ||
      pseudoHasPaint(element, '::before') ||
      pseudoHasPaint(element, '::after')
    );
  }

  function canvasHasPaintedPixels(canvas) {
    try {
      if (!elementHasPaintedArea(canvas)) {
        return false;
      }
      var sampleCanvas = document.createElement('canvas');
      var sampleWidth = Math.min(Math.max(1, Number(canvas.width) || 1), 64);
      var sampleHeight = Math.min(Math.max(1, Number(canvas.height) || 1), 64);
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      var context = sampleCanvas.getContext('2d', { willReadFrequently: true });
      if (!context || typeof context.getImageData !== 'function') {
        return false;
      }
      context.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
      var data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      for (var index = 3; index < data.length; index += 4) {
        if (data[index] > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      // Pixel opacity is unknowable after a security exception; fail closed.
      return false;
    }
  }

  function svgHasPaintedContent(svg) {
    if (!elementHasPaintedArea(svg) || !svg.querySelectorAll) {
      return false;
    }
    var shapes = svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,text,image,use');
    for (var index = 0; index < shapes.length; index += 1) {
      var shape = shapes[index];
      if (!elementHasPaintedArea(shape) || !window.getComputedStyle) {
        continue;
      }
      var style = window.getComputedStyle(shape);
      var fill = String(style.fill || shape.getAttribute && shape.getAttribute('fill') || '').trim();
      var stroke = String(style.stroke || shape.getAttribute && shape.getAttribute('stroke') || '').trim();
      var fillOpacity = Number(style.fillOpacity || shape.getAttribute && shape.getAttribute('fill-opacity') || '1');
      var strokeOpacity = Number(style.strokeOpacity || shape.getAttribute && shape.getAttribute('stroke-opacity') || '1');
      var strokeWidth = Number.parseFloat(style.strokeWidth || shape.getAttribute && shape.getAttribute('stroke-width') || '0');
      if (
        (fill !== 'none' && fillOpacity > 0 && colorHasVisibleAlpha(fill)) ||
        (stroke !== 'none' && strokeOpacity > 0 && strokeWidth > 0 && colorHasVisibleAlpha(stroke))
      ) {
        return true;
      }
    }
    return false;
  }

  function imageHasPaintedPixels(image) {
    try {
      if (!elementHasPaintedArea(image) || !image.complete || !image.naturalWidth || !image.naturalHeight) {
        return false;
      }
      var canvas = document.createElement('canvas');
      var sampleWidth = Math.min(Number(image.naturalWidth), 64);
      var sampleHeight = Math.min(Number(image.naturalHeight), 64);
      canvas.width = sampleWidth;
      canvas.height = sampleHeight;
      var context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        return false;
      }
      context.drawImage(image, 0, 0, sampleWidth, sampleHeight);
      var data = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
      for (var index = 3; index < data.length; index += 4) {
        if (data[index] > 0) {
          return true;
        }
      }
      return false;
    } catch (error) {
      // Pixel opacity is unknowable after a security exception; fail closed.
      return false;
    }
  }

  function visualHasPaintedContent(visual) {
    var tagName = String(visual.tagName || '').toLowerCase();
    if (tagName === 'canvas') {
      return canvasHasPaintedPixels(visual);
    }
    if (tagName === 'svg') {
      return svgHasPaintedContent(visual);
    }
    if (tagName === 'img') {
      return imageHasPaintedPixels(visual);
    }
    return elementHasPaintedArea(visual);
  }

  function mountIsSubstantial() {
    try {
      var mount = document.getElementById('root') || document.getElementById('app');
      var surface = mount || document.body;
      if (!surface || (surface.id && surface.id === OVERLAY_ID)) {
        return false;
      }
      if (!elementCssIsVisible(surface)) {
        return false;
      }
      var overlay = document.getElementById(OVERLAY_ID);
      var textContainers = surface.querySelectorAll ? surface.querySelectorAll('*') : [];
      if (elementHasPaintedText(surface)) {
        return true;
      }
      if (elementHasPaintedDecoration(surface)) {
        return true;
      }
      for (var textIndex = 0; textIndex < textContainers.length; textIndex += 1) {
        var textContainer = textContainers[textIndex];
        if (textContainer !== overlay && !(textContainer.closest && textContainer.closest('#' + OVERLAY_ID))) {
          if (elementHasPaintedText(textContainer)) {
            return true;
          }
          if (elementHasPaintedDecoration(textContainer)) {
            return true;
          }
        }
      }
      var visuals = surface.querySelectorAll
        ? surface.querySelectorAll('img[src],canvas,video,svg,input,button,textarea,select,[role="img"]')
        : [];
      for (var i = 0; i < visuals.length; i += 1) {
        var visual = visuals[i];
        if (visual.id === OVERLAY_ID || (visual.closest && visual.closest('#' + OVERLAY_ID))) {
          continue;
        }
        if (visualHasPaintedContent(visual)) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
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
      var h = document.createElement('div');
      h.style.cssText = 'font-size:15px;font-weight:600;margin:0 0 8px;color:#f0f6fc;';
      h.textContent = 'This preview failed to load';
      var p = document.createElement('div');
      p.style.cssText = 'font-size:13px;line-height:1.5;color:#8b949e;margin:0 0 14px;';
      p.textContent = 'The dev server is running but the app never rendered — an error in the app code stopped it before it could mount.';
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
      btn.textContent = 'Reload preview';
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

  var mountReported = false;
  var previewOkReported = false;
  var mountObservationGeneration = 0;
  var stableMountGeneration = 0;
  var stableMountPending = false;
  var stableMountReadyAt = 0;
  var reblankGeneration = 0;
  var reblankPending = false;
  function observeMount() {
    mountObservationGeneration += 1;
    if (mountIsSubstantial()) {
      reblankGeneration += 1;
      reblankPending = false;
      if (!mountReported) {
        mountReported = true;
        sendLifecycle('PREVIEW_MOUNTED');
      }
      if (stableMountPending || previewOkReported) {
        return;
      }
      stableMountPending = true;
      stableMountReadyAt = Date.now() + 750;
      var stableGeneration = stableMountGeneration;
      function proveStableMount() {
        var remaining = stableMountReadyAt - Date.now();
        if (remaining > 0) {
          setTimeout(proveStableMount, remaining);
          return;
        }
        stableMountPending = false;
        if (stableGeneration !== stableMountGeneration || !mountIsSubstantial() || previewOkReported) {
          return;
        }
        previewOkReported = true;
        blankReported = false;
        sendLifecycle('PREVIEW_OK');
        try {
          var overlay = document.getElementById(OVERLAY_ID);
          if (overlay && typeof overlay.remove === 'function') {
            overlay.remove();
          }
        } catch (error) {
          // best-effort cleanup; never break the mounted app.
        }
      }
      setTimeout(proveStableMount, 750);
      return;
    }

    mountReported = false;
    stableMountGeneration += 1;
    stableMountPending = false;
    stableMountReadyAt = 0;
    if (previewOkReported) {
      previewOkReported = false;
      blankReported = false;
      if (!reblankPending) {
        reblankPending = true;
        var reblankToken = reblankGeneration;
        setTimeout(function () {
          reblankPending = false;
          if (reblankToken === reblankGeneration && !mountIsSubstantial()) {
            reportBlank();
          }
        }, 1500);
      }
    }
  }

  function installMountObserver() {
    if (!document.body) {
      window.addEventListener('DOMContentLoaded', installMountObserver, { once: true });
      return;
    }
    observeMount();
    try {
      if (window.MutationObserver && document.body) {
        var observer = new window.MutationObserver(observeMount);
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class', 'style', 'hidden'],
        });
      }
    } catch (error) {
      // Initial/load checks below remain as a bounded fallback.
    }
    [250, 1000, 3000, 10000].forEach(function (delay) {
      setTimeout(observeMount, delay);
    });
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
    var payload = { message: message };
    sendLifecycle('PREVIEW_BLANK', payload);
    beaconPreviewState('blank', location.href, lastErrorMessage);
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
    send({ type: 'PREVIEW_ERROR', message: detail, ts: Date.now() });
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
    if (!previewOkReported && mountIsEmpty()) {
      reportBlank();
    } else if (!previewOkReported) {
      observeMount();
    }
  }, 18000);

  installMountObserver();

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
