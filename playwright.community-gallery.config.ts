import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

const useSystemChrome = process.env.COMMUNITY_GALLERY_USE_SYSTEM_CHROME === 'true';
const useHeadfulBrowser = process.env.COMMUNITY_GALLERY_HEADFUL === 'true';
const useReducedProcessBrowser = process.env.COMMUNITY_GALLERY_REDUCED_PROCESS === 'true';
const forceWebDns = process.env.COMMUNITY_GALLERY_FORCE_WEB_DNS === 'true';

function resolveIPv4(host: string) {
  const output = execFileSync('nslookup', [host], {
    encoding: 'utf8',
    timeout: 5_000,
  });
  const addresses = [...output.matchAll(/^Address:\s+([0-9]+(?:\.[0-9]+){3})\s*$/gm)].map((match) => match[1]);

  if (!addresses[0]) {
    throw new Error(`Unable to resolve an IPv4 address for ${host}.`);
  }

  return addresses[0];
}

function createWebContainerHostResolverRules() {
  const stackblitz = resolveIPv4('stackblitz.com');
  const webContainerStatic = resolveIPv4('w-credentialless-staticblitz.com');
  const staticblitz = resolveIPv4('c.staticblitz.com');
  const localWebContainer = resolveIPv4('local.webcontainer.io');
  const stackblitzProxy = resolveIPv4('p.stackblitz.com');
  const webContainerPreview = resolveIPv4('5173.local-credentialless.webcontainer-api.io');

  return [
    `MAP stackblitz.com ${stackblitz}`,
    `MAP w-credentialless-staticblitz.com ${webContainerStatic}`,
    `MAP *.w-credentialless-staticblitz.com ${webContainerStatic}`,
    `MAP c.staticblitz.com ${staticblitz}`,
    `MAP *.staticblitz.com ${staticblitz}`,
    `MAP local.webcontainer.io ${localWebContainer}`,
    `MAP *.webcontainer.io ${localWebContainer}`,
    `MAP p.stackblitz.com ${stackblitzProxy}`,
    `MAP *.stackblitz.com ${staticblitz}`,
    `MAP *.webcontainer-api.io ${webContainerPreview}`,
    'EXCLUDE localhost',
    'EXCLUDE 127.0.0.1',
  ].join(',');
}

const hostResolverRules =
  process.env.COMMUNITY_GALLERY_HOST_RESOLVER_RULES?.trim() ??
  (forceWebDns ? createWebContainerHostResolverRules() : undefined);

const chromiumNetworkArgs = hostResolverRules ? [`--host-resolver-rules=${hostResolverRules}`] : [];

const browserLaunch = useSystemChrome
  ? {
      channel: 'chrome' as const,
      launchOptions: {
        args: ['--disable-crash-reporter', '--disable-crashpad', ...chromiumNetworkArgs],
      },
    }
  : useReducedProcessBrowser
    ? { launchOptions: { args: ['--disable-gpu', '--no-zygote', ...chromiumNetworkArgs] } }
    : {
        launchOptions: {
          args: ['--disable-gpu', '--no-zygote', '--single-process', ...chromiumNetworkArgs],
        },
      };

/**
 * Focused live proof for the Community Gallery, Remix, and Import Hub.
 *
 * The local QA Mac can run several IDE/runtime sessions at once. Chromium's
 * normal process fan-out then exhausts the host Mach service namespace before a
 * test page opens. A single browser process still exercises the real page,
 * network, JavaScript, iframe preview and screenshot pipeline, while keeping
 * this repeatable gallery proof isolated from the repository-wide config.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: /community-gallery(?:\.visual)?\.spec\.ts/,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    headless: !useHeadfulBrowser,
    trace: 'on-first-retry',
    ...browserLaunch,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1194, height: 834 },
        isMobile: false,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
