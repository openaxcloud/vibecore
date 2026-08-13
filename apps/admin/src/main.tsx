import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildAdminLoginBody, errorMessage, isMfaRequiredError } from './admin-login';
import {
  adminSections,
  collectionFromResponse,
  dangerousActions,
  searchableText,
  sortRows,
  type AdminSection,
} from './admin-model';
import {
  apiJson,
  clearAdminToken,
  exportCsv,
  getAdminToken,
  reauthAdmin,
  setAdminToken,
  type AdminOverview,
  type AdminRecord,
} from './api';
import { CUSTOM_PANELS } from './panels';
import { redactRecord } from './redact';
import './styles.css';

type SortState = { key: string; direction: 'asc' | 'desc' };
type DialogState = { action: string; title: string; payload?: AdminRecord } | null;

function App() {
  const [sectionId, setSectionId] = useState('overview');
  const [token, setToken] = useState(getAdminToken());
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMfaCode, setLoginMfaCode] = useState('');
  const [authRevision, setAuthRevision] = useState(0);
  const [tokenMessage, setTokenMessage] = useState<string>();
  const [reauthPassword, setReauthPassword] = useState('');
  // F23: live count of unresolved security events, badged on the sidebar item.
  const [securityOpenCount, setSecurityOpenCount] = useState(0);
  const section = adminSections.find((item) => item.id === sectionId) ?? adminSections[0];

  useEffect(() => {
    if (!token.trim()) {
      setSecurityOpenCount(0);
      return;
    }
    let cancelled = false;
    apiJson<{ openCount?: number }>('/admin/security-events')
      .then((result) => {
        if (!cancelled) {
          setSecurityOpenCount(result.openCount ?? 0);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSecurityOpenCount(0);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token, authRevision, sectionId]);

  function useToken() {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      clearAdminToken();
      setToken('');
      setTokenMessage('Token cleared.');
    } else {
      setAdminToken(normalizedToken);
      setToken(normalizedToken);
      setTokenMessage('Token saved. Reloading admin data...');
    }

    setAuthRevision((value) => value + 1);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>E-Code Admin</h1>
            <div className="muted">Platform console</div>
          </div>
          <span className="status">live</span>
        </div>
        <nav className="nav" aria-label="Admin sections">
          {adminSections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === section.id ? 'page' : undefined}
              onClick={() => setSectionId(item.id)}
            >
              {item.label}
              {item.id === 'security-events' && securityOpenCount > 0 ? (
                <span className="nav-badge" aria-label={`${securityOpenCount} open security events`}>
                  {securityOpenCount}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="page-title">
            <div>
              <h1>{section.label}</h1>
              <p className="muted">{section.description}</p>
            </div>
          </div>
          <form
            className="token-form"
            onSubmit={async (event) => {
              event.preventDefault();

              if (loginEmail || loginPassword) {
                try {
                  const result = await apiJson<{ token: string }>('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(buildAdminLoginBody(loginEmail, loginPassword, loginMfaCode)),
                  });
                  setAdminToken(result.token);
                  setToken(result.token);
                  setLoginMfaCode('');
                  setTokenMessage('Login saved. Reloading admin data...');
                  setAuthRevision((value) => value + 1);
                } catch (error) {
                  const message = errorMessage(error, 'Login failed');
                  setTokenMessage(
                    isMfaRequiredError(message)
                      ? 'MFA code required — enter your authenticator or recovery code and try again.'
                      : message,
                  );
                }
              } else {
                useToken();
              }
            }}
          >
            <input
              aria-label="Admin email"
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="admin email"
            />
            <input
              aria-label="Admin password"
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="password"
            />
            <input
              aria-label="MFA code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={loginMfaCode}
              onChange={(event) => setLoginMfaCode(event.target.value)}
              placeholder="MFA code (if enabled)"
            />
            <input
              aria-label="Admin bearer token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Admin bearer token"
            />
            <input
              aria-label="Re-auth password"
              type="password"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
              placeholder="re-auth password"
            />
            <button className="secondary" type="submit">
              Login / use token
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                clearAdminToken();
                setToken('');
                setTokenMessage('Token cleared.');
                setAuthRevision((value) => value + 1);
              }}
            >
              Clear
            </button>
            {tokenMessage ? <span className="muted">{tokenMessage}</span> : null}
          </form>
        </div>
        <SectionView section={section} authRevision={authRevision} reauthPassword={reauthPassword} />
      </main>
    </div>
  );
}

function SectionView({
  section,
  authRevision,
  reauthPassword,
}: {
  section: AdminSection;
  authRevision: number;
  reauthPassword: string;
}) {
  const [data, setData] = useState<unknown>();
  const [rows, setRows] = useState<AdminRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'createdAt', direction: 'desc' });
  const [selected, setSelected] = useState<AdminRecord>();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<string>();

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError(undefined);

    try {
      const response = await apiJson<unknown>(section.endpoint, { signal });

      /*
       * A newer section/auth load aborted this one: drop the stale response so it
       * can't clobber the now-visible section's rows/data with the wrong records.
       */
      if (signal?.aborted) {
        return;
      }

      setData(response);
      setRows(collectionFromResponse(response, section));
    } catch (requestError) {
      if (isAbortError(requestError) || signal?.aborted) {
        return;
      }

      setError(requestError instanceof Error ? requestError.message : 'Unable to load admin section');
      setRows([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    /*
     * Cancel the in-flight request when the section/auth changes so a slower
     * previous-section response cannot resolve after — and overwrite — the new one.
     */
    return () => controller.abort();
  }, [section.id, authRevision]);

  const visibleRows = useMemo(() => {
    const filtered = query ? rows.filter((row) => searchableText(row).includes(query.toLowerCase())) : rows;
    return sortRows(filtered, sort.key, sort.direction);
  }, [query, rows, sort]);

  const columns = useMemo(() => inferColumns(rows), [rows]);
  const CustomPanel = CUSTOM_PANELS[section.id];

  async function runAction(action: string, payload?: AdminRecord, body?: Record<string, unknown>) {
    if (dangerousActions.has(action)) {
      /*
       * The themed ActionDialog gates dangerous actions with an explicit
       * acknowledgement checkbox (no native window.confirm), so by the time we
       * get here the operator has confirmed. We only still need the re-auth
       * password before hitting the audited endpoint.
       */
      if (!reauthPassword) {
        setToast('Enter your re-auth password in the top bar before dangerous admin actions.');
        return;
      }
    }

    try {
      if (dangerousActions.has(action)) {
        await reauthAdmin(reauthPassword);
      }

      const request = adminActionRequest(action, payload, body);
      await apiJson(request.path, {
        method: request.method,
        body: request.body ? JSON.stringify(request.body) : undefined,
      });
      setToast('Admin action completed and audited.');
      setDialog(null);
      await load();
    } catch (error) {
      /*
       * Re-auth or the action endpoint failed: surface it instead of leaving
       * the dialog stuck open with no feedback (would look like a no-op).
       */
      setToast(errorMessage(error, 'Admin action failed'));
    }
  }

  if (loading) {
    return <div className="panel skeleton" role="status" aria-label="Loading admin data" />;
  }

  if (error) {
    return (
      <div className="panel" role="alert">
        <h2>Unable to load section</h2>
        <p>{error}</p>
        <button className="action" type="button" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="grid">
      {section.id === 'overview' ? <Overview data={data as AdminOverview} /> : null}
      {CustomPanel ? <CustomPanel reauthPassword={reauthPassword} pushToast={setToast} /> : null}
      {CustomPanel ? null : (
      <>
      <div className="toolbar">
        <input
          aria-label="Filter table"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter rows"
        />
        <div className="actions">
          {section.exportable ? (
            <button
              className="secondary"
              type="button"
              onClick={() => void exportCsv(section.endpoint, `${section.id}.csv`)}
            >
              Export CSV
            </button>
          ) : null}
          <button className="secondary" type="button" onClick={() => void load()}>
            Refresh
          </button>
          {section.id === 'feature-flags' ? (
            <button
              className="action"
              type="button"
              onClick={() => setDialog({ action: 'create-flag', title: 'Create feature flag' })}
            >
              Create flag
            </button>
          ) : null}
          {section.id === 'announcements' ? (
            <button
              className="action"
              type="button"
              onClick={() => setDialog({ action: 'announcement', title: 'Create announcement' })}
            >
              Announce
            </button>
          ) : null}
          {section.id === 'incident-banner' ? (
            <button
              className="danger"
              type="button"
              onClick={() => setDialog({ action: 'incident', title: 'Set incident banner' })}
            >
              Incident banner
            </button>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="panel">
          <h2>Empty state</h2>
          <p className="muted">The API returned no records for this section.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>
                    <button
                      type="button"
                      onClick={() =>
                        setSort((current) => ({
                          key: column,
                          direction: current.key === column && current.direction === 'asc' ? 'desc' : 'asc',
                        }))
                      }
                    >
                      {column}
                    </button>
                  </th>
                ))}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={String(row.id ?? row.key ?? index)}>
                  {columns.map((column) => (
                    <td key={column}>{formatCell(row[column])}</td>
                  ))}
                  <td>
                    <div className="actions">
                      <button className="secondary" type="button" onClick={() => setSelected(row)}>
                        Details
                      </button>
                      <RowActions
                        section={section}
                        row={row}
                        onAction={(action) => setDialog({ action, title: actionLabel(action), payload: row })}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
      {selected ? <DetailsPanel record={selected} onClose={() => setSelected(undefined)} /> : null}
      {dialog ? <ActionDialog dialog={dialog} onCancel={() => setDialog(null)} onSubmit={runAction} /> : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button className="secondary" type="button" onClick={() => setToast(undefined)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const counts = data?.counts ?? {};
  const health = data?.health;

  return (
    <div className="grid metrics">
      {Object.entries(counts).map(([key, value]) => (
        <div className="card metric" key={key}>
          {key}
          <strong>{value}</strong>
        </div>
      ))}
      <div className="card metric">
        AI cost
        <strong>${((data?.cost?.aiCostCents ?? 0) / 100).toFixed(2)}</strong>
      </div>
      {health
        ? Object.entries(health).map(([key, value]) => (
            <div className="card" key={key}>
              <span className={statusClass(String(value.status))}>{key}</span>
              <p className="muted">{JSON.stringify(value)}</p>
            </div>
          ))
        : null}
    </div>
  );
}

function RowActions({
  section,
  row,
  onAction,
}: {
  section: AdminSection;
  row: AdminRecord;
  onAction: (action: string) => void;
}) {
  if (section.id === 'users') {
    return (
      <>
        <button className="danger" type="button" onClick={() => onAction('suspend-user')}>
          Suspend
        </button>
        <button className="secondary" type="button" onClick={() => onAction('force-logout')}>
          Logout
        </button>
        <button className="secondary" type="button" onClick={() => onAction('reset-mfa')}>
          Reset MFA
        </button>
      </>
    );
  }

  if (section.id === 'organizations') {
    return (
      <button className="danger" type="button" onClick={() => onAction('suspend-org')}>
        Suspend org
      </button>
    );
  }

  if (section.id === 'workspaces') {
    return (
      <>
        <button className="danger" type="button" onClick={() => onAction('stop-workspace')}>
          Stop
        </button>
        <button className="secondary" type="button" onClick={() => onAction('restart-workspace')}>
          Restart
        </button>
      </>
    );
  }

  if (section.id === 'abuse-events') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('resolve-abuse')}>
        Resolve
      </button>
    );
  }

  if (section.id === 'support-tickets') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('respond-ticket')}>
        Respond
      </button>
    );
  }

  if (section.id === 'quotas') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('quota-override')}>
        Override
      </button>
    );
  }

  return null;
}

function ActionDialog({
  dialog,
  onCancel,
  onSubmit,
}: {
  dialog: NonNullable<DialogState>;
  onCancel: () => void;
  onSubmit: (action: string, payload?: AdminRecord, body?: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const fields = fieldsForAction(dialog.action);
  const isDangerous = dangerousActions.has(dialog.action);

  return (
    <div className="modal-backdrop" role="presentation">
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        onSubmit={(event) => {
          event.preventDefault();

          if (isDangerous && !acknowledged) {
            return;
          }

          void onSubmit(dialog.action, dialog.payload, form);
        }}
      >
        <h2>{dialog.title}</h2>
        <p className="muted">This action is audited and may require recent admin re-authentication.</p>
        {fields.map((field) => (
          <label key={field.name}>
            {field.label}
            {field.kind === 'textarea' ? (
              <textarea
                required={field.required}
                value={form[field.name] ?? ''}
                onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
              />
            ) : (
              <input
                required={field.required}
                value={form[field.name] ?? ''}
                onChange={(event) => setForm({ ...form, [field.name]: event.target.value })}
              />
            )}
          </label>
        ))}
        {isDangerous ? (
          <label className="danger-ack">
            <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
            <span>
              I confirm this admin action. It requires recent re-authentication and will be written to AdminAuditLog.
            </span>
          </label>
        ) : null}
        <div className="actions">
          <button className="secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="danger" type="submit" disabled={isDangerous && !acknowledged}>
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailsPanel({ record, onClose }: { record: AdminRecord; onClose: () => void }) {
  return (
    <section className="panel" aria-label="Detail page">
      <div className="page-title">
        <h2>Details</h2>
        <button className="secondary" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <pre>{JSON.stringify(redactRecord(record), null, 2)}</pre>
    </section>
  );
}

function inferColumns(rows: AdminRecord[]) {
  const preferred = [
    'id',
    'email',
    'name',
    'organizationId',
    'projectId',
    'userId',
    'status',
    'severity',
    'type',
    'action',
    'createdAt',
  ];
  const keys = new Set(
    rows.flatMap((row) => Object.keys(row)).filter((key) => !/secret|token|password|keyHash/i.test(key)),
  );

  return preferred
    .filter((key) => keys.has(key))
    .concat([...keys].filter((key) => !preferred.includes(key)).slice(0, 4));
}

function formatCell(value: unknown) {
  if (value === undefined || value === null) {
    return <span className="muted">-</span>;
  }

  if (typeof value === 'boolean') {
    return value ? 'yes' : 'no';
  }

  if (typeof value === 'object') {
    return <code>{JSON.stringify(redactRecord(value as AdminRecord)).slice(0, 140)}</code>;
  }

  return String(value);
}

function statusClass(status: string) {
  if (/healthy|configured|ok|ready|live/i.test(status)) {
    return 'status';
  }

  if (/not-configured|degraded|pending|starting/i.test(status)) {
    return 'status warn';
  }

  return 'status bad';
}

type ActionField = { name: string; label: string; kind?: 'textarea'; required: boolean };

function fieldsForAction(action: string): ActionField[] {
  if (action === 'respond-ticket') {
    return [{ name: 'response', label: 'Response', kind: 'textarea', required: true }];
  }

  if (action === 'quota-override') {
    return [
      { name: 'key', label: 'Quota key', required: true },
      { name: 'limit', label: 'Limit', required: true },
      { name: 'reason', label: 'Reason', required: true },
    ];
  }

  if (action === 'create-flag') {
    return [
      { name: 'key', label: 'Flag key', required: true },
      { name: 'enabled', label: 'Enabled true/false', required: true },
      { name: 'rolloutPercent', label: 'Rollout percent', required: false },
    ];
  }

  if (action === 'announcement' || action === 'incident') {
    return [{ name: 'message', label: 'Message', kind: 'textarea', required: true }];
  }

  return [];
}

function adminActionRequest(action: string, payload?: AdminRecord, body: Record<string, unknown> = {}) {
  const id = String(payload?.id ?? '');

  switch (action) {
    case 'suspend-user':
      return { method: 'POST', path: `/admin/users/${id}/suspend` };
    case 'force-logout':
      return { method: 'POST', path: `/admin/users/${id}/force-logout` };
    case 'reset-mfa':
      return { method: 'POST', path: `/admin/users/${id}/reset-mfa` };
    case 'suspend-org':
      return { method: 'POST', path: `/admin/orgs/${id}/suspend` };
    case 'stop-workspace':
      return { method: 'POST', path: `/admin/workspaces/${id}/stop` };
    case 'restart-workspace':
      return { method: 'POST', path: `/admin/workspaces/${id}/restart` };
    case 'resolve-abuse':
      return { method: 'POST', path: `/admin/abuse-events/${id}/resolve` };
    case 'respond-ticket':
      return {
        method: 'POST',
        path: `/admin/support-tickets/${id}/respond`,
        body: { response: body.response, status: 'PENDING' },
      };
    case 'quota-override':
      return {
        method: 'POST',
        path: '/admin/quota-overrides',
        body: {
          organizationId: payload?.organizationId ?? organizationIdFromPayload(payload),
          key: body.key,
          limit: Number(body.limit),
          reason: body.reason,
        },
      };
    case 'create-flag':
      return {
        method: 'POST',
        path: '/admin/feature-flags',
        body: {
          key: body.key,
          enabled: String(body.enabled).toLowerCase() === 'true',
          rolloutPercent: body.rolloutPercent ? Number(body.rolloutPercent) : undefined,
        },
      };
    case 'announcement':
      return {
        method: 'POST',
        path: '/admin/announcements',
        body: { message: body.message, severity: 'info', active: true },
      };
    case 'incident':
      return {
        method: 'POST',
        path: '/admin/incident-banner',
        body: { message: body.message, status: 'investigating', active: true },
      };
    default:
      return { method: 'POST', path: '/admin/system-settings', body };
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : Boolean(error) && typeof error === 'object' && (error as { name?: unknown }).name === 'AbortError';
}

function organizationIdFromPayload(payload?: AdminRecord) {
  const organization = payload?.organization;
  return organization && typeof organization === 'object' && 'id' in organization
    ? String((organization as { id: string }).id)
    : '';
}

function actionLabel(action: string) {
  return action.replaceAll('-', ' ');
}

const rootElement = document.getElementById('root');

if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
