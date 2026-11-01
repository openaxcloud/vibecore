import { useStore } from '@nanostores/react';
import { useTranslation } from 'react-i18next';
import { ToastContainer } from 'react-toastify';

import { AGENT_APPLIED_CONTAINER_ID } from './AppliedFilesToast';
import { themeStore } from '~/lib/stores/theme';

/** A real layout row, so applied-file notifications cannot cover the transcript. */
export function AppliedFilesNoticeDock() {
  const theme = useStore(themeStore);
  const { t } = useTranslation();

  return (
    <div id={AGENT_APPLIED_CONTAINER_ID} className="bolt-agent-applied-notice-dock">
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
      />
    </div>
  );
}
