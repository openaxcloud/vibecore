/*
 * Batch-F admin panels — rich, section-specific operator UIs that go beyond the
 * generic table renderer in main.tsx. Each panel is self-contained: it fetches
 * its own data via `apiJson`, renders a themed view (status tokens only, zero
 * purple), and performs mutations through re-auth-gated helpers. main.tsx looks
 * a section up in CUSTOM_PANELS and renders the panel instead of / above the
 * generic table.
 */
import React, { useCallback, useEffect, useState } from 'react';

import { apiJson, reauthAdmin } from './api';

export interface PanelProps {
  /** Re-auth password entered in the top bar; required before mutating actions. */
  reauthPassword: string;

  /** Surface a status message in the shared toast. */
  pushToast: (message: string) => void;
}

export function formatCents(cents: number | null | undefined): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  const sign = value < 0 ? '-' : '';

  return `${sign}$${(Math.abs(value) / 100).toFixed(2)}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

/**
 * Run a mutating admin call behind the same re-auth gate the generic action
 * dialog uses. Refuses (with a toast) when the operator has not entered their
 * re-auth password, mirroring runAction() in main.tsx.
 */
export async function withReauth<T>(
  reauthPassword: string,
  pushToast: (message: string) => void,
  run: () => Promise<T>,
): Promise<T | undefined> {
  if (!reauthPassword) {
    pushToast('Enter your re-auth password in the top bar before this action.');
    return undefined;
  }

  try {
    await reauthAdmin(reauthPassword);
    return await run();
  } catch (error) {
    pushToast(error instanceof Error ? error.message : 'Action failed');
    return undefined;
  }
}

/** Small hook: fetch a panel's data, expose loading/error/reload. */
export function usePanelData<T>(path: string): {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
} {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    apiJson<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : 'Failed to load');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  return { data, loading, error, reload };
}

export function PanelStates({ loading, error }: { loading: boolean; error?: string }) {
  if (loading) {
    return <div className="panel skeleton" role="status" aria-label="Loading" />;
  }

  if (error) {
    return (
      <div className="panel" role="alert">
        <p>{error}</p>
      </div>
    );
  }

  return null;
}

/*
 * ---------------------------------------------------------------------------
 * F20 — Credit wallets: signed adjustment (mandatory reason → audit) + history
 * ---------------------------------------------------------------------------
 */

interface WalletRow {
  organizationId: string;
  balanceCents: number;
  budgetCapCents?: number | null;
  updatedAt?: string;
}

interface LedgerEntry {
  id: string;
  deltaCents: number;
  kind: string;
  reason: string;
  createdAt: string;
}

function CreditWalletsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<{ wallets: WalletRow[] }>('/admin/wallets');
  const [openOrg, setOpenOrg] = useState<string>();
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const wallets = data?.wallets ?? [];

  const loadLedger = useCallback(async (organizationId: string) => {
    setLedgerLoading(true);

    try {
      const result = await apiJson<{ ledger: LedgerEntry[] }>(`/admin/wallets/${organizationId}/ledger`);
      setLedger(result.ledger);
    } catch {
      setLedger([]);
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  function toggleOrg(organizationId: string) {
    if (openOrg === organizationId) {
      setOpenOrg(undefined);
      return;
    }

    setOpenOrg(organizationId);
    setDelta('');
    setReason('');
    void loadLedger(organizationId);
  }

  async function submitAdjust(organizationId: string) {
    const cents = Math.trunc(Number(delta));

    if (!Number.isFinite(cents) || cents === 0) {
      pushToast('Enter a non-zero adjustment amount in cents (+credit / −debit).');
      return;
    }

    if (!reason.trim()) {
      pushToast('A reason is required for every wallet adjustment.');
      return;
    }

    setBusy(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson<{ wallet: { balanceCents: number } }>(`/admin/wallets/${organizationId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ deltaCents: cents, reason: reason.trim() }),
      }),
    );
    setBusy(false);

    if (result) {
      pushToast(`Wallet adjusted — new balance ${formatCents(result.wallet.balanceCents)}. Audited.`);
      setDelta('');
      setReason('');
      reload();
      void loadLedger(organizationId);
    }
  }

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  return (
    <section className="panel" aria-label="Credit wallets">
      <div className="page-title">
        <h2>Credit wallets</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Signed adjustments (+credit / −debit) require a reason and are written to the wallet ledger and AdminAuditLog.
      </p>
      {wallets.length === 0 ? (
        <p className="muted">No credit wallets yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Balance</th>
                <th>Budget cap</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <React.Fragment key={wallet.organizationId}>
                  <tr>
                    <td>{wallet.organizationId}</td>
                    <td>{formatCents(wallet.balanceCents)}</td>
                    <td>{wallet.budgetCapCents == null ? '—' : formatCents(wallet.budgetCapCents)}</td>
                    <td>{formatDateTime(wallet.updatedAt)}</td>
                    <td>
                      <button className="secondary" type="button" onClick={() => toggleOrg(wallet.organizationId)}>
                        {openOrg === wallet.organizationId ? 'Close' : 'Adjust / history'}
                      </button>
                    </td>
                  </tr>
                  {openOrg === wallet.organizationId ? (
                    <tr>
                      <td colSpan={5}>
                        <div className="wallet-detail">
                          <form
                            className="wallet-adjust"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void submitAdjust(wallet.organizationId);
                            }}
                          >
                            <label>
                              Adjustment (cents, +credit / −debit)
                              <input
                                type="number"
                                step="1"
                                value={delta}
                                onChange={(event) => setDelta(event.target.value)}
                                placeholder="e.g. 5000 or -2000"
                              />
                            </label>
                            <label>
                              Reason (required)
                              <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder="Why is this adjustment being made?"
                              />
                            </label>
                            <button className="action" type="submit" disabled={busy}>
                              {busy ? 'Applying…' : 'Apply adjustment'}
                            </button>
                          </form>
                          <h3>Movement history</h3>
                          {ledgerLoading ? (
                            <p className="muted">Loading movements…</p>
                          ) : ledger.length === 0 ? (
                            <p className="muted">No movements recorded.</p>
                          ) : (
                            <div className="table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th>When</th>
                                    <th>Kind</th>
                                    <th>Amount</th>
                                    <th>Reason</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ledger.map((entry) => (
                                    <tr key={entry.id}>
                                      <td>{formatDateTime(entry.createdAt)}</td>
                                      <td>{entry.kind}</td>
                                      <td
                                        className={
                                          entry.deltaCents < 0
                                            ? 'ledger-amount ledger-debit'
                                            : 'ledger-amount ledger-credit'
                                        }
                                      >
                                        {entry.deltaCents >= 0 ? '+' : ''}
                                        {formatCents(entry.deltaCents)}
                                      </td>
                                      <td>{entry.reason}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F24 — Account deletions: J+14 purge queue (TTL remaining) + Cancel deletion
 * ---------------------------------------------------------------------------
 */

interface DeletionRow {
  userId: string;
  email: string | null;
  status: string;
  requestedAt: string | null;
  purgeDueAt: string | null;
}

interface DeletionsResponse {
  gracePeriodDays: number;
  requests: DeletionRow[];
  readyToPurge: number;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) {
    return null;
  }

  const due = new Date(iso).getTime();

  if (Number.isNaN(due)) {
    return null;
  }

  return Math.ceil((due - Date.now()) / 86_400_000);
}

function deletionStatusClass(status: string): string {
  if (status === 'ready_to_purge') {
    return 'ledger-debit';
  }

  if (status === 'pending') {
    return 'status-warn-text';
  }

  return '';
}

function AccountDeletionsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<DeletionsResponse>('/admin/account-deletions');
  const [busyUser, setBusyUser] = useState<string>();
  const [exportingUser, setExportingUser] = useState<string>();

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const requests = data?.requests ?? [];

  async function cancel(userId: string) {
    setBusyUser(userId);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson<{ cancelled: boolean }>(`/admin/account-deletions/${userId}/cancel`, { method: 'POST' }),
    );
    setBusyUser(undefined);

    if (result) {
      pushToast('Account deletion cancelled — the grace-period purge will not run. Audited.');
      reload();
    }
  }

  /*
   * F24: admin-initiated GDPR export. Fetch the JSON document (reauth-gated,
   * audited server-side) and trigger a client-side download — no data touches
   * disk on the server. Secret fields are stripped by the shared builder.
   */
  async function exportData(userId: string, email: string | null) {
    setExportingUser(userId);

    const doc = await withReauth(reauthPassword, pushToast, () =>
      apiJson<unknown>(`/admin/account-deletions/${userId}/export`),
    );
    setExportingUser(undefined);

    if (doc) {
      const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `ecode-data-export-${email ?? userId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      pushToast('Account data exported — JSON downloaded. Audited.');
    }
  }

  return (
    <section className="panel" aria-label="Account deletions">
      <div className="page-title">
        <h2>Account deletions</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Self-serve deletions purge after a {data?.gracePeriodDays ?? 14}-day grace window.{' '}
        {data ? `${data.readyToPurge} ready to purge now.` : ''} Cancelling stops the scheduled purge (audited).
      </p>
      {requests.length === 0 ? (
        <p className="muted">No pending account deletions.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Purge due</th>
                <th>TTL</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((row) => {
                const ttl = daysUntil(row.purgeDueAt);
                return (
                  <tr key={row.userId}>
                    <td>{row.email ?? row.userId}</td>
                    <td className={deletionStatusClass(row.status)}>{row.status.replace(/_/g, ' ')}</td>
                    <td>{formatDateTime(row.requestedAt)}</td>
                    <td>{formatDateTime(row.purgeDueAt)}</td>
                    <td className="ledger-amount">
                      {ttl == null ? '—' : ttl <= 0 ? 'due now' : `${ttl} day${ttl === 1 ? '' : 's'}`}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="secondary"
                          type="button"
                          disabled={exportingUser === row.userId}
                          onClick={() => void exportData(row.userId, row.email)}
                        >
                          {exportingUser === row.userId ? 'Exporting…' : 'Export data'}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busyUser === row.userId}
                          onClick={() => void cancel(row.userId)}
                        >
                          {busyUser === row.userId ? 'Cancelling…' : 'Cancel deletion'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F19 — AI models: plan × model matrix + cost/1M + guarantee ≥1 active per plan
 * ---------------------------------------------------------------------------
 */

interface ModelRow {
  provider?: string;
  modelId: string;
  displayName: string;
  enabled: boolean;
  enabledPlans: string[];
  isHighPower: boolean;
  supportsThinking: boolean;
  inputCentsPerM: number;
  outputCentsPerM: number;
}

function AiModelsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<{ models: ModelRow[] }>('/admin/models');
  const [busy, setBusy] = useState<string>();

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const models = data?.models ?? [];
  const plans = Array.from(new Set(models.flatMap((model) => model.enabledPlans))).sort();
  const activeByPlan = new Map<string, number>();

  for (const plan of plans) {
    activeByPlan.set(plan, models.filter((model) => model.enabled && model.enabledPlans.includes(plan)).length);
  }

  async function toggle(model: ModelRow) {
    const key = `${model.provider}:${model.modelId}`;
    setBusy(key);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson(`/admin/models/toggle`, {
        method: 'POST',
        body: JSON.stringify({ provider: model.provider, modelId: model.modelId, enabled: !model.enabled }),
      }),
    );
    setBusy(undefined);

    if (result) {
      pushToast(`${model.displayName} ${model.enabled ? 'disabled' : 'enabled'}.`);
      reload();
    }
  }

  return (
    <section className="panel" aria-label="AI models">
      <div className="page-title">
        <h2>AI models</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Plan × model access and cost per 1M tokens. Every plan must keep at least one active model — the API refuses a
        disable that would strand a plan.
      </p>
      <div className="plan-coverage">
        {plans.map((plan) => {
          const count = activeByPlan.get(plan) ?? 0;
          const tone = count === 0 ? 'ledger-debit' : count === 1 ? 'status-warn-text' : 'ledger-credit';

          return (
            <span key={plan} className={`plan-chip ${tone}`}>
              {plan}: {count} active
            </span>
          );
        })}
      </div>
      {models.length === 0 ? (
        <p className="muted">No models in the registry.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>In $/1M</th>
                <th>Out $/1M</th>
                {plans.map((plan) => (
                  <th key={plan}>{plan}</th>
                ))}
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {models.map((model) => {
                const key = `${model.provider}:${model.modelId}`;
                return (
                  <tr key={key}>
                    <td>
                      {model.displayName}
                      <span className="muted"> ({model.provider ?? '—'})</span>
                      {model.isHighPower ? <span className="model-tag">power</span> : null}
                      {model.supportsThinking ? <span className="model-tag">thinking</span> : null}
                    </td>
                    <td className="ledger-amount">{formatCents(model.inputCentsPerM)}</td>
                    <td className="ledger-amount">{formatCents(model.outputCentsPerM)}</td>
                    {plans.map((plan) => (
                      <td key={plan} style={{ textAlign: 'center' }}>
                        {model.enabledPlans.includes(plan) ? (model.enabled ? '●' : '○') : ''}
                      </td>
                    ))}
                    <td className={model.enabled ? 'ledger-credit' : 'muted'}>
                      {model.enabled ? 'active' : 'disabled'}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy === key}
                        onClick={() => void toggle(model)}
                      >
                        {busy === key ? '…' : model.enabled ? 'Disable' : 'Enable'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F25 — Previews: TTL remaining + kill per row + default TTL (System settings)
 * ---------------------------------------------------------------------------
 */

interface PreviewRow {
  workspaceId: string;
  url: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface PreviewsResponse {
  defaultTtlMinutes: number;
  previews: PreviewRow[];
}

function PreviewsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<PreviewsResponse>('/admin/previews');
  const [ttl, setTtl] = useState('');
  const [savingTtl, setSavingTtl] = useState(false);
  const [busy, setBusy] = useState<string>();

  useEffect(() => {
    if (data?.defaultTtlMinutes) {
      setTtl(String(data.defaultTtlMinutes));
    }
  }, [data?.defaultTtlMinutes]);

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const previews = data?.previews ?? [];

  async function saveTtl() {
    const minutes = Math.trunc(Number(ttl));

    if (!Number.isFinite(minutes) || minutes <= 0) {
      pushToast('Enter a positive number of minutes for the default preview TTL.');
      return;
    }

    setSavingTtl(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson('/admin/system-settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'preview.defaultTtlMinutes', value: minutes }),
      }),
    );
    setSavingTtl(false);

    if (result) {
      pushToast(`Default preview TTL set to ${minutes} minutes.`);
      reload();
    }
  }

  async function kill(workspaceId: string) {
    setBusy(workspaceId);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson(`/admin/workspaces/${workspaceId}/stop`, { method: 'POST' }),
    );
    setBusy(undefined);

    if (result) {
      pushToast(`Preview killed (workspace ${workspaceId} stopped). Audited.`);
      reload();
    }
  }

  return (
    <section className="panel" aria-label="Previews">
      <div className="page-title">
        <h2>Previews</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <form
        className="ttl-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveTtl();
        }}
      >
        <label>
          Default preview TTL (minutes)
          <input type="number" step="1" min="1" value={ttl} onChange={(event) => setTtl(event.target.value)} />
        </label>
        <button className="action" type="submit" disabled={savingTtl}>
          {savingTtl ? 'Saving…' : 'Save default TTL'}
        </button>
      </form>
      {previews.length === 0 ? (
        <p className="muted">No workspace previews.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th>TTL</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((preview) => {
                const secondsLeft = Math.round((new Date(preview.expiresAt).getTime() - Date.now()) / 1000);
                const expired = secondsLeft <= 0;

                const ttlLabel = expired
                  ? 'expired'
                  : secondsLeft >= 3600
                    ? `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`
                    : `${Math.max(1, Math.floor(secondsLeft / 60))}m`;

                const running = /running|starting/i.test(preview.status);

                return (
                  <tr key={preview.workspaceId}>
                    <td>{preview.workspaceId}</td>
                    <td>{preview.status}</td>
                    <td>{formatDateTime(preview.createdAt)}</td>
                    <td>{formatDateTime(preview.expiresAt)}</td>
                    <td className={expired ? 'ledger-debit' : 'ledger-amount'}>{ttlLabel}</td>
                    <td>
                      <button
                        className="danger"
                        type="button"
                        disabled={busy === preview.workspaceId || !running}
                        onClick={() => void kill(preview.workspaceId)}
                      >
                        {busy === preview.workspaceId ? 'Killing…' : 'Kill'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F22 — Abuse events: Dismiss / Warn (email) / Suspend (reuse E26) + status
 * ---------------------------------------------------------------------------
 */

interface AbuseRow {
  id: string;
  organizationId?: string;
  userId?: string;
  type: string;
  severity: string;
  createdAt: string;
  resolved?: boolean;
  disposition?: string;
}

function abuseStatusLabel(row: AbuseRow): { label: string; className: string } {
  if (row.resolved) {
    return { label: row.disposition ? `resolved · ${row.disposition}` : 'resolved', className: 'ledger-credit' };
  }

  if (row.disposition === 'warned') {
    return { label: 'warned (open)', className: 'status-warn-text' };
  }

  return { label: 'open', className: 'status-warn-text' };
}

function AbuseEventsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<{ abuseEvents: AbuseRow[] }>('/admin/abuse-events');
  const [busy, setBusy] = useState<string>();

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const events = data?.abuseEvents ?? [];

  async function act(row: AbuseRow, kind: 'dismiss' | 'warn' | 'suspend') {
    setBusy(`${row.id}:${kind}`);

    const result = await withReauth(reauthPassword, pushToast, async () => {
      if (kind === 'suspend') {
        if (!row.userId) {
          throw new Error('This event has no associated user to suspend.');
        }

        return apiJson(`/admin/users/${row.userId}/suspend`, {
          method: 'POST',
          body: JSON.stringify({ reason: `Abuse: ${row.type} (${row.severity})` }),
        });
      }

      return apiJson(`/admin/abuse-events/${row.id}/${kind}`, { method: 'POST' });
    });
    setBusy(undefined);

    if (result) {
      const done =
        kind === 'suspend' ? 'User suspended (reason audited).' : kind === 'warn' ? 'Warning emailed.' : 'Dismissed.';
      pushToast(done);
      reload();
    }
  }

  return (
    <section className="panel" aria-label="Abuse events">
      <div className="page-title">
        <h2>Abuse events</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Dismiss (no action), Warn (emails the user, keeps the event open to escalate), or Suspend the user (reason →
        AdminAuditLog, E26). {events.filter((event) => !event.resolved).length} open.
      </p>
      {events.length === 0 ? (
        <p className="muted">No abuse events.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Severity</th>
                <th>Org</th>
                <th>User</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row) => {
                const status = abuseStatusLabel(row);
                return (
                  <tr key={row.id}>
                    <td>{row.type}</td>
                    <td>{row.severity}</td>
                    <td>{row.organizationId ?? '—'}</td>
                    <td>{row.userId ?? '—'}</td>
                    <td>{formatDateTime(row.createdAt)}</td>
                    <td className={status.className}>{status.label}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy === `${row.id}:dismiss` || row.resolved}
                          onClick={() => void act(row, 'dismiss')}
                        >
                          Dismiss
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy === `${row.id}:warn` || !row.userId}
                          onClick={() => void act(row, 'warn')}
                        >
                          Warn
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={busy === `${row.id}:suspend` || !row.userId}
                          onClick={() => void act(row, 'suspend')}
                        >
                          Suspend
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F26 — Costs: 30-day cost/day per provider + monthly budget + 80/100% alerts
 * ---------------------------------------------------------------------------
 */

// Non-purple categorical chart palette (blue/emerald/amber/teal/rose/cyan/lime/orange).
const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#14b8a6', '#f43f5e', '#06b6d4', '#84cc16', '#f97316'];

interface CostsSummary {
  days: string[];
  providers: string[];
  series: Record<string, number[]>;
  windowTotalCents: number;
  monthToDateCents: number;
  monthlyBudgetCents: number | null;
  budgetUsedPct: number | null;
  alertLevel: 'ok' | 'warn' | 'over' | null;
  alertThresholds: number[];
}

function CostsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<CostsSummary>('/admin/costs/summary');
  const [budget, setBudget] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.monthlyBudgetCents != null) {
      setBudget((data.monthlyBudgetCents / 100).toFixed(2));
    }
  }, [data?.monthlyBudgetCents]);

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const summary = data!;

  const dayTotals = summary.days.map((_, index) =>
    summary.providers.reduce((sum, provider) => sum + (summary.series[provider]?.[index] ?? 0), 0),
  );

  const maxDay = Math.max(1, ...dayTotals);

  async function saveBudget() {
    const dollars = Number(budget);

    if (!Number.isFinite(dollars) || dollars < 0) {
      pushToast('Enter a monthly budget in dollars (0 to clear).');
      return;
    }

    setSaving(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson('/admin/system-settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'costs.monthlyBudgetCents', value: Math.round(dollars * 100) }),
      }),
    );
    setSaving(false);

    if (result) {
      pushToast(`Monthly AI budget set to $${dollars.toFixed(2)}.`);
      reload();
    }
  }

  const alertClass =
    summary.alertLevel === 'over' ? 'cost-alert-over' : summary.alertLevel === 'warn' ? 'cost-alert-warn' : '';

  return (
    <section className="panel" aria-label="Cost dashboard">
      <div className="page-title">
        <h2>Cost dashboard</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>

      {summary.alertLevel === 'warn' || summary.alertLevel === 'over' ? (
        <div className={`cost-alert ${alertClass}`} role="alert">
          Month-to-date AI spend is {summary.budgetUsedPct}% of the $
          {((summary.monthlyBudgetCents ?? 0) / 100).toFixed(2)} budget
          {summary.alertLevel === 'over' ? ' — over budget.' : ' — approaching the limit.'}
        </div>
      ) : null}

      <div className="cost-stats">
        <div>
          <span className="muted">30-day AI spend</span>
          <strong>{formatCents(summary.windowTotalCents)}</strong>
        </div>
        <div>
          <span className="muted">Month to date</span>
          <strong>{formatCents(summary.monthToDateCents)}</strong>
        </div>
        <div>
          <span className="muted">Budget used</span>
          <strong>{summary.budgetUsedPct == null ? '— (no budget)' : `${summary.budgetUsedPct}%`}</strong>
        </div>
      </div>

      <form
        className="ttl-form"
        onSubmit={(event) => {
          event.preventDefault();
          void saveBudget();
        }}
      >
        <label>
          Monthly AI budget ($)
          <input type="number" step="0.01" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} />
        </label>
        <button className="action" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save budget'}
        </button>
      </form>

      {summary.providers.length === 0 ? (
        <p className="muted">No AI cost records in the last 30 days.</p>
      ) : (
        <>
          <div className="cost-chart" role="img" aria-label="AI cost per day for the last 30 days by provider">
            {summary.days.map((day, index) => (
              <div key={day} className="cost-bar" title={`${day}: ${formatCents(dayTotals[index])}`}>
                <div className="cost-bar-stack">
                  {summary.providers.map((provider, providerIndex) => {
                    const cents = summary.series[provider]?.[index] ?? 0;

                    if (cents <= 0) {
                      return null;
                    }

                    return (
                      <div
                        key={provider}
                        style={{
                          height: `${(cents / maxDay) * 100}%`,
                          background: CHART_COLORS[providerIndex % CHART_COLORS.length],
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="cost-legend">
            {summary.providers.map((provider, providerIndex) => (
              <span key={provider} className="cost-legend-item">
                <span
                  className="cost-swatch"
                  style={{ background: CHART_COLORS[providerIndex % CHART_COLORS.length] }}
                />
                {provider}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F21 — Agent checkpoints: storage total/org + retention rule + purge w/ estimate
 * ---------------------------------------------------------------------------
 */

interface CheckpointOrg {
  organizationId: string;
  checkpoints: number;
  inputTokens: number;
  outputTokens: number;
  creditCents: number;
}

interface CheckpointStorage {
  retentionDays: number;
  cutoff: string;
  totalCheckpoints: number;
  totalCreditCents: number;
  byOrg: CheckpointOrg[];
  purgeEstimate: number;
}

function CheckpointsPanel({ reauthPassword, pushToast }: PanelProps) {
  const [days, setDays] = useState('');
  const path = days ? `/admin/checkpoints/storage?olderThanDays=${days}` : '/admin/checkpoints/storage';
  const { data, loading, error, reload } = usePanelData<CheckpointStorage>(path);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!days && data?.retentionDays) {
      setDays(String(data.retentionDays));
    }
  }, [data?.retentionDays, days]);

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const storage = data!;

  async function purge() {
    const olderThanDays = Math.trunc(Number(days));

    if (!Number.isFinite(olderThanDays) || olderThanDays <= 0) {
      pushToast('Enter a positive number of days.');
      return;
    }

    setBusy(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson<{ deleted: number }>('/admin/checkpoints/purge', {
        method: 'POST',
        body: JSON.stringify({ olderThanDays }),
      }),
    );
    setBusy(false);

    if (result) {
      pushToast(`Purged ${result.deleted} checkpoint(s) older than ${olderThanDays} days. Audited.`);
      reload();
    }
  }

  return (
    <section className="panel" aria-label="Agent checkpoints">
      <div className="page-title">
        <h2>Agent checkpoints</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <div className="cost-stats">
        <div>
          <span className="muted">Total checkpoints</span>
          <strong>{storage.totalCheckpoints.toLocaleString()}</strong>
        </div>
        <div>
          <span className="muted">Total settled credit</span>
          <strong>{formatCents(storage.totalCreditCents)}</strong>
        </div>
      </div>

      <form
        className="ttl-form"
        onSubmit={(event) => {
          event.preventDefault();
          void purge();
        }}
      >
        <label>
          Purge terminal checkpoints older than (days)
          <input type="number" step="1" min="1" value={days} onChange={(event) => setDays(event.target.value)} />
        </label>
        <button className="danger" type="submit" disabled={busy || storage.purgeEstimate === 0}>
          {busy ? 'Purging…' : `Purge ${storage.purgeEstimate}`}
        </button>
      </form>
      <p className="muted">
        Estimate: {storage.purgeEstimate} COMPLETED/FAILED checkpoint(s) started before {formatDateTime(storage.cutoff)}{' '}
        would be permanently deleted (removes settled billing history — audited).
      </p>

      {storage.byOrg.length === 0 ? (
        <p className="muted">No agent checkpoints.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Organization</th>
                <th>Checkpoints</th>
                <th>Input tokens</th>
                <th>Output tokens</th>
                <th>Settled credit</th>
              </tr>
            </thead>
            <tbody>
              {storage.byOrg.map((row) => (
                <tr key={row.organizationId}>
                  <td>{row.organizationId}</td>
                  <td className="ledger-amount">{row.checkpoints.toLocaleString()}</td>
                  <td className="ledger-amount">{row.inputTokens.toLocaleString()}</td>
                  <td className="ledger-amount">{row.outputTokens.toLocaleString()}</td>
                  <td className="ledger-amount">{formatCents(row.creditCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F18 — AI providers: fallback order ↑↓ (+ honest note on p95/error metrics)
 * ---------------------------------------------------------------------------
 */

interface ProviderRow {
  provider: string;
  displayName: string;
  enabled: boolean;
  sampleCount?: number;
  p95LatencyMs?: number | null;
  errorRatePct?: number | null;
}

interface FallbackOrder {
  order: string[];
  providers: ProviderRow[];
  metricsAvailable: boolean;
  window?: string;
  thresholds: { warnErrorPct: number; errorErrorPct: number };
}

/** F18 — colour the 24h error rate against the warn/error thresholds. */
function errorRateClass(pct: number | null | undefined, thresholds: { warnErrorPct: number; errorErrorPct: number }) {
  if (pct == null) {
    return 'muted';
  }

  if (pct >= thresholds.errorErrorPct) {
    return 'ledger-debit';
  }

  if (pct >= thresholds.warnErrorPct) {
    return 'status-warn-text';
  }

  return 'ledger-credit';
}

/*
 * Write-only key view from GET /admin/providers. `hasKey` + `source` (db beats
 * env) drive the badge; the key itself is never returned. `keyLast4` only ever
 * comes back from a POST credentials response (the just-submitted key).
 */
interface ProviderKeyInfo {
  provider: string;
  displayName: string;
  enabled: boolean;
  hasKey: boolean;
  source: 'db' | 'env' | 'none';
  baseUrl: string | null;
  byokAllowed: boolean;
}

function KeyBadge({ info }: { info: ProviderKeyInfo | undefined }) {
  if (!info) {
    return <span className="muted">—</span>;
  }

  if (info.hasKey) {
    return (
      <span className="ledger-credit" title="Admin-set key stored (encrypted)">
        ✓ key (db)
      </span>
    );
  }

  if (info.source === 'env') {
    return (
      <span className="muted" title="Resolved from the platform env var">
        ✓ key (env)
      </span>
    );
  }

  return (
    <span className="ledger-debit" title="No platform key configured">
      ✗ no key
    </span>
  );
}

function ProvidersPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<FallbackOrder>('/admin/providers/fallback-order');
  const keys = usePanelData<{ providers: ProviderKeyInfo[] }>('/admin/providers');
  const [order, setOrder] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Per-provider key form state (only one row is open at a time).
  const [openKeys, setOpenKeys] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [baseUrlInput, setBaseUrlInput] = useState('');
  const [byokInput, setByokInput] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Last-4 of the just-saved key, surfaced from the write-only POST response only.
  const [lastSavedLast4, setLastSavedLast4] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.order) {
      setOrder(data.order);
      setDirty(false);
    }
  }, [data?.order]);

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const byName = new Map((data?.providers ?? []).map((provider) => [provider.provider, provider]));
  const keyByName = new Map((keys.data?.providers ?? []).map((provider) => [provider.provider, provider]));

  function move(index: number, delta: number) {
    const next = [...order];
    const target = index + delta;

    if (target < 0 || target >= next.length) {
      return;
    }

    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
  }

  async function save() {
    setSaving(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson('/admin/providers/fallback-order', { method: 'POST', body: JSON.stringify({ order }) }),
    );
    setSaving(false);

    if (result) {
      pushToast('Provider fallback order saved. Audited.');
      reload();
    }
  }

  function toggleKeys(name: string) {
    if (openKeys === name) {
      setOpenKeys(null);
      return;
    }

    const info = keyByName.get(name);
    setOpenKeys(name);
    setKeyInput('');
    setBaseUrlInput(info?.baseUrl ?? '');
    setByokInput(info?.byokAllowed ?? false);
    setConfirmRemove(false);
  }

  async function saveKey(name: string) {
    const trimmedKey = keyInput.trim();
    const info = keyByName.get(name);
    const currentBaseUrl = info?.baseUrl ?? '';
    const nextBaseUrl = baseUrlInput.trim();

    const payload: { apiKey?: string; baseUrl?: string; byokAllowed?: boolean } = {};

    if (trimmedKey) {
      payload.apiKey = trimmedKey;
    }

    if (nextBaseUrl !== currentBaseUrl) {
      payload.baseUrl = nextBaseUrl;
    }

    if ((info?.byokAllowed ?? false) !== byokInput) {
      payload.byokAllowed = byokInput;
    }

    if (Object.keys(payload).length === 0) {
      pushToast('Nothing to save — enter a key or change a field first.');
      return;
    }

    setKeyBusy(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson<{ keyLast4: string | null }>(`/admin/providers/${encodeURIComponent(name)}/credentials`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    setKeyBusy(false);

    if (result) {
      if (result.keyLast4) {
        setLastSavedLast4((prev) => ({ ...prev, [name]: result.keyLast4 as string }));
      }

      setKeyInput('');
      pushToast(`Saved ${name} credentials. Audited.`);
      keys.reload();
    }
  }

  async function removeKey(name: string) {
    setKeyBusy(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson(`/admin/providers/${encodeURIComponent(name)}/credentials`, { method: 'DELETE' }),
    );
    setKeyBusy(false);
    setConfirmRemove(false);

    if (result) {
      setLastSavedLast4((prev) => {
        const next = { ...prev };
        delete next[name];

        return next;
      });
      pushToast(`Removed ${name} key. Env fallback resumes. Audited.`);
      keys.reload();
    }
  }

  return (
    <section className="panel" aria-label="AI providers">
      <div className="page-title">
        <h2>AI providers</h2>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            reload();
            keys.reload();
          }}
        >
          Refresh
        </button>
      </div>
      <p className="muted">
        Enable/disable providers, set the fallback order (↑/↓, then Save), and set each provider’s platform API key.
        Keys are write-only and encrypted; the runtime resolves them DB-first and falls back to the provider’s env var,
        so a provider with no key here keeps its current env behaviour.
      </p>

      {!data?.metricsAvailable ? (
        <div className="cost-alert cost-alert-warn" role="note">
          No AI provider requests recorded in the last {data?.window ?? '24h'} yet — p95 latency and error rate populate
          as requests flow. Alert thresholds: warn ≥{data?.thresholds.warnErrorPct ?? 2}%, error ≥
          {data?.thresholds.errorErrorPct ?? 5}%.
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Provider</th>
              <th>Status</th>
              <th>p95 latency (24h)</th>
              <th>Error rate (24h)</th>
              <th>Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {order.map((name, index) => {
              const provider = byName.get(name);
              const info = keyByName.get(name);
              const isOpen = openKeys === name;
              const thresholds = data?.thresholds ?? { warnErrorPct: 2, errorErrorPct: 5 };

              return (
                <React.Fragment key={name}>
                  <tr>
                    <td className="ledger-amount">{index + 1}</td>
                    <td>{provider?.displayName ?? info?.displayName ?? name}</td>
                    <td className={provider?.enabled ? 'ledger-credit' : 'muted'}>
                      {provider?.enabled ? 'enabled' : 'disabled'}
                    </td>
                    <td className="ledger-amount">
                      {provider?.p95LatencyMs == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span title={`${provider.sampleCount ?? 0} requests sampled`}>{provider.p95LatencyMs} ms</span>
                      )}
                    </td>
                    <td className={errorRateClass(provider?.errorRatePct, thresholds)}>
                      {provider?.errorRatePct == null ? <span className="muted">—</span> : `${provider.errorRatePct}%`}
                    </td>
                    <td>
                      <KeyBadge info={info} />
                    </td>
                    <td>
                      <div className="actions">
                        <button
                          className="secondary"
                          type="button"
                          disabled={index === 0}
                          aria-label={`Move ${name} up`}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={index === order.length - 1}
                          aria-label={`Move ${name} down`}
                          onClick={() => move(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => toggleKeys(name)}
                        >
                          {isOpen ? 'Close' : 'Key'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen ? (
                    <tr>
                      <td colSpan={7}>
                        <div className="wallet-detail">
                          <form
                            className="provider-key-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveKey(name);
                            }}
                          >
                            <label>
                              API key (write-only — leave blank to keep the current key)
                              <input
                                type="password"
                                autoComplete="off"
                                value={keyInput}
                                onChange={(event) => setKeyInput(event.target.value)}
                                placeholder={
                                  info?.hasKey ? '•••• stored — enter to rotate' : 'Paste the platform API key'
                                }
                              />
                            </label>
                            <label>
                              Base URL (optional — leave blank to clear; OpenAI-compatible only)
                              <input
                                type="url"
                                value={baseUrlInput}
                                onChange={(event) => setBaseUrlInput(event.target.value)}
                                placeholder="https://api.example.com/v1"
                              />
                            </label>
                            <label className="byok-toggle">
                              <input
                                type="checkbox"
                                checked={byokInput}
                                onChange={(event) => setByokInput(event.target.checked)}
                              />
                              Allow users to bring their own key (BYOK)
                            </label>
                            <div className="actions">
                              <button className="action" type="submit" disabled={keyBusy}>
                                {keyBusy ? 'Saving…' : info?.hasKey ? 'Save / rotate' : 'Save key'}
                              </button>
                              {info?.hasKey ? (
                                confirmRemove ? (
                                  <>
                                    <button
                                      className="danger"
                                      type="button"
                                      disabled={keyBusy}
                                      onClick={() => void removeKey(name)}
                                    >
                                      Confirm remove
                                    </button>
                                    <button
                                      className="secondary"
                                      type="button"
                                      disabled={keyBusy}
                                      onClick={() => setConfirmRemove(false)}
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="danger"
                                    type="button"
                                    disabled={keyBusy}
                                    onClick={() => setConfirmRemove(true)}
                                  >
                                    Remove key
                                  </button>
                                )
                              ) : null}
                            </div>
                          </form>
                          <p className="muted">
                            Source: <strong>{info?.source ?? 'none'}</strong>
                            {lastSavedLast4[name] ? (
                              <>
                                {' '}
                                · saved key ending <code>····{lastSavedLast4[name]}</code>
                              </>
                            ) : null}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="action" type="button" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save order'}
        </button>
      </div>
    </section>
  );
}

/*
 * ---------------------------------------------------------------------------
 * F23 — Security events: severity + timeline + mark resolved (note) + open count
 * ---------------------------------------------------------------------------
 */

interface SecurityEvent {
  id: string;
  action: string;
  actorUserId?: string;
  ipAddress?: string;
  createdAt: string;
  severity: 'high' | 'medium' | 'low';
  resolved: boolean;
  note?: string;
  resolvedAt?: string;
}

function severityClass(severity: string): string {
  if (severity === 'high') {
    return 'sev-high';
  }

  if (severity === 'medium') {
    return 'sev-medium';
  }

  return 'sev-low';
}

function SecurityEventsPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<{ events: SecurityEvent[]; openCount: number }>(
    '/admin/security-events',
  );

  const [openId, setOpenId] = useState<string>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading || error) {
    return <PanelStates loading={loading} error={error} />;
  }

  const events = data?.events ?? [];

  async function resolve(id: string) {
    setBusy(true);

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson(`/admin/security-events/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ note: note.trim() || undefined }),
      }),
    );
    setBusy(false);

    if (result) {
      pushToast('Security event marked resolved. Audited.');
      setOpenId(undefined);
      setNote('');
      reload();
    }
  }

  return (
    <section className="panel" aria-label="Security events">
      <div className="page-title">
        <h2>
          Security events{' '}
          {data && data.openCount > 0 ? <span className="open-badge">{data.openCount} open</span> : null}
        </h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Auth / MFA / security audit events, newest first. Severity is derived from the action. Resolving records an
        optional note (keyed to the immutable audit row — the trail is never edited).
      </p>
      {events.length === 0 ? (
        <p className="muted">No security events.</p>
      ) : (
        <ol className="event-timeline">
          {events.map((event) => (
            <li key={event.id} className={event.resolved ? 'event-resolved' : ''}>
              <span className={`sev-badge ${severityClass(event.severity)}`}>{event.severity}</span>
              <div className="event-body">
                <div className="event-head">
                  <strong>{event.action}</strong>
                  <span className="muted">{formatDateTime(event.createdAt)}</span>
                </div>
                <div className="muted event-meta">
                  {event.actorUserId ? `actor ${event.actorUserId}` : 'no actor'}
                  {event.ipAddress ? ` · ${event.ipAddress}` : ''}
                  {event.resolved ? ` · resolved${event.note ? `: ${event.note}` : ''}` : ''}
                </div>
                {!event.resolved ? (
                  openId === event.id ? (
                    <div className="event-resolve">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Resolution note (optional)"
                      />
                      <button className="action" type="button" disabled={busy} onClick={() => void resolve(event.id)}>
                        {busy ? 'Saving…' : 'Confirm resolve'}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => {
                          setOpenId(undefined);
                          setNote('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => {
                        setOpenId(event.id);
                        setNote('');
                      }}
                    >
                      Mark resolved
                    </button>
                  )
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Registry of section-id → custom panel. main.tsx renders the panel in place of
 * the generic table when an entry exists. Populated one Batch-F point at a time.
 */
export const CUSTOM_PANELS: Record<string, React.ComponentType<PanelProps>> = {
  'agent-routing': AgentRoutingPanel,
  'credit-wallets': CreditWalletsPanel,
  'account-deletions': AccountDeletionsPanel,
  'ai-models': AiModelsPanel,
  previews: PreviewsPanel,
  'abuse-events': AbuseEventsPanel,
  costs: CostsPanel,
  'agent-checkpoints': CheckpointsPanel,
  'provider-health': ProvidersPanel,
  'security-events': SecurityEventsPanel,
};

/* ------------------------------------------------------------------ */
/* Agent routing (AGM) — Admin > Agent > Model routing                 */
/* ------------------------------------------------------------------ */

interface AgentRoutingLineView {
  key: string;
  label: string;
  provider: string;
  model: string;
  costInCentsPerM: number;
  costOutCentsPerM: number;
  multiplier: number;
  billedToUser: boolean;
  availablePlans: string[];
  active: boolean;
  userPrice: { inCentsPerM: number; outCentsPerM: number };
  margins: { inputMargin: number | null; outputMargin: number | null; negative: boolean };
  volume30d: {
    calls: number;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    creditCents: number;
    marginCents: number;
  };
}

interface AgentRoutingPayload {
  card: {
    version: number;
    effectiveFrom: string;
    sourceDate: string;
    baseUserInCentsPerM: number;
    baseUserOutCentsPerM: number;
  };
  lines: AgentRoutingLineView[];
  negativeLines: string[];
  history: Array<{
    version: number;
    active: boolean;
    effectiveFrom: string;
    effectiveTo?: string;
    sourceDate?: string;
    createdAt: string;
    createdByEmail?: string;
  }>;
}

interface AgentRoutingSimulation {
  windowDays: number;
  negativeLines: string[];
  lines: Array<{
    lineKey: string;
    calls: number;
    tokensIn: number;
    tokensOut: number;
    actualCostCents: number;
    actualCreditCents: number;
    actualMarginCents: number;
    simulatedCostCents: number;
    simulatedCreditCents: number;
    simulatedMarginCents: number;
  }>;
  totals: {
    actualCostCents: number;
    actualCreditCents: number;
    actualMarginCents: number;
    simulatedCostCents: number;
    simulatedCreditCents: number;
    simulatedMarginCents: number;
  };
}

interface AgentCallRow {
  id: string;
  createdAt: string;
  mode: string;
  highEffort: boolean;
  escalated: boolean;
  turbo: boolean;
  lineKey: string;
  provider: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costMillicents: number;
  creditCents: number;
  marginMillicents: number;
  billedToUser: boolean;
  routingCardVersion: number;
  source: string;
}

function formatMargin(margin: number | null): string {
  if (margin === null) {
    return '—';
  }

  return `${(margin * 100).toFixed(1)}%`;
}

function marginTone(margin: number | null): React.CSSProperties {
  if (margin === null) {
    return { color: 'var(--admin-text-muted, #8a8f98)' };
  }

  return margin < 0 ? { color: '#e5484d', fontWeight: 700 } : { color: '#30a46c' };
}

/**
 * AGM admin screen: one line per mode/switch with cost of revenue, the ONE
 * billed multiplier, live margins (red + save-blocking when negative), 30-day
 * real volume, plan availability and the classifier as a visible unbilled
 * operating cost. Publishing is a NEW versioned card (config change, zero
 * deployment) — full history + who/when below, plus the 30-day simulator.
 */
export function AgentRoutingPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<AgentRoutingPayload>('/admin/agent-routing');
  const [draftLines, setDraftLines] = useState<AgentRoutingLineView[] | undefined>(undefined);
  const [baseIn, setBaseIn] = useState<number | undefined>(undefined);
  const [baseOut, setBaseOut] = useState<number | undefined>(undefined);
  const [sourceDate, setSourceDate] = useState<string | undefined>(undefined);
  const [confirmNegative, setConfirmNegative] = useState(false);
  const [simulation, setSimulation] = useState<AgentRoutingSimulation | undefined>(undefined);
  const [calls, setCalls] = useState<AgentCallRow[] | undefined>(undefined);

  useEffect(() => {
    if (data) {
      setDraftLines(structuredClone(data.lines));
      setBaseIn(data.card.baseUserInCentsPerM);
      setBaseOut(data.card.baseUserOutCentsPerM);
      setSourceDate(data.card.sourceDate);
      setSimulation(undefined);
      setConfirmNegative(false);
    }
  }, [data]);

  useEffect(() => {
    apiJson<{ calls: AgentCallRow[] }>('/admin/agent-routing/calls?limit=50')
      .then((payload) => setCalls(payload.calls))
      .catch(() => setCalls([]));
  }, [data]);

  if (loading || error || !data || !draftLines) {
    return <PanelStates loading={loading} error={error} />;
  }

  const effectiveBaseIn = baseIn ?? data.card.baseUserInCentsPerM;
  const effectiveBaseOut = baseOut ?? data.card.baseUserOutCentsPerM;

  const draftUserPrice = (line: AgentRoutingLineView) =>
    line.billedToUser
      ? { inCentsPerM: effectiveBaseIn * line.multiplier, outCentsPerM: effectiveBaseOut * line.multiplier }
      : { inCentsPerM: 0, outCentsPerM: 0 };

  const draftMargins = (line: AgentRoutingLineView) => {
    if (!line.billedToUser) {
      return { inputMargin: null, outputMargin: null, negative: false };
    }

    const price = draftUserPrice(line);
    const inputMargin = price.inCentsPerM > 0 ? (price.inCentsPerM - line.costInCentsPerM) / price.inCentsPerM : null;
    const outputMargin =
      price.outCentsPerM > 0 ? (price.outCentsPerM - line.costOutCentsPerM) / price.outCentsPerM : null;

    return {
      inputMargin,
      outputMargin,
      negative: (inputMargin !== null && inputMargin < 0) || (outputMargin !== null && outputMargin < 0),
    };
  };

  const negativeDraftLines = draftLines.filter((line) => line.active && draftMargins(line).negative);

  const updateLine = (key: string, patch: Partial<AgentRoutingLineView>) => {
    setDraftLines((current) => current?.map((line) => (line.key === key ? { ...line, ...patch } : line)));
    setSimulation(undefined);
  };

  const draftCardBody = () => ({
    sourceDate: sourceDate || new Date().toISOString().slice(0, 10),
    baseUserInCentsPerM: effectiveBaseIn,
    baseUserOutCentsPerM: effectiveBaseOut,
    lines: draftLines.map((line) => ({
      key: line.key,
      label: line.label,
      provider: line.provider,
      model: line.model,
      costInCentsPerM: line.costInCentsPerM,
      costOutCentsPerM: line.costOutCentsPerM,
      multiplier: line.multiplier,
      billedToUser: line.billedToUser,
      availablePlans: line.availablePlans,
      active: line.active,
    })),
  });

  const simulate = async () => {
    try {
      const result = await apiJson<AgentRoutingSimulation>('/admin/agent-routing/simulate', {
        method: 'POST',
        body: JSON.stringify({ card: draftCardBody() }),
      });
      setSimulation(result);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Simulation failed');
    }
  };

  const publish = async () => {
    if (negativeDraftLines.length > 0 && !confirmNegative) {
      pushToast(
        `Negative margin on: ${negativeDraftLines.map((line) => line.key).join(', ')} — tick the explicit confirmation to publish anyway.`,
      );
      return;
    }

    const result = await withReauth(reauthPassword, pushToast, () =>
      apiJson<{ published: boolean; version: number }>('/admin/agent-routing', {
        method: 'POST',
        body: JSON.stringify({ card: draftCardBody(), confirmNegativeMargin: confirmNegative }),
      }),
    );

    if (result?.published) {
      pushToast(`Routing card v${result.version} published — live immediately, no deployment.`);
      reload();
    }
  };

  const cellInput = (value: number, onChange: (next: number) => void, width = 90) => (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={0}
      step="any"
      onChange={(event) => onChange(Number(event.currentTarget.value))}
      style={{ width }}
    />
  );

  return (
    <div className="admin-panel">
      <div className="admin-panel-block">
        <h3>Model routing — active card v{data.card.version}</h3>
        <p className="admin-panel-hint">
          One line per mode/switch. The user price is <strong>base × multiplier</strong> — the multiplier shown IS the
          multiplier billed. Margin is computed live; a negative margin blocks publishing unless explicitly confirmed.
          Publishing creates a NEW version (config change — never a deployment).
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
          <label>
            Base user price /1M in (¢): {cellInput(effectiveBaseIn, setBaseIn)}
          </label>
          <label>
            Base user price /1M out (¢): {cellInput(effectiveBaseOut, setBaseOut)}
          </label>
          <label>
            Source date:{' '}
            <input
              type="date"
              value={sourceDate ?? ''}
              onChange={(event) => setSourceDate(event.currentTarget.value)}
            />
          </label>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Provider</th>
                <th>Model</th>
                <th>Cost /1M in (¢)</th>
                <th>Cost /1M out (¢)</th>
                <th>×</th>
                <th>User /1M in</th>
                <th>User /1M out</th>
                <th>Margin in</th>
                <th>Margin out</th>
                <th>Margin 30d</th>
                <th>Volume 30d</th>
                <th>Plans</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {draftLines.map((line) => {
                const margins = draftMargins(line);
                const price = draftUserPrice(line);
                const served = data.lines.find((entry) => entry.key === line.key);

                return (
                  <tr key={line.key} style={margins.negative ? { background: 'rgba(229,72,77,0.08)' } : undefined}>
                    <td>
                      <strong>{line.label}</strong>
                      {!line.billedToUser ? (
                        <div style={{ fontSize: 11, color: '#8a8f98' }}>not billed (our operating cost)</div>
                      ) : null}
                    </td>
                    <td>
                      <input
                        value={line.provider}
                        onChange={(event) => updateLine(line.key, { provider: event.currentTarget.value })}
                        style={{ width: 100 }}
                      />
                    </td>
                    <td>
                      <input
                        value={line.model}
                        onChange={(event) => updateLine(line.key, { model: event.currentTarget.value })}
                        style={{ width: 170 }}
                      />
                    </td>
                    <td>{cellInput(line.costInCentsPerM, (next) => updateLine(line.key, { costInCentsPerM: next }))}</td>
                    <td>
                      {cellInput(line.costOutCentsPerM, (next) => updateLine(line.key, { costOutCentsPerM: next }))}
                    </td>
                    <td>{cellInput(line.multiplier, (next) => updateLine(line.key, { multiplier: next }), 60)}</td>
                    <td>{line.billedToUser ? formatCents(price.inCentsPerM) : '—'}</td>
                    <td>{line.billedToUser ? formatCents(price.outCentsPerM) : '—'}</td>
                    <td style={marginTone(margins.inputMargin)}>{formatMargin(margins.inputMargin)}</td>
                    <td style={marginTone(margins.outputMargin)}>{formatMargin(margins.outputMargin)}</td>
                    <td style={marginTone(served && served.volume30d.calls > 0 ? served.volume30d.marginCents : null)}>
                      {served && served.volume30d.calls > 0 ? formatCents(served.volume30d.marginCents) : '—'}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {served
                        ? `${served.volume30d.calls} calls · ${served.volume30d.tokensIn.toLocaleString()} in / ${served.volume30d.tokensOut.toLocaleString()} out`
                        : '—'}
                    </td>
                    <td>
                      <input
                        value={line.availablePlans.join(',')}
                        onChange={(event) =>
                          updateLine(line.key, {
                            availablePlans: event.currentTarget.value
                              .split(',')
                              .map((plan) => plan.trim())
                              .filter(Boolean),
                          })
                        }
                        style={{ width: 160 }}
                        title="Comma-separated plan keys"
                      />
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={line.active}
                        onChange={(event) => updateLine(line.key, { active: event.currentTarget.checked })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {negativeDraftLines.length > 0 ? (
          <div
            role="alert"
            data-testid="agent-routing-negative-alert"
            style={{
              margin: '10px 0',
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #e5484d',
              background: 'rgba(229,72,77,0.1)',
              color: '#e5484d',
              fontWeight: 600,
            }}
          >
            ⚠ Negative margin on: {negativeDraftLines.map((line) => line.label).join(', ')}. Publishing is blocked
            unless you explicitly confirm losing money on these lines.
            <label style={{ display: 'block', marginTop: 6, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={confirmNegative}
                onChange={(event) => setConfirmNegative(event.currentTarget.checked)}
              />{' '}
              I understand and confirm publishing with a negative margin.
            </label>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, margin: '10px 0' }}>
          <button type="button" onClick={simulate}>
            Simulate on the last 30 days
          </button>
          <button type="button" onClick={publish} data-testid="agent-routing-publish">
            Publish new version
          </button>
          <button type="button" onClick={reload}>
            Reset draft
          </button>
        </div>

        {simulation ? (
          <div className="admin-panel-block" data-testid="agent-routing-simulation">
            <h4>Simulation — real volume of the last {simulation.windowDays} days</h4>
            <p>
              At this volume, this config would have <strong>cost {formatCents(simulation.totals.simulatedCostCents)}</strong>{' '}
              and <strong>earned {formatCents(simulation.totals.simulatedCreditCents)}</strong> (margin{' '}
              {formatCents(simulation.totals.simulatedMarginCents)}) — vs actual: cost{' '}
              {formatCents(simulation.totals.actualCostCents)}, earned {formatCents(simulation.totals.actualCreditCents)}
              , margin {formatCents(simulation.totals.actualMarginCents)}.
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th>Calls</th>
                  <th>Actual cost</th>
                  <th>Actual earned</th>
                  <th>Simulated cost</th>
                  <th>Simulated earned</th>
                  <th>Simulated margin</th>
                </tr>
              </thead>
              <tbody>
                {simulation.lines.map((line) => (
                  <tr key={line.lineKey}>
                    <td>{line.lineKey}</td>
                    <td>{line.calls}</td>
                    <td>{formatCents(line.actualCostCents)}</td>
                    <td>{formatCents(line.actualCreditCents)}</td>
                    <td>{formatCents(line.simulatedCostCents)}</td>
                    <td>{formatCents(line.simulatedCreditCents)}</td>
                    <td style={marginTone(line.simulatedMarginCents < 0 ? -1 : 1)}>
                      {formatCents(line.simulatedMarginCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="admin-panel-block">
        <h4>Version history — who changed what, when</h4>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Active</th>
              <th>Effective from</th>
              <th>Effective to</th>
              <th>Source date</th>
              <th>Author</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((entry) => (
              <tr key={entry.version}>
                <td>v{entry.version}</td>
                <td>{entry.active ? '● active' : '—'}</td>
                <td>{formatDateTime(entry.effectiveFrom)}</td>
                <td>{entry.effectiveTo ? formatDateTime(entry.effectiveTo) : '—'}</td>
                <td>{entry.sourceDate ?? '—'}</td>
                <td>{entry.createdByEmail ?? 'seed'}</td>
                <td>{formatDateTime(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel-block">
        <h4>Recent agent calls (admin-only log)</h4>
        <table className="admin-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Mode</th>
              <th>Line</th>
              <th>Model (real)</th>
              <th>Tokens in/out</th>
              <th>Cost</th>
              <th>Credits</th>
              <th>Margin</th>
              <th>Escalated</th>
              <th>Card</th>
            </tr>
          </thead>
          <tbody>
            {(calls ?? []).map((call) => (
              <tr key={call.id}>
                <td>{formatDateTime(call.createdAt)}</td>
                <td>
                  {call.mode}
                  {call.turbo ? ' · turbo' : ''}
                  {call.highEffort ? ' · high-effort' : ''}
                </td>
                <td>{call.lineKey}</td>
                <td>
                  {call.provider}/{call.model}
                  {!call.billedToUser ? ' (unbilled)' : ''}
                </td>
                <td>
                  {call.tokensIn.toLocaleString()} / {call.tokensOut.toLocaleString()}
                </td>
                <td>{formatCents(call.costMillicents / 1000)}</td>
                <td>{formatCents(call.creditCents)}</td>
                <td style={marginTone(call.marginMillicents < 0 ? -1 : 1)}>{formatCents(call.marginMillicents / 1000)}</td>
                <td>{call.escalated ? 'yes' : 'no'}</td>
                <td>v{call.routingCardVersion}</td>
              </tr>
            ))}
            {calls && calls.length === 0 ? (
              <tr>
                <td colSpan={10}>No routed calls yet.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
