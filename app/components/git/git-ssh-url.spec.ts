import { describe, expect, it } from 'vitest';
import { isSshRemoteUrl, sshHostFromGitUrl } from './git-ssh-url';

describe('sshHostFromGitUrl', () => {
  it('extracts the host from scp-style and ssh:// URLs (case-insensitive, port-stripped)', () => {
    expect(sshHostFromGitUrl('git@github.com:owner/repo.git')).toBe('github.com');
    expect(sshHostFromGitUrl('ssh://git@Gitlab.Example.com/owner/repo.git')).toBe('gitlab.example.com');
    expect(sshHostFromGitUrl('ssh://host.example.com:2222/owner/repo.git')).toBe('host.example.com');
  });

  it('returns null for https/empty', () => {
    expect(sshHostFromGitUrl('https://github.com/owner/repo.git')).toBeNull();
    expect(sshHostFromGitUrl('')).toBeNull();
  });
});

describe('isSshRemoteUrl', () => {
  it('accepts scp-style and ssh:// URLs', () => {
    expect(isSshRemoteUrl('git@github.com:owner/repo.git')).toBe(true);
    expect(isSshRemoteUrl('ssh://git@host.example.com/owner/repo.git')).toBe(true);
  });

  it('rejects https, empty, and whitespace-bearing values', () => {
    expect(isSshRemoteUrl('https://github.com/owner/repo.git')).toBe(false);
    expect(isSshRemoteUrl('')).toBe(false);
    expect(isSshRemoteUrl('git@github.com:owner/repo.git extra')).toBe(false);
  });
});
