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

// ---------------------------------------------------------------------------
// F20 — Credit wallets: signed adjustment (mandatory reason → audit) + history
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F24 — Account deletions: J+14 purge queue (TTL remaining) + Cancel deletion
// ---------------------------------------------------------------------------

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
                      <button
                        className="secondary"
                        type="button"
                        disabled={busyUser === row.userId}
                        onClick={() => void cancel(row.userId)}
                      >
                        {busyUser === row.userId ? 'Cancelling…' : 'Cancel deletion'}
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

// ---------------------------------------------------------------------------
// F19 — AI models: plan × model matrix + cost/1M + guarantee ≥1 active per plan
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F25 — Previews: TTL remaining + kill per row + default TTL (System settings)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F22 — Abuse events: Dismiss / Warn (email) / Suspend (reuse E26) + status
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F26 — Costs: 30-day cost/day per provider + monthly budget + 80/100% alerts
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F21 — Agent checkpoints: storage total/org + retention rule + purge w/ estimate
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// F18 — AI providers: fallback order ↑↓ (+ honest note on p95/error metrics)
// ---------------------------------------------------------------------------

interface ProviderRow {
  provider: string;
  displayName: string;
  enabled: boolean;
}

interface FallbackOrder {
  order: string[];
  providers: ProviderRow[];
  metricsAvailable: boolean;
  thresholds: { warnErrorPct: number; errorErrorPct: number };
}

function ProvidersPanel({ reauthPassword, pushToast }: PanelProps) {
  const { data, loading, error, reload } = usePanelData<FallbackOrder>('/admin/providers/fallback-order');
  const [order, setOrder] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

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

  return (
    <section className="panel" aria-label="AI providers">
      <div className="page-title">
        <h2>AI providers</h2>
        <button className="secondary" type="button" onClick={reload}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Fallback order — the priority the gateway tries providers in. Use ↑/↓ to reorder, then Save.
      </p>

      {!data?.metricsAvailable ? (
        <div className="cost-alert cost-alert-warn" role="note">
          Per-provider p95 latency and 24h error rate are not recorded yet (no request-metrics source). Alert thresholds
          — warn ≥{data?.thresholds.warnErrorPct ?? 2}%, error ≥{data?.thresholds.errorErrorPct ?? 5}% — will apply once
          request instrumentation lands.
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {order.map((name, index) => {
              const provider = byName.get(name);
              return (
                <tr key={name}>
                  <td className="ledger-amount">{index + 1}</td>
                  <td>{provider?.displayName ?? name}</td>
                  <td className={provider?.enabled ? 'ledger-credit' : 'muted'}>
                    {provider?.enabled ? 'enabled' : 'disabled'}
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
                    </div>
                  </td>
                </tr>
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

// ---------------------------------------------------------------------------
// F23 — Security events: severity + timeline + mark resolved (note) + open count
// ---------------------------------------------------------------------------

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
