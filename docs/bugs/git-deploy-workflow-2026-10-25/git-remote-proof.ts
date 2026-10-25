import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { GitCliProvider } from '../../../services/api/src/project-storage.ts';
async function run() {
  const root = await mkdtemp(join(tmpdir(), 'gitdeploy-remote-'));
  try {
    process.env.PROJECT_STORAGE_DIR = join(root, 'projects');
    const projectId = 'isolated-project';
    const dir = join(root, 'projects', projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'proof.txt'), 'initial\n');
    const p = new GitCliProvider();
    await p.commit({ projectId, message: 'Initial local fixture', files: [] });
    const bare = join(root, 'origin.git');
    const peer = join(root, 'peer');
    const git = (cwd: string, args: string[]) =>
      execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    git(root, ['init', '--bare', bare]);
    await p.configureRemote({ projectId, remoteUrl: bare });
    const branch = git(dir, ['branch', '--show-current']);
    await p.push({ projectId, branch });
    assert.equal(git(bare, ['rev-parse', `refs/heads/${branch}`]), git(dir, ['rev-parse', 'HEAD']));
    git(root, ['clone', '--branch', branch, bare, peer]);
    git(peer, ['config', 'user.name', 'Local QA']);
    git(peer, ['config', 'user.email', 'qa@local.test']);
    await writeFile(join(peer, 'proof.txt'), 'remote update\n');
    git(peer, ['add', 'proof.txt']);
    git(peer, ['commit', '-m', 'Peer update']);
    git(peer, ['push', 'origin', branch]);
    await p.pull({ projectId, branch });
    assert.equal(await readFile(join(dir, 'proof.txt'), 'utf8'), 'remote update\n');
    git(dir, ['config', 'pull.rebase', 'false']);
    await writeFile(join(dir, 'proof.txt'), 'local conflicting line\n');
    await p.commit({ projectId, message: 'Local conflict', files: [] });
    await writeFile(join(peer, 'proof.txt'), 'remote conflicting line\n');
    git(peer, ['add', 'proof.txt']);
    git(peer, ['commit', '-m', 'Peer conflict']);
    git(peer, ['push', 'origin', branch]);
    await assert.rejects(
      p.pull({ projectId, branch }),
      (error: any) =>
        error.statusCode === 409 && error.code === 'GIT_MERGE_CONFLICT' && error.conflicts.includes('proof.txt'),
    );
    const receipt = {
      scope: 'real GitCliProvider and Git local bare remote only',
      checks: [
        'push updates bare ref',
        'pull updates real file',
        'conflicting pull returns 409 GIT_MERGE_CONFLICT with proof.txt',
      ],
    };
    await writeFile(
      process.env.QA_RECEIPT_PATH ?? '/tmp/git-deploy-remote-proof.json',
      JSON.stringify(receipt, null, 2),
    );
    console.log(receipt.checks.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
run();
