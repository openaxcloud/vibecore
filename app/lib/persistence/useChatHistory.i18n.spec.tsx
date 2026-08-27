/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import type { PropsWithChildren } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {},
  });

  return {
    loaderData: {} as { id?: string; projectId?: string },
    searchParams: new URLSearchParams(),
    navigate: vi.fn(),
    toastInfo: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    consoleError: vi.fn(),
    openDatabase: vi.fn(async () => ({ name: 'chat-history-spec-db' })),
    getMessages: vi.fn(),
    getNextId: vi.fn(),
    getUrlId: vi.fn(),
    setMessages: vi.fn(),
    duplicateChat: vi.fn(),
    createChatFromMessages: vi.fn(),
    getSnapshot: vi.fn(),
    setSnapshot: vi.fn(),
    getProjectIdeMemory: vi.fn(),
    saveProjectIdeMemory: vi.fn(),
    createDirectory: vi.fn(),
    writeFile: vi.fn(),
    logError: vi.fn(),
  };
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useLoaderData: () => mocks.loaderData,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [mocks.searchParams, vi.fn()],
  };
});

vi.mock('react-toastify', () => ({
  toast: {
    info: (...args: unknown[]) => mocks.toastInfo(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

vi.mock('./db', () => ({
  openDatabase: (...args: unknown[]) => mocks.openDatabase(...args),
  getMessages: (...args: unknown[]) => mocks.getMessages(...args),
  getNextId: (...args: unknown[]) => mocks.getNextId(...args),
  getUrlId: (...args: unknown[]) => mocks.getUrlId(...args),
  setMessages: (...args: unknown[]) => mocks.setMessages(...args),
  duplicateChat: (...args: unknown[]) => mocks.duplicateChat(...args),
  createChatFromMessages: (...args: unknown[]) => mocks.createChatFromMessages(...args),
  getSnapshot: (...args: unknown[]) => mocks.getSnapshot(...args),
  setSnapshot: (...args: unknown[]) => mocks.setSnapshot(...args),
}));

vi.mock('./projectIdeMemory', () => ({
  getProjectIdeMemory: (...args: unknown[]) => mocks.getProjectIdeMemory(...args),
  saveProjectIdeMemory: (...args: unknown[]) => mocks.saveProjectIdeMemory(...args),
}));

vi.mock('~/lib/runtime/RuntimeAdapterProvider', () => ({
  runtimeAdapter: {
    workdir: '/home/project',
    createDirectory: (...args: unknown[]) => mocks.createDirectory(...args),
    writeFile: (...args: unknown[]) => mocks.writeFile(...args),
  },
}));

vi.mock('~/lib/stores/logs', () => ({
  logStore: {
    logError: (...args: unknown[]) => mocks.logError(...args),
  },
}));

vi.mock('~/lib/stores/workbench', () => ({
  workbenchStore: {
    firstArtifact: undefined,
    files: { get: () => ({}) },
  },
}));

vi.mock('~/utils/projectCommands', () => ({
  detectProjectCommands: vi.fn(async () => []),
  createCommandActionsString: vi.fn(() => ''),
  escapeBoltActionAttribute: vi.fn((value: string) => value),
}));

import { description, useChatHistory } from './useChatHistory';
import {
  chatHistoryEn,
  chatHistoryFr,
  getChatHistoryCopy,
  getChatHistorySafeError,
  resolveProjectAssistantDescription,
} from '~/lib/i18n/catalogs/chat-history';

function wrapper(language: string) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: language,
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr', 'es'],
    resources: { en: { translation: {} }, fr: { translation: {} }, es: { translation: {} } },
    initImmediate: false,
  });

  return function TestI18nProvider({ children }: PropsWithChildren) {
    return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
  };
}

describe('useChatHistory i18n', () => {
  beforeEach(() => {
    mocks.loaderData = {};
    mocks.searchParams = new URLSearchParams();
    localStorage.clear();

    for (const mock of [
      mocks.navigate,
      mocks.toastInfo,
      mocks.toastError,
      mocks.toastSuccess,
      mocks.consoleError,
      mocks.getMessages,
      mocks.getNextId,
      mocks.getUrlId,
      mocks.setMessages,
      mocks.duplicateChat,
      mocks.createChatFromMessages,
      mocks.getSnapshot,
      mocks.setSnapshot,
      mocks.getProjectIdeMemory,
      mocks.saveProjectIdeMemory,
      mocks.createDirectory,
      mocks.writeFile,
      mocks.logError,
    ]) {
      mock.mockReset();
    }

    mocks.getNextId.mockResolvedValue('chat-next');
    mocks.getUrlId.mockResolvedValue('chat-url');
    mocks.setMessages.mockResolvedValue(undefined);
    mocks.setSnapshot.mockResolvedValue(undefined);
    mocks.saveProjectIdeMemory.mockResolvedValue(undefined);
    mocks.getMessages.mockResolvedValue(undefined);
    mocks.getSnapshot.mockResolvedValue(undefined);
    mocks.getProjectIdeMemory.mockResolvedValue({ chat: undefined, updatedAt: '2026-08-05T00:00:00.000Z' });
    description.set(undefined);
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => mocks.consoleError(...args));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps strict catalog parity, safe errors, and English fallback', () => {
    expect(Object.keys(chatHistoryFr).sort()).toEqual(Object.keys(chatHistoryEn).sort());

    for (const key of Object.keys(chatHistoryEn) as Array<keyof typeof chatHistoryEn>) {
      expect(chatHistoryEn[key].trim().length, key).toBeGreaterThan(0);
      expect(chatHistoryFr[key].trim().length, key).toBeGreaterThan(0);
    }

    const rawError = new Error('IndexedDB failed: token=raw-secret-value');

    expect(getChatHistoryCopy('fr-FR')['chatHistory.fallback.projectAssistant']).toBe('Assistant de projet');
    expect(getChatHistoryCopy('es-ES')['chatHistory.fallback.projectAssistant']).toBe('Project assistant');
    expect(getChatHistorySafeError('chatHistory.error.import', 'fr', rawError)).toBe(
      'Impossible d’importer la conversation.',
    );
  });

  it('localizes only exact generated titles on the canonical project chat', () => {
    expect(resolveProjectAssistantDescription('Project assistant', 'project:project-1', 'project-1', 'fr')).toBe(
      'Assistant de projet',
    );
    expect(resolveProjectAssistantDescription('Assistant de projet', 'project:project-1', 'project-1', 'en')).toBe(
      'Project assistant',
    );
    expect(resolveProjectAssistantDescription('Project assistant ACME', 'project:project-1', 'project-1', 'fr')).toBe(
      'Project assistant ACME',
    );
    expect(resolveProjectAssistantDescription(' Project assistant', 'project:project-1', 'project-1', 'fr')).toBe(
      ' Project assistant',
    );
    expect(resolveProjectAssistantDescription('Project Assistant', 'project:project-1', 'project-1', 'fr')).toBe(
      'Project Assistant',
    );
    expect(resolveProjectAssistantDescription('Project assistant ', 'project:project-1', 'project-1', 'fr')).toBe(
      'Project assistant ',
    );
    expect(resolveProjectAssistantDescription('Project assistant', 'imported-chat', 'project-1', 'fr')).toBe(
      'Project assistant',
    );
  });

  it('renders a persisted English project fallback in French without rewriting memory', async () => {
    mocks.loaderData = { projectId: 'project-1' };
    mocks.getProjectIdeMemory.mockResolvedValueOnce({
      chat: {
        id: 'project:project-1',
        description: 'Project assistant',
        messages: [{ id: 'message-1', role: 'assistant', content: 'Persisted assistant response' }],
      },
      updatedAt: '2026-08-05T00:00:00.000Z',
    });

    const { result } = renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(description.get()).toBe('Assistant de projet');
    expect(mocks.setMessages).not.toHaveBeenCalled();
    expect(mocks.saveProjectIdeMemory).not.toHaveBeenCalled();
  });

  it('renders the local-only warning in French and falls back to English', async () => {
    const french = renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(
        'L’historique des conversations est stocké localement sur cet appareil et ne sera pas synchronisé avec vos autres appareils.',
        expect.objectContaining({ toastId: 'local-chat-persistence' }),
      ),
    );

    french.unmount();
    localStorage.clear();
    mocks.toastInfo.mockReset();
    renderHook(() => useChatHistory(), { wrapper: wrapper('es') });

    await waitFor(() =>
      expect(mocks.toastInfo).toHaveBeenCalledWith(
        'Chat history is stored locally on this device and will not sync across devices.',
        expect.objectContaining({ toastId: 'local-chat-persistence' }),
      ),
    );
  });

  it('masks a raw project-memory failure in both the toast and visible event log', async () => {
    const rawError = 'IndexedDB rejected service_role=raw-secret-detail';
    mocks.loaderData = { projectId: 'project-1' };
    mocks.getProjectIdeMemory.mockRejectedValueOnce(new Error(rawError));

    renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(
        'Impossible de charger la mémoire de l’IDE du projet.',
        expect.objectContaining({ toastId: 'project-ide-memory-load-project-1' }),
      ),
    );
    expect(mocks.logError).toHaveBeenCalledWith('Impossible de charger la mémoire de l’IDE du projet.');
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.consoleError.mock.calls)).not.toContain(rawError);
  });

  it('localizes generated snapshot-restoration messages without translating technical markup', async () => {
    mocks.loaderData = { id: 'chat-1' };
    mocks.getMessages.mockResolvedValueOnce({
      id: 'chat-1',
      urlId: 'chat-one',
      description: 'Titre défini par l’utilisateur',
      timestamp: '2026-08-05T00:00:00.000Z',
      messages: [
        { id: 'message-1', role: 'user', content: 'Contenu utilisateur antérieur' },
        { id: 'message-2', role: 'assistant', content: 'Réponse antérieure' },
        { id: 'message-3', role: 'user', content: 'Contenu utilisateur conservé' },
      ],
    });
    mocks.getSnapshot.mockResolvedValueOnce({ chatIndex: 'message-2', files: {} });

    const { result } = renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.initialMessages[0]?.content).toBe('Restaurer le projet depuis l’instantané');
    expect(result.current.initialMessages[1]?.content).toContain(
      'Votre conversation a été restaurée depuis un instantané.',
    );
    expect(result.current.initialMessages[1]?.content).toContain('title="Projet et configuration restaurés"');
    expect(result.current.initialMessages[1]?.content).toContain('<boltArtifact id="restored-project-setup"');
    expect(result.current.initialMessages[2]?.content).toBe('Contenu utilisateur conservé');
  });

  it('never appends a raw import exception to French feedback', async () => {
    const rawError = 'Import failed: password=raw-secret-value';
    mocks.createChatFromMessages.mockRejectedValueOnce(new Error(rawError));

    const { result } = renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await act(async () => {
      await result.current.importChat('Conversation importée par l’utilisateur', [], undefined);
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Impossible d’importer la conversation.');
    expect(mocks.logError).toHaveBeenCalledWith('Impossible d’importer la conversation.');
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.consoleError.mock.calls)).not.toContain(rawError);
  });

  it('masks a raw export exception instead of rejecting without feedback', async () => {
    const rawError = 'Export failed: access_token=raw-secret-value';
    mocks.getMessages.mockRejectedValueOnce(new Error(rawError));

    const { result } = renderHook(() => useChatHistory(), { wrapper: wrapper('fr') });

    await act(async () => {
      await result.current.exportChat('chat-export');
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Impossible d’exporter la conversation.');
    expect(mocks.logError).toHaveBeenCalledWith('Impossible d’exporter la conversation.');
    expect(JSON.stringify(mocks.toastError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain(rawError);
    expect(JSON.stringify(mocks.consoleError.mock.calls)).not.toContain(rawError);
  });

  it('has zero hardcoded-copy findings and no raw error-message concatenation', async () => {
    const file = 'app/lib/persistence/useChatHistory.ts';
    const source = readFileSync(file, 'utf8');
    const { scanSource } = await import('../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, file);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).not.toMatch(/error\.message|String\(error\)/u);
  });
});
