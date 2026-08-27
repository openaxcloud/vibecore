import { editorKindForLayout, getResponsiveLayoutState } from '@vibecore/editor';
import { launchMobileBootstrap } from './bootstrap-launch';
import { readMobileRuntimeConfig } from './config';
import {
  detectMobileLanguage,
  getMobileCopy,
  persistMobileLanguage,
  type MobileCopy,
  type MobileLanguage,
} from './i18n';
import { openExternalUrl, readNativeAppInfo, routeFromDeepLink, shareProjectLink, uploadProjectFile } from './native';
import './styles.css';

const config = readMobileRuntimeConfig();
const frame = document.querySelector<HTMLIFrameElement>('#web-app-frame');
const missing = document.querySelector<HTMLElement>('#config-missing');
const shell = document.querySelector<HTMLElement>('#app');
const version = document.querySelector<HTMLElement>('#app-version');
const title = document.querySelector<HTMLElement>('#mobile-title');
const offlineBanner = document.querySelector<HTMLElement>('#offline-banner');
const uploadError = document.querySelector<HTMLElement>('#upload-error');
const upload = document.querySelector<HTMLInputElement>('#file-upload');
let mobileLanguage = detectMobileLanguage();

if (!document.cookie.includes('vibecore-lang=') && !document.cookie.includes('vibecore-auto-lang=')) {
  persistMobileLanguage(mobileLanguage, false);
}

applyMobileCopy(mobileLanguage);

void launchMobileBootstrap({
  config,
  onDeepLink(url) {
    navigateFrame(routeFromDeepLink(url));
  },
  onOfflineChange(offline) {
    shell?.setAttribute('data-offline', String(offline));

    if (offlineBanner) {
      offlineBanner.hidden = !offline;
    }
  },
  onCrashReport(error, context) {
    console.error('Mobile crash adapter captured error', { error, context });
  },
});

void readNativeAppInfo()
  .then((info) => {
    if (version) {
      version.textContent = `${info.platform} ${info.version} (${info.build})`;
    }
  })
  .catch(() => {
    if (version) {
      const copy = getMobileCopy(mobileLanguage);
      version.textContent = `${copy.webPlatform} ${editorKindForLayout(getResponsiveLayoutState(window.innerWidth))}`;
    }
  });

if (config.webAppOrigin && frame) {
  frame.src = `${config.webAppOrigin}/projects`;
} else if (missing) {
  missing.hidden = false;
}

document.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((button) => {
  button.addEventListener('click', () => {
    const route = button.dataset.route;

    if (route) {
      navigateFrame(route);
    }
  });
});

document.querySelector<HTMLButtonElement>('#share-project')?.addEventListener('click', () => {
  const projectId = currentProjectId() ?? 'current';
  const url = frame?.src || `${config.webAppOrigin ?? ''}/projects`;
  void shareProjectLink(projectId, url, mobileLanguage);
});

document.querySelector<HTMLButtonElement>('#language-toggle')?.addEventListener('click', () => {
  mobileLanguage = mobileLanguage === 'fr' ? 'en' : 'fr';
  persistMobileLanguage(mobileLanguage);
  applyMobileCopy(mobileLanguage);
  syncFrameLanguage(mobileLanguage);
});

document.querySelector<HTMLButtonElement>('#open-browser')?.addEventListener('click', () => {
  const url = frame?.src || config.webAppOrigin;

  if (url) {
    void openExternalUrl(url);
  }
});

upload?.addEventListener('change', () => {
  const file = upload.files?.[0];
  const projectId = currentProjectId();

  if (!file || !projectId || !config.apiBaseUrl) {
    return;
  }

  if (uploadError) {
    uploadError.hidden = true;
  }

  void uploadProjectFile(projectId, file, config.apiBaseUrl).catch(() => {
    if (uploadError) {
      uploadError.textContent = getMobileCopy(mobileLanguage).uploadFailed;
      uploadError.hidden = false;
    }
  });
});

function navigateFrame(route: string) {
  if (!frame || !config.webAppOrigin) {
    return;
  }

  let url = new URL(route, config.webAppOrigin);

  /*
   * Defense-in-depth: never let a crafted deep-link route navigate the trusted
   * in-app frame off webAppOrigin. A protocol-relative ('//evil.com/x') or
   * absolute route resolves to a foreign origin in new URL(route, origin); if
   * the resolved origin differs, fall back to the projects root on our origin.
   */
  if (url.origin !== new URL(config.webAppOrigin).origin) {
    url = new URL('/projects', config.webAppOrigin);
  }

  frame.src = url.toString();

  if (title) {
    title.textContent = titleForRoute(url.pathname, getMobileCopy(mobileLanguage));
  }
}

function titleForRoute(pathname: string, copy: MobileCopy) {
  if (pathname.includes('/ide') || pathname.startsWith('/@')) {
    return copy.titleProjectIde;
  }

  if (pathname.includes('/notifications')) {
    return copy.titleNotifications;
  }

  if (pathname.includes('/settings')) {
    return copy.titleSettings;
  }

  if (pathname.includes('/dashboard')) {
    return copy.titleDashboard;
  }

  return copy.titleProjects;
}

function setText(selector: string, value: string) {
  const element = document.querySelector<HTMLElement>(selector);

  if (element) {
    element.textContent = value;
  }
}

function applyMobileCopy(language: MobileLanguage) {
  const copy = getMobileCopy(language);
  document.documentElement.lang = language;
  document.title = copy.documentTitle;
  setText('#mobile-title', titleForRoute(frame?.src ? new URL(frame.src).pathname : '/projects', copy));
  setText('#share-project', copy.shareButton);
  setText('#open-browser', copy.openButton);
  setText('#offline-banner', copy.offline);
  setText('#config-missing-title', copy.configMissingTitle);
  setText('#config-missing-description', copy.configMissingDescription);
  setText('#app-version', copy.versionLoading);
  setText('#upload-label', copy.upload);
  document.querySelector<HTMLButtonElement>('#share-project')?.setAttribute('aria-label', copy.shareButtonLabel);
  document.querySelector<HTMLButtonElement>('#open-browser')?.setAttribute('aria-label', copy.openButtonLabel);
  document.querySelector<HTMLButtonElement>('#language-toggle')?.setAttribute('aria-label', copy.languageSwitchLabel);
  setText('#language-toggle', copy.languageButtonTarget);
  document.querySelector<HTMLIFrameElement>('#web-app-frame')?.setAttribute('title', copy.frameTitle);
  document.querySelector<HTMLElement>('[data-mobile-nav]')?.setAttribute('aria-label', copy.navigationLabel);

  const routeLabels: Readonly<Record<string, string>> = {
    '/login': copy.navigationLogin,
    '/onboarding': copy.navigationOnboarding,
    '/dashboard': copy.navigationDashboard,
    '/projects': copy.navigationProjects,
    '/notifications': copy.navigationAlerts,
    '/settings': copy.navigationSettings,
  };

  for (const [route, label] of Object.entries(routeLabels)) {
    setText(`[data-route="${route}"]`, label);
  }

  if (uploadError && !uploadError.hidden) {
    uploadError.textContent = copy.uploadFailed;
  }
}

function syncFrameLanguage(language: MobileLanguage) {
  if (!frame?.src) {
    return;
  }

  const url = new URL(frame.src);
  url.searchParams.set('lang', language);
  frame.src = url.toString();
}

function currentProjectId() {
  const match = frame?.src.match(/\/projects\/([^/?#]+)/);
  return match?.[1];
}
