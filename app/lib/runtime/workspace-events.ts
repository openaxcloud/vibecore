export type WorkspaceEventMap = {
  'file:applied': {
    filePath: string;
    source: 'agent' | 'user' | 'system';
    artifactId?: string;
    actionId?: string;
  };
};

type WorkspaceEventName = keyof WorkspaceEventMap;
type WorkspaceEventHandler<T extends WorkspaceEventName> = (payload: WorkspaceEventMap[T]) => void;

class WorkspaceEvents {
  #target = new EventTarget();

  emit<T extends WorkspaceEventName>(eventName: T, payload: WorkspaceEventMap[T]) {
    this.#target.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
  }

  on<T extends WorkspaceEventName>(eventName: T, handler: WorkspaceEventHandler<T>) {
    const listener = (event: Event) => {
      handler((event as CustomEvent<WorkspaceEventMap[T]>).detail);
    };

    this.#target.addEventListener(eventName, listener);

    return () => {
      this.#target.removeEventListener(eventName, listener);
    };
  }
}

export const workspaceEvents = new WorkspaceEvents();
