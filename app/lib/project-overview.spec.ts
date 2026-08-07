import { describe, expect, it } from 'vitest';
import {
  buildProjectOverviewInsights,
  detectProjectStack,
  extractProjectScripts,
  normalizeProjectOverviewCommits,
} from './project-overview';

describe('project overview insights', () => {
  it('detects the project stack from manifests, dependencies and files', () => {
    const stack = detectProjectStack({
      packageManager: 'pnpm@9.14.4',
      files: [{ path: 'src/main.tsx' }, { path: 'vite.config.ts' }, { path: 'prisma/schema.prisma' }],
      dependencies: [
        { name: 'react', version: '^18.3.1' },
        { name: 'vite', version: '^5.4.21' },
        { name: '@prisma/client', version: '^7.8.0' },
        { name: 'vitest', version: '^2.1.7' },
      ],
      manifests: [{ path: 'package.json', scripts: { dev: 'vite' } }],
    });

    expect(stack.map((item) => item.name)).toEqual(
      expect.arrayContaining(['pnpm', 'React', 'Vite', 'TypeScript', 'Prisma', 'Vitest']),
    );
  });

  it('prioritizes common npm scripts and builds run commands', () => {
    const scripts = extractProjectScripts({
      packageManager: 'npm',
      manifests: [
        {
          path: 'package.json',
          scripts: {
            lint: 'eslint app',
            build: 'vite build',
            dev: 'vite',
            storybook: 'storybook dev',
          },
        },
      ],
    });

    expect(scripts.map((script) => script.name).slice(0, 3)).toEqual(['dev', 'build', 'lint']);
    expect(scripts[0]).toMatchObject({ runCommand: 'npm run dev', command: 'vite' });
  });

  it('builds a full overview payload with commits, active members and activity', () => {
    const overview = buildProjectOverviewInsights({
      project: {
        id: 'project_1',
        name: 'Analytics App',
        sourceType: 'github',
        createdAt: '2026-05-01T12:00:00.000Z',
        updatedAt: '2026-05-02T12:00:00.000Z',
      },
      dashboard: {
        workspace: { status: 'RUNNING', runtimeMode: 'remote-kubernetes' },
        files: [{ path: 'package.json' }, { path: 'src/App.tsx' }],
        git: { branch: 'main' },
        recentActivity: [{ action: 'project.files.import_zip', createdAt: '2026-05-02T10:00:00.000Z' }],
      },
      packages: {
        packageManager: 'pnpm',
        files: [{ path: 'package.json' }, { path: 'src/App.tsx' }],
        manifests: [{ path: 'package.json', scripts: { dev: 'vite', test: 'vitest' } }],
        dependencies: [{ name: 'react', version: '^18.3.1' }],
      },
      gitGraph: {
        commits: [{ sha: 'abcdef123456', message: 'Initial import', author: 'Avi', date: '2026-05-02T11:00:00.000Z' }],
      },
      collaboration: {
        collaborators: [{ id: 'collab_1', userId: 'user_1', roleKey: 'admin' }],
        presence: [{ userId: 'user_1', status: 'active', mode: 'editing', filePath: 'src/App.tsx' }],
      },
    });

    expect(overview.summary).toMatchObject({
      branch: 'main',
      fileCount: 2,
      activeMemberCount: 1,
      scriptCount: 2,
      workspaceStatus: 'RUNNING',
    });
    expect(overview.commits[0]).toMatchObject({ shortSha: 'abcdef12', message: 'Initial import' });
    expect(overview.members[0]).toMatchObject({ userId: 'user_1', status: 'active', filePath: 'src/App.tsx' });
    expect(overview.activity[0]?.action).toBe('project.files.import_zip');
  });

  it('counts active members beyond the displayed-member cap', () => {
    const collaborators = Array.from({ length: 15 }, (_, index) => ({
      id: `collab_${index}`,
      userId: `user_${index}`,
      roleKey: 'editor',
    }));
    const presence = Array.from({ length: 15 }, (_, index) => ({
      userId: `user_${index}`,
      status: 'active',
      mode: 'editing',
    }));

    const overview = buildProjectOverviewInsights({
      project: { id: 'project_big', name: 'Big Team App' },
      collaboration: { collaborators, presence },
    });

    // The displayed member list is capped, but the active count must reflect the full team.
    expect(overview.members).toHaveLength(8);
    expect(overview.summary.activeMemberCount).toBe(15);
  });

  it('localizes the fallback without changing user-provided commit messages', () => {
    expect(normalizeProjectOverviewCommits([{ sha: 'a1', message: '' }], 'fr')[0]?.message).toBe('Commit sans message');
    expect(normalizeProjectOverviewCommits([{ sha: 'a2', message: 'Fix dashboard' }], 'fr')[0]?.message).toBe(
      'Fix dashboard',
    );
  });
});
