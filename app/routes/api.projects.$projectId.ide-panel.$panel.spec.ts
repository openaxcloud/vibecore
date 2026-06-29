import { describe, expect, it } from 'vitest';
import {
  buildGitSshLsRemoteScript,
  buildSshConnectScript,
  ephemeralSshKeyPrelude,
  isSshGitUrl,
  scopeDeploymentsForWorkspace,
} from './api.projects.$projectId.ide-panel.$panel';

describe('scopeDeploymentsForWorkspace', () => {
  const deployments = [
    { id: 'legacy-project-deploy' },
    { id: 'primary-deploy', workspaceId: 'workspace-primary' },
    { id: 'secondary-deploy', workspaceId: 'workspace-secondary' },
  ];

  it('keeps legacy project deployments with the primary workspace only', () => {
    expect(scopeDeploymentsForWorkspace(deployments, 'workspace-primary', 'workspace-primary')).toEqual([
      deployments[0],
      deployments[1],
    ]);
  });

  it('keeps only deployments from the selected secondary workspace', () => {
    expect(scopeDeploymentsForWorkspace(deployments, 'workspace-secondary', 'workspace-primary')).toEqual([
      deployments[2],
    ]);
  });

  it('keeps only legacy project deployments when no workspace is selected', () => {
    expect(scopeDeploymentsForWorkspace(deployments)).toEqual([deployments[0]]);
  });
});

describe('SSH key handling (tenant isolation)', () => {
  describe('ephemeralSshKeyPrelude', () => {
    it('materializes the key from the named pod env var to a 0600 temp file and cleans up', () => {
      const script = ephemeralSshKeyPrelude('TERMINAL_SSH_PRIVATE_KEY_ABC');

      expect(script).toContain('umask 077');
      expect(script).toContain('VIBECORE_SSH_KEYFILE="$(mktemp)"');
      expect(script).toContain('trap \'rm -f "$VIBECORE_SSH_KEYFILE"\' EXIT INT TERM');

      // References the key BY NAME — the secret value never enters the command string.
      expect(script).toContain('"$TERMINAL_SSH_PRIVATE_KEY_ABC"');

      // Actionable guard when the secret isn't injected into the running pod yet.
      expect(script).toContain('exit 97');
    });
  });

  describe('buildSshConnectScript', () => {
    it('ssh -i the ephemeral key with IdentitiesOnly and the quoted user@host/port', () => {
      const script = buildSshConnectScript({
        keyEnvVar: 'TERMINAL_SSH_PRIVATE_KEY_X',
        host: 'bastion.example.com',
        port: 2222,
        username: 'deploy',
      });

      expect(script).toContain('ssh -i "$VIBECORE_SSH_KEYFILE"');
      expect(script).toContain('-o IdentitiesOnly=yes');
      expect(script).toContain('-o BatchMode=yes');
      expect(script).toContain("'deploy@bastion.example.com'");
      expect(script).toContain("-p '2222'");
      expect(script).toContain('echo vibecore-ssh-connected');

      // Includes the prelude (key materialization).
      expect(script).toContain('VIBECORE_SSH_KEYFILE="$(mktemp)"');
    });
  });

  describe('isSshGitUrl', () => {
    it('accepts scp-style and ssh:// URLs', () => {
      expect(isSshGitUrl('git@github.com:owner/repo.git')).toBe(true);
      expect(isSshGitUrl('ssh://git@host.example.com/owner/repo.git')).toBe(true);
    });

    it('rejects https, empty, and whitespace-bearing values', () => {
      expect(isSshGitUrl('https://github.com/owner/repo.git')).toBe(false);
      expect(isSshGitUrl('')).toBe(false);
      expect(isSshGitUrl('git@github.com:owner/repo.git extra')).toBe(false);
    });
  });

  describe('buildGitSshLsRemoteScript', () => {
    it('binds GIT_SSH_COMMAND to the ephemeral key and runs a read-only ls-remote', () => {
      const script = buildGitSshLsRemoteScript({
        keyEnvVar: 'TERMINAL_SSH_PRIVATE_KEY_X',
        repoUrl: 'git@github.com:owner/repo.git',
      });

      expect(script).toContain('GIT_SSH_COMMAND="ssh -i $VIBECORE_SSH_KEYFILE');
      expect(script).toContain('-o IdentitiesOnly=yes');
      expect(script).toContain("git ls-remote --heads 'git@github.com:owner/repo.git'");
      expect(script).toContain('VIBECORE_SSH_KEYFILE="$(mktemp)"');
    });
  });
});
