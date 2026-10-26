import { useEffect, useState } from 'react';

const IDE_SHELL = '.bolt-project-ide-shell, .bolt-responsive-ide';

/** Scope notifications to an actually mounted IDE, including legacy chat routes. */
export function useIdeToastLayout() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 1023px)');
    const update = () => setCompact(viewport.matches && Boolean(document.querySelector(IDE_SHELL)));

    const observer = new MutationObserver((changes) => {
      // Ignore streamed text changes; only a shell insertion/removal can change scope.
      if (
        changes.some((change) =>
          [...change.addedNodes, ...change.removedNodes].some(
            (node) => node instanceof Element && (node.matches(IDE_SHELL) || node.querySelector(IDE_SHELL)),
          ),
        )
      ) {
        update();
      }
    });

    update();
    viewport.addEventListener('change', update);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      viewport.removeEventListener('change', update);
      observer.disconnect();
    };
  }, []);

  return compact;
}
