import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from 'react';

type Menu = 'sessions' | 'actions' | null;
interface Transfer {
  source: HTMLElement;
  control: string;
  menu: Menu;
  location: string;
  reserved?: boolean;
  consumed?: boolean;
}

const Context = createContext<MutableRefObject<Map<string, Transfer>> | null>(null);
const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function ScopedProvider({ children }: { children: ReactNode }) {
  const transfers = useRef(new Map<string, Transfer>());

  return <Context.Provider value={transfers}>{children}</Context.Provider>;
}

/** Route lifetime isolates transient interaction receipts from other projects and windows. */
export function TerminalInteractionHandoffProvider({
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
  return <ScopedProvider key={JSON.stringify([projectId, workspaceId ?? null, windowId])}>{children}</ScopedProvider>;
}

/** A committed mobile destination can own the receipt while its lazy Workbench mounts. */
export function TerminalInteractionHandoffBoundary({
  paneId,
  slot,
  children,
}: {
  paneId?: string;
  slot: string;
  children: ReactNode;
}) {
  const shared = useContext(Context);
  const identity = paneId ? JSON.stringify([paneId, slot]) : undefined;
  const held = useRef<{ identity: string; transfer: Transfer }>();

  useClientLayoutEffect(() => {
    if (!shared || !identity) {
      held.current = undefined;
      return undefined;
    }

    const transfer =
      shared.current.get(identity) ?? (held.current?.identity === identity ? held.current.transfer : undefined);

    if (
      !transfer ||
      transfer.consumed ||
      transfer.source.isConnected ||
      transfer.location !== window.location.href ||
      document.activeElement !== document.body
    ) {
      held.current = undefined;
      return undefined;
    }

    held.current = { identity, transfer };
    transfer.reserved = true;
    shared.current.set(identity, transfer);

    const abandon = () => {
      held.current = undefined;
      transfer.reserved = false;
      transfer.consumed = true;

      if (shared.current.get(identity) === transfer) {
        shared.current.delete(identity);
      }
    };
    const interaction = (event: Event) => {
      if (!(event.target instanceof Node) || !transfer.source.contains(event.target)) {
        abandon();
      }
    };
    document.addEventListener('pointerdown', interaction, true);
    document.addEventListener('keydown', interaction, true);
    document.addEventListener('focusin', interaction, true);
    window.addEventListener('popstate', abandon);
    window.addEventListener('hashchange', abandon);
    window.addEventListener('resize', abandon);

    return () => {
      transfer.reserved = false;

      if (shared.current.get(identity) === transfer) {
        shared.current.delete(identity);
      }

      document.removeEventListener('pointerdown', interaction, true);
      document.removeEventListener('keydown', interaction, true);
      document.removeEventListener('focusin', interaction, true);
      window.removeEventListener('popstate', abandon);
      window.removeEventListener('hashchange', abandon);
      window.removeEventListener('resize', abandon);
    };
  }, [shared, identity]);

  return <>{children}</>;
}

export function useTerminalInteractionHandoff(
  root: RefObject<HTMLDivElement>,
  identity: string | undefined,
  menu: () => Menu,
  restoreMenu: (menu: Menu) => void,
) {
  const shared = useContext(Context);
  const current = useRef({ menu, restoreMenu });
  current.current = { menu, restoreMenu };

  const pending = useRef<Transfer>();

  useClientLayoutEffect(() => {
    if (!shared || !identity) {
      return undefined;
    }

    const element = root.current;
    const location = window.location.href;
    const transfer = shared.current.get(identity);
    shared.current.delete(identity);

    if (transfer) {
      transfer.consumed = true;
    }

    if (
      transfer &&
      !transfer.source.isConnected &&
      transfer.location === location &&
      document.activeElement === document.body
    ) {
      pending.current = transfer;
      current.current.restoreMenu(transfer.menu);
      queueMicrotask(() => {
        if (pending.current === transfer) {
          pending.current = undefined;
        }
      });
    }

    return () => {
      const focused = document.activeElement;

      if (!(focused instanceof HTMLElement) || !element?.contains(focused)) {
        return;
      }

      const control = focused.dataset.terminalControl;

      if (!control || window.location.href !== location) {
        return;
      }

      const receipt: Transfer = { source: element, control, menu: current.current.menu(), location };
      shared.current.set(identity, receipt);

      // A later reopen (even without another pointer event) must never revive a menu.
      queueMicrotask(() => {
        if (!receipt.reserved && shared.current.get(identity) === receipt) {
          shared.current.delete(identity);
        }
      });
    };
  }, [shared, identity, root]);

  /** Takes priority over the menu's usual first/last-control autofocus. Never clicks a control. */
  return (renderedMenu: Menu) => {
    const transfer = pending.current;

    if (!transfer) {
      return false;
    }

    // The first passive effect can precede the render requested by layout restoration.
    if (renderedMenu !== transfer.menu) {
      return true;
    }

    if (window.location.href !== transfer.location || document.activeElement !== document.body) {
      pending.current = undefined;
      current.current.restoreMenu(null);

      return true;
    }

    const target = Array.from(root.current?.querySelectorAll<HTMLElement>('[data-terminal-control]') ?? []).find(
      (element) => element.dataset.terminalControl === transfer.control,
    );

    pending.current = undefined;

    if (target) {
      target.focus({ preventScroll: true });
    }

    return true;
  };
}
