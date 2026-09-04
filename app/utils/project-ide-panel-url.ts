export function readPanelSearchParam(
  searchParams: URLSearchParams,
  allowedPanels: readonly string[],
): string | undefined {
  const panel = searchParams.get('panel')?.trim();

  if (!panel) {
    return undefined;
  }

  return allowedPanels.includes(panel) ? panel : undefined;
}

/*
 * BUG-IDE-PANEL-RECLICK-REPROVISION-001 — whether writing `panel` into the URL
 * would leave the search string UNCHANGED (re-click on the already-active
 * panel). Callers must then skip setSearchParams entirely: a same-URL
 * navigation is treated by React Router as a refresh (defaultShouldRevalidate
 * is TRUE when pathname+search are identical), so every loader re-ran and the
 * whole IDE reloaded on a simple re-click.
 */
export function isRedundantPanelSearchParamUpdate(searchParams: URLSearchParams, panel?: string): boolean {
  const current = searchParams.get('panel') ?? undefined;
  const next = panel || undefined;

  return current === next;
}

export function withPanelSearchParam(searchParams: URLSearchParams, panel?: string): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);

  if (!panel) {
    nextParams.delete('panel');
  } else {
    nextParams.set('panel', panel);
  }

  return nextParams;
}
