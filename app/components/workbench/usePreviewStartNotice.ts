import { useCallback, useEffect, useMemo, useRef } from 'react';

/** One informational notice per mounted project visit; never a readiness signal. */
export function usePreviewStartNotice(projectId: string | undefined) {
  const visit = useMemo(() => ({ active: false, notified: false }), [projectId]);
  const currentVisit = useRef(visit);

  useEffect(() => {
    currentVisit.current = visit;
    visit.active = true;

    return () => {
      visit.active = false;
    };
  }, [visit]);

  // Stable identity: notification bookkeeping must not retrigger the boot effect.
  return useCallback(() => {
    const pendingVisit = currentVisit.current;

    return () => {
      if (!pendingVisit.active || pendingVisit.notified) {
        return false;
      }

      pendingVisit.notified = true;

      return true;
    };
  }, []);
}
