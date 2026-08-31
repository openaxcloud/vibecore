import type { RollbackLeaseFence } from './store.js';

export interface RollbackOperationLeaseStore {
  renewRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
    leaseDurationMs: number;
  }): Promise<string | undefined>;
  validateRollbackOperationLease(input: {
    operationId: string;
    ownerToken: string;
    fencingToken: number;
  }): Promise<boolean>;
}

export class RollbackOperationLeaseLostError extends Error {
  readonly code = 'ROLLBACK_OWNERSHIP_LOST';
  readonly statusCode = 409;

  constructor() {
    super('ROLLBACK_OWNERSHIP_LOST');
    this.name = 'RollbackOperationLeaseLostError';
  }
}

/**
 * Heartbeats one durable rollback executor. Ownership loss is one-way: after a
 * failed renewal or validation, the caller must not mutate a deployment,
 * publish a ReleaseManifest, clean a workload, or persist an HTTP response.
 */
export class RollbackOperationLeaseManager {
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _renewal: Promise<void> | undefined;
  private _stopped = false;
  private _lost = false;
  private readonly _authorityAbort = new AbortController();

  readonly signal = this._authorityAbort.signal;

  constructor(
    private readonly _store: RollbackOperationLeaseStore,
    readonly fence: Omit<RollbackLeaseFence, 'expectedHeadVersion'>,
    private readonly _leaseDurationMs: number,
    private readonly _renewIntervalMs: number,
  ) {
    if (
      !Number.isFinite(_leaseDurationMs) ||
      !Number.isFinite(_renewIntervalMs) ||
      _leaseDurationMs < 1_000 ||
      _leaseDurationMs > 30 * 60_000 ||
      _renewIntervalMs < 1 ||
      _renewIntervalMs >= _leaseDurationMs
    ) {
      throw new TypeError('INVALID_ROLLBACK_LEASE_CONFIGURATION');
    }
  }

  start(): void {
    if (!this._stopped && !this._timer && !this._lost) {
      this._schedule();
    }
  }

  private _schedule(): void {
    this._timer = setTimeout(() => {
      this._timer = undefined;
      this._renewal = this._renew()
        .catch(() => {
          this._lost = true;
          if (!this.signal.aborted) this._authorityAbort.abort(new RollbackOperationLeaseLostError());
        })
        .finally(() => {
          this._renewal = undefined;

          if (!this._stopped && !this._lost) {
            this._schedule();
          }
        });
    }, this._renewIntervalMs);
    this._timer.unref?.();
  }

  private async _renew(): Promise<void> {
    const expiresAt = await this._store.renewRollbackOperationLease({
      ...this.fence,
      leaseDurationMs: this._leaseDurationMs,
    });

    if (!expiresAt) {
      this._lost = true;
      if (!this.signal.aborted) this._authorityAbort.abort(new RollbackOperationLeaseLostError());
    }
  }

  async guard(): Promise<void> {
    if (this._lost || this._stopped) {
      throw new RollbackOperationLeaseLostError();
    }

    const valid = await this._store.validateRollbackOperationLease(this.fence).catch(() => false);

    if (!valid) {
      this._lost = true;
      if (!this.signal.aborted) this._authorityAbort.abort(new RollbackOperationLeaseLostError());
      throw new RollbackOperationLeaseLostError();
    }
  }

  async stop(): Promise<void> {
    this._stopped = true;
    if (!this.signal.aborted) this._authorityAbort.abort(new Error('ROLLBACK_OPERATION_LEASE_STOPPED'));

    if (this._timer) {
      clearTimeout(this._timer);
    }

    this._timer = undefined;
    await this._renewal?.catch(() => undefined);
  }

  isLost(): boolean {
    return this._lost;
  }
}
