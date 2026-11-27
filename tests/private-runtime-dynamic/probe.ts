import { randomInt } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

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
