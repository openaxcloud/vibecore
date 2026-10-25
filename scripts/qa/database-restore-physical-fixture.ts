/**
 * Physical PostgreSQL 16 QA fixture. Uses a locally cached image, dedicated
 * containers/volumes and synthetic data only. Never connects to shared QA or
 * production. All owned resources are removed by close().
 */
import assert from 'node:assert/strict';
import { verifyPostgresBaseBackup } from '../../services/api/src/database-restore-archive.js';
import { execFile, fork, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';

const execute = promisify(execFile);
const postgresImage = 'sha256:9b05db12a35460fff0587e009f9326e414a53e9484555547f96d214a2ba98ef7';
const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const expectedRows = [
  { id: 'base', value: 'before physical backup' },
  { id: 'target', value: 'included in requested recovery point' },
];
type AppResult = {
  acceptingRequests?: boolean;
  previousPoolClosed?: boolean;
  newConnection?: boolean;
  backendPid?: number;
  systemIdentifier?: string;
  bindingVersion?: number;
};

export class PhysicalRestoreFixture {
  readonly name = `vc-restore-qa-${randomBytes(6).toString('hex')}`;
  readonly sourceName = `${this.name}-source`;
  readonly targetName = `${this.name}-target`;
  readonly volumes = ['source', 'archive', 'backup', 'target'].map((name) => `${this.name}-${name}`);
  readonly evidence: Record<string, unknown> = {
    scope: 'isolated local PostgreSQL physical backup and WAL',
    production: false,
  };
  targetTimestamp = '';
  sourceUri = '';
  targetUri = '';
  manifestSha256 = '';
  sourceSystemIdentifier = '';
  readonly expectedReadbackSha256 = createHash('sha256').update(JSON.stringify(expectedRows)).digest('hex');
  private restoredTargetId = this.targetName;
  private readonly password = randomBytes(32).toString('hex');
  private directory = '';
  private app: ChildProcess | undefined;
  private appUrl = '';
  private commandId = 0;
  private targetStarted = false;
  private closing = false;
  private preparing = 0;
  private readonly commands = new Map<
    number,
    { resolve: (value: AppResult) => void; reject: (reason: Error) => void }
  >();

  private async docker(args: string[]): Promise<string> {
    try {
      return (await execute('docker', args, { timeout: 120_000, maxBuffer: 1024 * 1024 })).stdout.trim();
    } catch {
      // Docker output can contain environment values; keep errors structural.
      throw new Error(`Local QA docker ${args[0]} failed`);
    }
  }

  private pgExec(args: string[]): Promise<string> {
    return this.docker(['exec', '--user', 'postgres', this.sourceName, ...args]);
  }

  private async connectionUri(container: string): Promise<string> {
    const port = await this.docker(['port', container, '5432/tcp']);
    assert.match(port, /^127\.0\.0\.1:\d+$/);
    return `postgresql://postgres:${this.password}@${port}/postgres`;
  }

  private async availableLoopbackPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    // Docker must bind this explicit port or fail. An automatically assigned
    // port can change on restart and invalidate the persisted connection URI.
    return address.port;
  }

  private async query<T extends Record<string, unknown>>(uri: string, sql: string): Promise<T[]> {
    assert.equal(new URL(uri).hostname, '127.0.0.1');
    const client = new Client({ connectionString: uri, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      return (await client.query<T>(sql)).rows;
    } finally {
      await client.end();
    }
  }

  private async waitForDatabase(uri: string, requirePrimary = false): Promise<void> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const state = await this.query<{ recovering: boolean }>(uri, 'SELECT pg_is_in_recovery() AS recovering');
        // Hot standby can answer SELECT before recovery_target_action=promote
        // finishes. A usable restored target must have left recovery.
        if (!requirePrimary || state[0]?.recovering === false) return;
      } catch {
        // Startup and promotion remain inside the same bounded readiness wait.
      }
      await delay(250);
    }
    throw new Error('Isolated QA PostgreSQL did not become ready');
  }

  async initialize(): Promise<void> {
    const started = Date.now();
    assert.equal(await this.docker(['image', 'inspect', postgresImage, '--format', '{{.Id}}']), postgresImage);
    this.directory = await mkdtemp(join(tmpdir(), 'vibecore-physical-restore-'));
    const environmentFile = join(this.directory, 'postgres.env');
    await writeFile(environmentFile, `POSTGRES_PASSWORD=${this.password}\n`, { mode: 0o600 });
    for (const volume of this.volumes)
      await this.docker(['volume', 'create', '--label', `vibecore.qa=${this.name}`, volume]);
    await this.docker([
      'run',
      '--detach',
      '--pull=never',
      '--name',
      this.sourceName,
      '--label',
      `vibecore.qa=${this.name}`,
      '--memory=512m',
      '--cpus=1',
      '--publish',
      '127.0.0.1::5432',
      '--env-file',
      environmentFile,
      '--mount',
      `type=volume,source=${this.volumes[0]},target=/var/lib/postgresql/data`,
      '--mount',
      `type=volume,source=${this.volumes[1]},target=/archive`,
      '--mount',
      `type=volume,source=${this.volumes[2]},target=/backup`,
      '--mount',
      `type=volume,source=${this.volumes[3]},target=/target`,
      postgresImage,
      'postgres',
      '-c',
      'wal_level=replica',
      '-c',
      'archive_mode=on',
      '-c',
      'archive_command=if test -f /archive/%f; then cmp -s %p /archive/%f; else cp %p /archive/%f; fi',
    ]);
    await this.docker([
      'exec',
      '--user',
      'root',
      this.sourceName,
      'chown',
      '999:999',
      '/archive',
      '/backup',
      '/target',
    ]);
    this.sourceUri = await this.connectionUri(this.sourceName);
    await this.waitForDatabase(this.sourceUri);
    await this.query(
      this.sourceUri,
      "CREATE TABLE restore_probe (id text PRIMARY KEY, value text NOT NULL); INSERT INTO restore_probe VALUES ('base', 'before physical backup')",
    );
    const identity = await this.query<{ system_identifier: string }>(
      this.sourceUri,
      'SELECT system_identifier::text FROM pg_control_system()',
    );
    this.sourceSystemIdentifier = identity[0]!.system_identifier;
    await this.pgExec([
      'pg_basebackup',
      '-U',
      'postgres',
      '-D',
      '/backup',
      '-Fp',
      '-X',
      'stream',
      '--checkpoint=fast',
      '--manifest-checksums=SHA256',
    ]);
    await this.pgExec(['/usr/lib/postgresql/16/bin/pg_verifybackup', '/backup']);
    this.manifestSha256 = (await this.pgExec(['sha256sum', '/backup/backup_manifest'])).split(/\s+/)[0]!;
    assert.match(this.manifestSha256, /^[a-f0-9]{64}$/);
    await this.query(
      this.sourceUri,
      "INSERT INTO restore_probe VALUES ('target', 'included in requested recovery point')",
    );
    const timestamp = await this.query<{ target: string }>(
      this.sourceUri,
      "SELECT (date_trunc('milliseconds', clock_timestamp()) + interval '1 second')::text AS target",
    );
    // Prisma's timestamp precision is milliseconds. Put the target strictly
    // between committed writes instead of truncating onto the first commit.
    this.targetTimestamp = new Date(timestamp[0]!.target).toISOString();
    await delay(1100);
    // Commit the excluded write before closing its WAL segment. Recovery needs
    // the commit record after the target time to know where it must stop.
    await this.query(this.sourceUri, "INSERT INTO restore_probe VALUES ('post', 'must not survive recovery')");
    await this.query(this.sourceUri, 'SELECT pg_switch_wal()');
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const archived = await this.query<{ pending: string }>(
        this.sourceUri,
        "SELECT count(*)::text AS pending FROM pg_ls_dir('pg_wal/archive_status') f WHERE f LIKE '%.ready'",
      );
      if (archived[0]?.pending === '0') break;
      await delay(100);
    }
    const archived = await this.query<{ pending: string }>(
      this.sourceUri,
      "SELECT count(*)::text AS pending FROM pg_ls_dir('pg_wal/archive_status') f WHERE f LIKE '%.ready'",
    );
    assert.equal(archived[0]?.pending, '0');
    this.evidence.initializeMilliseconds = Date.now() - started;
    this.evidence.physicalBackupVerified = true;
    this.evidence.archivedWalPending = 0;
    this.evidence.targetTimestamp = this.targetTimestamp;
    this.evidence.manifestSha256 = this.manifestSha256;
    await this.startApplication();
  }

  async verifyArchive(): Promise<void> {
    const verified = await verifyPostgresBaseBackup(
      {
        readManifest: async () =>
          Buffer.from(await this.pgExec(['base64', '-w0', '/backup/backup_manifest']), 'base64'),
        verifyBackup: async () => {
          await this.pgExec(['/usr/lib/postgresql/16/bin/pg_verifybackup', '/backup']);
        },
        readControlData: () => this.pgExec(['env', 'LC_ALL=C', '/usr/lib/postgresql/16/bin/pg_controldata', '/backup']),
      },
      { manifestSha256: this.manifestSha256, systemIdentifier: this.sourceSystemIdentifier },
    );
    assert.equal(verified.baseBackupVerified, true);
    this.evidence.archiveSourceIdentityVerified = true;
  }

  async proveTamperDetection(): Promise<void> {
    const original = await this.pgExec(['cat', '/backup/PG_VERSION']);
    assert.equal(original, '16');
    await this.pgExec(['sh', '-c', "printf '00\\n' > /backup/PG_VERSION"]);
    let rejected = false;
    try {
      await this.verifyArchive();
    } catch {
      rejected = true;
    } finally {
      await this.pgExec(['sh', '-c', "printf '16\\n' > /backup/PG_VERSION"]);
    }
    assert.equal(rejected, true);
    await this.verifyArchive();
    this.evidence.tamperedArchiveRejected = rejected;
  }

  async prepareTarget(
    targetId = this.targetName,
  ): Promise<{ targetId: string; connectionUri: string; systemIdentifier: string }> {
    assert.equal(this.closing, false);
    this.preparing += 1;
    try {
      return await this.prepareTargetOnce(targetId);
    } finally {
      this.preparing -= 1;
    }
  }

  private async prepareTargetOnce(
    targetId: string,
  ): Promise<{ targetId: string; connectionUri: string; systemIdentifier: string }> {
    if (this.targetStarted) assert.equal(targetId, this.restoredTargetId);
    this.restoredTargetId = targetId;
    if (!this.targetStarted) {
      await this.verifyArchive();
      assert.match(this.targetTimestamp, /^\d{4}-\d\d-\d\dT[\d:.]+Z$/);
      await this.pgExec(['sh', '-c', 'cp -a /backup/. /target/']);
      const configuration =
        [
          "restore_command = 'cp /archive/%f %p'",
          `recovery_target_time = '${this.targetTimestamp.replace('T', ' ').replace('Z', '+00')}'`,
          "recovery_target_action = 'promote'",
          'archive_mode = off',
        ].join('\n') + '\n';
      await this.pgExec([
        'sh',
        '-c',
        'printf "%s" "$1" >> /target/postgresql.auto.conf; touch /target/recovery.signal; chmod 700 /target',
        'qa-config',
        configuration,
      ]);
      const targetPort = await this.availableLoopbackPort();
      await this.docker([
        'run',
        '--detach',
        '--pull=never',
        '--name',
        this.targetName,
        '--label',
        `vibecore.qa=${this.name}`,
        '--memory=512m',
        '--cpus=1',
        '--publish',
        `127.0.0.1:${targetPort}:5432`,
        '--mount',
        `type=volume,source=${this.volumes[3]},target=/var/lib/postgresql/data`,
        '--mount',
        `type=volume,source=${this.volumes[1]},target=/archive,readonly`,
        postgresImage,
      ]);
      this.targetUri = await this.connectionUri(this.targetName);
      assert.equal(new URL(this.targetUri).port, String(targetPort));
      this.targetStarted = true;
    }
    await this.waitForDatabase(this.targetUri, true);
    const actual = await this.query<{ id: string; value: string }>(
      this.targetUri,
      'SELECT id, value FROM restore_probe ORDER BY id',
    );
    assert.deepEqual(actual, expectedRows);
    const identity = await this.query<{ system_identifier: string; recovering: boolean }>(
      this.targetUri,
      'SELECT system_identifier::text, pg_is_in_recovery() AS recovering FROM pg_control_system()',
    );
    assert.equal(identity[0]!.system_identifier, this.sourceSystemIdentifier);
    assert.equal(identity[0]!.recovering, false);
    this.evidence.recoveredRows = actual;
    this.evidence.promotedTarget = true;
    this.evidence.targetResource = { targetId, container: this.targetName };
    return { targetId, connectionUri: this.targetUri, systemIdentifier: identity[0]!.system_identifier };
  }

  private async startApplication(): Promise<void> {
    this.app = fork(fileURLToPath(new URL('./database-restore-qa-app.ts', import.meta.url)), {
      execArgv: ['--import', 'tsx'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { PATH: process.env.PATH, NODE_ENV: 'test' },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('QA application startup timed out')), 15_000);
      this.app!.once('exit', () => reject(new Error('QA application exited before startup')));
      this.app!.on(
        'message',
        (message: { ready?: boolean; port?: number; id?: number; result?: AppResult; error?: string }) => {
          if (message.ready && message.port) {
            clearTimeout(timer);
            this.appUrl = `http://127.0.0.1:${message.port}`;
            resolve();
          } else if (message.id !== undefined) {
            const command = this.commands.get(message.id);
            this.commands.delete(message.id);
            if (message.error) command?.reject(new Error(message.error));
            else command?.resolve(message.result ?? {});
          }
        },
      );
    });
    await this.appCommand({ action: 'connect', connectionUri: this.sourceUri, bindingVersion: 0, activate: true });
    const before = (await (await fetch(`${this.appUrl}/value`)).json()) as { rows: Array<{ id: string }> };
    assert.equal(
      before.rows.some((row) => row.id === 'post'),
      true,
    );
    this.evidence.originalApplicationSeesPostTargetWrite = true;
  }

  private appCommand(command: Record<string, unknown>): Promise<AppResult> {
    const id = ++this.commandId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.commands.delete(id);
        reject(new Error('QA application command timed out'));
      }, 15_000);
      this.commands.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.app!.send({ ...command, id });
    });
  }

  async quiesceApplication(): Promise<{ receiptId: string }> {
    const result = await this.appCommand({ action: 'quiesce' });
    assert.equal(result.previousPoolClosed, true);
    const response = await fetch(`${this.appUrl}/value`);
    assert.equal(response.status, 503);
    this.evidence.quiescedApplicationHttpStatus = response.status;
    return { receiptId: `${this.name}-quiesced` };
  }

  async reconnectAndReadback(bindingVersion: number): Promise<{
    receiptId: string;
    targetId: string;
    bindingVersion: number;
    previousPoolClosed: true;
    newConnection: true;
    readbackVerified: true;
    observedReadbackSha256: string;
  }> {
    const result = await this.appCommand({
      action: 'connect',
      connectionUri: this.targetUri,
      bindingVersion,
      targetId: this.restoredTargetId,
      systemIdentifier: this.sourceSystemIdentifier,
      expectedReadbackSha256: this.expectedReadbackSha256,
    });
    assert.equal(result.previousPoolClosed, true);
    assert.equal(result.newConnection, true);
    assert.equal(result.systemIdentifier, this.sourceSystemIdentifier);
    const response = await fetch(`${this.appUrl}/restore-readback`);
    assert.equal(response.status, 200);
    const actual = (await response.json()) as { observedReadbackSha256: string; bindingVersion: number };
    assert.equal(actual.observedReadbackSha256, this.expectedReadbackSha256);
    assert.equal(actual.bindingVersion, bindingVersion);
    assert.equal((await fetch(`${this.appUrl}/value`)).status, 503);
    this.evidence.applicationReadback = actual;
    this.evidence.previousPoolClosed = result.previousPoolClosed;
    this.evidence.newConnection = result.newConnection;
    return {
      receiptId: `${this.name}-readback`,
      targetId: this.restoredTargetId,
      bindingVersion,
      previousPoolClosed: true,
      newConnection: true,
      readbackVerified: true,
      observedReadbackSha256: actual.observedReadbackSha256,
    };
  }

  async releaseApplication(bindingVersion: number): Promise<void> {
    const result = await this.appCommand({ action: 'release', bindingVersion });
    assert.equal(result.acceptingRequests, true);
    const response = await fetch(`${this.appUrl}/value`);
    assert.equal(response.status, 200);
    const actual = (await response.json()) as { rows: unknown; bindingVersion: number };
    assert.deepEqual(actual.rows, expectedRows);
    assert.equal(actual.bindingVersion, bindingVersion);
    this.evidence.releasedApplicationHttpStatus = response.status;
  }

  async verifyDurableTarget(): Promise<void> {
    await this.appCommand({ action: 'suspend' });
    await this.docker(['restart', this.targetName]);
    assert.equal(await this.connectionUri(this.targetName), this.targetUri);
    this.evidence.targetEndpointUnchangedAfterRestart = true;
    await this.waitForDatabase(this.targetUri, true);
    const actual = await this.query(this.targetUri, 'SELECT id, value FROM restore_probe ORDER BY id');
    assert.deepEqual(actual, expectedRows);
    this.evidence.targetSurvivesContainerRestart = true;
  }

  async createControlDatabase(): Promise<string> {
    // This database is created after the recovery point. It is isolated from
    // the application database and contains only the drill's control records.
    await this.query(this.sourceUri, 'CREATE DATABASE restore_control');
    const uri = new URL(this.sourceUri);
    uri.pathname = '/restore_control';
    return uri.toString();
  }

  async close(): Promise<void> {
    this.closing = true;
    // A failed HTTP assertion can occur while the API's durable task is still
    // preparing its target. Drain that owned operation before removing it.
    while (this.preparing > 0) await delay(100);
    if (this.app && this.app.connected) {
      try {
        await this.appCommand({ action: 'stop' });
      } catch {
        this.app.kill('SIGTERM');
      }
    }
    for (const name of [this.targetName, this.sourceName]) {
      try {
        await this.docker(['rm', '--force', name]);
      } catch {
        /* May not have been created. */
      }
    }
    for (const volume of this.volumes) {
      try {
        await this.docker(['volume', 'rm', volume]);
      } catch {
        /* Cleanup status checked below. */
      }
    }
    const containers = await this.docker([
      'ps',
      '--all',
      '--filter',
      `label=vibecore.qa=${this.name}`,
      '--format',
      '{{.Names}}',
    ]);
    const volumes = await this.docker([
      'volume',
      'ls',
      '--filter',
      `label=vibecore.qa=${this.name}`,
      '--format',
      '{{.Name}}',
    ]);
    assert.equal(containers, '');
    assert.equal(volumes, '');
    if (this.directory) await rm(this.directory, { recursive: true, force: true });
    this.evidence.ownedResourcesRemoved = true;
  }
}
