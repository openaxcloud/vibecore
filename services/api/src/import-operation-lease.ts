export type ImportOperationState = 'COMMITTING' | 'CLEANUP_PENDING';

export interface ImportOperationLeaseStore {
  renewImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
    leaseDurationMs: number;
  }): Promise<unknown | undefined>;
  validateImportJobLease(input: {
    id: string;
    organizationId: string;
    operationToken: string;
    expectedStates: string[];
  }): Promise<boolean>;
}

export class ImportOperationLeaseLostError extends Error {
  readonly statusCode = 409;

  constructor(readonly code: 'IMPORT_COMMIT_OWNERSHIP_LOST' | 'IMPORT_CLEANUP_OWNERSHIP_LOST') {
    super(code);
    this.name = 'ImportOperationLeaseLostError';
  }
}

/**
 * Heartbeats an import's durable fencing token. Renewal or validation failure
 * is one-way: after LOST, no storage mutation or state finalization may run.
 */
export class ImportOperationLeaseManager {
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _renewal: Promise<void> | undefined;
  private _stopped = false;
  private _lost = false;

  constructor(
    private readonly _store: ImportOperationLeaseStore,
    private readonly _lease: {
      id: string;
      organizationId: string;
      operationToken: string;
      state: ImportOperationState;
    },
    private readonly _leaseDurationMs: number,
    private readonly _renewIntervalMs: number,
    private readonly _errorCode: 'IMPORT_COMMIT_OWNERSHIP_LOST' | 'IMPORT_CLEANUP_OWNERSHIP_LOST',
  ) {
    if (
      !Number.isFinite(_leaseDurationMs) ||
      !Number.isFinite(_renewIntervalMs) ||
      _leaseDurationMs < 1_000 ||
      _renewIntervalMs < 1 ||
      _renewIntervalMs >= _leaseDurationMs
    ) {
      throw new TypeError('INVALID_IMPORT_LEASE_CONFIGURATION');
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
    const renewed = await this._store.renewImportJobLease({
      id: this._lease.id,
      organizationId: this._lease.organizationId,
      operationToken: this._lease.operationToken,
      expectedStates: [this._lease.state],
      leaseDurationMs: this._leaseDurationMs,
    });

    if (!renewed) {
      this._lost = true;
    }
  }

  async guard(): Promise<void> {
    if (this._lost || this._stopped) {
      throw new ImportOperationLeaseLostError(this._errorCode);
    }

    const valid = await this._store
      .validateImportJobLease({
        id: this._lease.id,
        organizationId: this._lease.organizationId,
        operationToken: this._lease.operationToken,
        expectedStates: [this._lease.state],
      })
      .catch(() => false);

    if (!valid) {
      this._lost = true;
      throw new ImportOperationLeaseLostError(this._errorCode);
    }
  }

  async stop(): Promise<void> {
    this._stopped = true;

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
