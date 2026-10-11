import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';

test('extinction automatique : préserve son parent et termine le nettoyage', () => {
  const source = readFileSync(new URL('./pile-locale.sh', import.meta.url), 'utf8');
  const start = source.indexOf('descendre() {');
  const end = source.indexOf('\n}\n', start);
  assert.ok(start >= 0 && end > start, 'fonction réelle trouvée');

  const directory = mkdtempSync(join(tmpdir(), 'vibecore-extinction-'));
  const state = join(directory, 'state');
  const calls = join(directory, 'calls');
  const lock = join(directory, 'lock');

  try {
    writeFileSync(lock, '#!/bin/bash\nprintf "lock:%s\\n" "$1" >> "$CALLS"\n', { mode: 0o700 });

    const stdout = execFileSync(
      'bash',
      [
        '-c',
        `
      set -u
      kill() { printf 'kill:%s\\n' "$*" >> "$CALLS"; }
      pkill() { printf 'pkill:%s\\n' "$*" >> "$CALLS"; }
      lsof() { return 0; }
      docker() { return 0; }
      printf 'pid=%s\\npid=424242\\norb=oui\\n' "$PPID" > "$ETAT"
      ${source.slice(start, end + 2)}
      descendre
    `,
      ],
      {
        env: { ...process.env, APP: directory, ETAT: state, CALLS: calls, VERROU_ORB: lock, COMPOSE: 'true' },
        encoding: 'utf8',
      },
    );

    const recorded = readFileSync(calls, 'utf8').trim().split('\n');
    assert.deepEqual(recorded, ['pkill:-P 424242', 'kill:424242', 'lock:rendre']);
    assert.equal(existsSync(state), false, 'état supprimé après restitution du verrou');
    assert.match(stdout, /reste : 0 port\(s\), 0 conteneur\(s\)/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
