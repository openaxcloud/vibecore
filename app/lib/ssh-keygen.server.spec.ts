import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateSshKeyPair, type SshKeyType } from './ssh-keygen.server.js';

/** The base64 key body of an OpenSSH public key line (`<algo> <body> [comment]`). */
function keyBody(publicKeyLine: string): string {
  return publicKeyLine.split(' ')[1];
}

function hasSshKeygen(): boolean {
  try {
    execFileSync('ssh-keygen', ['-A', '-f', '/nonexistent-probe'], { stdio: 'ignore' });

    return true;
  } catch (error) {
    /*
     * Any spawn (ENOENT) failure means the binary is absent; a non-zero exit
     * from the probe still proves the binary exists.
     */
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

describe('generateSshKeyPair', () => {
  it('defaults to ed25519 and produces a well-formed public key + fingerprint', () => {
    const key = generateSshKeyPair();

    expect(key.type).toBe('ed25519');
    expect(key.publicKey.startsWith('ssh-ed25519 AAAA')).toBe(true);
    expect(key.fingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/);
    expect(key.privateKey).toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
  });

  it('generates an rsa key with a PKCS#1 PEM private key', () => {
    const key = generateSshKeyPair({ type: 'rsa', rsaModulusLength: 2048 });

    expect(key.type).toBe('rsa');
    expect(key.publicKey.startsWith('ssh-rsa AAAA')).toBe(true);
    expect(key.privateKey).toContain('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('appends a sanitized comment to the public key line', () => {
    const key = generateSshKeyPair({ comment: 'dev@example.com' });

    expect(key.publicKey.endsWith(' dev@example.com')).toBe(true);
  });

  it('produces distinct keys on each call', () => {
    expect(generateSshKeyPair().publicKey).not.toBe(generateSshKeyPair().publicKey);
  });

  /*
   * Interop: a real `ssh-keygen` must accept the private key, derive the same
   * public key from it, and report the same fingerprint we computed.
   */
  for (const type of ['ed25519', 'rsa'] as SshKeyType[]) {
    it(`interops with OpenSSH ssh-keygen (${type})`, () => {
      if (!hasSshKeygen()) {
        return; // environment without OpenSSH; structural assertions above still cover the format
      }

      const key = generateSshKeyPair({ type, comment: 'interop@vibecore', rsaModulusLength: 2048 });
      const dir = mkdtempSync(join(tmpdir(), 'vibecore-ssh-'));

      try {
        const privPath = join(dir, 'id');
        const pubPath = join(dir, 'id.pub');
        writeFileSync(privPath, key.privateKey, { mode: 0o600 });
        writeFileSync(pubPath, `${key.publicKey}\n`);

        // ssh-keygen derives the public key from the private key it just parsed.
        const derived = execFileSync('ssh-keygen', ['-y', '-f', privPath]).toString().trim();
        expect(keyBody(derived)).toBe(keyBody(key.publicKey));

        // ssh-keygen's own fingerprint of our public key must match ours.
        const fingerprintLine = execFileSync('ssh-keygen', ['-l', '-f', pubPath]).toString();
        expect(fingerprintLine).toContain(key.fingerprint);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
