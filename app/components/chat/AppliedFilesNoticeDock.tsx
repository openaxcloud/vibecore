import { useStore } from '@nanostores/react';
import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ToastContainer } from 'react-toastify';

import { AGENT_APPLIED_CONTAINER_ID, AGENT_APPLIED_DOCK_ID } from './applied-files-notice-id';
import { themeStore } from '~/lib/stores/theme';

/** A layout destination; the persistent container is owned by the app root. */
export function AppliedFilesNoticeDock() {
  return <div id={AGENT_APPLIED_DOCK_ID} className="bolt-agent-applied-notice-dock" />;
}

/** Move one portal host, not the toast: details, focus, timers and callbacks survive navigation. */
export function AppliedFilesNoticeHost() {
  const theme = useStore(themeStore);
  const { t } = useTranslation();

  const [host] = useState(() => {
    const element = document.createElement('div');
    element.className = 'bolt-agent-applied-notice-host';

    return element;
  });

  useLayoutEffect(() => {
    let frame = 0;

    const readClocks = () =>
      (host.getAnimations?.({ subtree: true }) ?? [])
        .filter((animation): animation is CSSAnimation => 'animationName' in animation)
        .map((animation) => ({
          target: (animation.effect as KeyframeEffect | null)?.target,
          name: animation.animationName,
          time: animation.currentTime,
        }));

    let clocks: ReturnType<typeof readClocks> = [];

    const place = () => {
      frame = 0;

      const currentClocks = readClocks();

      if (currentClocks.length > 0) {
        clocks = currentClocks;
      }

      const dock = document.getElementById(AGENT_APPLIED_DOCK_ID);
      const destination = dock && dock.getClientRects().length > 0 ? dock : document.body;

      if (host.parentElement !== destination) {
        const focused = host.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;

        destination.appendChild(host);

        for (const animation of host.getAnimations?.({ subtree: true }) ?? []) {
          if (!('animationName' in animation)) {
            continue;
          }

          const clock = clocks.find(
            (entry) =>
              entry.target === (animation.effect as KeyframeEffect | null)?.target &&
              entry.name === animation.animationName,
          );

          if (clock?.time != null) {
            animation.currentTime = clock.time;
          }
        }

        focused?.focus({ preventScroll: true });
      }

      /*
       * Hiding an ancestor cancels its CSS animations before MutationObserver
       * can move the host. Keep the last visible clock while an animation runs;
       * no frame loop is needed for an idle or paused notice.
       */
      if ((host.getAnimations?.({ subtree: true }) ?? []).some((animation) => animation.playState === 'running')) {
        schedule();
      } else if (!host.querySelector('.Toastify__toast')) {
        clocks = [];
      }
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(place);
      }
    };

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    window.addEventListener('resize', schedule);
    place();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      host.remove();
    };
  }, [host]);

  return createPortal(
    <ToastContainer
      containerId={AGENT_APPLIED_CONTAINER_ID}
      aria-label={t('userArea.notifications.label')}
      className="bolt-agent-applied-notice-container"
      position="top-right"
      theme={theme}
      icon={false}
      closeButton={false}
      hideProgressBar
      autoClose={4000}
      pauseOnFocusLoss
      limit={1}
    />,
    host,
  );
}
