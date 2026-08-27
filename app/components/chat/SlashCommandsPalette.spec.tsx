/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SlashCommandsPalette } from './SlashCommandsPalette';
import { registerSlashCommand } from '~/lib/chat/slash-commands';

function renderWithLanguage(language: string, node: ReactNode) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>);
}

describe('<SlashCommandsPalette />', () => {
  afterEach(() => {
    cleanup();
  });

  it('lists every built-in command for an empty query', () => {
    renderWithLanguage('en', <SlashCommandsPalette query="" onSelect={() => undefined} />);

    const options = screen.getAllByRole('option');
    expect(options.length).toBe(11); // 11 built-ins (clear, discuss, build, plan, help, file, snapshot, preview-error, open, diff, run)
    expect(screen.getByText('/clear')).toBeTruthy();
    expect(screen.getByText('/plan')).toBeTruthy();
  });

  it('filters to the matching command on a query', () => {
    renderWithLanguage('en', <SlashCommandsPalette query="plan" onSelect={() => undefined} />);

    expect(screen.getAllByRole('option').length).toBe(1);
    expect(screen.getByText('/plan')).toBeTruthy();
  });

  it('shows the empty state when nothing matches', () => {
    renderWithLanguage('en', <SlashCommandsPalette query="zzzzzz" onSelect={() => undefined} />);
    expect(screen.getByText('No matching commands')).toBeTruthy();
  });

  it('renders and searches reviewed French copy while preserving command ids and user arguments', () => {
    renderWithLanguage(
      'fr',
      <SlashCommandsPalette query="effacer" pendingArgument="src/TrèsLongNomUtilisateur.tsx" onSelect={vi.fn()} />,
    );

    const listbox = screen.getByRole('listbox', { name: 'Commandes slash' });
    const option = screen.getByRole('option');

    expect(screen.getByText('/clear')).toBeTruthy();
    expect(screen.getByText('Effacer la conversation')).toBeTruthy();
    expect(screen.getByText('Archivez la conversation actuelle et ouvrez un nouveau fil.')).toBeTruthy();
    expect(screen.getByText('Argument :')).toBeTruthy();
    expect(screen.getByText('src/TrèsLongNomUtilisateur.tsx')).toBeTruthy();
    expect(screen.queryByText('Clear conversation')).toBeNull();
    expect(listbox.className).toContain('bolt-slash-commands-palette');
    expect(option.className).toContain('min-w-0');
    expect(option.querySelector('.bolt-slash-commands-label')?.className).toContain('break-words');
    expect(option.querySelector('.bolt-slash-commands-description')?.className).toContain('break-words');
  });

  it('falls back to English for an unsupported locale', () => {
    renderWithLanguage('es', <SlashCommandsPalette query="clear" onSelect={vi.fn()} />);

    expect(screen.getByRole('listbox', { name: 'Slash commands' })).toBeTruthy();
    expect(screen.getByText('Clear conversation')).toBeTruthy();
  });

  it('localizes keyboard shortcut accessibility help', () => {
    const unregister = registerSlashCommand({
      id: 'shortcut-spec',
      label: 'Technical extension command',
      description: 'Technical extension description',
      shortcut: '⌘K',
      execute: vi.fn(),
    });

    try {
      renderWithLanguage('fr', <SlashCommandsPalette query="shortcut-spec" onSelect={vi.fn()} />);
      expect(screen.getByLabelText('Raccourci clavier : ⌘K')).toBeTruthy();
    } finally {
      unregister();
    }
  });

  it('moves the active index on arrow keys', () => {
    renderWithLanguage('en', <SlashCommandsPalette query="" onSelect={() => undefined} />);

    const listbox = screen.getByRole('listbox');
    const options = screen.getAllByRole('option');
    expect(options[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(options[1].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(listbox, { key: 'ArrowUp' });
    expect(options[0].getAttribute('aria-selected')).toBe('true');
  });

  it('emits the selected command on Enter and click', () => {
    const onSelect = vi.fn();
    renderWithLanguage('en', <SlashCommandsPalette query="" onSelect={onSelect} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].id).toBe('build');

    onSelect.mockClear();
    fireEvent.click(screen.getAllByRole('option')[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('emits onDismiss on Escape', () => {
    const onDismiss = vi.fn();
    renderWithLanguage('en', <SlashCommandsPalette query="" onSelect={() => undefined} onDismiss={onDismiss} />);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
