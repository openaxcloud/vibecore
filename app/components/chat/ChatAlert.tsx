import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { formatErrorSurfacesCopy, getErrorSurfacesCopy } from '~/lib/i18n/catalogs/error-surfaces';
import type { ActionAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface Props {
  alert: ActionAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export default function ChatAlert({ alert, clearAlert, postMessage }: Props) {
  const { i18n } = useTranslation();
  const copy = getErrorSurfacesCopy(i18n.resolvedLanguage ?? i18n.language);
  const { description, content, source } = alert;

  const isPreview = source === 'preview';
  const title = isPreview ? copy['chatAlert.preview.title'] : copy['chatAlert.terminal.title'];

  const message = isPreview ? copy['chatAlert.preview.message'] : copy['chatAlert.terminal.message'];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        role="alert"
        aria-label={title}
        className="bolt-project-chat-alert rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mb-2"
      >
        <div className="flex items-start">
          {/* Icon */}
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={`i-ph:warning-duotone text-xl text-bolt-elements-button-danger-text`}></div>
          </motion.div>
          {/* Content */}
          <div className="ml-3 min-w-0 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="break-words text-sm font-medium text-bolt-elements-textPrimary"
            >
              {title}
            </motion.h3>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-bolt-elements-textSecondary"
            >
              <p className="break-words">{message}</p>
              {description && (
                <details className="mt-4 mb-4 text-xs text-bolt-elements-textSecondary">
                  <summary className="inline-flex min-h-11 max-w-full cursor-pointer items-center break-words font-medium text-bolt-elements-textPrimary">
                    {copy['chatAlert.details']}
                  </summary>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-bolt-elements-background-depth-3 p-2">
                    <code>{description}</code>
                  </pre>
                </details>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className={classNames('flex flex-wrap gap-2')}>
                <button
                  onClick={() =>
                    postMessage(
                      formatErrorSurfacesCopy(
                        isPreview ? copy['chatAlert.prompt.preview'] : copy['chatAlert.prompt.terminal'],
                        { content },
                      ),
                    )
                  }
                  className={classNames(
                    'min-h-11 min-w-11 whitespace-normal rounded-md px-3 py-2 text-sm font-medium',
                    'bg-bolt-elements-button-primary-background',
                    'hover:bg-bolt-elements-button-primary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-danger-background',
                    'text-bolt-elements-button-primary-text',
                    'flex items-center gap-1.5',
                  )}
                >
                  <div className="i-ph:chat-circle-duotone"></div>
                  {copy['chatAlert.askAgent']}
                </button>
                <button
                  onClick={clearAlert}
                  className={classNames(
                    'min-h-11 min-w-11 whitespace-normal rounded-md px-3 py-2 text-sm font-medium',
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  {copy['chatAlert.dismiss']}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
