import { describe, expect, it } from 'vitest';
import {
  buildGitSshFetchScript,
  buildGitSshLsRemoteScript,
  buildGitSshPullScript,
  buildGitSshPushScript,
  buildSshConnectScript,
  ephemeralSshKeyPrelude,
  describePackagesRunOutcome,
  isSshGitUrl,
  normalizeRuntimePorts,
  scopeDeploymentsForWorkspace,
  selectSshConnectionForOrigin,
  sshHostFromGitUrl,
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

describe('normalizeRuntimePorts', () => {
  const runtimePort = {
    port: 5173,
    processId: 'dc0deaa323e2',
    type: 'open',
    ready: true,
    url: 'https://ws-1-5173.preview.e-code.ai/',
  };

  it('keeps the bare array the runtime ports route actually returns', () => {
    expect(normalizeRuntimePorts([runtimePort])).toEqual([runtimePort]);
  });

  it('unwraps the {ports: []} shape used by the loader failure fallback', () => {
    expect(normalizeRuntimePorts({ ports: [runtimePort] })).toEqual([runtimePort]);
  });

  it('never yields the spread-array object that made the panel list no port', () => {
    /*
     * The regression: `{...[port]}` produced `{0: port}`, which is neither an
     * array nor `.ports`, so the panel reader returned [] while :5173 was live.
     */
    expect(normalizeRuntimePorts({ 0: runtimePort })).toEqual([]);
  });

  it('falls back to empty for null/undefined/non-list payloads', () => {
    expect(normalizeRuntimePorts(null)).toEqual([]);
    expect(normalizeRuntimePorts(undefined)).toEqual([]);
    expect(normalizeRuntimePorts({ ports: 'nope' })).toEqual([]);
  });
});

describe('describePackagesRunOutcome', () => {
  it('reports a successful install as 200 ok', () => {
    expect(
      describePackagesRunOutcome({ script: 'npm install lodash', exitCode: 0, status: 'succeeded', output: 'added 1' }),
    ).toEqual({ ok: true, status: 200 });
  });

  it('reports a failed install as 422 with the real reason — not a hardcoded ok', () => {
    /*
     * The regression: this branch answered `{ok:true}` HTTP 200 for a run with
     * exitCode 1, so the panel looked successful while nothing was installed.
     */
    const outcome = describePackagesRunOutcome({
      script: 'npm install lodash',
      exitCode: 1,
      status: 'failed',
      output: 'npm error code E404\nnpm error 404 Not Found\n',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(422);
    expect(outcome.error).toContain('npm install lodash failed (exit 1)');
    expect(outcome.error).toContain('404 Not Found');
  });

  it('still explains the failure when the command produced no output', () => {
    const outcome = describePackagesRunOutcome({ script: 'npm install', exitCode: 1, status: 'failed', output: '' });

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe('npm install failed (exit 1)');
  });

  it('turns the exact run production answered "ok" for into a 422 with the npm reason', () => {
    /*
     * Captured live from prod on 2026-08-06: installing a package that cannot
     * resolve recorded exitCode 1 / status failed, and the action still replied
     * HTTP 200 {"ok":true}. Same run, through the fixed mapper.
     */
    const outcome = describePackagesRunOutcome({
      script: 'npm install @vibecore/definitely-not-a-real-package-9f3a',
      exitCode: 1,
      status: 'failed',
      output:
        'npm error 404 Note that you can also install from a\n' +
        'npm error 404 tarball, folder, http url, or git url.\n' +
        'npm error A complete log of this run can be found in: /home/node/.npm/_logs/2026-08-06T16_04_17_441Z-debug-0.log',
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(422);
    expect(outcome.error).toContain('npm install @vibecore/definitely-not-a-real-package-9f3a failed (exit 1)');
    expect(outcome.error).toContain('404');
  });

  it('caps the quoted output so a huge npm log cannot blow up the response', () => {
    const outcome = describePackagesRunOutcome({
      script: 'npm install',
      exitCode: 1,
      status: 'failed',
      output: 'x'.repeat(5000),
    });

    expect((outcome.error ?? '').length).toBeLessThan(400);
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

describe('SSH git in the workspace pod (Option A)', () => {
  describe('sshHostFromGitUrl', () => {
    it('extracts the host from scp-style and ssh:// URLs (case-insensitive)', () => {
      expect(sshHostFromGitUrl('git@github.com:owner/repo.git')).toBe('github.com');
      expect(sshHostFromGitUrl('ssh://git@Gitlab.Example.com/owner/repo.git')).toBe('gitlab.example.com');
      expect(sshHostFromGitUrl('ssh://host.example.com:2222/owner/repo.git')).toBe('host.example.com');
    });

    it('returns null for non-SSH URLs', () => {
      expect(sshHostFromGitUrl('https://github.com/owner/repo.git')).toBeNull();
      expect(sshHostFromGitUrl('')).toBeNull();
    });
  });

  describe('selectSshConnectionForOrigin (key→origin binding)', () => {
    const gh = { id: 'a', host: 'github.com' };
    const gl = { id: 'b', host: 'gitlab.com' };

    it('prefers the key whose host matches the origin host', () => {
      expect(selectSshConnectionForOrigin([gh, gl], 'git@gitlab.com:owner/repo.git')).toBe(gl);
      expect(selectSshConnectionForOrigin([gh, gl], 'ssh://git@github.com/owner/repo.git')).toBe(gh);
    });

    it('falls back to the single configured key when none matches by host', () => {
      const only = { id: 'solo', host: 'bastion.internal' };
      expect(selectSshConnectionForOrigin([only], 'git@github.com:owner/repo.git')).toBe(only);
    });

    it('refuses to guess when several keys exist and none matches the host', () => {
      expect(selectSshConnectionForOrigin([gh, gl], 'git@bitbucket.org:owner/repo.git')).toBeNull();
    });
  });

  describe('buildGitSshPushScript', () => {
    const script = buildGitSshPushScript({
      keyEnvVar: 'TERMINAL_SSH_PRIVATE_KEY_X',
      repoUrl: 'git@github.com:owner/repo.git',
      branch: 'main',
      message: 'Update from workspace',
    });

    it('materializes the key and binds GIT_SSH_COMMAND to it', () => {
      expect(script).toContain('VIBECORE_SSH_KEYFILE="$(mktemp)"');
      expect(script).toContain('export GIT_SSH_COMMAND="ssh -i $VIBECORE_SSH_KEYFILE');
      expect(script).toContain('-o IdentitiesOnly=yes');
    });

    it('runs in the pod working tree and against the quoted origin/branch', () => {
      expect(script).toContain('cd "$VIBECORE_GIT_WORKDIR"');
      expect(script).toContain("URL='git@github.com:owner/repo.git'");
      expect(script).toContain("BRANCH='main'");
      expect(script).toContain('git push origin "HEAD:refs/heads/$BRANCH"');
    });

    it('bases on the remote tip without overwriting the working tree, then commits local changes', () => {
      expect(script).toContain('git fetch --no-tags --depth=50 origin "$BRANCH"');
      expect(script).toContain('git update-ref "refs/heads/$BRANCH" FETCH_HEAD');
      expect(script).toContain('git reset --mixed -q');
      expect(script).toContain('git add -A');
      expect(script).toContain("git commit -q -m 'Update from workspace'");
    });

    it('does NOT swallow fetch stderr and aborts when an existing branch fails to fetch (auth/network)', () => {
      /*
       * Bug #1: no `2>/dev/null` on the fetch, and a ls-remote guard that aborts
       * (exit 4) rather than orphaning history when the branch exists remotely.
       */
      expect(script).not.toContain('git fetch --no-tags --depth=50 origin "$BRANCH" 2>/dev/null');
      expect(script).toContain('git ls-remote --exit-code --heads origin "$BRANCH"');
      expect(script).toContain('exit 4');
    });

    it('guards git add -A with transient excludes when the repo has no .gitignore (Bug #5)', () => {
      expect(script).toContain('if [ -f .gitignore ]; then');
      expect(script).toContain('core.excludesFile="$VIBECORE_GIT_EXCLUDES"');
      expect(script).toContain('node_modules');

      // Never writes/commits a .gitignore the user didn't author.
      expect(script).not.toContain('> .gitignore');
    });
  });

  describe('buildGitSshPullScript', () => {
    const script = buildGitSshPullScript({
      keyEnvVar: 'TERMINAL_SSH_PRIVATE_KEY_X',
      repoUrl: 'ssh://git@host/owner/repo.git',
      branch: 'dev',
    });

    it('fetches and fast-forwards, erroring on real divergence', () => {
      expect(script).toContain('git fetch --no-tags origin "$BRANCH"');
      expect(script).toContain('git merge --ff-only FETCH_HEAD');
      expect(script).toContain('exit 3');
      expect(script).toContain("BRANCH='dev'");
    });
  });

  describe('buildGitSshFetchScript', () => {
    it('is a read-only fetch bound to the ephemeral key', () => {
      const script = buildGitSshFetchScript({
        keyEnvVar: 'TERMINAL_SSH_PRIVATE_KEY_X',
        repoUrl: 'git@github.com:owner/repo.git',
        branch: 'main',
      });

      expect(script).toContain('export GIT_SSH_COMMAND="ssh -i $VIBECORE_SSH_KEYFILE');
      expect(script).toContain('git fetch --no-tags origin "$BRANCH"');
      expect(script).not.toContain('git push');
      expect(script).not.toContain('git commit');
    });
  });
});
