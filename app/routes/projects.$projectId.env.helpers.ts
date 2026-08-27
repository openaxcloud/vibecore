import {
  formatProjectEnvCopy,
  getProjectEnvCopy,
  getProjectEnvScopeLabel,
  resolveProjectEnvLanguage,
  type ProjectEnvCopy,
} from '~/lib/i18n/catalogs/project-env';
import { formatUserAreaDateTime } from '~/lib/i18n/user-area-locale';

/** Env-var scopes, mirroring the API's `envVarScopeSchema` (services/api). */
export const ENV_VAR_SCOPES = ['development', 'preview', 'production'] as const;
export type EnvVarScope = (typeof ENV_VAR_SCOPES)[number];

export type EnvVarRecord = { id: string; key: string; value: string; scope?: string; updatedAt?: string };

export type EnvVarRow =
  | { kind: 'var'; id: string; key: string; detail: string }
  | { kind: 'empty'; title: string; detail: string };

/**
 * Coerce an arbitrary scope string (or a legacy row written before the column
 * existed) to a known scope. Unknown/absent → 'production', matching the API's
 * back-compat default (services/api `normalizeEnvVarScope`).
 */
export function normalizeEnvVarScope(scope: string | undefined): EnvVarScope {
  return scope === 'development' || scope === 'preview' ? scope : 'production';
}

/*
 * Pure mapping from the loader's env-var records to the rows rendered in the
 * panel, filtered to ONE scope. Variable rows expose a stable `key` so the UI
 * can submit a delete intent for that exact key; the empty placeholder carries
 * no key and must never render a delete control. Rows are sorted by key so the
 * panel order is stable across saves.
 */
export function buildEnvVarRows(
  envVars: EnvVarRecord[] | undefined,
  scope: EnvVarScope,
  language?: string | null,
  suppliedCopy?: ProjectEnvCopy,
): EnvVarRow[] {
  const resolvedLanguage = resolveProjectEnvLanguage(language);
  const copy = suppliedCopy ?? getProjectEnvCopy(resolvedLanguage);
  const scopeLabel = getProjectEnvScopeLabel(scope, copy);

  const vars = (envVars ?? [])
    .filter((item) => normalizeEnvVarScope(item.scope) === scope)
    .sort((a, b) => a.key.localeCompare(b.key));

  if (!vars.length) {
    return [
      {
        kind: 'empty',
        title: formatProjectEnvCopy(copy['projectEnv.empty.title'], { scope: scopeLabel }),
        detail: formatProjectEnvCopy(copy['projectEnv.empty.description'], { scope: scopeLabel }),
      },
    ];
  }

  return vars.map((item) => ({
    kind: 'var' as const,
    id: item.id,
    key: item.key,
    detail: item.updatedAt
      ? formatProjectEnvCopy(copy['projectEnv.row.updated'], {
          date:
            formatUserAreaDateTime(item.updatedAt, undefined, resolvedLanguage) ??
            copy['projectEnv.row.dateUnavailable'],
        })
      : copy['projectEnv.row.saved'],
  }));
}

/** One key's value across the three scopes (absent scope → undefined). */
export type EnvVarDiffRow = {
  key: string;
  values: Record<EnvVarScope, string | undefined>;

  /** True when the value is not identical-and-present across all three scopes. */
  differs: boolean;
};

/**
 * Cross-environment diff: for every key defined in AT LEAST ONE scope, collect
 * its value per scope. `differs` is true when the key is missing in some scope OR
 * its value is not the same in every scope — i.e. the rows worth surfacing in the
 * "differences across environments" view. Pure + deterministic (sorted by key) so
 * it is unit-testable without the loader. The API enforces one row per
 * (key, scope), so the first-seen guard is defensive only.
 */
export function buildEnvVarDiff(envVars: EnvVarRecord[] | undefined): EnvVarDiffRow[] {
  const byKey = new Map<string, Record<EnvVarScope, string | undefined>>();

  for (const item of envVars ?? []) {
    const scope = normalizeEnvVarScope(item.scope);

    const entry =
      byKey.get(item.key) ??
      ({ development: undefined, preview: undefined, production: undefined } as Record<
        EnvVarScope,
        string | undefined
      >);

    if (entry[scope] === undefined) {
      entry[scope] = item.value;
    }

    byKey.set(item.key, entry);
  }

  return [...byKey.entries()]
    .map(([key, values]) => {
      const present = ENV_VAR_SCOPES.filter((scope) => values[scope] !== undefined);
      const allPresent = present.length === ENV_VAR_SCOPES.length;
      const allEqual = present.every((scope) => values[scope] === values[present[0]]);

      return { key, values, differs: !allPresent || !allEqual };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}
