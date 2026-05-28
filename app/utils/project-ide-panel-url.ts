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

export function withPanelSearchParam(searchParams: URLSearchParams, panel?: string): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams);

  if (!panel) {
    nextParams.delete('panel');
  } else {
    nextParams.set('panel', panel);
  }

  return nextParams;
}
