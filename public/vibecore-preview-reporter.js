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
    return !mountIsSubstantial();
  }

  function transformIsCollapsed(transform) {
    var normalized = String(transform || '')
      .replace(/\s/g, '')
      .toLowerCase();

    if (!normalized || normalized === 'none') {
      return false;
    }

    if (/^scale(?:3d|x|y)?\(0(?:[,)]|$)/.test(normalized)) {
      return true;
    }

    var matrix = normalized.match(/^matrix\(([^)]*)\)$/);

    if (matrix) {
      var values = matrix[1].split(',').map(Number);

      return values.length === 6 && Math.abs(values[0] * values[3] - values[1] * values[2]) < 0.000001;
    }

    var matrix3d = normalized.match(/^matrix3d\(([^)]*)\)$/);

    if (matrix3d) {
      var entries = matrix3d[1].split(',').map(Number);

      return entries.length === 16 && Math.abs(entries[0] * entries[5] * entries[10]) < 0.000001;
    }

    return false;
  }

  function transformIsOffscreen(transform) {
    var normalized = String(transform || '')
      .replace(/\s/g, '')
      .toLowerCase();
    var translated = normalized.match(/translate(?:3d|x|y)?\(([-+]?\d+(?:\.\d+)?)px/);

    return Boolean(
      translated && Math.abs(Number(translated[1])) > Math.max(window.innerWidth || 0, window.innerHeight || 0),
    );
  }

  function elementCssIsVisible(element) {
    try {
      if (
        typeof element.checkVisibility === 'function' &&
        !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
      ) {
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
            /opacity\(\s*(?:0(?:\.0+)?|0%)\s*\)/i.test(currentStyle.filter || '') ||
            /rect\(\s*0(?:px)?(?:\s*,?\s*0(?:px)?){3}\s*\)/i.test(currentStyle.clip || '') ||
            /(?:circle|ellipse)\(\s*0(?:px|%|em|rem)?(?:\s+0(?:px|%|em|rem)?)?/i.test(currentStyle.clipPath || '') ||
            /inset\(\s*(?:100%|[5-9]\d(?:\.\d+)?%)(?:\s+(?:100%|[5-9]\d(?:\.\d+)?%)){0,3}\s*\)/i.test(
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
    var normalized = String(token || '')
      .replace(/\s/g, '')
      .toLowerCase();

    return (
      normalized === 'transparent' ||
      /rgba\([^)]*,0(?:\.0+)?\)$/.test(normalized) ||
      /hsla\([^)]*,0(?:\.0+)?\)$/.test(normalized) ||
      /(?:rgb|hsl)\([^)]*\/0(?:\.0+)?\)$/.test(normalized)
    );
  }

  function maskIsFullyTransparent(maskImage) {
    var normalized = String(maskImage || '')
      .trim()
      .toLowerCase();

    if (!normalized || normalized === 'none') {
      return false;
    }

    var colors = normalized.match(/transparent|rgba?\([^)]*\)|hsla?\([^)]*\)/g) || [];

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
      var fixedEscapesAncestors =
        positionOverride === 'fixed' || Boolean(elementStyle && elementStyle.position === 'fixed');
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
              /(^|\s)(layout|paint|strict|content)(\s|$)/.test(ancestorStyle.contain || '') ||
              /(^|,|\s)(transform|perspective|filter)(,|\s|$)/.test(ancestorStyle.willChange || '');

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
        var textColor = String(textStyle.color || '')
          .replace(/\s/g, '')
          .toLowerCase();
        var textFillColor = String(textStyle.webkitTextFillColor || '')
          .replace(/\s/g, '')
          .toLowerCase();
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

    var backgroundImage = String(style.backgroundImage || '')
      .trim()
      .toLowerCase();
    var backgroundSize = String(style.backgroundSize || '')
      .replace(/\s/g, '')
      .toLowerCase();
    var hasBackgroundImage =
      backgroundImage &&
      backgroundImage !== 'none' &&
      !maskIsFullyTransparent(backgroundImage) &&
      !/^(?:0(?:px|%)?)(?:0(?:px|%)?)?$/.test(backgroundSize);
    var hasBackgroundColor = colorHasVisibleAlpha(style.backgroundColor);
    var shadow = String(style.boxShadow || '')
      .trim()
      .toLowerCase();
    var hasShadow = shadow !== '' && shadow !== 'none' && !maskIsFullyTransparent(shadow);
    var sides = ['Top', 'Right', 'Bottom', 'Left'];
    var hasBorder = sides.some(function (side) {
      var width = parseFloat(style['border' + side + 'Width'] || '0');
      var borderStyle = String(style['border' + side + 'Style'] || '').toLowerCase();
      return (
        width > 0 &&
        borderStyle !== 'none' &&
        borderStyle !== 'hidden' &&
        colorHasVisibleAlpha(style['border' + side + 'Color'])
      );
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
        /opacity\(\s*(?:0(?:\.0+)?|0%)\s*\)/i.test(style.filter || '') ||
        /rect\(\s*0(?:px)?(?:\s*,?\s*0(?:px)?){3}\s*\)/i.test(style.clip || '') ||
        /(?:circle|ellipse)\(\s*0(?:px|%|em|rem)?(?:\s+0(?:px|%|em|rem)?)?/i.test(style.clipPath || '') ||
        /inset\(\s*(?:100%|[5-9]\d(?:\.\d+)?%)(?:\s+(?:100%|[5-9]\d(?:\.\d+)?%)){0,3}\s*\)/i.test(
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
        styleHasPaint(style) || (content !== '""' && content !== "''" && (visibleText || gradientText)),
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
      var containingWidth =
        style.position === 'absolute' && hostRect ? Number(hostRect.width) || viewportWidth : viewportWidth;
      var containingHeight =
        style.position === 'absolute' && hostRect ? Number(hostRect.height) || viewportHeight : viewportHeight;
      width = Number.isFinite(width) && width > 0 ? width : Math.max(0, containingWidth - (left - originLeft) - right);
      height =
        Number.isFinite(height) && height > 0 ? height : Math.max(0, containingHeight - (top - originTop) - bottom);

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
      var fill = String((style.fill || (shape.getAttribute && shape.getAttribute('fill'))) ?? '').trim();
      var stroke = String((style.stroke || (shape.getAttribute && shape.getAttribute('stroke'))) ?? '').trim();
      var fillOpacity = Number(
        (style.fillOpacity || (shape.getAttribute && shape.getAttribute('fill-opacity'))) ?? '1',
      );
      var strokeOpacity = Number(
        (style.strokeOpacity || (shape.getAttribute && shape.getAttribute('stroke-opacity'))) ?? '1',
      );
      var strokeWidth = Number.parseFloat(
        (style.strokeWidth || (shape.getAttribute && shape.getAttribute('stroke-width'))) ?? '0',
      );

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
      h.textContent = 'This preview failed to load';

      var p = document.createElement('div');
      p.style.cssText = 'font-size:13px;line-height:1.5;color:#8b949e;margin:0 0 14px;';
      p.textContent =
        'The dev server is running but the app never rendered — an error in the app code stopped it before it could mount.';

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
      btn.textContent = 'Reload preview';
      btn.style.cssText =
        'font:inherit;font-size:13px;font-weight:500;color:#fff;background:#238636;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;';
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

  var blankReported = false;
  var assetErrorReported = false;
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

  function reportBlank() {
    if (blankReported || !mountIsEmpty()) {
      return;
    }

    blankReported = true;

    var message = lastErrorMessage
      ? 'Preview served but the app never mounted: ' + lastErrorMessage
      : 'Preview served but the app never mounted';

    sendLifecycle('PREVIEW_BLANK', { message: message });
    renderBlankOverlay(lastErrorMessage);
  }

  function reportAssetError(detail) {
    if (assetErrorReported) {
      return;
    }

    assetErrorReported = true;
    send({ type: 'PREVIEW_ERROR', message: detail, ts: Date.now() });
  }

  window.addEventListener(
    'error',
    function (event) {
      var target = event.target;

      if (!target || target === window || typeof target.tagName !== 'string') {
        return;
      }

      var tag = target.tagName.toUpperCase();
      var isStylesheet =
        tag === 'LINK' &&
        String(target.rel || '')
          .toLowerCase()
          .indexOf('stylesheet') !== -1;
      var isScript = tag === 'SCRIPT';

      if (!isStylesheet && !isScript) {
        return;
      }

      reportAssetError(
        'Failed to load ' + (isStylesheet ? 'stylesheet' : 'script') + ': ' + (target.href || target.src || ''),
      );
    },
    true,
  );

  function sweepFailedStylesheets() {
    try {
      var links = document.querySelectorAll('link[rel~="stylesheet"]');

      for (var linkIndex = 0; linkIndex < links.length; linkIndex += 1) {
        var link = links[linkIndex];

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
      setTimeout(sweepFailedStylesheets, 500);
    });
  }

  var loadErrorCheckScheduled = false;

  function scheduleLoadErrorBlankCheck() {
    if (loadErrorCheckScheduled) {
      return;
    }

    loadErrorCheckScheduled = true;
    // Give a slow/late mount a short grace; if still empty after a load-time error,
    // it is definitively broken → surface now instead of at the slow watchdog.
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
