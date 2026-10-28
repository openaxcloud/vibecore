import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface ProjectMemory {
  id: string;
  content?: string;
  summary?: string;
  memoryType?: string;
  tags?: string[];
  scope?: string;
  importance?: number;
  accessCount?: number;
  updatedAt?: string;
}

export function parseMemoryTags(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

/** Ephemeral route state only. No account, credentials or persistent browser storage. */
function useSettingsState(projectId: string) {
  const { t } = useTranslation();
  const [settingsTab, setSettingsTab] = useState('project');
  const [memoryDraft, setMemoryDraft] = useState('');
  const [memoryType, setMemoryType] = useState('semantic');
  const [memoryTags, setMemoryTags] = useState('');
  const [memoryError, setMemoryError] = useState<string>();
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [memoryEnabled, setMemoryEnabled] = useState(true);
  const [memoryEditId, setMemoryEditId] = useState<string>();
  const [memoryEditDraft, setMemoryEditDraft] = useState('');
  const [memoryEditType, setMemoryEditType] = useState('semantic');
  const [memoryEditTags, setMemoryEditTags] = useState('');
  const [memoryNotice, setMemoryNotice] = useState('');
  const currentDraft = useRef('');
  currentDraft.current = JSON.stringify([memoryDraft, memoryType, memoryTags]);

  const currentEdit = useRef('');
  currentEdit.current = JSON.stringify([memoryEditId, memoryEditDraft, memoryEditType, memoryEditTags]);

  const operation = useRef(false);
  const lifetime = useRef<AbortController>();
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;

    return () => controller.abort();
  }, []);

  const memoryFetch = useCallback((input: RequestInfo | URL, init?: RequestInit) => {
    const signal = lifetime.current?.signal;

    if (signal?.aborted) {
      return Promise.reject(new DOMException('Route closed', 'AbortError'));
    }

    return fetch(input, { ...init, signal });
  }, []);
  const run = useCallback(async (action: () => Promise<void>) => {
    if (operation.current || lifetime.current?.signal.aborted) {
      return;
    }

    operation.current = true;
    setMemoryLoading(true);

    try {
      await action();
    } finally {
      operation.current = false;
      setMemoryLoading(false);
    }
  }, []);

  const refreshMemories = useCallback(async () => {
    if (!projectId) {
      return;
    }

    setMemoryError(undefined);

    try {
      const response = await memoryFetch(`/api/agent-memory?projectId=${encodeURIComponent(projectId)}&limit=30`, {
        headers: { accept: 'application/json' },
      });
      const preferenceResponse = await memoryFetch(
        `/api/agent-memory/preferences?projectId=${encodeURIComponent(projectId)}`,
        {
          headers: { accept: 'application/json' },
        },
      );

      const payload = (await response.json()) as { memories?: ProjectMemory[]; error?: string };

      const preferencePayload = (await preferenceResponse.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        console.warn('Agent memory request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.loadFailedHttp', { status: response.status }));

        return;
      }

      if (!preferenceResponse.ok) {
        console.warn('Agent memory preference request failed', {
          status: preferenceResponse.status,
          serverError: preferencePayload.error,
        });
        setMemoryError(
          t('baseChatAst.memory.preferenceLoadFailedHttp', {
            status: preferenceResponse.status,
          }),
        );

        return;
      }

      setMemories(payload.memories ?? []);
      setMemoryEnabled(preferencePayload.preference?.enabled !== false);
    } catch (error) {
      if (lifetime.current?.signal.aborted) {
        return;
      }

      console.error('Agent memory request failed', error);
      setMemoryError(t('baseChatAst.memory.loadFailed'));
    }
  }, [projectId, t, memoryFetch]);

  async function saveMemoryRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!memoryDraft.trim()) {
      return;
    }

    setMemoryError(undefined);

    try {
      const response = await memoryFetch('/api/agent-memory', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          scope: 'project',
          projectId,
          content: memoryDraft,
          memoryType,
          tags: parseMemoryTags(memoryTags),
          source: 'manual',
          force: true,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        skipped?: string;
      };

      if (!response.ok) {
        console.warn('Agent memory save request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.saveFailedHttp', { status: response.status }));
        setMemoryNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      /*
       * The API returns 202 (ok) with a {skipped} reason (quota_exceeded /
       * too_short) when the write was NOT persisted — don't claim "saved".
       */
      if (response.status === 202 || payload.skipped) {
        console.warn('Agent memory save was skipped', { reason: payload.skipped });
        setMemoryError(t('baseChatAst.memory.notSaved'));
        setMemoryNotice(t('baseChatAst.memory.notSaved'));

        return;
      }

      if (currentDraft.current === JSON.stringify([memoryDraft, memoryType, memoryTags])) {
        setMemoryDraft('');
        setMemoryTags('');
      }

      setMemoryNotice(t('baseChatAst.memory.saved'));
      await refreshMemories();
    } catch (error) {
      if (lifetime.current?.signal.aborted) {
        return;
      }

      console.error('Agent memory save request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setMemoryNotice(t('baseChatAst.memory.actionFailed'));
    }
  }

  async function deleteMemoryRequest(memoryId: string) {
    setMemoryError(undefined);

    try {
      const response = await memoryFetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'DELETE',
        headers: { accept: 'application/json' },
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        console.warn('Agent memory delete request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.deleteFailedHttp', { status: response.status }));
        setMemoryNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      setMemoryNotice(t('baseChatAst.memory.deleted'));
      await refreshMemories();
    } catch (error) {
      if (lifetime.current?.signal.aborted) {
        return;
      }

      console.error('Agent memory delete request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setMemoryNotice(t('baseChatAst.memory.actionFailed'));
    }
  }

  async function toggleMemoryEnabledRequest(enabled: boolean) {
    setMemoryError(undefined);

    try {
      const response = await memoryFetch('/api/agent-memory/preferences', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ projectId, enabled }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        preference?: { enabled?: boolean };
        error?: string;
      };

      if (!response.ok) {
        console.warn('Agent memory preference update failed', {
          status: response.status,
          serverError: payload.error,
        });
        setMemoryError(t('baseChatAst.memory.preferenceUpdateFailedHttp', { status: response.status }));
        setMemoryNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      setMemoryEnabled(payload.preference?.enabled !== false);
      setMemoryNotice(t(enabled ? 'baseChatAst.memory.enabled' : 'baseChatAst.memory.disabled'));
    } catch (error) {
      if (lifetime.current?.signal.aborted) {
        return;
      }

      console.error('Agent memory preference update failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setMemoryNotice(t('baseChatAst.memory.actionFailed'));
    }
  }

  function startEditMemory(memory: ProjectMemory) {
    setMemoryEditId(memory.id);
    setMemoryEditDraft(memory.content ?? memory.summary ?? '');
    setMemoryEditType(memory.memoryType ?? 'semantic');
    setMemoryEditTags(Array.isArray(memory.tags) ? memory.tags.join(', ') : '');
  }

  async function saveEditedMemoryRequest(memoryId: string) {
    if (!memoryEditDraft.trim()) {
      return;
    }

    setMemoryError(undefined);

    try {
      const response = await memoryFetch(`/api/agent-memory/${encodeURIComponent(memoryId)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          content: memoryEditDraft,
          memoryType: memoryEditType,
          tags: parseMemoryTags(memoryEditTags),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        console.warn('Agent memory update request failed', { status: response.status, serverError: payload.error });
        setMemoryError(t('baseChatAst.memory.updateFailedHttp', { status: response.status }));
        setMemoryNotice(t('baseChatAst.memory.actionFailed'));

        return;
      }

      if (currentEdit.current === JSON.stringify([memoryEditId, memoryEditDraft, memoryEditType, memoryEditTags])) {
        setMemoryEditId(undefined);
        setMemoryEditDraft('');
        setMemoryEditTags('');
      }

      setMemoryNotice(t('baseChatAst.memory.updated'));
      await refreshMemories();
    } catch (error) {
      if (lifetime.current?.signal.aborted) {
        return;
      }

      console.error('Agent memory update request failed', error);
      setMemoryError(t('baseChatAst.memory.actionFailed'));
      setMemoryNotice(t('baseChatAst.memory.actionFailed'));
    }
  }

  const loadMemories = useCallback(() => run(refreshMemories), [run, refreshMemories]);
  useEffect(() => {
    if (settingsTab === 'memory') {
      void loadMemories();
    }
  }, [settingsTab, loadMemories]);

  const saveMemory = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    return run(() => saveMemoryRequest(event));
  };

  const deleteMemory = (id: string) => run(() => deleteMemoryRequest(id));
  const toggleMemoryEnabled = (enabled: boolean) => run(() => toggleMemoryEnabledRequest(enabled));
  const saveEditedMemory = (id: string) => run(() => saveEditedMemoryRequest(id));

  return {
    settingsTab,
    setSettingsTab,
    memoryDraft,
    setMemoryDraft,
    memoryType,
    setMemoryType,
    memoryTags,
    setMemoryTags,
    memoryError,
    setMemoryError,
    memoryLoading,
    setMemoryLoading,
    memories,
    setMemories,
    memoryEnabled,
    setMemoryEnabled,
    memoryEditId,
    setMemoryEditId,
    memoryEditDraft,
    setMemoryEditDraft,
    memoryEditType,
    setMemoryEditType,
    memoryEditTags,
    setMemoryEditTags,
    memoryNotice,
    loadMemories,
    saveMemory,
    deleteMemory,
    toggleMemoryEnabled,
    startEditMemory,
    saveEditedMemory,
  };
}

const SettingsContext = createContext<ReturnType<typeof useSettingsState> | null>(null);

export function IdeSettingsDraftProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const state = useSettingsState(projectId);
  return <SettingsContext.Provider value={state}>{children}</SettingsContext.Provider>;
}
export function useIdeSettingsDraft(projectId: string) {
  const shared = useContext(SettingsContext);
  const local = useSettingsState(shared ? '' : projectId);

  return shared ?? local;
}
