/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectGrid, ProjectPreviewMedia, ProjectStatusPill, type ProjectCard } from './SaaSLayout';

afterEach(cleanup);

const project: ProjectCard = {
  id: 'project-1',
  name: 'Client portal',
  status: 'Deployed',
  lifecycle: 'deployed',
  previewImageUrl: '/api/projects/project-1/thumbnail',
};

describe('project card media', () => {
  it('renders the real project preview with a useful accessible name', () => {
    render(<ProjectPreviewMedia project={project} />);

    expect(screen.getByRole('img', { name: 'Latest preview of Client portal' }).getAttribute('src')).toBe(
      '/api/projects/project-1/thumbnail',
    );
  });

  it('replaces a failed preview request with an explicit fallback', () => {
    render(<ProjectPreviewMedia project={project} />);

    fireEvent.error(screen.getByRole('img', { name: 'Latest preview of Client portal' }));

    expect(screen.queryByRole('img', { name: 'Latest preview of Client portal' })).toBeNull();
    expect(screen.getByText('No preview yet')).toBeTruthy();
  });

  it('uses semantic project status tones', () => {
    render(<ProjectStatusPill project={project} />);

    expect(screen.getByText('Deployed').className).toContain('status-success');
  });

  it('keeps the project grid compact while surfacing real activity and the primary IDE action', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <ProjectGrid projects={[{ ...project, updatedAtIso: '2026-07-14T12:00:00.000Z' }]} />,
      },
    ]);

    render(<RouterProvider router={router} />);

    expect(screen.getByTestId('project-grid').getAttribute('style')).toContain(
      'repeat(auto-fit, minmax(min(100%, 19rem), 1fr))',
    );
    expect(screen.getByText('Activity')).toBeTruthy();
    expect(screen.getByText('Deployments')).toBeTruthy();

    const openIde = screen.getByRole('link', { name: 'Open IDE' });
    expect(openIde.className).toContain('min-h-[44px]');
    expect(openIde.className).toContain('button-primary-background');
    expect(openIde.getAttribute('href')).toBe('/projects/project-1/ide');
  });
});
