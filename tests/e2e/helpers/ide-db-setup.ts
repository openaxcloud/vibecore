/** Validate the actual PUT contract without exposing its secret value in assertion output. */
export async function requireDatabaseSetup(
  response: { status(): number; json(): Promise<unknown> },
  projectId: string,
  value: string,
) {
  const status = response.status();

  if (status !== 200) {
    throw new Error(`Database setup PUT failed: HTTP ${status}`);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new Error('Database setup PUT: invalid JSON confirmation');
  }

  const row = (body as { envVar?: Record<string, unknown> } | null)?.envVar;

  const confirmed =
    row &&
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    row.projectId === projectId &&
    row.key === 'DATABASE_URL' &&
    row.value === value &&
    row.scope === 'production';

  if (!confirmed) {
    throw new Error('Database setup PUT: missing or mismatched persisted confirmation');
  }
}
