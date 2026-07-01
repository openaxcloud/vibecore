import { AnimatePresence, motion } from 'framer-motion';
import type { LlmErrorAlertType } from '~/types/actions';
import { classNames } from '~/utils/classNames';

export interface LlmRetryModelOption {
  name: string;
  label: string;
  provider: string;
}

interface Props {
  alert: LlmErrorAlertType;
  clearAlert: () => void;

  /*
   * A short list of alternative models the user can retry with (Cursor/Replit
   * "retry with <model>"). Supplied by BaseChat from its live modelList, current
   * model excluded. When empty the control is hidden.
   */
  alternativeModels?: LlmRetryModelOption[];
}

export default function LlmErrorAlert({ alert, clearAlert, alternativeModels = [] }: Props) {
  const { title, description, provider, errorType } = alert;

  const retryWithModel = (option: LlmRetryModelOption | undefined) => {
    if (!option) {
      return;
    }

    clearAlert();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vibecore:llm-retry-with-model', {
          detail: { model: option.name, provider: option.provider },
        }),
      );
    }
  };

  const getErrorIcon = () => {
    switch (errorType) {
      case 'authentication':
        return 'i-ph:key-duotone';
      case 'rate_limit':
        return 'i-ph:clock-duotone';
      case 'quota':
        return 'i-ph:warning-circle-duotone';
      default:
        return 'i-ph:warning-duotone';
    }
  };

  const getErrorMessage = () => {
    switch (errorType) {
      case 'authentication':
        return `Authentication failed with ${provider}. Please check your API key.`;
      case 'rate_limit':
        return `Rate limit exceeded for ${provider}. Please wait before retrying.`;
      case 'quota':
        /*
         * This is a plan/organization allowance (e.g. monthly AI token budget),
         * not the upstream provider's rate-limit — so don't name the provider and
         * don't imply that simply waiting a moment will clear it. It refills next
         * billing period; the way out is upgrading the plan or raising the limit.
         */
        return `You've reached your plan's AI usage limit for this billing period. Upgrade your plan or check your account limits — it refills next period.`;
      default:
        return 'An error occurred while processing your request.';
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.3 }}
        className="rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 p-4 mb-2"
      >
        <div className="flex items-start">
          <motion.div
            className="flex-shrink-0"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <div className={`${getErrorIcon()} text-xl text-bolt-elements-button-danger-text`}></div>
          </motion.div>

          <div className="ml-3 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-bolt-elements-textPrimary"
            >
              {title}
            </motion.h3>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-bolt-elements-textSecondary"
            >
              <p>{getErrorMessage()}</p>

              {description && (
                <div className="text-xs text-bolt-elements-textSecondary p-2 bg-bolt-elements-background-depth-3 rounded mt-4 mb-4 break-words whitespace-pre-wrap overflow-x-hidden max-h-40 overflow-y-auto">
                  Error Details: {description}
                </div>
              )}
            </motion.div>

            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <div className="flex flex-wrap gap-2">
                {/*
                 * Retry re-runs the last generation. A transient error (rate limit,
                 * network, a 5xx) usually clears on retry, and the reload button was
                 * previously buried elsewhere in the UI — so a one-click retry right
                 * on the error is the obvious Replit/Cursor affordance. Self-contained
                 * via a window event that Chat.client listens for (reload()), so no
                 * callback threading through BaseChat.
                 */}
                {errorType !== 'quota' && (
                  <button
                    onClick={() => {
                      clearAlert();

                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('vibecore:llm-retry'));
                      }
                    }}
                    className={classNames(
                      'px-2 py-1.5 rounded-md text-sm font-medium',
                      'bg-bolt-elements-button-primary-background',
                      'hover:bg-bolt-elements-button-primary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-primary-background',
                      'text-bolt-elements-button-primary-text',
                    )}
                  >
                    Retry
                  </button>
                )}
                {errorType !== 'quota' && alternativeModels.length > 0 && (
                  <select
                    aria-label="Retry with a different model"
                    defaultValue=""
                    onChange={(event) => {
                      const option = alternativeModels.find((model) => model.name === event.currentTarget.value);
                      event.currentTarget.value = '';
                      retryWithModel(option);
                    }}
                    className={classNames(
                      'max-w-[12rem] px-2 py-1.5 rounded-md text-sm font-medium cursor-pointer',
                      'bg-bolt-elements-button-secondary-background',
                      'hover:bg-bolt-elements-button-secondary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                      'text-bolt-elements-button-secondary-text border border-bolt-elements-borderColor',
                    )}
                  >
                    <option value="" disabled>
                      Retry with…
                    </option>
                    {alternativeModels.map((model) => (
                      <option key={`${model.provider}:${model.name}`} value={model.name}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                )}
                {(errorType === 'authentication' || errorType === 'quota') && (
                  <a
                    href={errorType === 'quota' ? '/billing' : '/settings'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(
                      'px-2 py-1.5 rounded-md text-sm font-medium inline-flex items-center',
                      'bg-bolt-elements-button-secondary-background',
                      'hover:bg-bolt-elements-button-secondary-backgroundHover',
                      'text-bolt-elements-button-secondary-text',
                    )}
                  >
                    {errorType === 'quota' ? 'View plan & limits' : 'Open settings'}
                  </a>
                )}
                <button
                  onClick={clearAlert}
                  className={classNames(
                    'px-2 py-1.5 rounded-md text-sm font-medium',
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  Dismiss
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
