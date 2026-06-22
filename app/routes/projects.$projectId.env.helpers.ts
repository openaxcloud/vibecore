export type EnvVarRecord = { id: string; key: string; value: string; updatedAt?: string };

export type EnvVarRow =
  | { kind: 'var'; id: string; key: string; detail: string }
  | { kind: 'empty'; title: string; detail: string };

/*
 * Pure mapping from the loader's env-var records to the rows rendered in the
 * panel. Variable rows expose a stable `key` so the UI can submit a delete
 * intent for that exact key; the empty placeholder carries no key and must
 * never render a delete control.
 */
export function buildEnvVarRows(envVars: EnvVarRecord[] | undefined): EnvVarRow[] {
  const vars = envVars ?? [];

  if (!vars.length) {
    return [
      {
        kind: 'empty',
        title: 'No environment variables',
        detail: 'Add the first project environment variable.',
      },
    ];
  }

  return vars.map((item) => ({
    kind: 'var' as const,
    id: item.id,
    key: item.key,
    detail: item.updatedAt ? `Updated ${new Date(item.updatedAt).toLocaleString()}` : 'Stored in project metadata',
  }));
}
