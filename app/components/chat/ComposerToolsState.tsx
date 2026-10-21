import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { seedColorSchemeState, type ColorSchemeLocalState } from '~/components/ui/color-scheme-state';
import type { DesignScheme } from '~/types/design-scheme';

export type DesignPaletteState = ColorSchemeLocalState & {
  open: boolean;
  activeSection: 'colors' | 'typography' | 'features';
};

type PalettePair = [DesignPaletteState, Dispatch<SetStateAction<DesignPaletteState>>];
type ToolsState = { menuOpen: boolean; palette: DesignPaletteState };
type ToolsPair = [ToolsState, Dispatch<SetStateAction<ToolsState>>];

const Context = createContext<ToolsPair | undefined>(undefined);

function initialPalette(scheme?: DesignScheme): DesignPaletteState {
  return { ...seedColorSchemeState(scheme), open: false, activeSection: 'colors' };
}

function ScopedTools({ children }: { children: ReactNode }) {
  const state = useState<ToolsState>(() => ({ menuOpen: false, palette: initialPalette() }));

  return <Context.Provider value={state}>{children}</Context.Provider>;
}

/** Keep unfinished composer interactions through shell replacement, within one IDE scope. */
export function ComposerToolsProvider({
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
  return <ScopedTools key={JSON.stringify([projectId, workspaceId, windowId])}>{children}</ScopedTools>;
}

export function useComposerToolsMenu(): [boolean, Dispatch<SetStateAction<boolean>>] {
  const shared = useContext(Context);
  const [local, setLocal] = useState(false);
  const setShared = shared?.[1];

  const setOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      if (!setShared) {
        setLocal(value);
        return;
      }

      setShared((previous) => {
        const next = typeof value === 'function' ? value(previous.menuOpen) : value;

        return {
          ...previous,
          menuOpen: next,
          palette: next ? previous.palette : { ...previous.palette, open: false },
        };
      });
    },
    [setShared],
  );

  return [shared ? shared[0].menuOpen : local, setOpen];
}

export function useDesignPaletteState(scheme?: DesignScheme): PalettePair {
  const shared = useContext(Context);
  const [local, setLocal] = useState(() => initialPalette(scheme));
  const setShared = shared?.[1];

  const setPalette = useCallback<Dispatch<SetStateAction<DesignPaletteState>>>(
    (value) => {
      if (!setShared) {
        setLocal(value);
        return;
      }

      setShared((previous) => ({
        ...previous,
        palette: typeof value === 'function' ? value(previous.palette) : value,
      }));
    },
    [setShared],
  );

  return [shared ? shared[0].palette : local, setPalette];
}
