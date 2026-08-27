/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectCardMenu, ProjectRenameForm } from './ProjectCardMenu';
import { projectCardMenuEn, projectCardMenuFr } from '~/lib/i18n/catalogs/project-card-menu';
import { createI18nInstance } from '~/lib/i18n/runtime';

const testState = vi.hoisted(() => ({
  submit: vi.fn(),
}));

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useFetcher: () => ({ state: 'idle', data: undefined, submit: testState.submit }),
  };
});

vi.mock('react-toastify', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock('@radix-ui/react-dialog', () => ({
  Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('~/components/ui/Dropdown', () => ({
  Dropdown: ({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) => (
    <div>
      {trigger}
      {children}
    </div>
  ),
  DropdownItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
  DropdownSeparator: () => <hr />,
}));

vi.mock('~/components/ui/Dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function frenchProvider(children: React.ReactNode) {
  return <I18nextProvider i18n={createI18nInstance('fr')}>{children}</I18nextProvider>;
}

describe('ProjectCardMenu i18n', () => {
  it('keeps complete EN/FR catalog parity', () => {
    expect(Object.keys(projectCardMenuFr).sort()).toEqual(Object.keys(projectCardMenuEn).sort());
  });

  it('localizes every menu action and creates a localized duplicate name', () => {
    render(
      frenchProvider(
        <ProjectCardMenu
          project={{ id: 'project-1', name: 'Portail client', lifecycle: 'active' }}
          onRename={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole('button', { name: 'Actions du projet Portail client' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Renommer' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archiver' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
    expect(testState.submit).toHaveBeenCalledWith(
      { intent: 'duplicate', name: 'Portail client — copie' },
      { method: 'post', action: '/api/projects/project-1/project-action' },
    );
    expect(document.body.textContent).not.toMatch(/\b(?:Rename|Duplicate|Archive|Delete)\b/);
  });

  it('renders the high-risk delete confirmation and rename control in French', () => {
    const project = { id: 'project-1', name: 'Portail client', lifecycle: 'active' as const, deploymentCount: 1 };
    const { unmount } = render(frenchProvider(<ProjectCardMenu project={project} onRename={vi.fn()} />));

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Supprimer le projet' })).toBeTruthy();
    expect(screen.getByText(/Cette action supprime définitivement/)).toBeTruthy();
    expect(screen.getByText(/déploiement actif/)).toBeTruthy();
    expect(screen.getByLabelText('Saisissez Portail client pour confirmer la suppression')).toBeTruthy();

    unmount();
    render(frenchProvider(<ProjectRenameForm project={project} onDone={vi.fn()} />));
    expect(screen.getByLabelText('Renommer le projet Portail client')).toBeTruthy();
  });
});
