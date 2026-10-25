import { useCallback, useEffect, useRef, useState } from 'react';

/** Isolate each request to the project that issued it, including late responses. */
export function useProjectDomains(projectId?: string) {
  const [state, setState] = useState<{
    projectId?: string;
    data: any;
    loading: boolean;
    busy: boolean;
    error: boolean;
    status?: number;
  }>({
    projectId,
    data: null,
    loading: Boolean(projectId),
    busy: false,
    error: false,
  });

  const active = useRef<AbortController>();
  const mutation = useRef(false);
  const generation = useRef(0);
  const currentProject = useRef(projectId);

  const load = useCallback(async () => {
    if (!projectId) {
      return;
    }

    const requestGeneration = generation.current;
    active.current?.abort();

    const controller = new AbortController();
    active.current = controller;
    setState((previous) => ({ ...previous, projectId, loading: true, error: false, status: undefined }));

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/domains`, {
        headers: { accept: 'application/json' },
        signal: controller.signal,
      });

      if (!response.ok) {
        if (!controller.signal.aborted && generation.current === requestGeneration) {
          setState((previous) => ({ ...previous, loading: false, error: true, status: response.status }));
        }

        return;
      }

      const envelope: unknown = await response.json();

      if (
        controller.signal.aborted ||
        currentProject.current !== projectId ||
        generation.current !== requestGeneration
      ) {
        return;
      }

      const data = envelope && typeof envelope === 'object' && 'data' in envelope ? envelope.data : envelope;

      if (!data || typeof data !== 'object' || !('domains' in data) || !Array.isArray(data.domains)) {
        setState((previous) => ({ ...previous, loading: false, error: true }));

        return;
      }

      setState((previous) => ({ ...previous, projectId, data, loading: false, error: false }));
    } catch {
      if (
        !controller.signal.aborted &&
        currentProject.current === projectId &&
        generation.current === requestGeneration
      ) {
        setState((previous) => ({ ...previous, loading: false, error: true }));
      }
    }
  }, [projectId]);

  useEffect(() => {
    generation.current += 1;
    currentProject.current = projectId;
    mutation.current = false;
    setState({ projectId, data: null, loading: Boolean(projectId), busy: false, error: false });
    void load();

    return () => {
      generation.current += 1;
      active.current?.abort();
    };
  }, [projectId, load]);

  const submit = useCallback(
    async (form: FormData) => {
      if (!projectId || mutation.current) {
        return;
      }

      const mutationGeneration = generation.current;
      const isCurrent = () => currentProject.current === projectId && generation.current === mutationGeneration;
      mutation.current = true;
      setState((previous) => ({ ...previous, busy: true, error: false, status: undefined }));

      try {
        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/domains`, {
          method: 'POST',
          body: form,
        });

        if (!response.ok) {
          if (isCurrent()) {
            setState((previous) => ({ ...previous, error: true, status: response.status }));
          }

          return;
        }

        if (isCurrent()) {
          await load();
        }
      } catch {
        if (isCurrent()) {
          setState((previous) => ({ ...previous, error: true }));
        }
      } finally {
        if (isCurrent()) {
          mutation.current = false;
          setState((previous) => ({ ...previous, busy: false }));
        }
      }
    },
    [projectId, load],
  );

  return {
    ...(state.projectId === projectId ? state : { data: null, loading: true, busy: false, error: false }),
    load,
    submit,
  };
}
