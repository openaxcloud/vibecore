/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGrid, ProjectPreviewMedia, ProjectStatusPill, type ProjectCard } from './SaaSLayout';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(cleanup);

const project: ProjectCard = {
  id: 'project-1',
  name: 'Client portal',
  status: 'Deployed',
  lifecycle: 'deployed',
  previewImageUrl: '/api/projects/project-1/thumbnail',
};

function renderWithI18n(element: ReactElement) {
  return render(<I18nextProvider i18n={createI18nInstance('en')}>{element}</I18nextProvider>);
}

describe('project card media', () => {
  it('renders the real project preview with a useful accessible name', () => {
    renderWithI18n(<ProjectPreviewMedia project={project} />);

    expect(screen.getByRole('img', { name: 'Latest preview of Client portal' }).getAttribute('src')).toBe(
      '/api/projects/project-1/thumbnail',
    );
  });

  it('replaces a failed preview request with an explicit fallback', () => {
    renderWithI18n(<ProjectPreviewMedia project={project} />);

    fireEvent.error(screen.getByRole('img', { name: 'Latest preview of Client portal' }));

    expect(screen.queryByRole('img', { name: 'Latest preview of Client portal' })).toBeNull();
    expect(screen.getByText('No preview yet')).toBeTruthy();
  });

  /*
   * Reproduit ce qui a été mesuré sur l'environnement d'audit : la lecture de
   * vignette côté API attendait un stockage objet injoignable, la réponse ne
   * venait ni en succès ni en erreur, et la carte restait un rectangle vide
   * pendant une demi-minute. Ni `onLoad` ni `onError` ne se déclenchent dans ce
   * cas — seule une échéance sort de cet état.
   */
  it('bascule sur le repli quand la vignette ne répond ni en succès ni en erreur', async () => {
    vi.useFakeTimers();

    try {
      renderWithI18n(<ProjectPreviewMedia project={project} />);

      expect(screen.getByRole('img', { name: 'Latest preview of Client portal' })).toBeTruthy();

      await act(async () => {
        // AV-UX point 12 : l'échéance passe de 6s à 15s (302 → URL GCS signée, stockage froid).
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.queryByRole('img', { name: 'Latest preview of Client portal' })).toBeNull();
      expect(screen.getByText('No preview yet')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  /*
   * AV-UX point 12 — un aperçu qui EXISTE mais arrive après l'échéance doit
   * finir par s'afficher : l'image reste montée sous le repli et son `onLoad`
   * la fait reprendre la place du « No preview yet ».
   */
  it('remplace le repli par l’aperçu réel quand la vignette finit par charger', async () => {
    vi.useFakeTimers();

    try {
      const { container } = renderWithI18n(<ProjectPreviewMedia project={project} />);

      await act(async () => {
        vi.advanceTimersByTime(15_000);
      });

      expect(screen.getByText('No preview yet')).toBeTruthy();

      const image = container.querySelector('img');
      expect(image).not.toBeNull();

      await act(async () => {
        fireEvent.load(image!);
      });

      expect(screen.queryByText('No preview yet')).toBeNull();
      expect(screen.getByRole('img', { name: 'Latest preview of Client portal' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('uses semantic project status tones', () => {
    renderWithI18n(<ProjectStatusPill project={project} />);

    expect(screen.getByText('Deployed').className).toContain('status-success');
  });

  it('keeps the project grid compact while surfacing real activity and the primary IDE action', () => {
    const router = createMemoryRouter([
      {
        path: '/',
        element: <ProjectGrid projects={[{ ...project, updatedAtIso: '2026-07-14T12:00:00.000Z' }]} />,
      },
    ]);

    renderWithI18n(<RouterProvider router={router} />);

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
