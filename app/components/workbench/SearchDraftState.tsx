import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useRef,
  useLayoutEffect,
  useEffect,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from 'react';

interface SearchDraft {
  searchQuery: string;
  replaceQuery: string;
  caseSensitive: boolean;
  isRegex: boolean;
}

const emptyDraft: SearchDraft = { searchQuery: '', replaceQuery: '', caseSensitive: false, isRegex: false };
type UpdateDraft = <K extends keyof SearchDraft>(
  paneId: string,
  field: K,
  value: SetStateAction<SearchDraft[K]>,
) => void;

interface SearchFocusTransfer {
  paneId: string;
  field: 'query' | 'replacement';
  source: HTMLInputElement;
  start: number | null;
  end: number | null;
  direction: 'forward' | 'backward' | 'none' | null;
}

const SearchDraftContext = createContext<{
  drafts: Record<string, SearchDraft>;
  update: UpdateDraft;
  focusTransfer: MutableRefObject<SearchFocusTransfer | null>;
} | null>(null);

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function ScopedSearchDraftProvider({ children }: { children: ReactNode }) {
  const focusTransfer = useRef<SearchFocusTransfer | null>(null);
  const [drafts, setDrafts] = useState<Record<string, SearchDraft>>({});

  const update: UpdateDraft = useCallback((paneId, field, value) => {
    setDrafts((current) => {
      const draft = current[paneId] ?? emptyDraft;
      const nextValue = typeof value === 'function' ? value(draft[field]) : value;

      if (Object.is(draft[field], nextValue)) {
        return current;
      }

      return { ...current, [paneId]: { ...draft, [field]: nextValue } };
    });
  }, []);

  const context = useMemo(() => ({ drafts, update, focusTransfer }), [drafts, update]);

  return <SearchDraftContext.Provider value={context}>{children}</SearchDraftContext.Provider>;
}

/** Route lifetime survives startup shells; a scope change discards all drafts. */
export function SearchDraftProvider({
  projectId,
  workspaceId,
  windowId,
  children,
}: {
  projectId: string;
  workspaceId?: string;
  windowId: string;
  children: ReactNode;
}) {
  return (
    <ScopedSearchDraftProvider key={JSON.stringify([projectId, workspaceId ?? null, windowId])}>
      {children}
    </ScopedSearchDraftProvider>
  );
}

/** Only explicitly identified IDE panes share drafts; legacy workbenches stay local. */
export function useSearchDraft(paneId?: string) {
  const shared = useContext(SearchDraftContext);
  const [local, setLocal] = useState(emptyDraft);
  const update = shared?.update;
  const useShared = Boolean(shared && paneId);

  const setField = useCallback(
    <K extends keyof SearchDraft>(field: K, value: SetStateAction<SearchDraft[K]>) => {
      if (useShared && paneId && update) {
        update(paneId, field, value);
      } else {
        setLocal((draft) => ({ ...draft, [field]: typeof value === 'function' ? value(draft[field]) : value }));
      }
    },
    [useShared, paneId, update],
  );

  return {
    ...(useShared && paneId ? (shared!.drafts[paneId] ?? emptyDraft) : local),
    setSearchQuery: useCallback((value: SetStateAction<string>) => setField('searchQuery', value), [setField]),
    setReplaceQuery: useCallback((value: SetStateAction<string>) => setField('replaceQuery', value), [setField]),
    setCaseSensitive: useCallback((value: SetStateAction<boolean>) => setField('caseSensitive', value), [setField]),
    setIsRegex: useCallback((value: SetStateAction<boolean>) => setField('isRegex', value), [setField]),
  };
}

/** A focus receipt expires at the next microtask, before a later panel visit. */
export function useSearchFocusHandoff(paneId?: string) {
  const transfer = useContext(SearchDraftContext)?.focusTransfer;
  const root = useRef<HTMLDivElement>(null);

  useClientLayoutEffect(() => {
    if (!transfer || !paneId) {
      return undefined;
    }

    const receipt = transfer.current;

    if (receipt?.paneId === paneId) {
      transfer.current = null;

      const active = document.activeElement;
      const target = root.current?.querySelector<HTMLInputElement>(`[data-search-draft-field="${receipt.field}"]`);

      if (target && (active === document.body || active === receipt.source)) {
        target.focus({ preventScroll: true });
        target.setSelectionRange(receipt.start, receipt.end, receipt.direction ?? undefined);
      }
    }

    return () => {
      const source = document.activeElement;

      if (!(source instanceof HTMLInputElement) || !root.current?.contains(source)) {
        return;
      }

      const field = source.dataset.searchDraftField;

      if (field !== 'query' && field !== 'replacement') {
        return;
      }

      const pending: SearchFocusTransfer = {
        paneId,
        field,
        source,
        start: source.selectionStart,
        end: source.selectionEnd,
        direction: source.selectionDirection,
      };
      transfer.current = pending;

      // Layout cleanup precedes the successor's layout setup in the same commit.
      queueMicrotask(() => {
        if (transfer.current === pending) {
          transfer.current = null;
        }
      });
    };
  }, [paneId, transfer]);

  return root;
}
