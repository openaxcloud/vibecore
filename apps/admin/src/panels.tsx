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

/**
 * Registry of section-id → custom panel. main.tsx renders the panel in place of
 * the generic table when an entry exists. Populated one Batch-F point at a time.
 */
export const CUSTOM_PANELS: Record<string, React.ComponentType<PanelProps>> = {
  'credit-wallets': CreditWalletsPanel,
};
