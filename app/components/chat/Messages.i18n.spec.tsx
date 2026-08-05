/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Vitest hoisted state cannot use an ESM import.
  const { atom } = require('nanostores') as typeof import('nanostores');

  return {
    chatId: atom<string | undefined>('chat-1'),
    forkChat: vi.fn(),
    toastError: vi.fn(),
  };
});

vi.mock('react-toastify', () => ({
  toast: { error: (...args: unknown[]) => mocks.toastError(...args) },
}));

vi.mock('~/lib/persistence/db', () => ({
  forkChat: (...args: unknown[]) => mocks.forkChat(...args),
}));

vi.mock('~/lib/persistence/useChatHistory', () => ({
  db: { chats: {} },
  chatId: mocks.chatId,
}));

vi.mock('./AssistantMessage', () => ({
  AssistantMessage: ({ onFork }: { onFork: (messageId: string) => void }) => (
    <button type="button" onClick={() => onFork('assistant-1')}>
      test-fork-control
    </button>
  ),
}));

vi.mock('./UserMessage', () => ({
  UserMessage: ({ content }: { content: string }) => <div>{content}</div>,
}));

import { Messages } from './Messages.client';

function renderLocalized(node: ReactNode, language: 'en' | 'fr' = 'fr') {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    resources: { en: { translation: {} }, fr: { translation: {} } },
    initImmediate: false,
  });

  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{node}</MemoryRouter>
      </I18nextProvider>,
    ),
    i18n,
  };
}

beforeEach(() => {
  mocks.chatId.set('chat-1');
  mocks.forkChat.mockReset();
  mocks.toastError.mockReset();
});

afterEach(cleanup);

describe('<Messages /> i18n', () => {
  it('localizes the streaming status live', async () => {
    const { i18n } = renderLocalized(<Messages isStreaming addToolResult={vi.fn()} />);

    expect(screen.getByRole('status', { name: 'L’agent répond…' })).toBeTruthy();

    await act(async () => {
      await i18n.changeLanguage('en');
    });

    expect(screen.getByRole('status', { name: 'The agent is responding…' })).toBeTruthy();
  });

  it('uses safe localized fork errors and never exposes the persistence exception', async () => {
    mocks.forkChat.mockRejectedValue(new Error('IndexedDB upstream English error secret=123'));
    renderLocalized(
      <Messages
        messages={[{ id: 'assistant-1', role: 'assistant', content: 'Réponse conservée' }]}
        addToolResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'test-fork-control' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('Impossible de dupliquer la conversation. Réessayez.');
    });
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('IndexedDB'));
    expect(mocks.toastError).not.toHaveBeenCalledWith(expect.stringContaining('secret=123'));
  });

  it('localizes the unavailable-history error without attempting a fork', async () => {
    mocks.chatId.set(undefined);
    renderLocalized(
      <Messages
        messages={[{ id: 'assistant-1', role: 'assistant', content: 'Réponse conservée' }]}
        addToolResult={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'test-fork-control' }));

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith('L’historique de la conversation est indisponible.');
    });
    expect(mocks.forkChat).not.toHaveBeenCalled();
  });
});
