import { tourInterrompuAReprendre } from './tour-en-cours';

/** Unbounded initial generation may start automatically; an interrupted turn remains a manual recovery. */
export async function canAutomaticallyReplayPrompt(
  projectId: string,
  transport: typeof fetch = fetch,
): Promise<boolean> {
  if (tourInterrompuAReprendre(projectId)) {
    return false;
  }

  try {
    const response = await transport(`/api/projects/${encodeURIComponent(projectId)}/agent/explicit-run`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      return false;
    }

    const value: unknown = await response.json();

    // Another request/tab can mark this project while either fetch or JSON decoding is pending.
    if (tourInterrompuAReprendre(projectId)) {
      return false;
    }

    return Boolean(
      value && typeof value === 'object' && 'bounded' in value && value.bounded === false && !('error' in value),
    );
  } catch {
    return false;
  }
}
