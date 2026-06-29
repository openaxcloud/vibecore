export type WorkspaceEventMap = {
  'file:applied': {
    filePath: string;
    source: 'agent' | 'user' | 'system';
    artifactId?: string;
    actionId?: string;
  };

  /*
   * Phase 0 #2 — emitted by ActionRunner while the AST self-repair retry
   * loop is in progress. status === null clears the surface (success or
   * exhausted). Keyed by relative file path because the action runner has
   * the relativePath on hand but not the artifact-level id; the patch
   * review queue can correlate against AgentPatchProposal.relativePath to
   * surface the "Self-repair attempt 1/2…" banner on the right card.
   */
  'agent:self-repair:progress': {
    filePath: string;
    status: { attempt: number; maxAttempts: number; errorMessage?: string } | null;
  };

  /*
   * Phase 0 #9 — emitted by ActionRunner at each terminal outcome of the AST
   * self-repair loop (one per attempt that fails, plus the final
   * repaired / gave_up). Distinct from the transient `:progress` banner: this
   * is the durable audit signal the workbench mirrors to the
   * `agent-repair-events` table (backend contract §9) for the repair review UI.
   */
  'agent:self-repair:event': {
    filePath: string;
    outcome: 'repaired' | 'failed' | 'gave_up';
    attempt: number;
    validationError?: string;
    repairError?: string;
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
