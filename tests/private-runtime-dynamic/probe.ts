import { randomInt } from 'node:crypto';
import { expect, type Locator, type Page } from '@playwright/test';

export function emittedOrigin(raw: string, deploymentId: string) {
  if (
    !/^[a-z0-9]+$/.test(deploymentId) ||
    (raw !== `https://d-${deploymentId}.localhost/` && raw !== `https://d-${deploymentId}.localhost`)
  ) {
    throw new Error('Expected the deployment’s dedicated local HTTPS URL');
  }
  return new URL(raw).origin;
}

export async function checkCalculation(page: Page, origin: string, version: string, factor: number) {
  const first = randomInt(1, 900_000);
  const offset = randomInt(1, 900_000);
  for (const a of [first, first + 1]) {
    const url = new URL('/compute', origin);
    url.searchParams.set('a', String(a));
    url.searchParams.set('b', String(offset));
    const response = await page.goto(url.href);
    expect(response?.url()).toBe(url.href);
    expect(response?.request().redirectedFrom()).toBeNull();
    expect(response?.status()).toBe(200);
    expect(await response!.headerValue('content-type')).toContain('application/json');
    expect(await response!.json()).toEqual({ version, result: a * factor + offset });
  }
}

// Keep checking the browser-emitted address while the workspace discovers its listening port.
export async function waitForWorkspaceCalculation(
  page: Page,
  frame: Locator,
  version: string,
  factor: number,
  timeout = 60000,
) {
  let preview: URL | undefined;
  const first = new URL((await frame.getAttribute('src'))!);
  const workspaceHost = first.hostname.replace(/-\d+\.localhost$/, '');
  await expect(async () => {
    const raw = (await frame.getAttribute('src')) ?? '';
    expect(raw).toMatch(/^http:\/\/ws-[a-z0-9-]+-\d+\.localhost:3020\//);
    const current = new URL(raw);
    expect(current.hostname.replace(/-\d+\.localhost$/, '')).toBe(workspaceHost);
    await checkCalculation(page, current.origin, version, factor);
    preview = current;
  }).toPass({ timeout });
  if (!preview) throw Error('Workspace preview calculation did not pass');
  return preview;
}
