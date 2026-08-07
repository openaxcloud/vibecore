/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('react-toastify', () => ({ toast: toastMocks }));

vi.mock('~/components/chat/ImportFolderButton', () => ({
  ImportFolderButton: ({ className, importChat }: { className?: string; importChat?: unknown }) => (
    <button type="button" className={className} data-testid="import-folder-button" data-available={Boolean(importChat)}>
      Importer un dossier
    </button>
  ),
}));

import { ImportButtons, parseChatImportJson } from './ImportButtons';
import { getImportButtonsCopy, importButtonsEn, importButtonsFr } from '~/lib/i18n/catalogs/import-buttons';

function createTestI18n(language: 'en' | 'fr' | 'es') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return i18n;
}

function renderWithLanguage(language: 'en' | 'fr' | 'es', node: ReactNode) {
  const i18n = createTestI18n(language);

  return {
    i18n,
    ...render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>),
  };
}

function chatFile(name: string, content: string, textImplementation?: () => Promise<string>): File {
  const file = new File([content], name, { type: 'application/json' });

  Object.defineProperty(file, 'text', {
    configurable: true,
    value: textImplementation ?? vi.fn(async () => content),
  });

  return file;
}

function chooseFile(input: HTMLInputElement, file: File) {
  fireEvent.change(input, { target: { files: [file] } });
}

afterEach(() => {
  cleanup();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
});

describe('ImportButtons catalog and parser', () => {
  it('keeps EN and FR keys aligned and falls back to English', () => {
    expect(Object.keys(importButtonsFr)).toEqual(Object.keys(importButtonsEn));
    expect(getImportButtonsCopy('fr-CA')['importButtons.chat.trigger']).toBe('Importer une conversation');
    expect(getImportButtonsCopy('es-ES')['importButtons.chat.trigger']).toBe('Import chat');
  });

  it('preserves imported descriptions, messages, file names, code, and user content', () => {
    const source = {
      description: '',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'Do not translate OPENAI_API_KEY, /src/App.tsx, commit, or const value = "Hello";',
        },
      ],
    };

    const parsed = parseChatImportJson(JSON.stringify(source));

    expect(parsed).toEqual({ ok: true, data: source });
  });

  it('distinguishes malformed JSON from a structurally invalid export', () => {
    expect(parseChatImportJson('{not-json')).toEqual({ ok: false, errorCode: 'parseFailed' });
    expect(parseChatImportJson(JSON.stringify({ messages: 'not-an-array' }))).toEqual({
      ok: false,
      errorCode: 'invalidFormat',
    });
    expect(parseChatImportJson(JSON.stringify({ messages: [], description: 42 }))).toEqual({
      ok: false,
      errorCode: 'invalidFormat',
    });
  });
});

describe('<ImportButtons /> i18n and async states', () => {
  it('imports the JSON payload unchanged and reports French success copy', async () => {
    const importChat = vi.fn(async () => undefined);

    const source = {
      description: 'Projet API — exact',
      messages: [
        {
          id: 'message-exact',
          role: 'assistant',
          content: 'TypeError: ENOENT at /workspace/src/App.tsx\nconst commit = "unchanged";',
        },
      ],
    };

    const file = chatFile('conversation-technique.json', JSON.stringify(source));

    renderWithLanguage('fr', ImportButtons(importChat));

    const input = screen.getByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer');
    chooseFile(input, file);

    await waitFor(() => expect(importChat).toHaveBeenCalledTimes(1));

    expect(importChat).toHaveBeenCalledWith(source.description, source.messages);
    expect((await screen.findByRole('status')).textContent).toBe(
      'Le fichier conversation-technique.json a bien été importé.',
    );
    expect(toastMocks.success).toHaveBeenCalledWith('Le fichier conversation-technique.json a bien été importé.');
    expect(input.value).toBe('');
  });

  it('shows a named loading state, disables duplicate submission, and keeps 44px targets', async () => {
    let finishImport: (() => void) | undefined;

    const importChat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishImport = resolve;
        }),
    );

    const file = chatFile('export-avec-un-nom-tres-long.json', JSON.stringify({ messages: [] }));
    const { container } = renderWithLanguage('fr', ImportButtons(importChat));

    const input = screen.getByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer');
    chooseFile(input, file);

    const loadingButton = await screen.findByRole('button', {
      name: 'Importation de export-avec-un-nom-tres-long.json…',
    });
    expect(loadingButton.getAttribute('aria-busy')).toBe('true');
    expect(loadingButton.hasAttribute('disabled')).toBe(true);
    expect(loadingButton.className).toContain('min-h-[44px]');
    expect(loadingButton.className).toContain('!whitespace-normal');
    expect(importChat).toHaveBeenCalledWith('Conversation importée', []);

    const group = screen.getByRole('group', { name: 'Options d’importation' });
    expect(group.className).toContain('flex-wrap');
    expect(container.firstElementChild?.className).toContain('min-w-0');
    expect(screen.getByTestId('import-folder-button').className).toContain('basis-40');

    await act(async () => finishImport?.());
    await screen.findByRole('status');
  });

  it('masks JSON parser details and never renders raw malformed content', async () => {
    const importChat = vi.fn(async () => undefined);
    const rawSecret = 'SECRET_API_TOKEN=never-render';
    const file = chatFile('broken.json', `{"messages":[${rawSecret}`);
    const { container } = renderWithLanguage('fr', ImportButtons(importChat));

    chooseFile(screen.getByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer'), file);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe(
      'Impossible d’analyser ce fichier JSON. Vérifiez qu’il s’agit d’un export de conversation E-Code valide, puis réessayez.',
    );
    expect(container.textContent).not.toContain(rawSecret);
    expect(toastMocks.error).toHaveBeenCalledWith(alert.textContent);
    expect(importChat).not.toHaveBeenCalled();
  });

  it('masks raw file-read and import-handler errors', async () => {
    const readFailure = chatFile('unreadable.json', '', async () => {
      throw new Error('SECRET_FILE_PATH=/private/customer.json');
    });

    const first = renderWithLanguage('fr', ImportButtons(vi.fn(async () => undefined)));

    chooseFile(
      screen.getByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer'),
      readFailure,
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Impossible de lire le fichier sélectionné. Vérifiez ses autorisations, puis choisissez-le de nouveau.',
    );
    expect(first.container.textContent).not.toContain('SECRET_FILE_PATH');

    first.unmount();

    const importChat = vi.fn(async () => {
      throw new Error('SECRET_DATABASE_URL=never-render');
    });

    const second = renderWithLanguage('fr', ImportButtons(importChat));
    const validFile = chatFile('valid.json', JSON.stringify({ messages: [] }));

    chooseFile(screen.getByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer'), validFile);

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Impossible d’importer la conversation. Vérifiez le fichier, puis réessayez.',
    );
    expect(second.container.textContent).not.toContain('SECRET_DATABASE_URL');
  });

  it('keeps unavailable actions focusable and explains how to recover', () => {
    renderWithLanguage('fr', ImportButtons(undefined));

    const button = screen.getByRole('button', { name: 'Importer une conversation' });
    expect(button.hasAttribute('disabled')).toBe(false);
    expect(button.getAttribute('aria-disabled')).toBe('true');

    fireEvent.click(button);

    expect(screen.getByRole('alert').textContent).toBe(
      'L’importation de conversations est momentanément indisponible.',
    );
  });

  it('uses unique input ids and wires each trigger to its own file input', () => {
    const importChat = vi.fn(async () => undefined);

    renderWithLanguage(
      'fr',
      <>
        {ImportButtons(importChat)}
        {ImportButtons(importChat)}
      </>,
    );

    const inputs = screen.getAllByLabelText<HTMLInputElement>('Choisir un export JSON de conversation à importer');
    const triggers = screen.getAllByRole('button', { name: 'Importer une conversation' });

    expect(inputs[0].id).not.toBe('');
    expect(inputs[1].id).not.toBe('');
    expect(inputs[0].id).not.toBe(inputs[1].id);
    expect(triggers[0].getAttribute('aria-controls')).toBe(inputs[0].id);
    expect(triggers[1].getAttribute('aria-controls')).toBe(inputs[1].id);
  });

  it('updates visible copy on locale changes and uses English for unsupported locales', async () => {
    const { i18n } = renderWithLanguage('es', ImportButtons(undefined));
    const group = screen.getByRole('group', { name: 'Import options' });

    const trigger = within(group).getByRole('button', { name: 'Import chat' });
    expect(trigger).toBeTruthy();

    fireEvent.click(trigger);
    expect(screen.getByRole('alert').textContent).toBe('Chat import is unavailable right now.');

    await act(async () => {
      await i18n.changeLanguage('fr');
    });

    expect(screen.getByRole('group', { name: 'Options d’importation' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Importer une conversation' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'L’importation de conversations est momentanément indisponible.',
    );
    expect(screen.queryByRole('button', { name: 'Import chat' })).toBeNull();
  });
});
