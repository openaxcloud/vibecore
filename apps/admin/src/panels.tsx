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
import {
  adminLedgerKindLabel,
  adminLocale,
  adminPluralT,
  adminStatusLabel,
  adminStandaloneT as adminT,
  localizedAdminError,
} from './i18n';

export interface PanelProps {
  /** Re-auth password entered in the top bar; required before mutating actions. */
  reauthPassword: string;

  /** Surface a status message in the shared toast. */
  pushToast: (message: string) => void;
}

export function formatCents(cents: number | null | undefined): string {
  const value = typeof cents === 'number' && Number.isFinite(cents) ? cents : 0;
  return new Intl.NumberFormat(adminLocale(), { style: 'currency', currency: 'USD' }).format(value / 100);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(adminLocale());
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
    pushToast(adminT('admin.standalone.panelReauthRequired'));
    return undefined;
  }

  try {
    await reauthAdmin(reauthPassword);
    return await run();
  } catch (error) {
    pushToast(localizedAdminError(error, 'admin.standalone.panelActionFailed'));
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
          setError(localizedAdminError(requestError, 'admin.standalone.panelLoadFailed'));
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
    return <div className="panel skeleton" role="status" aria-label={adminT('admin.standalone.loading_8f26c6')} />;
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
      pushToast(adminT('admin.standalone.walletAmountInvalid'));
      return;
    }

    if (!reason.trim()) {
      pushToast(adminT('admin.standalone.walletReasonRequired'));
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
      pushToast(adminT('admin.standalone.walletAdjusted', { balance: formatCents(result.wallet.balanceCents) }));
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
    <section className="panel" aria-label={adminT('admin.standalone.creditWallets_159a5d')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.creditWallets_159a5d')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">{adminT('admin.standalone.signedAdjustmentsCreditDebitRequireAReasonAnd_f03154')}</p>
      {wallets.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noCreditWalletsYet_3415d9')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.organization_519255')}</th>
                <th>{adminT('admin.standalone.balance_90eef6')}</th>
                <th>{adminT('admin.standalone.budgetCap_a36814')}</th>
                <th>{adminT('admin.standalone.updated_f2f857')}</th>
                <th>{adminT('admin.standalone.actions_c3cd63')}</th>
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
                        {openOrg === wallet.organizationId
                          ? adminT('admin.standalone.close_bbfa77')
                          : adminT('admin.standalone.adjustHistory')}
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
                              {adminT('admin.standalone.adjustmentCentsCreditDebit_1ed0eb')}
                              <input
                                type="number"
                                step="1"
                                value={delta}
                                onChange={(event) => setDelta(event.target.value)}
                                placeholder={adminT('admin.standalone.eG5000Or2000_f97ea4')}
                              />
                            </label>
                            <label>
                              {adminT('admin.standalone.reasonRequired_51df13')}
                              <input
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                                placeholder={adminT('admin.standalone.whyIsThisAdjustmentBeingMade_acced6')}
                              />
                            </label>
                            <button className="action" type="submit" disabled={busy}>
                              {busy ? adminT('admin.standalone.applying') : adminT('admin.standalone.applyAdjustment')}
                            </button>
                          </form>
                          <h3>{adminT('admin.standalone.movementHistory_9418ba')}</h3>
                          {ledgerLoading ? (
                            <p className="muted">{adminT('admin.standalone.loadingMovements_ee86a1')}</p>
                          ) : ledger.length === 0 ? (
                            <p className="muted">{adminT('admin.standalone.noMovementsRecorded_582085')}</p>
                          ) : (
                            <div className="table-wrap">
                              <table>
                                <thead>
                                  <tr>
                                    <th>{adminT('admin.standalone.when_769bb1')}</th>
                                    <th>{adminT('admin.standalone.kind_e00ac2')}</th>
                                    <th>{adminT('admin.standalone.amount_43dc85')}</th>
                                    <th>{adminT('admin.standalone.reason_f219cc')}</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {ledger.map((entry) => (
                                    <tr key={entry.id}>
                                      <td>{formatDateTime(entry.createdAt)}</td>
                                      <td>{adminLedgerKindLabel(entry.kind)}</td>
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
      pushToast(adminT('admin.standalone.deletionCancelled'));
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
      pushToast(adminT('admin.standalone.accountDataExported'));
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.accountDeletions_4361ee')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.accountDeletions_4361ee')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">
        {adminT('admin.standalone.selfServeDeletionsPurgeAfterA_a6108a')} {data?.gracePeriodDays ?? 14}
        {adminT('admin.standalone.dayGraceWindow_c25341')}{' '}
        {data
          ? adminPluralT(
              'admin.standalone.readyToPurgeNow_one',
              'admin.standalone.readyToPurgeNow_other',
              data.readyToPurge,
            )
          : ''}{' '}
        {adminT('admin.standalone.cancellingStopsTheScheduledPurgeAudited_b47561')}
      </p>
      {requests.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noPendingAccountDeletions_38d542')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.user_9f8a23')}</th>
                <th>{adminT('admin.standalone.status_bae7d5')}</th>
                <th>{adminT('admin.standalone.requested_c26bf6')}</th>
                <th>{adminT('admin.standalone.purgeDue_792bdf')}</th>
                <th>{adminT('admin.standalone.ttl_878260')}</th>
                <th>{adminT('admin.standalone.actions_c3cd63')}</th>
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
                      {ttl == null
                        ? '—'
                        : ttl <= 0
                          ? adminT('admin.standalone.dueNow')
                          : adminPluralT('admin.standalone.day_one', 'admin.standalone.day_other', ttl)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          className="secondary"
                          type="button"
                          disabled={exportingUser === row.userId}
                          onClick={() => void exportData(row.userId, row.email)}
                        >
                          {exportingUser === row.userId
                            ? adminT('admin.standalone.exporting')
                            : adminT('admin.standalone.exportData')}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busyUser === row.userId}
                          onClick={() => void cancel(row.userId)}
                        >
                          {busyUser === row.userId
                            ? adminT('admin.standalone.cancelling')
                            : adminT('admin.standalone.cancelDeletion')}
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
      pushToast(
        adminT('admin.standalone.modelStateChanged', {
          model: model.displayName,
          state: model.enabled ? adminT('admin.standalone.disable') : adminT('admin.standalone.enable'),
        }),
      );
      reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.aiModels_220092')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.aiModels_220092')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">{adminT('admin.standalone.planModelAccessAndCostPer1mTokens_fc5360')}</p>
      <div className="plan-coverage">
        {plans.map((plan) => {
          const count = activeByPlan.get(plan) ?? 0;
          const tone = count === 0 ? 'ledger-debit' : count === 1 ? 'status-warn-text' : 'ledger-credit';

          return (
            <span key={plan} className={`plan-chip ${tone}`}>
              {plan}: {count} {adminT('admin.standalone.active_2bb6b9')}
            </span>
          );
        })}
      </div>
      {models.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noModelsInTheRegistry_db8735')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.model_68c2cc')}</th>
                <th>{adminT('admin.standalone.in1m_759e3f')}</th>
                <th>{adminT('admin.standalone.out1m_8d9342')}</th>
                {plans.map((plan) => (
                  <th key={plan}>{plan}</th>
                ))}
                <th>{adminT('admin.standalone.status_bae7d5')}</th>
                <th>{adminT('admin.standalone.action_97c89a')}</th>
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
                      {model.isHighPower ? (
                        <span className="model-tag">{adminT('admin.standalone.power_b573f2')}</span>
                      ) : null}
                      {model.supportsThinking ? (
                        <span className="model-tag">{adminT('admin.standalone.thinking_beac9e')}</span>
                      ) : null}
                    </td>
                    <td className="ledger-amount">{formatCents(model.inputCentsPerM)}</td>
                    <td className="ledger-amount">{formatCents(model.outputCentsPerM)}</td>
                    {plans.map((plan) => (
                      <td key={plan} style={{ textAlign: 'center' }}>
                        {model.enabledPlans.includes(plan) ? (model.enabled ? '●' : '○') : ''}
                      </td>
                    ))}
                    <td className={model.enabled ? 'ledger-credit' : 'muted'}>
                      {model.enabled ? adminT('admin.standalone.active_2bb6b9') : adminT('admin.standalone.disable')}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        type="button"
                        disabled={busy === key}
                        onClick={() => void toggle(model)}
                      >
                        {busy === key
                          ? '…'
                          : model.enabled
                            ? adminT('admin.standalone.disable')
                            : adminT('admin.standalone.enable')}
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
      pushToast(adminT('admin.standalone.previewTtlInvalid'));
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
      pushToast(adminT('admin.standalone.previewTtlSaved', { count: minutes }));
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
      pushToast(adminT('admin.standalone.previewKilled', { workspace: workspaceId }));
      reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.previews_beb86d')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.previews_beb86d')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
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
          {adminT('admin.standalone.defaultPreviewTtlMinutes_6c5faa')}
          <input type="number" step="1" min="1" value={ttl} onChange={(event) => setTtl(event.target.value)} />
        </label>
        <button className="action" type="submit" disabled={savingTtl}>
          {savingTtl ? adminT('admin.standalone.saving') : adminT('admin.standalone.saveDefaultTtl')}
        </button>
      </form>
      {previews.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noWorkspacePreviews_d093a1')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.workspace_4ca0a7')}</th>
                <th>{adminT('admin.standalone.status_bae7d5')}</th>
                <th>{adminT('admin.standalone.created_accf40')}</th>
                <th>{adminT('admin.standalone.expires_a99be3')}</th>
                <th>{adminT('admin.standalone.ttl_878260')}</th>
                <th>{adminT('admin.standalone.action_97c89a')}</th>
              </tr>
            </thead>
            <tbody>
              {previews.map((preview) => {
                const secondsLeft = Math.round((new Date(preview.expiresAt).getTime() - Date.now()) / 1000);
                const expired = secondsLeft <= 0;

                const ttlLabel = expired
                  ? adminT('admin.standalone.status.expired')
                  : secondsLeft >= 3600
                    ? `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m`
                    : `${Math.max(1, Math.floor(secondsLeft / 60))}m`;

                const running = /running|starting/i.test(preview.status);

                return (
                  <tr key={preview.workspaceId}>
                    <td>{preview.workspaceId}</td>
                    <td>{adminStatusLabel(preview.status)}</td>
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
                        {busy === preview.workspaceId
                          ? adminT('admin.standalone.killing')
                          : adminT('admin.standalone.kill')}
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
    return {
      label: row.disposition
        ? adminT('admin.standalone.resolvedDisposition', { disposition: row.disposition })
        : adminT('admin.standalone.resolved'),
      className: 'ledger-credit',
    };
  }

  if (row.disposition === 'warned') {
    return { label: adminT('admin.standalone.warnedOpen_5aad02'), className: 'status-warn-text' };
  }

  return { label: adminT('admin.standalone.open_5fc7e3'), className: 'status-warn-text' };
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
          throw new Error(adminT('admin.standalone.thisEventHasNoAssociatedUserToSuspend_f19396'));
        }

        return apiJson(`/admin/users/${row.userId}/suspend`, {
          method: 'POST',
          body: JSON.stringify({
            reason: adminT('admin.standalone.abuseSuspendReason', { type: row.type, severity: row.severity }),
          }),
        });
      }

      return apiJson(`/admin/abuse-events/${row.id}/${kind}`, { method: 'POST' });
    });
    setBusy(undefined);

    if (result) {
      const done =
        kind === 'suspend'
          ? adminT('admin.standalone.userSuspended')
          : kind === 'warn'
            ? adminT('admin.standalone.warningEmailed')
            : adminT('admin.standalone.eventDismissed');
      pushToast(done);
      reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.abuseEvents_b36589')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.abuseEvents_b36589')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">
        {adminT('admin.standalone.dismissNoActionWarnEmailsTheUserKeeps_9e0df4')}{' '}
        {events.filter((event) => !event.resolved).length} {adminT('admin.standalone.open_309a63')}
      </p>
      {events.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noAbuseEvents_9fcf3c')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.type_3deb74')}</th>
                <th>{adminT('admin.standalone.severity_de314f')}</th>
                <th>{adminT('admin.standalone.org_972f71')}</th>
                <th>{adminT('admin.standalone.user_9f8a23')}</th>
                <th>{adminT('admin.standalone.created_accf40')}</th>
                <th>{adminT('admin.standalone.status_bae7d5')}</th>
                <th>{adminT('admin.standalone.actions_c3cd63')}</th>
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
                          {adminT('admin.standalone.dismiss_70afe9')}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={busy === `${row.id}:warn` || !row.userId}
                          onClick={() => void act(row, 'warn')}
                        >
                          {adminT('admin.standalone.warn_3009d5')}
                        </button>
                        <button
                          className="danger"
                          type="button"
                          disabled={busy === `${row.id}:suspend` || !row.userId}
                          onClick={() => void act(row, 'suspend')}
                        >
                          {adminT('admin.standalone.suspend_b24247')}
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
      pushToast(adminT('admin.standalone.budgetInvalid'));
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
      pushToast(adminT('admin.standalone.budgetSaved', { amount: formatCents(Math.round(dollars * 100)) }));
      reload();
    }
  }

  const alertClass =
    summary.alertLevel === 'over' ? 'cost-alert-over' : summary.alertLevel === 'warn' ? 'cost-alert-warn' : '';

  return (
    <section className="panel" aria-label={adminT('admin.standalone.costDashboard_564e1b')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.costDashboard_564e1b')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>

      {summary.alertLevel === 'warn' || summary.alertLevel === 'over' ? (
        <div className={`cost-alert ${alertClass}`} role="alert">
          {adminT('admin.standalone.monthToDateAiSpendIs_73136a')} {summary.budgetUsedPct}
          {adminT('admin.standalone.ofThe_86303f')}
          {formatCents(summary.monthlyBudgetCents ?? 0)} {adminT('admin.standalone.budget_81e4a5')}
          {summary.alertLevel === 'over'
            ? adminT('admin.standalone.overBudget')
            : adminT('admin.standalone.nearBudget')}
        </div>
      ) : null}

      <div className="cost-stats">
        <div>
          <span className="muted">{adminT('admin.standalone.30DayAiSpend_fe0436')}</span>
          <strong>{formatCents(summary.windowTotalCents)}</strong>
        </div>
        <div>
          <span className="muted">{adminT('admin.standalone.monthToDate_314175')}</span>
          <strong>{formatCents(summary.monthToDateCents)}</strong>
        </div>
        <div>
          <span className="muted">{adminT('admin.standalone.budgetUsed_98c64c')}</span>
          <strong>
            {summary.budgetUsedPct == null
              ? adminT('admin.standalone.noBudget')
              : new Intl.NumberFormat(adminLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(
                  summary.budgetUsedPct / 100,
                )}
          </strong>
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
          {adminT('admin.standalone.monthlyAiBudget_a73917')}
          <input type="number" step="0.01" min="0" value={budget} onChange={(event) => setBudget(event.target.value)} />
        </label>
        <button className="action" type="submit" disabled={saving}>
          {saving ? adminT('admin.standalone.saving') : adminT('admin.standalone.saveBudget')}
        </button>
      </form>

      {summary.providers.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noAiCostRecordsInTheLast30_dacb99')}</p>
      ) : (
        <>
          <div
            className="cost-chart"
            role="img"
            aria-label={adminT('admin.standalone.aiCostPerDayForTheLast30_2a5214')}
          >
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
      pushToast(adminT('admin.standalone.daysInvalid'));
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
      pushToast(
        adminT(
          result.deleted === 1 ? 'admin.standalone.checkpointPurge_one' : 'admin.standalone.checkpointPurge_other',
          { count: result.deleted, days: olderThanDays },
        ),
      );
      reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.agentCheckpoints_153494')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.agentCheckpoints_153494')}</h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <div className="cost-stats">
        <div>
          <span className="muted">{adminT('admin.standalone.totalCheckpoints_fb890a')}</span>
          <strong>{storage.totalCheckpoints.toLocaleString(adminLocale())}</strong>
        </div>
        <div>
          <span className="muted">{adminT('admin.standalone.totalSettledCredit_937c43')}</span>
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
          {adminT('admin.standalone.purgeTerminalCheckpointsOlderThanDays_acdf97')}
          <input type="number" step="1" min="1" value={days} onChange={(event) => setDays(event.target.value)} />
        </label>
        <button className="danger" type="submit" disabled={busy || storage.purgeEstimate === 0}>
          {busy
            ? adminT('admin.standalone.purging')
            : adminT('admin.standalone.purgeCount', { count: storage.purgeEstimate })}
        </button>
      </form>
      <p className="muted">
        {adminT('admin.standalone.estimate_3a7ca0')} {storage.purgeEstimate}{' '}
        {adminT('admin.standalone.completedFailedCheckpointSStartedBefore_35efb3')} {formatDateTime(storage.cutoff)}{' '}
        {adminT('admin.standalone.wouldBePermanentlyDeletedRemovesSettledBillingHistory_052258')}
      </p>

      {storage.byOrg.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noAgentCheckpoints_31799b')}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{adminT('admin.standalone.organization_519255')}</th>
                <th>{adminT('admin.standalone.checkpoints_a2b3a5')}</th>
                <th>{adminT('admin.standalone.inputTokens_92f7d2')}</th>
                <th>{adminT('admin.standalone.outputTokens_b879f5')}</th>
                <th>{adminT('admin.standalone.settledCredit_875a02')}</th>
              </tr>
            </thead>
            <tbody>
              {storage.byOrg.map((row) => (
                <tr key={row.organizationId}>
                  <td>{row.organizationId}</td>
                  <td className="ledger-amount">{row.checkpoints.toLocaleString(adminLocale())}</td>
                  <td className="ledger-amount">{row.inputTokens.toLocaleString(adminLocale())}</td>
                  <td className="ledger-amount">{row.outputTokens.toLocaleString(adminLocale())}</td>
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
      <span className="ledger-credit" title={adminT('admin.standalone.adminSetKeyStoredEncrypted_b5fb68')}>
        {adminT('admin.standalone.keyDb_192435')}
      </span>
    );
  }

  if (info.source === 'env') {
    return (
      <span className="muted" title={adminT('admin.standalone.resolvedFromThePlatformEnvVar_1d276a')}>
        {adminT('admin.standalone.keyEnv_5cc43d')}
      </span>
    );
  }

  return (
    <span className="ledger-debit" title={adminT('admin.standalone.noPlatformKeyConfigured_b1ad73')}>
      {adminT('admin.standalone.noKey_9ff594')}
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
      pushToast(adminT('admin.standalone.providerOrderSaved'));
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
      pushToast(adminT('admin.standalone.nothingToSave'));
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
      pushToast(adminT('admin.standalone.providerCredentialsSaved', { provider: name }));
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
      pushToast(adminT('admin.standalone.providerKeyRemoved', { provider: name }));
      keys.reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.aiProviders_897a9f')}>
      <div className="page-title">
        <h2>{adminT('admin.standalone.aiProviders_897a9f')}</h2>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            reload();
            keys.reload();
          }}
        >
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">{adminT('admin.standalone.enableDisableProvidersSetTheFallbackOrderThen_79d4c3')}</p>

      {!data?.metricsAvailable ? (
        <div className="cost-alert cost-alert-warn" role="note">
          {adminT('admin.standalone.noAiProviderRequestsRecordedInTheLast_09da11')}{' '}
          {data?.window ?? adminT('admin.standalone.window24Hours')}{' '}
          {adminT('admin.standalone.yetP95LatencyAndErrorRatePopulateAs_9e771b')}
          {data?.thresholds.warnErrorPct ?? 2}
          {adminT('admin.standalone.error_8fc756')}
          {data?.thresholds.errorErrorPct ?? 5}%.
        </div>
      ) : null}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>{adminT('admin.standalone.provider_7ceee3')}</th>
              <th>{adminT('admin.standalone.status_bae7d5')}</th>
              <th>{adminT('admin.standalone.p95Latency24h_743f55')}</th>
              <th>{adminT('admin.standalone.errorRate24h_5a4f14')}</th>
              <th>{adminT('admin.standalone.key_c67dd2')}</th>
              <th>{adminT('admin.standalone.actions_c3cd63')}</th>
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
                      {adminStatusLabel(provider?.enabled ? 'active' : 'disabled')}
                    </td>
                    <td className="ledger-amount">
                      {provider?.p95LatencyMs == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <span
                          title={adminPluralT(
                            'admin.standalone.requestsSampled_one',
                            'admin.standalone.requestsSampled_other',
                            provider.sampleCount ?? 0,
                          )}
                        >
                          {provider.p95LatencyMs} {adminT('admin.standalone.ms_26cc32')}
                        </span>
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
                          aria-label={adminT('admin.standalone.moveProviderUp', { provider: name })}
                          onClick={() => move(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={index === order.length - 1}
                          aria-label={adminT('admin.standalone.moveProviderDown', { provider: name })}
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
                          {isOpen ? adminT('admin.standalone.close_bbfa77') : adminT('admin.standalone.key_c67dd2')}
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
                              {adminT('admin.standalone.apiKeyWriteOnlyLeaveBlankToKeep_4a13f0')}
                              <input
                                type="password"
                                autoComplete="off"
                                value={keyInput}
                                onChange={(event) => setKeyInput(event.target.value)}
                                placeholder={
                                  info?.hasKey
                                    ? adminT('admin.standalone.keyStoredPlaceholder')
                                    : adminT('admin.standalone.keyPastePlaceholder')
                                }
                              />
                            </label>
                            <label>
                              {adminT('admin.standalone.baseUrlOptionalLeaveBlankToClearOpenai_ac07d4')}
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
                              {adminT('admin.standalone.allowUsersToBringTheirOwnKeyByok_83e9f9')}
                            </label>
                            <div className="actions">
                              <button className="action" type="submit" disabled={keyBusy}>
                                {keyBusy
                                  ? adminT('admin.standalone.saving')
                                  : info?.hasKey
                                    ? adminT('admin.standalone.saveRotate')
                                    : adminT('admin.standalone.saveKey')}
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
                                      {adminT('admin.standalone.confirmRemove_2a8865')}
                                    </button>
                                    <button
                                      className="secondary"
                                      type="button"
                                      disabled={keyBusy}
                                      onClick={() => setConfirmRemove(false)}
                                    >
                                      {adminT('admin.standalone.cancel_77dfd2')}
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    className="danger"
                                    type="button"
                                    disabled={keyBusy}
                                    onClick={() => setConfirmRemove(true)}
                                  >
                                    {adminT('admin.standalone.removeKey_582d9a')}
                                  </button>
                                )
                              ) : null}
                            </div>
                          </form>
                          <p className="muted">
                            {adminT('admin.standalone.source_922acd')}{' '}
                            <strong>{info?.source ?? adminT('admin.standalone.sourceNone')}</strong>
                            {lastSavedLast4[name] ? (
                              <>
                                {' '}
                                {adminT('admin.standalone.savedKeyEnding_c24b41')}{' '}
                                <code>····{lastSavedLast4[name]}</code>
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
          {saving ? adminT('admin.standalone.saving') : adminT('admin.standalone.saveOrder')}
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
      pushToast(adminT('admin.standalone.securityResolved'));
      setOpenId(undefined);
      setNote('');
      reload();
    }
  }

  return (
    <section className="panel" aria-label={adminT('admin.standalone.securityEvents_c68076')}>
      <div className="page-title">
        <h2>
          {adminT('admin.standalone.securityEvents_c68076')}{' '}
          {data && data.openCount > 0 ? (
            <span className="open-badge">
              {data.openCount} {adminT('admin.standalone.open_5fc7e3')}
            </span>
          ) : null}
        </h2>
        <button className="secondary" type="button" onClick={reload}>
          {adminT('admin.standalone.refresh_56e3ba')}
        </button>
      </div>
      <p className="muted">{adminT('admin.standalone.authMfaSecurityAuditEventsNewestFirstSeverity_8cbdf2')}</p>
      {events.length === 0 ? (
        <p className="muted">{adminT('admin.standalone.noSecurityEvents_ce9a30')}</p>
      ) : (
        <ol className="event-timeline">
          {events.map((event) => (
            <li key={event.id} className={event.resolved ? 'event-resolved' : ''}>
              <span className={`sev-badge ${severityClass(event.severity)}`}>
                {adminT(`admin.standalone.severity.${event.severity}`)}
              </span>
              <div className="event-body">
                <div className="event-head">
                  <strong>{event.action}</strong>
                  <span className="muted">{formatDateTime(event.createdAt)}</span>
                </div>
                <div className="muted event-meta">
                  {event.actorUserId
                    ? adminT('admin.standalone.actor', { id: event.actorUserId })
                    : adminT('admin.standalone.noActor')}
                  {event.ipAddress ? ` · ${event.ipAddress}` : ''}
                  {event.resolved
                    ? ` · ${
                        event.note
                          ? adminT('admin.standalone.resolvedWithNote', { note: event.note })
                          : adminT('admin.standalone.resolved')
                      }`
                    : ''}
                </div>
                {!event.resolved ? (
                  openId === event.id ? (
                    <div className="event-resolve">
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder={adminT('admin.standalone.resolutionNoteOptional_f47be8')}
                      />
                      <button className="action" type="button" disabled={busy} onClick={() => void resolve(event.id)}>
                        {busy ? adminT('admin.standalone.saving') : adminT('admin.standalone.confirmResolve')}
                      </button>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() => {
                          setOpenId(undefined);
                          setNote('');
                        }}
                      >
                        {adminT('admin.standalone.cancel_77dfd2')}
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
                      {adminT('admin.standalone.markResolved_f9896c')}
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
      pushToast(localizedAdminError(err, 'admin.standalone.simulationFailed'));
    }
  };

  const publish = async () => {
    if (negativeDraftLines.length > 0 && !confirmNegative) {
      pushToast(
        adminT('admin.standalone.negativeMarginConfirm', {
          lines: negativeDraftLines.map((line) => line.key).join(', '),
        }),
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
      pushToast(adminT('admin.standalone.routingPublished', { version: result.version }));
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
        <h3>
          {adminT('admin.standalone.modelRoutingActiveCardV_649e77')}
          {data.card.version}
        </h3>
        <p className="admin-panel-hint">
          {adminT('admin.standalone.oneLinePerModeSwitchTheUserPrice_7174dc')}{' '}
          <strong>{adminT('admin.standalone.baseMultiplier_c4deba')}</strong>{' '}
          {adminT('admin.standalone.theMultiplierShownIsTheMultiplierBilledMargin_95d198')}
        </p>

        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', margin: '8px 0' }}>
          <label>
            {adminT('admin.standalone.baseUserPrice1mIn_6a9dc1')} {cellInput(effectiveBaseIn, setBaseIn)}
          </label>
          <label>
            {adminT('admin.standalone.baseUserPrice1mOut_56d9d5')} {cellInput(effectiveBaseOut, setBaseOut)}
          </label>
          <label>
            {adminT('admin.standalone.sourceDate_889778')}{' '}
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
                <th>{adminT('admin.standalone.line_ea9676')}</th>
                <th>{adminT('admin.standalone.provider_7ceee3')}</th>
                <th>{adminT('admin.standalone.model_68c2cc')}</th>
                <th>{adminT('admin.standalone.cost1mIn_00fce9')}</th>
                <th>{adminT('admin.standalone.cost1mOut_cb5962')}</th>
                <th>×</th>
                <th>{adminT('admin.standalone.user1mIn_2e7092')}</th>
                <th>{adminT('admin.standalone.user1mOut_1e548f')}</th>
                <th>{adminT('admin.standalone.marginIn_d72590')}</th>
                <th>{adminT('admin.standalone.marginOut_e25894')}</th>
                <th>{adminT('admin.standalone.margin30d_9cac2b')}</th>
                <th>{adminT('admin.standalone.volume30d_6d3e99')}</th>
                <th>{adminT('admin.standalone.plans_cf2e5f')}</th>
                <th>{adminT('admin.standalone.active_a733b8')}</th>
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
                        <div style={{ fontSize: 11, color: '#8a8f98' }}>
                          {adminT('admin.standalone.notBilledOurOperatingCost_5b7fc7')}
                        </div>
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
                    <td>
                      {cellInput(line.costInCentsPerM, (next) => updateLine(line.key, { costInCentsPerM: next }))}
                    </td>
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
                        ? adminT('admin.standalone.callVolume', {
                            calls: served.volume30d.calls.toLocaleString(adminLocale()),
                            input: served.volume30d.tokensIn.toLocaleString(adminLocale()),
                            output: served.volume30d.tokensOut.toLocaleString(adminLocale()),
                          })
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
                        title={adminT('admin.standalone.commaSeparatedPlanKeys_b4f5e3')}
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
            {adminT('admin.standalone.negativeMarginOn_a4c991')}{' '}
            {negativeDraftLines.map((line) => line.label).join(', ')}
            {adminT('admin.standalone.publishingIsBlockedUnlessYouExplicitlyConfirmLosing_bcd6c0')}
            <label style={{ display: 'block', marginTop: 6, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={confirmNegative}
                onChange={(event) => setConfirmNegative(event.currentTarget.checked)}
              />{' '}
              {adminT('admin.standalone.iUnderstandAndConfirmPublishingWithANegative_ee4b7c')}
            </label>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 10, margin: '10px 0' }}>
          <button type="button" onClick={simulate}>
            {adminT('admin.standalone.simulateOnTheLast30Days_bbde22')}
          </button>
          <button type="button" onClick={publish} data-testid="agent-routing-publish">
            {adminT('admin.standalone.publishNewVersion_c72a11')}
          </button>
          <button type="button" onClick={reload}>
            {adminT('admin.standalone.resetDraft_cdca27')}
          </button>
        </div>

        {simulation ? (
          <div className="admin-panel-block" data-testid="agent-routing-simulation">
            <h4>
              {adminT('admin.standalone.simulationRealVolumeOfTheLast_960e46')} {simulation.windowDays}{' '}
              {adminT('admin.standalone.days_5548ae')}
            </h4>
            <p>
              {adminT('admin.standalone.atThisVolumeThisConfigWouldHave_e10562')}{' '}
              <strong>
                {adminT('admin.standalone.cost_885dc4')} {formatCents(simulation.totals.simulatedCostCents)}
              </strong>{' '}
              {adminT('admin.standalone.and_cffa50')}{' '}
              <strong>
                {adminT('admin.standalone.earned_7aa913')} {formatCents(simulation.totals.simulatedCreditCents)}
              </strong>{' '}
              {adminT('admin.standalone.margin_0a1dda')} {formatCents(simulation.totals.simulatedMarginCents)}
              {adminT('admin.standalone.vsActualCost_f01611')} {formatCents(simulation.totals.actualCostCents)}
              {adminT('admin.standalone.earned_c3717d')} {formatCents(simulation.totals.actualCreditCents)}
              {adminT('admin.standalone.margin_cdbfd2')} {formatCents(simulation.totals.actualMarginCents)}.
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{adminT('admin.standalone.line_ea9676')}</th>
                  <th>{adminT('admin.standalone.calls_0a19b7')}</th>
                  <th>{adminT('admin.standalone.actualCost_edf396')}</th>
                  <th>{adminT('admin.standalone.actualEarned_9cb13e')}</th>
                  <th>{adminT('admin.standalone.simulatedCost_6426ad')}</th>
                  <th>{adminT('admin.standalone.simulatedEarned_2ec5f3')}</th>
                  <th>{adminT('admin.standalone.simulatedMargin_4ee579')}</th>
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
        <h4>{adminT('admin.standalone.versionHistoryWhoChangedWhatWhen_bb0a19')}</h4>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{adminT('admin.standalone.version_2da600')}</th>
              <th>{adminT('admin.standalone.active_a733b8')}</th>
              <th>{adminT('admin.standalone.effectiveFrom_ede7a1')}</th>
              <th>{adminT('admin.standalone.effectiveTo_07f1b2')}</th>
              <th>{adminT('admin.standalone.sourceDate_1356ae')}</th>
              <th>{adminT('admin.standalone.author_5fda23')}</th>
              <th>{adminT('admin.standalone.created_accf40')}</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((entry) => (
              <tr key={entry.version}>
                <td>v{entry.version}</td>
                <td>{entry.active ? adminT('admin.standalone.activeDot') : '—'}</td>
                <td>{formatDateTime(entry.effectiveFrom)}</td>
                <td>{entry.effectiveTo ? formatDateTime(entry.effectiveTo) : '—'}</td>
                <td>{entry.sourceDate ?? '—'}</td>
                <td>{entry.createdByEmail ?? adminT('admin.standalone.seedAuthor')}</td>
                <td>{formatDateTime(entry.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-panel-block">
        <h4>{adminT('admin.standalone.recentAgentCallsAdminOnlyLog_070d7a')}</h4>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{adminT('admin.standalone.when_769bb1')}</th>
              <th>{adminT('admin.standalone.mode_a7b93d')}</th>
              <th>{adminT('admin.standalone.line_ea9676')}</th>
              <th>{adminT('admin.standalone.modelReal_2f22cd')}</th>
              <th>{adminT('admin.standalone.tokensInOut_9a5fc7')}</th>
              <th>{adminT('admin.standalone.cost_64ae43')}</th>
              <th>{adminT('admin.standalone.credits_bfac50')}</th>
              <th>{adminT('admin.standalone.margin_792fe4')}</th>
              <th>{adminT('admin.standalone.escalated_aff666')}</th>
              <th>{adminT('admin.standalone.card_4d4ce7')}</th>
            </tr>
          </thead>
          <tbody>
            {(calls ?? []).map((call) => (
              <tr key={call.id}>
                <td>{formatDateTime(call.createdAt)}</td>
                <td>
                  {call.mode}
                  {call.turbo ? adminT('admin.standalone.turboSuffix') : ''}
                  {call.highEffort ? adminT('admin.standalone.highEffortSuffix') : ''}
                </td>
                <td>{call.lineKey}</td>
                <td>
                  {call.provider}/{call.model}
                  {!call.billedToUser ? adminT('admin.standalone.unbilledSuffix') : ''}
                </td>
                <td>
                  {call.tokensIn.toLocaleString(adminLocale())} / {call.tokensOut.toLocaleString(adminLocale())}
                </td>
                <td>{formatCents(call.costMillicents / 1000)}</td>
                <td>{formatCents(call.creditCents)}</td>
                <td style={marginTone(call.marginMillicents < 0 ? -1 : 1)}>
                  {formatCents(call.marginMillicents / 1000)}
                </td>
                <td>{call.escalated ? adminT('admin.standalone.yes') : adminT('admin.standalone.no')}</td>
                <td>v{call.routingCardVersion}</td>
              </tr>
            ))}
            {calls && calls.length === 0 ? (
              <tr>
                <td colSpan={10}>{adminT('admin.standalone.noRoutedCallsYet_ceff6f')}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
