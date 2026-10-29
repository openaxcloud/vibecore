import { useEffect, useState } from 'react';

interface CommittedLocation {
  pathname: string;
  search: string;
}

/** A repeated POP may return to the same route key without an intermediate React commit. */
export function useMobilePanelHistorySync(enabled: boolean, location: CommittedLocation, navigationState: string) {
  const [popRevision, setPopRevision] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const onPopState = () => setPopRevision((revision) => revision + 1);
    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, [enabled]);

  const ready =
    !enabled ||
    (typeof window !== 'undefined' &&
      navigationState === 'idle' &&
      location.pathname === window.location.pathname &&
      location.search === window.location.search);

  return { popRevision, ready };
}
