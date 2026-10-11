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
  hasAdminSession,
  reauthAdmin,
  setAdminToken,
  type AdminOverview,
  type AdminRecord,
} from './api';
import {
  adminPluralT,
  adminStandaloneT as adminT,
  getAdminLanguage,
  initializeAdminLanguage,
  localizedAdminError,
  selectAdminLanguage,
  type AdminLanguage,
} from './i18n';
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

  /*
   * AUDX-008: signed-in state comes from the httpOnly session cookie, not from a
   * token read out of localStorage. Without this probe, removing the stored
   * bearer would log every operator out on reload — a guard that breaks normal
   * work gets reverted, not fixed (CLAUDE.md rule 19).
   */
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void hasAdminSession().then((live) => {
      if (!cancelled) {
        setHasSession(live);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authRevision]);

  // F23: live count of unresolved security events, badged on the sidebar item.
  const [securityOpenCount, setSecurityOpenCount] = useState(0);
  const section = adminSections.find((item) => item.id === sectionId) ?? adminSections[0];

  useEffect(() => {
    if (!token.trim() && !hasSession) {
      setSecurityOpenCount(0);
      return undefined;
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
  }, [token, hasSession, authRevision, sectionId]);

  function useToken() {
    const normalizedToken = token.trim();

    if (!normalizedToken) {
      clearAdminToken();
      setToken('');
      setTokenMessage(adminT('admin.standalone.tokenCleared'));
    } else {
      setAdminToken(normalizedToken);
      setToken(normalizedToken);
      setTokenMessage(adminT('admin.standalone.tokenSaved'));
    }

    setAuthRevision((value) => value + 1);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div>
            <h1>{adminT('admin.standalone.eCodeAdmin_b09925')}</h1>
            <div className="muted">{adminT('admin.standalone.platformConsole_7548ce')}</div>
          </div>
          <span className="status">{adminT('admin.standalone.live_98aadb')}</span>
          <AdminLanguageSwitch />
        </div>
        <nav className="nav" aria-label={adminT('admin.standalone.adminSections_80deff')}>
          {adminSections.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={item.id === section.id ? 'page' : undefined}
              onClick={() => setSectionId(item.id)}
            >
              {item.label}
              {item.id === 'security-events' && securityOpenCount > 0 ? (
                <span
                  className="nav-badge"
                  aria-label={adminPluralT(
                    'admin.standalone.openSecurityEvents_one',
                    'admin.standalone.openSecurityEvents_other',
                    securityOpenCount,
                  )}
                >
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
                  await apiJson<{ token: string }>('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify(buildAdminLoginBody(loginEmail, loginPassword, loginMfaCode)),
                  });

                  /*
                   * The login response also set the httpOnly cookie; that is what
                   * authenticates from here on. Nothing is persisted.
                   */
                  setLoginMfaCode('');
                  setHasSession(true);
                  setTokenMessage(adminT('admin.standalone.loginSaved'));
                  setAuthRevision((value) => value + 1);
                } catch (error) {
                  const message = errorMessage(error, '');
                  setTokenMessage(
                    isMfaRequiredError(message)
                      ? adminT('admin.standalone.mfaRequired')
                      : adminT('admin.standalone.loginFailed'),
                  );
                }
              } else {
                useToken();
              }
            }}
          >
            <input
              aria-label={adminT('admin.standalone.adminEmail_f0fee7')}
              type="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder={adminT('admin.standalone.adminEmail_01caf6')}
            />
            <input
              aria-label={adminT('admin.standalone.adminPassword_b2cee1')}
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder={adminT('admin.standalone.password_5baa61')}
            />
            <input
              aria-label={adminT('admin.standalone.mfaCode_645f64')}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={loginMfaCode}
              onChange={(event) => setLoginMfaCode(event.target.value)}
              placeholder={adminT('admin.standalone.mfaCodeIfEnabled_ea329b')}
            />
            <input
              aria-label={adminT('admin.standalone.adminBearerToken_3ac8f5')}
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={adminT('admin.standalone.adminBearerToken_3ac8f5')}
            />
            <input
              aria-label={adminT('admin.standalone.reAuthPassword_91678c')}
              type="password"
              value={reauthPassword}
              onChange={(event) => setReauthPassword(event.target.value)}
              placeholder={adminT('admin.standalone.reAuthPassword_d4ddd0')}
            />
            <button className="secondary" type="submit">
              {adminT('admin.standalone.loginUseToken_a82e5c')}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => {
                clearAdminToken();
                setToken('');
                setHasSession(false);
                setTokenMessage(adminT('admin.standalone.tokenCleared'));
                setAuthRevision((value) => value + 1);
              }}
            >
              {adminT('admin.standalone.clear_719ea3')}
            </button>
            {tokenMessage ? <span className="muted">{tokenMessage}</span> : null}
          </form>
        </div>
        <SectionView section={section} authRevision={authRevision} reauthPassword={reauthPassword} />
      </main>
    </div>
  );
}

function AdminLanguageSwitch() {
  const [language, setLanguage] = useState<AdminLanguage>(() => getAdminLanguage());

  const changeLanguage = (nextLanguage: AdminLanguage) => {
    if (nextLanguage === language) {
      return;
    }

    selectAdminLanguage(nextLanguage);
    setLanguage(nextLanguage);
    globalThis.location?.reload();
  };

  return (
    <div className="language-switch" role="group" aria-label={adminT('admin.standalone.languageSelector')}>
      {(['en', 'fr'] as const).map((candidate) => (
        <button
          key={candidate}
          className={candidate === language ? 'active' : undefined}
          type="button"
          aria-pressed={candidate === language}
          aria-label={adminT(
            candidate === 'fr' ? 'admin.standalone.switchToFrench' : 'admin.standalone.switchToEnglish',
          )}
          onClick={() => changeLanguage(candidate)}
        >
          {candidate.toUpperCase()}
        </button>
      ))}
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

      setError(localizedAdminError(requestError, 'admin.standalone.loadSectionFailed'));
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
        setToast(adminT('admin.standalone.reauthRequired'));
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
      setToast(adminT('admin.standalone.actionCompleted'));
      setDialog(null);
      await load();
    } catch (error) {
      /*
       * Re-auth or the action endpoint failed: surface it instead of leaving
       * the dialog stuck open with no feedback (would look like a no-op).
       */
      setToast(localizedAdminError(error, 'admin.standalone.actionFailed'));
    }
  }

  if (loading) {
    return (
      <div className="panel skeleton" role="status" aria-label={adminT('admin.standalone.loadingAdminData_351d80')} />
    );
  }

  if (error) {
    return (
      <div className="panel" role="alert">
        <h2>{adminT('admin.standalone.unableToLoadSection_f31d6e')}</h2>
        <p>{error}</p>
        <button className="action" type="button" onClick={() => void load()}>
          {adminT('admin.standalone.retry_9f5cd8')}
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
              aria-label={adminT('admin.standalone.filterTable_874f29')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={adminT('admin.standalone.filterRows_4816c0')}
            />
            <div className="actions">
              {section.exportable ? (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => {
                    void exportCsv(section.endpoint, `${section.id}.csv`).catch(() => {
                      setToast(adminT('admin.standalone.csvExportFailed'));
                    });
                  }}
                >
                  {adminT('admin.standalone.exportCsv_5755f9')}
                </button>
              ) : null}
              <button className="secondary" type="button" onClick={() => void load()}>
                {adminT('admin.standalone.refresh_56e3ba')}
              </button>
              {section.id === 'feature-flags' ? (
                <button
                  className="action"
                  type="button"
                  onClick={() =>
                    setDialog({ action: 'create-flag', title: adminT('admin.standalone.createFeatureFlag_ae43aa') })
                  }
                >
                  {adminT('admin.standalone.createFlag_4d7620')}
                </button>
              ) : null}
              {section.id === 'announcements' ? (
                <button
                  className="action"
                  type="button"
                  onClick={() =>
                    setDialog({ action: 'announcement', title: adminT('admin.standalone.createAnnouncement_dd8f11') })
                  }
                >
                  {adminT('admin.standalone.announce_b6e441')}
                </button>
              ) : null}
              {section.id === 'incident-banner' ? (
                <button
                  className="danger"
                  type="button"
                  onClick={() =>
                    setDialog({ action: 'incident', title: adminT('admin.standalone.setIncidentBanner_5cc21d') })
                  }
                >
                  {adminT('admin.standalone.incidentBanner_3c667d')}
                </button>
              ) : null}
            </div>
          </div>
          {rows.length === 0 ? (
            <div className="panel">
              <h2>{adminT('admin.standalone.emptyState_41dac3')}</h2>
              <p className="muted">{adminT('admin.standalone.theApiReturnedNoRecordsForThisSection_eedf3d')}</p>
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
                          {columnLabel(column)}
                        </button>
                      </th>
                    ))}
                    <th>{adminT('admin.standalone.actions_c3cd63')}</th>
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
                            {adminT('admin.standalone.details_dc3dec')}
                          </button>
                          <RowActions
                            section={section}
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
            {adminT('admin.standalone.dismiss_70afe9')}
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
        {adminT('admin.standalone.aiCost_3c3d55')}
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

function RowActions({ section, onAction }: { section: AdminSection; onAction: (action: string) => void }) {
  if (section.id === 'users') {
    return (
      <>
        <button className="danger" type="button" onClick={() => onAction('suspend-user')}>
          {adminT('admin.standalone.suspend_b24247')}
        </button>
        <button className="secondary" type="button" onClick={() => onAction('force-logout')}>
          {adminT('admin.standalone.logout_e43d61')}
        </button>
        <button className="secondary" type="button" onClick={() => onAction('reset-mfa')}>
          {adminT('admin.standalone.resetMfa_0c1fff')}
        </button>
      </>
    );
  }

  if (section.id === 'organizations') {
    return (
      <button className="danger" type="button" onClick={() => onAction('suspend-org')}>
        {adminT('admin.standalone.suspendOrg_103459')}
      </button>
    );
  }

  if (section.id === 'workspaces') {
    return (
      <>
        <button className="danger" type="button" onClick={() => onAction('stop-workspace')}>
          {adminT('admin.standalone.stop_9e2534')}
        </button>
        <button className="secondary" type="button" onClick={() => onAction('restart-workspace')}>
          {adminT('admin.standalone.restart_b134bd')}
        </button>
      </>
    );
  }

  if (section.id === 'abuse-events') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('resolve-abuse')}>
        {adminT('admin.standalone.resolve_ac7f95')}
      </button>
    );
  }

  if (section.id === 'support-tickets') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('respond-ticket')}>
        {adminT('admin.standalone.respond_05bd56')}
      </button>
    );
  }

  if (section.id === 'quotas') {
    return (
      <button className="secondary" type="button" onClick={() => onAction('quota-override')}>
        {adminT('admin.standalone.override_842192')}
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
        <p className="muted">{adminT('admin.standalone.thisActionIsAuditedAndMayRequireRecent_b82a01')}</p>
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
            <span>{adminT('admin.standalone.iConfirmThisAdminActionItRequiresRecent_dc045e')}</span>
          </label>
        ) : null}
        <div className="actions">
          <button className="secondary" type="button" onClick={onCancel}>
            {adminT('admin.standalone.cancel_77dfd2')}
          </button>
          <button className="danger" type="submit" disabled={isDangerous && !acknowledged}>
            {adminT('admin.standalone.confirm_04a212')}
          </button>
        </div>
      </form>
    </div>
  );
}

function DetailsPanel({ record, onClose }: { record: AdminRecord; onClose: () => void }) {
  return (
    <section className="panel" aria-label={adminT('admin.standalone.detailPage_fb45b4')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.details_dc3dec')}</h2>
        <button className="secondary" type="button" onClick={onClose}>
          {adminT('admin.standalone.close_bbfa77')}
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
    return value ? adminT('admin.standalone.yes') : adminT('admin.standalone.no');
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
    return [{ name: 'response', label: adminT('admin.standalone.response_6e617e'), kind: 'textarea', required: true }];
  }

  if (action === 'quota-override') {
    return [
      { name: 'key', label: adminT('admin.standalone.quotaKey_e95bae'), required: true },
      { name: 'limit', label: adminT('admin.standalone.limit_24d948'), required: true },
      { name: 'reason', label: adminT('admin.standalone.reason_f219cc'), required: true },
    ];
  }

  if (action === 'create-flag') {
    return [
      { name: 'key', label: adminT('admin.standalone.flagKey_3ba971'), required: true },
      { name: 'enabled', label: adminT('admin.standalone.enabledTrueFalse_3f1751'), required: true },
      { name: 'rolloutPercent', label: adminT('admin.standalone.rolloutPercent_bf7a50'), required: false },
    ];
  }

  if (action === 'announcement' || action === 'incident') {
    return [{ name: 'message', label: adminT('admin.standalone.message_68f414'), kind: 'textarea', required: true }];
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
  const labels: Partial<Record<string, Parameters<typeof adminT>[0]>> = {
    'suspend-user': 'admin.standalone.action.suspendUser',
    'force-logout': 'admin.standalone.action.forceLogout',
    'reset-mfa': 'admin.standalone.action.resetMfa',
    'suspend-org': 'admin.standalone.action.suspendOrg',
    'stop-workspace': 'admin.standalone.action.stopWorkspace',
    'restart-workspace': 'admin.standalone.action.restartWorkspace',
    'resolve-abuse': 'admin.standalone.action.resolveAbuse',
    'respond-ticket': 'admin.standalone.action.respondTicket',
    'quota-override': 'admin.standalone.action.quotaOverride',
    'create-flag': 'admin.standalone.action.createFlag',
    announcement: 'admin.standalone.action.announcement',
    incident: 'admin.standalone.action.incident',
  };

  const key = labels[action];

  return key ? adminT(key) : action;
}

function columnLabel(column: string): string {
  const labels: Partial<Record<string, Parameters<typeof adminT>[0]>> = {
    id: 'admin.standalone.column.id',
    email: 'admin.standalone.column.email',
    name: 'admin.standalone.column.name',
    organizationId: 'admin.standalone.column.organizationId',
    projectId: 'admin.standalone.column.projectId',
    userId: 'admin.standalone.column.userId',
    status: 'admin.standalone.column.status',
    severity: 'admin.standalone.column.severity',
    type: 'admin.standalone.column.type',
    action: 'admin.standalone.column.action',
    createdAt: 'admin.standalone.column.createdAt',
  };

  const key = labels[column];

  return key ? adminT(key) : column;
}

const rootElement = document.getElementById('root');

if (rootElement) {
  initializeAdminLanguage();
  createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
