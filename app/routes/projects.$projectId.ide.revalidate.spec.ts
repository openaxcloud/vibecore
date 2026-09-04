import { describe, expect, it } from 'vitest';
import { routeKeyWithoutClientIdeParams, shouldRevalidateProjectIde } from './projects.$projectId.ide.revalidate';

const IDE_URL = 'https://app.e-code.ai/projects/p-1/ide';

function revalidates(currentUrl: string, nextUrl: string, formMethod?: string) {
  return shouldRevalidateProjectIde({
    currentUrl: new URL(currentUrl),
    nextUrl: new URL(nextUrl),
    formMethod,

    /*
     * React Router sets defaultShouldRevalidate to TRUE for a same-URL
     * navigation (treated as a refresh) — the exact case of the re-click bug —
     * so the tests model the default as true.
     */
    defaultShouldRevalidate: true,
  });
}

describe('project IDE shouldRevalidate (BUG-IDE-PANEL-RECLICK-REPROVISION-001)', () => {
  it('does NOT revalidate on a re-click of the already-active panel (identical URL)', () => {
    expect(revalidates(`${IDE_URL}?panel=preview`, `${IDE_URL}?panel=preview`)).toBe(false);
    expect(revalidates(`${IDE_URL}?panel=deployments`, `${IDE_URL}?panel=deployments`)).toBe(false);
    expect(revalidates(IDE_URL, IDE_URL)).toBe(false);
  });

  it('does NOT revalidate when only client-IDE params change (panel switch)', () => {
    expect(revalidates(`${IDE_URL}?panel=preview`, `${IDE_URL}?panel=git`)).toBe(false);
    expect(revalidates(IDE_URL, `${IDE_URL}?panel=snapshots`)).toBe(false);
    expect(revalidates(`${IDE_URL}?panel=git&commit=abc`, `${IDE_URL}?panel=git&commit=def`)).toBe(false);
  });

  it('still revalidates when a NON-client param or the path changes', () => {
    expect(revalidates(`${IDE_URL}?panel=git`, `${IDE_URL}?panel=git&workspace=w-2`)).toBe(true);
    expect(revalidates(`${IDE_URL}?panel=git`, 'https://app.e-code.ai/projects/p-2/ide?panel=git')).toBe(true);
  });

  it('defers to the default on non-GET submissions', () => {
    expect(revalidates(`${IDE_URL}?panel=git`, `${IDE_URL}?panel=git`, 'POST')).toBe(true);
  });

  it('route key strips exactly the client-IDE params', () => {
    expect(routeKeyWithoutClientIdeParams(new URL(`${IDE_URL}?panel=git&commit=abc&peWindow=1&workspace=w-2`))).toBe(
      '/projects/p-1/ide?workspace=w-2',
    );
  });
});
