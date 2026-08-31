import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGitLabConnection } from '~/lib/hooks';
import { getGitLabAuthDialogCopy, getGitLabAuthDialogSafeError } from '~/lib/i18n/catalogs/gitlab-auth-dialog';
import { classNames } from '~/utils/classNames';

type GitLabUrlValidationError = 'required' | 'invalid' | null;

const DEFAULT_GITLAB_URL = 'https://gitlab.com';
const GITLAB_REQUIRED_SCOPES = 'api, read_repository';
const GITLAB_TOKEN_SETTINGS_PATH = '/-/user_settings/personal_access_tokens';

function isValidGitLabUrl(value: string): boolean {
  try {
    const parsedUrl = new URL(value.trim());

    return (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') && Boolean(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function getGitLabTokenSettingsUrl(value: string): string | null {
  if (!isValidGitLabUrl(value)) {
    return null;
  }

  const parsedUrl = new URL(value.trim());
  const basePath = parsedUrl.pathname.replace(/\/+$/u, '');

  parsedUrl.pathname = `${basePath}${GITLAB_TOKEN_SETTINGS_PATH}`;
  parsedUrl.search = '';
  parsedUrl.hash = '';

  return parsedUrl.toString();
}

interface GitLabAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GitLabAuthDialog({ isOpen, onClose }: GitLabAuthDialogProps) {
  const { isConnecting, error, connect } = useGitLabConnection();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitLabAuthDialogCopy(language);
  const [token, setToken] = useState('');
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [gitlabUrl, setGitlabUrl] = useState(DEFAULT_GITLAB_URL);
  const [urlValidationError, setUrlValidationError] = useState<GitLabUrlValidationError>(null);
  const [hasTokenValidationError, setHasTokenValidationError] = useState(false);
  const [hasConnectionAttemptError, setHasConnectionAttemptError] = useState(false);
  const hasValidationError = urlValidationError !== null || hasTokenValidationError;
  const hasConnectionError = !hasValidationError && (Boolean(error) || hasConnectionAttemptError);
  const tokenSettingsUrl = getGitLabTokenSettingsUrl(gitlabUrl);

  const urlValidationMessage =
    urlValidationError === 'required'
      ? copy['gitLabAuthDialog.validation.urlRequired']
      : urlValidationError === 'invalid'
        ? copy['gitLabAuthDialog.validation.urlInvalid']
        : null;

  useEffect(() => {
    if (!isOpen) {
      setToken('');
      setTokenRevealed(false);
      setUrlValidationError(null);
      setHasTokenValidationError(false);
      setHasConnectionAttemptError(false);
    }
  }, [isOpen]);

  const resetSensitiveState = () => {
    setToken('');
    setTokenRevealed(false);
    setUrlValidationError(null);
    setHasTokenValidationError(false);
    setHasConnectionAttemptError(false);
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();

    const normalizedUrl = gitlabUrl.trim();

    const nextUrlValidationError: GitLabUrlValidationError = !normalizedUrl
      ? 'required'
      : isValidGitLabUrl(normalizedUrl)
        ? null
        : 'invalid';

    const nextTokenValidationError = !token.trim();

    setUrlValidationError(nextUrlValidationError);
    setHasTokenValidationError(nextTokenValidationError);
    setHasConnectionAttemptError(false);

    if (nextUrlValidationError || nextTokenValidationError) {
      return;
    }

    try {
      await connect(token, normalizedUrl);
    } catch {
      setHasConnectionAttemptError(true);
      return;
    }

    /* useGitLabConnection owns the success toast; avoid duplicate feedback. */
    resetSensitiveState();
    onClose();
  };

  const handleClose = () => {
    if (isConnecting) {
      return;
    }

    resetSensitiveState();
    onClose();
  };

  const handleTokenChange = (value: string) => {
    setToken(value);
    setHasTokenValidationError(false);
    setHasConnectionAttemptError(false);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[10001] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-lg focus:outline-none">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 shadow-xl dark:border-bolt-elements-borderColor-dark"
          >
            <div className="min-w-0 space-y-5 p-4 sm:space-y-6 sm:p-6">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" focusable="false">
                      <path
                        fill="currentColor"
                        d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Dialog.Title className="break-words text-lg font-medium text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark">
                      {copy['gitLabAuthDialog.title']}
                    </Dialog.Title>
                    <Dialog.Description className="break-words text-sm leading-relaxed text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark">
                      {copy['gitLabAuthDialog.description']}
                    </Dialog.Description>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={copy['gitLabAuthDialog.close']}
                  title={copy['gitLabAuthDialog.close']}
                  onClick={handleClose}
                  disabled={isConnecting}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="i-ph:x h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <form onSubmit={handleConnect} className="min-w-0 space-y-4" noValidate aria-busy={isConnecting}>
                <div>
                  <label
                    htmlFor="gitlab-auth-url"
                    className="mb-2 block break-words text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark"
                  >
                    {copy['gitLabAuthDialog.url.label']}
                  </label>
                  <input
                    id="gitlab-auth-url"
                    type="url"
                    inputMode="url"
                    value={gitlabUrl}
                    onChange={(event) => {
                      setGitlabUrl(event.target.value);
                      setUrlValidationError(null);
                      setHasConnectionAttemptError(false);
                    }}
                    autoComplete="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={isConnecting}
                    required
                    aria-invalid={urlValidationError !== null || hasConnectionError}
                    aria-describedby={
                      urlValidationError
                        ? 'gitlab-auth-url-validation'
                        : hasConnectionError
                          ? 'gitlab-auth-connection-error'
                          : 'gitlab-auth-url-help'
                    }
                    placeholder={copy['gitLabAuthDialog.url.placeholder']}
                    className={classNames(
                      'min-h-11 w-full rounded-lg px-3 py-2 text-sm',
                      'bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3',
                      'border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark',
                      'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark',
                      'placeholder-bolt-elements-textTertiary dark:placeholder-bolt-elements-textTertiary-dark',
                      'focus:outline-none focus:ring-2 focus:ring-orange-500',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  />
                  <p
                    id="gitlab-auth-url-help"
                    className="mt-1 break-words text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark"
                  >
                    {copy['gitLabAuthDialog.url.help']}
                  </p>
                  {urlValidationMessage && (
                    <p
                      id="gitlab-auth-url-validation"
                      className="mt-1 break-words text-sm text-red-700 dark:text-red-300"
                      role="alert"
                    >
                      {urlValidationMessage}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="gitlab-auth-token"
                    className="mb-2 block break-words text-sm text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark"
                  >
                    {copy['gitLabAuthDialog.token.label']}
                  </label>
                  <div className="relative min-w-0">
                    <input
                      id="gitlab-auth-token"
                      type={tokenRevealed ? 'text' : 'password'}
                      value={token}
                      onChange={(event) => handleTokenChange(event.target.value)}
                      onPaste={(event) => {
                        event.preventDefault();
                        handleTokenChange(event.clipboardData.getData('text').trim());
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isConnecting}
                      required
                      aria-invalid={hasTokenValidationError || hasConnectionError}
                      aria-describedby={
                        hasTokenValidationError
                          ? 'gitlab-auth-token-validation'
                          : hasConnectionError
                            ? 'gitlab-auth-connection-error'
                            : 'gitlab-auth-token-help'
                      }
                      placeholder={copy['gitLabAuthDialog.token.placeholder']}
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                      className={classNames(
                        'min-h-11 w-full rounded-lg py-2 pl-3 pr-12 text-sm',
                        'bg-bolt-elements-background-depth-2 dark:bg-bolt-elements-background-depth-3',
                        'border border-bolt-elements-borderColor dark:border-bolt-elements-borderColor-dark',
                        'text-bolt-elements-textPrimary dark:text-bolt-elements-textPrimary-dark',
                        'placeholder-bolt-elements-textTertiary dark:placeholder-bolt-elements-textTertiary-dark',
                        'focus:outline-none focus:ring-2 focus:ring-orange-500',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    />
                    <button
                      type="button"
                      aria-pressed={tokenRevealed}
                      aria-label={
                        tokenRevealed ? copy['gitLabAuthDialog.token.hide'] : copy['gitLabAuthDialog.token.show']
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setTokenRevealed((current) => !current)}
                      disabled={isConnecting}
                      className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={tokenRevealed ? 'i-ph:eye-slash h-4 w-4' : 'i-ph:eye h-4 w-4'}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div
                    id="gitlab-auth-token-help"
                    className="mt-1 flex min-w-0 flex-col items-start gap-1 text-xs text-bolt-elements-textSecondary dark:text-bolt-elements-textSecondary-dark sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2"
                  >
                    {tokenSettingsUrl ? (
                      <a
                        href={tokenSettingsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 max-w-full items-center gap-1 break-words text-orange-500 hover:text-orange-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      >
                        {copy['gitLabAuthDialog.token.get']}
                        <div className="i-ph:arrow-square-out h-3 w-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <span className="inline-flex min-h-11 items-center opacity-60" aria-disabled="true">
                        {copy['gitLabAuthDialog.token.get']}
                      </span>
                    )}
                    <span className="hidden sm:inline" aria-hidden="true">
                      •
                    </span>
                    <span className="break-words">
                      {copy['gitLabAuthDialog.scopes.label']}{' '}
                      <code className="font-mono break-all text-bolt-elements-textPrimary">
                        {GITLAB_REQUIRED_SCOPES}
                      </code>
                    </span>
                  </div>
                  {hasTokenValidationError && (
                    <p
                      id="gitlab-auth-token-validation"
                      className="mt-1 break-words text-sm text-red-700 dark:text-red-300"
                      role="alert"
                    >
                      {copy['gitLabAuthDialog.validation.tokenRequired']}
                    </p>
                  )}
                </div>

                {hasConnectionError && (
                  <div
                    id="gitlab-auth-connection-error"
                    className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                    role="alert"
                  >
                    <p className="break-words text-sm font-medium text-red-800 dark:text-red-200">
                      {copy['gitLabAuthDialog.error.title']}
                    </p>
                    <p className="mt-1 break-words text-sm text-red-800 dark:text-red-200">
                      {getGitLabAuthDialogSafeError(language, error)}
                    </p>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isConnecting}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-center text-sm whitespace-normal text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-bolt-elements-borderColor-dark dark:bg-bolt-elements-background-depth-3 dark:hover:bg-bolt-elements-background-depth-4 sm:w-auto"
                  >
                    {copy['gitLabAuthDialog.action.cancel']}
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    aria-busy={isConnecting}
                    className={classNames(
                      'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm whitespace-normal sm:w-auto',
                      'bg-orange-700 text-white hover:bg-orange-800',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {isConnecting ? (
                      <>
                        <div className="i-ph:spinner-gap h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                        {copy['gitLabAuthDialog.action.connecting']}
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging h-4 w-4 shrink-0" aria-hidden="true" />
                        {copy['gitLabAuthDialog.action.connect']}
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
