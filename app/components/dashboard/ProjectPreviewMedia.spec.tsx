/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectPreviewMedia, ProjectStatusPill, type ProjectCard } from './SaaSLayout';

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
});
