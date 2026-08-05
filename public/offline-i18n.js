(function initializeOfflinePage() {
  'use strict';

  const messages = window.__ECODE_OFFLINE_MESSAGES__;

  if (!messages?.en || !messages.fr) {
    return;
  }

  const manualCookie = 'vibecore-lang';
  const automaticCookie = 'vibecore-auto-lang';
  const storageKey = 'vibecore:user-language';
  let activeLanguage = 'en';

  function normalizeLanguage(value) {
    return typeof value === 'string' && value.trim().toLowerCase().split(/[-_]/)[0] === 'fr' ? 'fr' : 'en';
  }

  function readCookie(name) {
    const prefix = name + '=';

    for (const segment of (document.cookie || '').split(';')) {
      const candidate = segment.trim();

      if (candidate.startsWith(prefix)) {
        try {
          return decodeURIComponent(candidate.slice(prefix.length));
        } catch {
          return candidate.slice(prefix.length);
        }
      }
    }

    return undefined;
  }

  function readStoredLanguage() {
    try {
      return window.localStorage.getItem(storageKey) || undefined;
    } catch {
      return undefined;
    }
  }

  function cookieDomain() {
    const hostname = window.location.hostname.toLowerCase();

    return hostname === 'e-code.ai' || hostname.endsWith('.e-code.ai') ? '; Domain=.e-code.ai' : '';
  }

  function writeCookie(name, language) {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      name + '=' + encodeURIComponent(language) + '; Path=/; Max-Age=31536000; SameSite=Lax' + cookieDomain() + secure;
  }

  function detectLanguage() {
    const manual = readCookie(manualCookie) || readStoredLanguage();

    if (manual) {
      return normalizeLanguage(manual);
    }

    const automatic = readCookie(automaticCookie);

    if (automatic) {
      return normalizeLanguage(automatic);
    }

    const detected = normalizeLanguage(window.navigator.language);
    writeCookie(automaticCookie, detected);

    return detected;
  }

  function resolveTheme() {
    const preference =
      readCookie('ecode_theme') ||
      (function readStoredTheme() {
        try {
          return window.localStorage.getItem('bolt_theme');
        } catch {
          return undefined;
        }
      })();

    if (preference === 'light' || preference === 'dark') {
      return preference;
    }

    return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  function text(key) {
    return messages[activeLanguage][key] || messages.en[key] || '';
  }

  function setStatus(key) {
    const status = document.getElementById('connection-status');

    if (status) {
      status.textContent = text(key);
    }
  }

  function applyLanguage(language) {
    activeLanguage = normalizeLanguage(language);
    document.documentElement.lang = activeLanguage;
    document.title = text('documentTitle');

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = text(node.getAttribute('data-i18n'));
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', text(node.getAttribute('data-i18n-aria-label')));
    });

    document.querySelectorAll('[data-language]').forEach((button) => {
      const language = button.getAttribute('data-language');
      const french = language === 'fr';
      button.textContent = text(french ? 'frenchShort' : 'englishShort');
      button.setAttribute('aria-label', text(french ? 'french' : 'english'));
      button.setAttribute('aria-pressed', String(language === activeLanguage));
      button.setAttribute('lang', language || 'en');
    });
  }

  function selectLanguage(language) {
    const normalized = normalizeLanguage(language);
    writeCookie(manualCookie, normalized);

    try {
      window.localStorage.setItem(storageKey, normalized);
    } catch {
      // The manual cookie remains authoritative when storage is unavailable.
    }

    applyLanguage(normalized);
    updateConnectionStatus();
  }

  function updateConnectionStatus() {
    const indicator = document.getElementById('connection-indicator');

    if (window.navigator.onLine) {
      indicator?.classList.add('online');
      setStatus('restored');
      window.setTimeout(() => window.location.reload(), 800);
      return;
    }

    indicator?.classList.remove('online');
    setStatus('noConnection');
  }

  async function retryConnection() {
    setStatus('checking');

    try {
      await window.fetch('/favicon.svg', { method: 'HEAD', cache: 'no-store' });
      window.location.reload();
    } catch {
      setStatus('stillOffline');
    }
  }

  function start() {
    document.documentElement.dataset.theme = resolveTheme();
    applyLanguage(detectLanguage());

    document.querySelectorAll('[data-language]').forEach((button) => {
      button.addEventListener('click', () => selectLanguage(button.getAttribute('data-language')));
    });

    document.getElementById('retry-button')?.addEventListener('click', retryConnection);
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    updateConnectionStatus();
    window.setInterval(updateConnectionStatus, 5000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
