import { appPublicEnglish } from './app-public-copy.js';

export type ProjectCheckpointLease = Readonly<{
  checkpointId: string;
  barrierId: string;
  ownerToken: string;
  fence: number;
  expiresAt: string;
}>;

export interface ProjectCheckpointLeaseStore {
  renewProjectCheckpointBarrier(input: {
    checkpointId: string;
    ownerToken: string;
    fence: number;
    ttlSeconds: number;
  }): Promise<string | undefined>;
  assertProjectCheckpointBarrier(input: { checkpointId: string; ownerToken: string; fence: number }): Promise<void>;
}

export class ProjectCheckpointLeaseLostError extends Error {
  readonly code = 'CHECKPOINT_BARRIER_LOST';
  readonly statusCode = 409;

  constructor() {
    super('CHECKPOINT_BARRIER_LOST');
    this.name = 'ProjectCheckpointLeaseLostError';
  }
}

/**
 * Heartbeats a durable project write barrier and turns every renewal error into
 * a one-way LOST state. Once lost, `guard()` can never become healthy again and
 * the orchestrator must perform no further tree mutation or finalization.
 */
export class ProjectCheckpointLeaseManager {
  private _timer: ReturnType<typeof setTimeout> | undefined;
  private _renewal: Promise<void> | undefined;
  private _stopped = false;
  private _lost = false;

  constructor(
    private readonly _store: ProjectCheckpointLeaseStore,
    readonly lease: ProjectCheckpointLease,
    private readonly _ttlSeconds: number,
    private readonly _renewIntervalMs: number,
  ) {
    if (_ttlSeconds <= 0 || _renewIntervalMs <= 0 || _renewIntervalMs >= _ttlSeconds * 1000) {
      throw new Error(appPublicEnglish('CHECKPOINT_LEASE_CONFIGURATION_INVALID'));
    }
  }

  start(): void {
    if (this._stopped || this._timer) {
      return;
    }

    this._schedule();
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
    const renewed = await this._store.renewProjectCheckpointBarrier({
      checkpointId: this.lease.checkpointId,
      ownerToken: this.lease.ownerToken,
      fence: this.lease.fence,
      ttlSeconds: this._ttlSeconds,
    });

    if (!renewed) {
      this._lost = true;
    }
  }

  async guard(): Promise<void> {
    if (this._lost || this._stopped) {
      throw new ProjectCheckpointLeaseLostError();
    }

    try {
      await this._store.assertProjectCheckpointBarrier({
        checkpointId: this.lease.checkpointId,
        ownerToken: this.lease.ownerToken,
        fence: this.lease.fence,
      });
    } catch {
      this._lost = true;
      throw new ProjectCheckpointLeaseLostError();
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
