/** Only an authoritative unbounded project may replay a queued prompt automatically. */
export async function canAutomaticallyReplayPrompt(
  projectId: string,
  transport: typeof fetch = fetch,
): Promise<boolean> {
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

    return Boolean(
      value && typeof value === 'object' && 'bounded' in value && value.bounded === false && !('error' in value),
    );
  } catch {
    return false;
  }
}
