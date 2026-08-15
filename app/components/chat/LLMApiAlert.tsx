import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { formatChatClientCopy, getChatClientCopy } from '~/lib/i18n/catalogs/chat-client';
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
   * KILL-SWITCH FACTURATION — passé par l'appelant, pas lu par un hook ici : ce
   * composant est PUR et testé sans routeur, où un hook de loader rendrait
   * toujours `false`. Défaut `false` : un appelant qui oublie MASQUE.
   */
  billingOn?: boolean;

  /*
   * A short list of alternative models the user can retry with (Cursor/Replit
   * "retry with <model>"). Supplied by BaseChat from its live modelList, current
   * model excluded. When empty the control is hidden.
   */
  alternativeModels?: LlmRetryModelOption[];
}

export default function LlmErrorAlert({ alert, clearAlert, alternativeModels = [], billingOn = false }: Props) {
  const { i18n } = useTranslation();
  const copy = getChatClientCopy(i18n.resolvedLanguage ?? i18n.language);
  const { provider, errorType } = alert;
  const providerLabel = provider?.trim() || copy['chatClient.error.provider'];

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
        return formatChatClientCopy(copy['chatClient.error.authentication'], { provider: providerLabel });
      case 'rate_limit':
        return formatChatClientCopy(copy['chatClient.error.rateLimit'], { provider: providerLabel });
      case 'quota':
        /*
         * This is a plan/organization allowance (e.g. monthly AI token budget),
         * not the upstream provider's rate-limit — so don't name the provider and
         * don't imply that simply waiting a moment will clear it. It refills next
         * billing period; the way out is upgrading the plan or raising the limit.
         */
        return copy['chatClient.error.quota'];
      default:
        return copy['chatClient.error.generic'];
    }
  };

  const getErrorTitle = () => {
    switch (errorType) {
      case 'authentication':
        return copy['chatClient.error.title.authentication'];
      case 'rate_limit':
        return copy['chatClient.error.title.rateLimit'];
      case 'quota':
        return copy['chatClient.error.title.quota'];
      case 'network':
        return copy['chatClient.error.title.server'];
      default:
        return copy['chatClient.error.title.request'];
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

          <div className="ml-3 min-w-0 flex-1">
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="break-words text-sm font-medium text-bolt-elements-textPrimary"
            >
              {getErrorTitle()}
            </motion.h3>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mt-2 text-sm text-bolt-elements-textSecondary"
            >
              <p className="break-words">{getErrorMessage()}</p>
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
                      'min-h-11 min-w-11 px-3 py-2 rounded-md text-sm font-medium whitespace-normal',
                      'bg-bolt-elements-button-primary-background',
                      'hover:bg-bolt-elements-button-primary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-primary-background',
                      'text-bolt-elements-button-primary-text',
                    )}
                  >
                    {copy['chatClient.error.retry']}
                  </button>
                )}
                {errorType !== 'quota' && alternativeModels.length > 0 && (
                  <select
                    aria-label={copy['chatClient.error.retryWith.aria']}
                    defaultValue=""
                    onChange={(event) => {
                      const option = alternativeModels.find((model) => model.name === event.currentTarget.value);
                      event.currentTarget.value = '';
                      retryWithModel(option);
                    }}
                    className={classNames(
                      'min-h-11 w-full sm:w-auto max-w-full sm:max-w-[14rem] px-3 py-2 rounded-md text-sm font-medium cursor-pointer',
                      'bg-bolt-elements-button-secondary-background',
                      'hover:bg-bolt-elements-button-secondary-backgroundHover',
                      'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                      'text-bolt-elements-button-secondary-text border border-bolt-elements-borderColor',
                    )}
                  >
                    <option value="" disabled>
                      {copy['chatClient.error.retryWith']}
                    </option>
                    {alternativeModels.map((model) => (
                      <option key={`${model.provider}:${model.name}`} value={model.name}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                )}
                {/* KILL-SWITCH FACTURATION : le lien « quota » mène à /billing, page
                    inexistante à OFF — on ne rend pas un lien mort. */}
                {(errorType === 'authentication' || (errorType === 'quota' && billingOn)) && (
                  <a
                    href={errorType === 'quota' ? '/billing' : '/settings'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={classNames(
                      'min-h-11 min-w-11 px-3 py-2 rounded-md text-sm font-medium inline-flex items-center text-center whitespace-normal',
                      'bg-bolt-elements-button-secondary-background',
                      'hover:bg-bolt-elements-button-secondary-backgroundHover',
                      'text-bolt-elements-button-secondary-text',
                    )}
                  >
                    {errorType === 'quota' ? copy['chatClient.error.viewPlan'] : copy['chatClient.error.openSettings']}
                  </a>
                )}
                <button
                  onClick={clearAlert}
                  className={classNames(
                    'min-h-11 min-w-11 px-3 py-2 rounded-md text-sm font-medium whitespace-normal',
                    'bg-bolt-elements-button-secondary-background',
                    'hover:bg-bolt-elements-button-secondary-backgroundHover',
                    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-bolt-elements-button-secondary-background',
                    'text-bolt-elements-button-secondary-text',
                  )}
                >
                  {copy['chatClient.error.dismiss']}
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
