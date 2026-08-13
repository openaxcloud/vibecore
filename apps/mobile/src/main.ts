import { editorKindForLayout, getResponsiveLayoutState } from '@vibecore/editor';
import { launchMobileBootstrap } from './bootstrap-launch';
import { readMobileRuntimeConfig } from './config';
import {
  openExternalUrl,
  readNativeAppInfo,
  routeFromDeepLink,
  shareProjectLink,
  uploadProjectFile,
} from './native';
import './styles.css';

const config = readMobileRuntimeConfig();
const frame = document.querySelector<HTMLIFrameElement>('#web-app-frame');
const missing = document.querySelector<HTMLElement>('#config-missing');
const shell = document.querySelector<HTMLElement>('#app');
const version = document.querySelector<HTMLElement>('#app-version');
const title = document.querySelector<HTMLElement>('#mobile-title');
const offlineBanner = document.querySelector<HTMLElement>('#offline-banner');
const upload = document.querySelector<HTMLInputElement>('#file-upload');

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
      version.textContent = `web ${editorKindForLayout(getResponsiveLayoutState(window.innerWidth))}`;
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
  void shareProjectLink(projectId, url);
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

  void uploadProjectFile(projectId, file, config.apiBaseUrl);
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
    title.textContent = titleForRoute(url.pathname);
  }
}

function titleForRoute(pathname: string) {
  if (pathname.includes('/ide') || pathname.startsWith('/@')) {
    return 'Project IDE';
  }

  if (pathname.includes('/notifications')) {
    return 'Notifications';
  }

  if (pathname.includes('/settings')) {
    return 'Settings';
  }

  if (pathname.includes('/dashboard')) {
    return 'Dashboard';
  }

  return 'Projects';
}

function currentProjectId() {
  const match = frame?.src.match(/\/projects\/([^/?#]+)/);
  return match?.[1];
}
