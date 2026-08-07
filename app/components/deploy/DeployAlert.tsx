import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatDeployRemainingCopy,
  getDeployAlertText,
  getDeployRemainingCopy,
} from '~/lib/i18n/catalogs/deploy-remaining';
import type { DeployAlert } from '~/types/actions';
import { classNames } from '~/utils/classNames';

interface DeployAlertProps {
  alert: DeployAlert;
  clearAlert: () => void;
  postMessage: (message: string) => void;
}

export default function DeployChatAlert({ alert, clearAlert, postMessage }: DeployAlertProps) {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const { type, content, url, stage, buildStatus, deployStatus } = alert;
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getDeployRemainingCopy(language);
  const visibleAlert = getDeployAlertText(language, { type, stage, buildStatus, deployStatus });

  useEffect(() => {
    if (type === 'error' && content) {
      console.error('Deployment diagnostic details:', content);
    }
  }, [content, type]);

  // Determine if we should show the deployment progress
  const showProgress = Boolean(stage && (buildStatus || deployStatus));

  return (
    <AnimatePresence>
      <motion.div
        role={type === 'error' ? 'alert' : 'status'}
        aria-live={type === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
        initial={reduceMotion ? false : { opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? undefined : { opacity: 0, y: -20 }}
        transition={{ duration: reduceMotion ? 0 : 0.3 }}
        className="mb-2 min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4"
      >
        <div className="flex min-w-0 items-start">
          {/* Icon */}
          <motion.div
            className="flex-shrink-0"
            initial={reduceMotion ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: reduceMotion ? 0 : 0.2 }}
            aria-hidden
          >
            <div
              className={classNames(
                'text-xl',
                type === 'success'
                  ? 'i-ph:check-circle-duotone text-bolt-elements-icon-success'
                  : type === 'error'
                    ? 'i-ph:warning-duotone text-bolt-elements-button-danger-text'
                    : 'i-ph:info-duotone text-bolt-elements-loader-progress',
              )}
            ></div>
          </motion.div>
          {/* Content */}
          <div className="ml-3 min-w-0 flex-1">
            <motion.h3
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.1 }}
              className="break-words text-sm font-medium text-bolt-elements-textPrimary"
            >
              {visibleAlert.title}
            </motion.h3>
            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: reduceMotion ? 0 : 0.2 }}
              className="mt-2 min-w-0 text-sm text-bolt-elements-textSecondary"
            >
              <p className="break-words">{visibleAlert.description}</p>

              {/* Deployment Progress Visualization */}
              {showProgress && (
                <div className="mt-4 mb-2">
                  <div
                    role="group"
                    className="mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-3"
                    aria-label={copy['deployRemaining.alert.progressLabel']}
                  >
                    {/* Build Step */}
                    <div className="flex min-w-0 items-center">
                      <div
                        className={classNames(
                          'w-6 h-6 rounded-full flex items-center justify-center',
                          buildStatus === 'running'
                            ? 'bg-bolt-elements-loader-progress'
                            : buildStatus === 'complete'
                              ? 'bg-bolt-elements-icon-success'
                              : buildStatus === 'failed'
                                ? 'bg-bolt-elements-button-danger-background'
                                : 'bg-bolt-elements-textTertiary',
                        )}
                      >
                        {buildStatus === 'running' ? (
                          <div className="i-svg-spinners:90-ring-with-bg text-white text-xs"></div>
                        ) : buildStatus === 'complete' ? (
                          <div className="i-ph:check text-white text-xs"></div>
                        ) : buildStatus === 'failed' ? (
                          <div className="i-ph:x text-white text-xs"></div>
                        ) : (
                          <span className="text-white text-xs">1</span>
                        )}
                      </div>
                      <span className="ml-2 break-words">{copy['deployRemaining.alert.buildStep']}</span>
                    </div>

                    {/* Connector Line */}
                    <div
                      className={classNames(
                        'h-0.5 w-8',
                        buildStatus === 'complete' ? 'bg-bolt-elements-icon-success' : 'bg-bolt-elements-textTertiary',
                      )}
                    ></div>

                    {/* Deploy Step */}
                    <div className="flex min-w-0 items-center">
                      <div
                        className={classNames(
                          'w-6 h-6 rounded-full flex items-center justify-center',
                          deployStatus === 'running'
                            ? 'bg-bolt-elements-loader-progress'
                            : deployStatus === 'complete'
                              ? 'bg-bolt-elements-icon-success'
                              : deployStatus === 'failed'
                                ? 'bg-bolt-elements-button-danger-background'
                                : 'bg-bolt-elements-textTertiary',
                        )}
                      >
                        {deployStatus === 'running' ? (
                          <div className="i-svg-spinners:90-ring-with-bg text-white text-xs"></div>
                        ) : deployStatus === 'complete' ? (
                          <div className="i-ph:check text-white text-xs"></div>
                        ) : deployStatus === 'failed' ? (
                          <div className="i-ph:x text-white text-xs"></div>
                        ) : (
                          <span className="text-white text-xs">2</span>
                        )}
                      </div>
                      <span className="ml-2 break-words">{copy['deployRemaining.alert.deployStep']}</span>
                    </div>
                  </div>
                </div>
              )}

              {url && type === 'success' && (
                <div className="mt-2">
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 max-w-full items-center gap-1 break-words rounded text-bolt-elements-item-contentAccent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-focus"
                  >
                    <span>{copy['deployRemaining.alert.viewSite']}</span>
                    <div className="i-ph:arrow-square-out shrink-0" aria-hidden></div>
                  </a>
                </div>
              )}
            </motion.div>

            {/* Actions */}
            <motion.div
              className="mt-4"
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduceMotion ? 0 : 0.3 }}
            >
              <div className={classNames('flex min-w-0 flex-wrap gap-2')}>
                {type === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      postMessage(
                        formatDeployRemainingCopy(copy['deployRemaining.alert.fixPrompt'], {
                          details: visibleAlert.description,
                        }),
                      );
                    }}
                    className={classNames(
                      'inline-flex min-h-11 min-w-0 items-center gap-1.5 whitespace-normal break-words rounded-md px-3 py-2 text-sm font-medium',
                      'bg-bolt-elements-button-primary-background',
                      'hover:bg-bolt-elements-button-primary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-danger-background',
                      'text-bolt-elements-button-primary-text',
                    )}
                  >
                    <div className="i-ph:chat-circle-duotone shrink-0" aria-hidden></div>
                    {copy['deployRemaining.alert.askECode']}
                  </button>
                )}
                <button
                  type="button"
                  onClick={clearAlert}
                  className={classNames(
                    'min-h-11 min-w-0 whitespace-normal break-words rounded-md px-3 py-2 text-sm font-medium',
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  {copy['deployRemaining.alert.dismiss']}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
