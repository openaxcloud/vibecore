import { ChevronRight, RefreshCw, Table2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFetcher } from 'react-router';
import { DatabaseSettings } from './DatabaseSettings';
import { DatabaseStudio } from './DatabaseStudio';
import {
  formatDatabaseSettingsBytes,
  formatDatabaseStudioPlural,
  getDatabaseStudioCopy,
  type DatabaseStudioCopy,
} from '~/lib/i18n/catalogs/database-studio';
import { classNames } from '~/utils/classNames';

/*
 * DatabaseWorkbench — the full Replit-parity Database panel shell, composing the
 * real building blocks (DatabaseStudio = My Data, DatabaseSettings = Settings) on
 * the live API (`…/ide-panel/database` list/schema, form-encoded query POST).
 * Structure: root "All Databases" usage cards (Dev/Prod) → a database view with
 * breadcrumb + Dev/Prod selector + 3 tabs (Overview / My Data / Settings). Zero
 * mock: usage/quota/connection-string render only when the API reports them.
 */

type Tab = 'overview' | 'mydata' | 'settings';

type DbEnv = { name: string; key: string; usedBytes?: number; quotaBytes?: number; status?: string };

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function container(data: unknown): Record<string, unknown> {
  const root = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;

  return (root.data && typeof root.data === 'object' ? root.data : root) as Record<string, unknown>;
}

/**
 * Message d'échec de provisionnement — choisi sur le CODE, jamais sur le texte
 * libre de l'amont.
 *
 * Deux exigences s'opposaient ici, et il faut les tenir ensemble :
 *
 *  1. Ne JAMAIS afficher le message brut de l'amont. Il peut contenir une
 *     chaîne de connexion, donc un mot de passe — c'est ce que garde le test
 *     « masks raw list and provisioning errors » (`… not.toContain('password
 *     leaked')`). Une première version de ce correctif affichait `data.error`
 *     et a été rattrapée par ce test.
 *  2. Ne pas conseiller un réessai qui ne peut PAS aboutir. Quand la cause est
 *     `DATABASE_PROVISION_UNAVAILABLE`, aucun réessai ne marchera tant que la
 *     plateforme n'est pas configurée : « Réessayez » est un conseil faux.
 *
 * La route amont a déjà fait le tri (`ACTIONABLE_PANEL_CODES`) : elle ne laisse
 * passer que des CODES sur lesquels l'utilisateur peut agir et masque tout le
 * reste. On s'appuie donc sur le code — une valeur d'énumération, pas du texte
 * d'amont — pour choisir une copie LOCALISÉE.
 */
export function provisionFailureCopyKey(data: { error?: string; code?: string } | undefined) {
  if (!data?.error?.trim()) {
    return undefined;
  }

  return data.code === 'DATABASE_PROVISION_UNAVAILABLE'
    ? ('databaseWorkbench.provisionUnavailable' as const)
    : ('databaseWorkbench.provisionFailed' as const);
}

/**
 * Détail technique affichable À CÔTÉ de la copie localisée. `reason` est une
 * valeur d'énumération (`SHARED_TENANT_UNAVAILABLE`), mais elle vient de
 * l'amont : on ne l'affiche que si elle EN A LA FORME, sinon un amont bavard
 * rouvrirait exactement la fuite que la règle 1 ferme.
 */
export function provisionFailureReason(data: { reason?: string } | undefined) {
  const reason = data?.reason?.trim();

  return reason && /^[A-Z][A-Z0-9_]{2,63}$/.test(reason) ? reason : undefined;
}

export function readEnvironments(data: unknown): DbEnv[] {
  const c = container(data);

  /*
   * `GET /projects/:id/databases` renvoie DEUX champs de sens différent :
   * `connections`, les bases réelles du projet (des OBJETS portant `key`), et
   * `environments`, la liste des NOMS d'environnement possibles (des CHAÎNES —
   * une constante, jamais vide).
   *
   * Le lecteur prenait `c.environments ?? c.databases ?? c.connections`. Comme
   * `environments` est TOUJOURS présent, le `??` ne retombait jamais sur
   * `connections` : on itérait des chaînes, dont aucune n'expose de `key`, et
   * on les écartait toutes. Le panneau rendait donc l'état vide « Aucune base
   * de données pour le moment » quoi qu'il arrive, y compris juste après un
   * provisionnement réussi — d'où « j'appuie sur Créer, rien ne se passe ».
   *
   * On retient donc la première source qui décrit VRAIMENT des bases, c'est-à-
   * dire dont au moins une entrée est un objet. Un tableau de chaînes ne peut
   * plus être pris pour une liste de bases, dans un sens comme dans l'autre :
   * ni masquer les vraies, ni en inventer cinq pour un projet qui n'en a aucune.
   */
  const decrit = (source: unknown) => asArray(source).some((d) => d !== null && typeof d === 'object');
  const raw = asArray([c.databases, c.connections, c.environments].find(decrit) ?? []);
  const envs: DbEnv[] = [];

  for (const d of raw) {
    const o = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    const key = String(o.key ?? o.connectionKey ?? o.id ?? o.name ?? '');

    if (!key) {
      continue;
    }

    const env: DbEnv = { key, name: String(o.name ?? o.label ?? o.displayName ?? key) };

    if (typeof o.usedBytes === 'number') {
      env.usedBytes = o.usedBytes;
    } else if (typeof o.sizeBytes === 'number') {
      env.usedBytes = o.sizeBytes;
    }

    if (typeof o.quotaBytes === 'number') {
      env.quotaBytes = o.quotaBytes;
    }

    if (o.status) {
      env.status = String(o.status);
    }

    envs.push(env);
  }

  /*
   * HONEST empty state. Previously this fabricated a fake
   * [{ key: 'DATABASE_URL', name: 'Production Database' }] card when the project had
   * NO real database — so the panel showed "Production Database — Connected" with an
   * SQL editor for a project with zero databases (data.environments/connections all
   * empty). A user would write SQL against a database that does not exist. Return the
   * real (possibly empty) list so the panel reflects THIS project's actual databases
   * and the "Add your first database" create path shows instead.
   */
  return envs;
}

function readConnectionString(data: unknown, key: string): string | undefined {
  const c = container(data);
  const envVars = asArray(c.envVars ?? c.secrets) as Array<Record<string, unknown>>;

  const hit = envVars.find(
    (e) => String(e.key ?? e.name ?? '') === key || String(e.key ?? e.name ?? '') === 'DATABASE_URL',
  );

  return hit && typeof hit.value === 'string' ? hit.value : undefined;
}

function localizedStatus(copy: DatabaseStudioCopy, status?: string): string {
  switch (status?.trim().toLowerCase()) {
    case 'connected':
    case 'active':
    case 'ready':
      return copy['databaseWorkbench.status.connected'];
    case 'creating':
    case 'pending':
    case 'provisioning':
      return copy['databaseWorkbench.status.provisioning'];
    case 'error':
    case 'offline':
    case 'unavailable':
      return copy['databaseWorkbench.status.unavailable'];
    default:
      return copy['databaseWorkbench.status.unknown'];
  }
}

function UsageCard({
  env,
  onOpen,
  copy,
  language,
}: {
  env: DbEnv;
  onOpen: () => void;
  copy: DatabaseStudioCopy;
  language: string;
}) {
  const used = formatDatabaseSettingsBytes(env.usedBytes, language);
  const quota = formatDatabaseSettingsBytes(env.quotaBytes, language);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 min-w-0 items-center justify-between gap-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 text-left hover:border-bolt-elements-item-contentAccent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
    >
      <div className="min-w-0">
        <div className="break-words text-[14px] font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
          {env.name}
        </div>
        <div className="mt-1 break-words text-[12px] text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
          {used ? `${used}${quota ? ` / ${quota}` : ''}` : localizedStatus(copy, env.status)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-bolt-elements-textTertiary" aria-hidden />
    </button>
  );
}

export function DatabaseWorkbench({ projectId }: { projectId: string }) {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDatabaseStudioCopy(language);
  const base = `/api/projects/${encodeURIComponent(projectId)}/ide-panel/database`;
  const fetcher = useFetcher();

  const provisionFetcher = useFetcher<{
    ok?: boolean;
    instance?: unknown;
    error?: string;
    code?: string;
    reason?: string;
  }>();

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  /*
   * BUG-QA-DB-REFETCH-LOOP-001 — deux boucles de rechargement infinies vivaient ici.
   *
   * `useFetcher()` renvoie un objet d'identité NOUVELLE à chaque rendu. Le mettre
   * en dépendance relançait donc l'effet à chaque rendu, et la garde `!fetcher.data`
   * ne retenait rien dès que le chargement n'aboutissait à aucune donnée — le cas
   * exact d'un provisionnement échoué. Mesuré par la QA : ~110 requêtes / 30 s
   * depuis UN SEUL onglet, CPU de l'API à 212 %, HPA de 2 à 10 réplicas.
   *
   * Le second effet bouclait pour une raison voisine : `provisionFetcher.data.ok`
   * reste vrai APRÈS un provisionnement réussi, donc `fetcher.load()` repartait à
   * chaque rendu.
   *
   * Les deux sont désormais gardés par une ref, et `fetcher` sort des dépendances :
   * l'identité qui compte est `base` (le projet), pas l'objet fetcher.
   */
  const loadedBaseRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedBaseRef.current === base) {
      return;
    }

    loadedBaseRef.current = base;
    fetcher.load(base);

    // `fetcher` est volontairement absent : son identité change à chaque rendu.
  }, [base]);

  // Après un provisionnement réussi, recharger le panneau UNE fois.
  const handledProvisionRef = useRef<unknown>(null);

  useEffect(() => {
    const data = provisionFetcher.data;

    if (provisionFetcher.state !== 'idle' || !data?.ok || handledProvisionRef.current === data) {
      return;
    }

    handledProvisionRef.current = data;
    fetcher.load(base);

    // `fetcher` est volontairement absent : son identité change à chaque rendu.
  }, [provisionFetcher.state, provisionFetcher.data, base]);

  const provisioning = provisionFetcher.state !== 'idle';

  const environments = useMemo(() => readEnvironments(fetcher.data), [fetcher.data]);
  const active = environments.find((e) => e.key === openKey) ?? null;
  const loading = fetcher.state !== 'idle';

  /*
   * BUG-QA-DB-IDE-BRICK-001 — un provisionnement échoué rendait l'IDE inutilisable.
   * L'onglet `database` est persisté côté serveur : à chaque ouverture du projet il
   * se remontait, relançait la boucle ci-dessus et l'IDE ne finissait jamais de
   * monter, sans aucune issue par l'interface.
   *
   * L'échec n'était reconnu que si la réponse portait un `error` — donc un
   * chargement qui n'aboutit à AUCUNE donnée (route en échec, 5xx, réseau coupé)
   * laissait le panneau en squelette perpétuel. On traite désormais aussi ce cas :
   * l'utilisateur voit une erreur et un bouton Réessayer, l'onglet reste
   * fermable, et le montage de l'IDE n'est plus retenu.
   */
  const loadAttempted = loadedBaseRef.current === base;

  /*
   * Une réponse qui PORTE une erreur est un échec en soi : elle doit s'afficher
   * dès le premier rendu, sans attendre qu'on ait nous-mêmes déclenché le
   * chargement. Seul le cas « aucune donnée du tout » a besoin de la garde
   * `loadAttempted`, pour distinguer « pas encore essayé » de « essayé, rien reçu ».
   */
  const loadFailed =
    fetcher.state === 'idle' &&
    ((Boolean(fetcher.data) && typeof container(fetcher.data).error === 'string' && environments.length === 0) ||
      (loadAttempted && fetcher.data === undefined));

  // Root view — Dev/Prod usage cards.
  if (!active) {
    return (
      <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-4">
        <header className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 break-words text-[15px] font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
            {copy['databaseWorkbench.allDatabases']}
          </h2>
          <button
            type="button"
            onClick={() => fetcher.load(base)}
            disabled={loading}
            className="inline-flex min-h-11 items-center gap-1.5 whitespace-normal rounded-md border border-bolt-elements-borderColor px-3 py-2 text-center text-[13px] text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] disabled:opacity-60"
          >
            <RefreshCw className={classNames('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden />
            {copy['databaseWorkbench.refresh']}
          </button>
        </header>
        {loading && fetcher.data === undefined ? (
          <div className="grid gap-3 sm:grid-cols-2" role="status" aria-live="polite">
            <span className="sr-only">{copy['databaseWorkbench.loading']}</span>
            {[0, 1].map((index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2"
                aria-hidden="true"
              />
            ))}
          </div>
        ) : null}
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {environments.map((env) => (
            <UsageCard
              key={env.key}
              env={env}
              copy={copy}
              language={language}
              onOpen={() => {
                setOpenKey(env.key);
                setTab('overview');
              }}
            />
          ))}
        </div>

        {loadFailed ? (
          <div
            className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
            role="alert"
          >
            <p className="break-words text-[13px] text-red-500 [overflow-wrap:anywhere]">
              {copy['databaseWorkbench.loadFailed']}
            </p>
            <button
              type="button"
              onClick={() => fetcher.load(base)}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-bolt-elements-borderColor px-3 py-2 text-[13px] font-medium text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
            >
              {copy['databaseWorkbench.retry']}
            </button>
          </div>
        ) : environments.length === 0 && !loading ? (
          <div className="flex min-w-0 flex-col items-start gap-3 rounded-lg border border-dashed border-bolt-elements-borderColor p-4">
            <div className="min-w-0">
              <p className="break-words text-[13px] font-medium text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
                {copy['databaseWorkbench.noDatabase']}
              </p>
              <p className="break-words text-[12px] text-bolt-elements-textSecondary [overflow-wrap:anywhere]">
                {copy['databaseWorkbench.noDatabaseDescription']}
              </p>
            </div>
            <button
              type="button"
              disabled={provisioning}
              onClick={() => provisionFetcher.submit({ intent: 'provision' }, { method: 'post', action: base })}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 whitespace-normal rounded-md bg-bolt-elements-button-primary-background px-3 py-2 text-center text-[13px] font-medium text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] disabled:opacity-60 sm:w-auto"
            >
              {provisioning ? copy['databaseWorkbench.creating'] : copy['databaseWorkbench.create']}
            </button>
            {provisionFetcher.data?.error ? (
              <p className="break-words text-[12px] text-red-500 [overflow-wrap:anywhere]" role="alert">
                {copy[provisionFailureCopyKey(provisionFetcher.data) ?? 'databaseWorkbench.provisionFailed']}
                {provisionFailureReason(provisionFetcher.data)
                  ? ` (${provisionFailureReason(provisionFetcher.data)})`
                  : ''}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // Database view — breadcrumb + Dev/Prod selector + 3 tabs.
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'overview', label: copy['databaseWorkbench.overview'] },
    { id: 'mydata', label: copy['databaseWorkbench.myData'] },
    { id: 'settings', label: copy['databaseWorkbench.settings'] },
  ];

  return (
    <div className="bolt-database-workbench flex h-full min-h-0 flex-col">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-bolt-elements-borderColor px-3 py-2 text-[13px] sm:px-4">
        <button
          type="button"
          onClick={() => setOpenKey(null)}
          className="min-h-11 break-words text-left text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)] [overflow-wrap:anywhere]"
        >
          {copy['databaseWorkbench.allDatabases']}
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-bolt-elements-textTertiary" aria-hidden />
        <select
          value={active.key}
          onChange={(e) => setOpenKey(e.target.value)}
          className="min-h-11 min-w-0 max-w-full rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 px-2 py-2 text-[13px] font-medium text-bolt-elements-textPrimary"
        >
          {environments.map((env) => (
            <option key={env.key} value={env.key}>
              {env.name}
            </option>
          ))}
        </select>
      </div>

      <nav
        className="flex min-w-0 items-stretch gap-1 overflow-x-auto border-b border-bolt-elements-borderColor px-2 sm:px-3"
        role="tablist"
        aria-label={copy['databaseWorkbench.views']}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={classNames(
              'min-h-11 shrink-0 whitespace-normal border-b-2 px-3 py-2 text-center text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ecode-accent)]',
              tab === t.id
                ? 'border-[var(--ecode-accent,#F26207)] text-bolt-elements-textPrimary'
                : 'border-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="bolt-database-workbench-body min-h-0 flex-1 overflow-auto">
        {tab === 'overview' ? (
          <OverviewTab
            base={base}
            connectionKey={active.key}
            onPickTable={() => setTab('mydata')}
            copy={copy}
            language={language}
          />
        ) : null}
        {tab === 'mydata' ? <DatabaseStudio projectId={projectId} /> : null}
        {tab === 'settings' ? (
          <DatabaseSettings
            name={active.name}
            active
            connectionString={readConnectionString(fetcher.data, active.key)}
            storageUsedBytes={active.usedBytes}
            storageQuotaBytes={active.quotaBytes}
            projectId={projectId}
          />
        ) : null}
      </div>
    </div>
  );
}

/* Overview — "Tables" cards (name + row count) from the connection schema. */
function OverviewTab({
  base,
  connectionKey,
  onPickTable,
  copy,
  language,
}: {
  base: string;
  connectionKey: string;
  onPickTable: () => void;
  copy: DatabaseStudioCopy;
  language: string;
}) {
  const fetcher = useFetcher();

  useEffect(() => {
    fetcher.load(`${base}?schemaKey=${encodeURIComponent(connectionKey)}`);
  }, [connectionKey]);

  const tables = useMemo(() => {
    const c = container(fetcher.data);
    const schema = (c.schema && typeof c.schema === 'object' ? c.schema : c) as Record<string, unknown>;

    return asArray(schema.tables ?? c.tables).map((t) => {
      const o = (t && typeof t === 'object' ? t : {}) as Record<string, unknown>;

      return { name: String(o.name ?? o.table ?? ''), rows: typeof o.rowCount === 'number' ? o.rowCount : undefined };
    });
  }, [fetcher.data]);

  return (
    <div className="flex min-w-0 flex-col gap-3 p-3 sm:p-4">
      <h3 className="flex min-w-0 items-center gap-1.5 break-words text-[13px] font-semibold text-bolt-elements-textPrimary [overflow-wrap:anywhere]">
        <Table2 className="h-4 w-4 shrink-0" aria-hidden /> {copy['databaseWorkbench.tables']}
      </h3>
      {tables.length === 0 ? (
        <p className="break-words text-[12px] text-bolt-elements-textTertiary [overflow-wrap:anywhere]" role="status">
          {fetcher.state !== 'idle' ? copy['databaseWorkbench.loadingSchema'] : copy['databaseWorkbench.noTables']}
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <button
              key={t.name}
              type="button"
              onClick={onPickTable}
              className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-md border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-3 py-2 text-left hover:border-bolt-elements-item-contentAccent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-accent)]"
            >
              <span className="truncate font-mono text-[13px] text-bolt-elements-textPrimary">{t.name}</span>
              <span className="shrink-0 text-[12px] text-bolt-elements-textTertiary">
                {typeof t.rows === 'number'
                  ? formatDatabaseStudioPlural(language, t.rows, {
                      one: copy['databaseWorkbench.rows_one'],
                      other: copy['databaseWorkbench.rows_other'],
                    })
                  : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
