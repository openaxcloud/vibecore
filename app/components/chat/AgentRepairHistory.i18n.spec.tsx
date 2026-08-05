/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchEvents: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('~/lib/persistence/agentRepairEventSync', () => ({
  fetchAgentRepairEvents: (...args: unknown[]) => mocks.fetchEvents(...args),
}));

vi.mock('~/lib/runtime/workspace-events', () => ({
  workspaceEvents: {
    on: vi.fn(() => mocks.unsubscribe),
  },
}));

import { AgentRepairHistory } from './AgentRepairHistory';

function createTestI18n(language: 'en' | 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('<AgentRepairHistory /> i18n', () => {
  it('switches outcome chrome live, formats French dates, and masks raw repair diagnostics', async () => {
    mocks.fetchEvents.mockResolvedValue([
      {
        id: 'repair-1',
        projectId: 'project-1',
        relativePath: 'src/Écran.tsx',
        attempt: 1,
        outcome: 'repaired',
        validationError: 'Unexpected token (12:4) secret=raw',
        repairError: 'Upstream repair provider failed with TOKEN=raw',
        createdAt: '2026-08-05T09:30:00.000Z',
      },
    ]);

    const i18n = createTestI18n('fr');

    render(
      <I18nextProvider i18n={i18n}>
        <AgentRepairHistory projectId="project-1" />
      </I18nextProvider>,
    );

    const toggle = await screen.findByRole('button', { name: /Historique des corrections automatiques/u });

    expect(toggle.className).toContain('min-h-11');
    fireEvent.click(toggle);

    await waitFor(() => expect(screen.getByText('Corrigé')).toBeTruthy());
    expect(screen.getByText('src/Écran.tsx')).toBeTruthy();
    expect(screen.getByText('tentative 1')).toBeTruthy();
    expect(screen.getByText('La validation du code a échoué. Ligne 12, colonne 4.')).toBeTruthy();
    expect(screen.getByText('La correction automatique n’a pas pu être appliquée.')).toBeTruthy();
    expect(screen.queryByText(/Unexpected token|secret=raw|TOKEN=raw|Upstream repair/u)).toBeNull();

    const timestamp = screen.getByRole('time');

    expect(timestamp.getAttribute('datetime')).toBe('2026-08-05T09:30:00.000Z');
    expect(timestamp.textContent).not.toContain('Invalid Date');

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByText('Repaired')).toBeTruthy();
    expect(screen.getByText('attempt 1')).toBeTruthy();
    expect(screen.getByText('Code validation failed. Line 12, column 4.')).toBeTruthy();
    expect(screen.getByText('src/Écran.tsx')).toBeTruthy();
  });
});
