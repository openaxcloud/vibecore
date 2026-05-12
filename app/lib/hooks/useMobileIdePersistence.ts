import { useCallback, useEffect, useState } from 'react';

const STORAGE_PREFIX = 'vibecore.mobileIdeState';

export interface MobileIdeLocalState {
  activePanel?: string;
  selectedFile?: string;
  editorScroll?: {
    line: number;
    column: number;
  };
  terminalHistory?: string[];
}

function storageKey(projectId: string) {
  return `${STORAGE_PREFIX}.${projectId}`;
}

function readState(projectId?: string): MobileIdeLocalState {
  if (!projectId || typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(storageKey(projectId));

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as MobileIdeLocalState;

    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeState(projectId: string | undefined, state: MobileIdeLocalState) {
  if (!projectId || typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(storageKey(projectId), JSON.stringify(state));
  } catch {
    // Local storage is a convenience cache. Backend project IDE memory remains authoritative.
  }
}

export function useMobileIdePersistence(projectId?: string) {
  const [state, setState] = useState<MobileIdeLocalState>(() => readState(projectId));

  useEffect(() => {
    setState(readState(projectId));
  }, [projectId]);

  useEffect(() => {
    writeState(projectId, state);
  }, [projectId, state]);

  const setActivePanel = useCallback((activePanel: string) => {
    setState((current) => ({ ...current, activePanel }));
  }, []);

  const setSelectedFile = useCallback((selectedFile: string | undefined) => {
    setState((current) => ({ ...current, selectedFile }));
  }, []);

  const setEditorScroll = useCallback((line: number, column: number) => {
    setState((current) => ({ ...current, editorScroll: { line, column } }));
  }, []);

  const setTerminalHistory = useCallback((terminalHistory: string[]) => {
    setState((current) => ({ ...current, terminalHistory: terminalHistory.slice(-100) }));
  }, []);

  const clearState = useCallback(() => {
    setState({});

    if (!projectId || typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.removeItem(storageKey(projectId));
    } catch {
      // Ignore storage cleanup failures; this state is recoverable.
    }
  }, [projectId]);

  return {
    state,
    setActivePanel,
    setSelectedFile,
    setEditorScroll,
    setTerminalHistory,
    clearState,
  };
}
