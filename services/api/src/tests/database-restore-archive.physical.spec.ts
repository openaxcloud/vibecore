import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { verifyPostgresBaseBackup } from '../database-restore-archive.js';
const execute = promisify(execFile);
const container = process.env.RESTORE_PHYSICAL_CONTAINER;
const run = container ? describe : describe.skip;
run('archive verifier with real PG tools in existing synthetic container', () => {
  it('verifies real bytes, rejects tampering, then completes WAL recovery and restart', async () => {
    if (container !== 'vibecore-ux-20261021-pg')
      throw new Error('Only the existing dedicated synthetic container is permitted');
    const runner = `/tmp/vibecore-archive-recipe-${randomUUID()}.sh`;
    const script = await readFile(
      new URL('../../../../scripts/qa/database-restore-existing-postgres.sh', import.meta.url),
      'utf8',
    );
    const command = async (args: string[]) =>
      (
        await execute('docker', ['exec', '--user', 'postgres', container, ...args], {
          timeout: 30000,
          maxBuffer: 8 * 1024 * 1024,
        })
      ).stdout;
    let child: ReturnType<typeof spawn> | undefined;
    let exited: Promise<number | null> | undefined;
    try {
      const writer = spawn('docker', ['exec', '--user', 'postgres', '-i', container, 'tee', runner], {
        stdio: ['pipe', 'ignore', 'ignore'],
      });
      const written = new Promise<number | null>((resolve, reject) => {
        writer.once('close', resolve);
        writer.once('error', reject);
      });
      writer.stdin.on('error', () => undefined);
      writer.stdin.end(script);
      expect(await written).toBe(0);
      const running = spawn(
        'docker',
        [
          'exec',
          '--user',
          'postgres',
          '-e',
          'VIBECORE_SYNTHETIC_PHYSICAL_RESTORE=1',
          '-e',
          'VIBECORE_ARCHIVE_HANDSHAKE=1',
          '-i',
          container,
          'bash',
          runner,
        ],
        { stdio: ['pipe', 'pipe', 'ignore'] },
      );
      child = running;
      running.stdin.on('error', () => undefined);
      let output = '';
      running.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      exited = new Promise<number | null>((resolve, reject) => {
        running.once('close', resolve);
        running.once('error', reject);
      });
      const ready = new Promise<any>((resolve, reject) => {
        running.stdout.on('data', () => {
          for (const line of output.split('\n')) {
            if (!line.startsWith('{')) continue;
            try {
              const record = JSON.parse(line);
              if (record.archiveReady) resolve(record);
            } catch {
              /* incomplete chunk */
            }
          }
        });
        running.once('close', () => reject(new Error('Physical recipe ended before archive readiness')));
        running.once('error', reject);
      });
      const archive = await ready;
      if (!/^\/tmp\/vibecore-restore-physical\.[A-Za-z0-9]+$/.test(archive.root))
        throw new Error('Unexpected fixture root');
      const backup = `${archive.root}/backup`;
      const tools = {
        readManifest: async () => Buffer.from(await command(['base64', '-w0', `${backup}/backup_manifest`]), 'base64'),
        verifyBackup: async () => {
          await command(['/usr/lib/postgresql/16/bin/pg_verifybackup', backup]);
        },
        readControlData: () => command(['env', 'LC_ALL=C', '/usr/lib/postgresql/16/bin/pg_controldata', backup]),
      };
      expect(await verifyPostgresBaseBackup(tools, archive)).toMatchObject({
        baseBackupVerified: true,
        pitrCoverageVerified: false,
      });
      await expect(verifyPostgresBaseBackup(tools, { ...archive, systemIdentifier: '1' })).rejects.toMatchObject({
        code: 'RESTORE_ARCHIVE_SYSTEM_MISMATCH',
      });
      await command(['sh', '-c', 'printf "00\\n" > "$1"', 'fixture', `${backup}/PG_VERSION`]);
      await expect(verifyPostgresBaseBackup(tools, archive)).rejects.toMatchObject({
        code: 'RESTORE_ARCHIVE_VERIFICATION_FAILED',
      });
      await command(['sh', '-c', 'printf "16\\n" > "$1"', 'fixture', `${backup}/PG_VERSION`]);
      expect((await verifyPostgresBaseBackup(tools, archive)).baseBackupVerified).toBe(true);
      running.stdin.end('continue\n');
      expect(await exited).toBe(0);
      const final = output
        .split('\n')
        .filter((line) => line.startsWith('{'))
        .map((line) => JSON.parse(line))
        .find((record) => record.targetRestartVerified);
      expect(final).toMatchObject({
        physicalBackupVerified: true,
        walRecoveryVerified: true,
        postTargetWriteExcluded: true,
        targetRestartVerified: true,
        networkListeners: false,
      });
      expect(
        (
          await command(['find', '/tmp', '-maxdepth', '1', '-type', 'd', '-name', archive.root.split('/').at(-1)!])
        ).trim(),
      ).toBe('');
    } finally {
      if (child?.stdin && !child.stdin.destroyed) child.stdin.end('continue\n');
      await exited?.catch(() => undefined); // Owned script always traps cleanup; handshake also expires after 30s.
      await command(['rm', '--', runner]);
    }
  });
});
