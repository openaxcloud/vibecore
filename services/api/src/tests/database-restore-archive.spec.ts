import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPostgresBaseBackup, type PostgresArchiveTools } from '../database-restore-archive.js';

function fixture() {
  const bytes = Buffer.from(
    JSON.stringify({
      'PostgreSQL-Backup-Manifest-Version': 1,
      'WAL-Ranges': [{ Timeline: 1, 'Start-LSN': '0/100', 'End-LSN': '0/200' }],
    }),
  );
  const expected = {
    manifestSha256: createHash('sha256').update(bytes).digest('hex'),
    systemIdentifier: '1234567890123456789',
  };
  let verifies = 0;
  const tools: PostgresArchiveTools = {
    readManifest: async () => bytes,
    verifyBackup: async () => {
      verifies++;
    },
    readControlData: async () => `Database system identifier: ${expected.systemIdentifier}\n`,
  };
  return { bytes, expected, tools, verifies: () => verifies };
}
describe('physical base backup verification — controlled failures', () => {
  it('does not confuse consistency WAL with PITR coverage', async () => {
    const f = fixture();
    expect(await verifyPostgresBaseBackup(f.tools, f.expected)).toMatchObject({
      baseBackupVerified: true,
      pitrCoverageVerified: false,
      walRanges: [{ timeline: 1, startLsn: '0/100', endLsn: '0/200' }],
    });
    expect(f.verifies()).toBe(1);
  });
  it('rejects an unexpected manifest before executing verification', async () => {
    const f = fixture();
    await expect(
      verifyPostgresBaseBackup(f.tools, { ...f.expected, manifestSha256: 'b'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'RESTORE_ARCHIVE_MANIFEST_MISMATCH' });
    expect(f.verifies()).toBe(0);
  });
  it('rejects a different PostgreSQL system', async () => {
    const f = fixture();
    f.tools.readControlData = async () => 'Database system identifier: 2\n';
    await expect(verifyPostgresBaseBackup(f.tools, f.expected)).rejects.toMatchObject({
      code: 'RESTORE_ARCHIVE_SYSTEM_MISMATCH',
    });
  });
  it('rejects manifest drift after the command and does not disclose command diagnostics', async () => {
    const f = fixture();
    let calls = 0;
    f.tools.readManifest = async () => (++calls === 1 ? f.bytes : Buffer.from('changed'));
    await expect(verifyPostgresBaseBackup(f.tools, f.expected)).rejects.toMatchObject({
      code: 'RESTORE_ARCHIVE_MANIFEST_CHANGED',
    });
    const bad = fixture();
    bad.tools.verifyBackup = async () => {
      throw new Error('private provider diagnostic');
    };
    await expect(verifyPostgresBaseBackup(bad.tools, bad.expected)).rejects.toThrow(
      'RESTORE_ARCHIVE_VERIFICATION_FAILED',
    );
  });
  it('refuses an unsupported manifest version before invoking PostgreSQL tools', async () => {
    const f = fixture();
    const bytes = Buffer.from(JSON.stringify({ 'PostgreSQL-Backup-Manifest-Version': 2 }));
    f.tools.readManifest = async () => bytes;
    await expect(
      verifyPostgresBaseBackup(f.tools, {
        ...f.expected,
        manifestSha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_ARCHIVE_MANIFEST_UNSUPPORTED' });
    expect(f.verifies()).toBe(0);
  });
  it.each([
    { ranges: [] },
    { ranges: [{ Timeline: 0, 'Start-LSN': '0/100', 'End-LSN': '0/200' }] },
    { ranges: [{ Timeline: 0x100000000, 'Start-LSN': '0/100', 'End-LSN': '0/200' }] },
    { ranges: [{ Timeline: 1, 'Start-LSN': '0/200', 'End-LSN': '0/100' }] },
  ])('rejects invalid WAL ranges %#', async ({ ranges }) => {
    const f = fixture();
    const bytes = Buffer.from(JSON.stringify({ 'PostgreSQL-Backup-Manifest-Version': 1, 'WAL-Ranges': ranges }));
    f.tools.readManifest = async () => bytes;
    await expect(
      verifyPostgresBaseBackup(f.tools, {
        ...f.expected,
        manifestSha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    ).rejects.toMatchObject({ code: 'RESTORE_ARCHIVE_WAL_RANGE_INVALID' });
    expect(f.verifies()).toBe(0);
  });
});
