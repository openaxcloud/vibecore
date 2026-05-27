/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';

describe('<ProjectOverviewPanel />', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the enriched project overview sections', () => {
    render(
      <ProjectOverviewPanel
        project={{ id: 'project_1', name: 'Analytics App', sourceType: 'github' }}
        data={{
          overview: {
            summary: {
              sourceType: 'github',
              workspaceStatus: 'RUNNING',
              runtimeMode: 'remote-kubernetes',
              branch: 'main',
              fileCount: 13,
              activeMemberCount: 1,
              scriptCount: 2,
              projectCreatedAt: '2026-05-01T12:00:00.000Z',
              projectUpdatedAt: '2026-05-02T12:00:00.000Z',
            },
            stack: [
              { name: 'React', category: 'frontend', source: 'react' },
              { name: 'Vite', category: 'tooling', source: 'vite' },
            ],
            scripts: [
              { name: 'dev', command: 'vite', runCommand: 'pnpm run dev', manifestPath: 'package.json' },
              { name: 'build', command: 'vite build', runCommand: 'pnpm run build', manifestPath: 'package.json' },
            ],
            commits: [
              {
                sha: 'abcdef123456',
                shortSha: 'abcdef12',
                message: 'Initial import',
                author: 'Avi',
                date: '2026-05-02T11:00:00.000Z',
              },
            ],
            members: [
              {
                id: 'collab_1',
                userId: 'user_1',
                roleKey: 'admin',
                status: 'active',
                filePath: 'src/App.tsx',
              },
            ],
            activity: [{ action: 'project.files.import_zip', createdAt: '2026-05-02T10:00:00.000Z' }],
          },
        }}
      />,
    );

    expect(screen.getByTestId('project-overview-panel')).toBeTruthy();
    expect(screen.getByText('Analytics App')).toBeTruthy();
    expect(screen.getByText('React')).toBeTruthy();
    expect(screen.getByText('Vite')).toBeTruthy();
    expect(screen.getByText('pnpm run dev')).toBeTruthy();
    expect(screen.getByText('Initial import')).toBeTruthy();
    expect(screen.getByText('user_1')).toBeTruthy();
    expect(screen.getByText('Project Files Import Zip')).toBeTruthy();
  });
});
