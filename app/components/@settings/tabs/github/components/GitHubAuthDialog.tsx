import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGitHubConnection } from '~/lib/hooks';
import { getGitHubAuthDialogCopy, getGitHubAuthDialogSafeError } from '~/lib/i18n/catalogs/github-auth-dialog';
import { classNames } from '~/utils/classNames';

type GitHubTokenType = 'classic' | 'fine-grained';

const GITHUB_REQUIRED_SCOPES = 'repo, read:org, read:user';

const GITHUB_TOKEN_URLS = {
  classic: 'https://github.com/settings/tokens/new',
  'fine-grained': 'https://github.com/settings/tokens/beta',
} as const satisfies Readonly<Record<GitHubTokenType, string>>;

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function GitHubAuthDialog({ isOpen, onClose, onSuccess }: GitHubAuthDialogProps) {
  const { connect, isConnecting, error } = useGitHubConnection();
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getGitHubAuthDialogCopy(language);
  const [token, setToken] = useState('');
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenType, setTokenType] = useState<GitHubTokenType>('classic');
  const [hasValidationError, setHasValidationError] = useState(false);
  const [hasConnectionAttemptError, setHasConnectionAttemptError] = useState(false);
  const hasConnectionError = !hasValidationError && (Boolean(error) || hasConnectionAttemptError);
  const isClassicToken = tokenType === 'classic';

  const tokenLabel = isClassicToken
    ? copy['githubAuthDialog.token.classicLabel']
    : copy['githubAuthDialog.token.fineGrainedLabel'];
  const tokenPlaceholder = isClassicToken
    ? copy['githubAuthDialog.token.classicPlaceholder']
    : copy['githubAuthDialog.token.fineGrainedPlaceholder'];

  useEffect(() => {
    if (!isOpen) {
      setToken('');
      setTokenRevealed(false);
      setHasValidationError(false);
      setHasConnectionAttemptError(false);
    }
  }, [isOpen]);

  const resetSensitiveState = () => {
    setToken('');
    setTokenRevealed(false);
    setHasValidationError(false);
    setHasConnectionAttemptError(false);
  };

  const handleConnect = async (event: React.FormEvent) => {
    event.preventDefault();
    setHasConnectionAttemptError(false);

    if (!token.trim()) {
      setHasValidationError(true);
      return;
    }

    setHasValidationError(false);

    try {
      await connect(token, tokenType);
    } catch {
      setHasConnectionAttemptError(true);
      return;
    }

    resetSensitiveState();
    onSuccess?.();
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
    setHasValidationError(false);
    setHasConnectionAttemptError(false);
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[10001] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-lg focus:outline-none">
          <motion.div
            className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 shadow-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="min-w-0 space-y-5 p-4 sm:space-y-6 sm:p-6">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Dialog.Title className="break-words text-lg font-semibold text-bolt-elements-textPrimary">
                    {copy['githubAuthDialog.title']}
                  </Dialog.Title>
                  <Dialog.Description className="break-words text-sm leading-relaxed text-bolt-elements-textSecondary">
                    {copy['githubAuthDialog.description']}
                  </Dialog.Description>
                </div>
                <button
                  type="button"
                  aria-label={copy['githubAuthDialog.close']}
                  title={copy['githubAuthDialog.close']}
                  onClick={handleClose}
                  disabled={isConnecting}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-item-backgroundActive/10 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <div className="i-ph:x h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="min-w-0 space-y-1 rounded-lg bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textSecondary">
                <p className="flex min-w-0 items-start gap-1.5">
                  <span
                    className="i-ph:lightbulb mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-icon-success"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{copy['githubAuthDialog.tip.label']}</span>{' '}
                    {copy['githubAuthDialog.tip.description']}
                  </span>
                </p>
                <p className="break-words">
                  {copy['githubAuthDialog.scopes.label']}{' '}
                  <code className="font-mono break-all text-bolt-elements-textPrimary">{GITHUB_REQUIRED_SCOPES}</code>
                </p>
              </div>

              <form onSubmit={handleConnect} className="min-w-0 space-y-4" noValidate aria-busy={isConnecting}>
                <div>
                  <label
                    htmlFor="github-auth-token-type"
                    className="mb-2 block break-words text-sm text-bolt-elements-textSecondary"
                  >
                    {copy['githubAuthDialog.tokenType.label']}
                  </label>
                  <select
                    id="github-auth-token-type"
                    value={tokenType}
                    onChange={(event) => {
                      setTokenType(event.target.value as GitHubTokenType);
                      setHasConnectionAttemptError(false);
                    }}
                    disabled={isConnecting}
                    className={classNames(
                      'min-h-11 w-full rounded-lg px-3 py-2 text-sm',
                      'bg-bolt-elements-background-depth-1',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textPrimary',
                      'focus:outline-none focus:ring-2 focus:ring-bolt-elements-item-contentAccent',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    <option value="classic">{copy['githubAuthDialog.tokenType.classic']}</option>
                    <option value="fine-grained">{copy['githubAuthDialog.tokenType.fineGrained']}</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="github-auth-token"
                    className="mb-2 block break-words text-sm text-bolt-elements-textSecondary"
                  >
                    {tokenLabel}
                  </label>
                  <div className="relative min-w-0">
                    <input
                      id="github-auth-token"
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
                      aria-invalid={hasValidationError || hasConnectionError}
                      aria-describedby={
                        hasValidationError
                          ? 'github-auth-token-validation'
                          : hasConnectionError
                            ? 'github-auth-connection-error'
                            : 'github-auth-token-help'
                      }
                      placeholder={tokenPlaceholder}
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                      className={classNames(
                        'min-h-11 w-full rounded-lg py-2 pl-3 pr-12 text-sm',
                        'bg-bolt-elements-background-depth-1',
                        'border border-bolt-elements-borderColor',
                        'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                        'focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive',
                        'disabled:cursor-not-allowed disabled:opacity-50',
                      )}
                    />
                    <button
                      type="button"
                      aria-pressed={tokenRevealed}
                      aria-label={
                        tokenRevealed ? copy['githubAuthDialog.token.hide'] : copy['githubAuthDialog.token.show']
                      }
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setTokenRevealed((current) => !current)}
                      disabled={isConnecting}
                      className="absolute right-0.5 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-bolt-elements-textTertiary transition-colors hover:bg-bolt-elements-background-depth-2 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span
                        className={tokenRevealed ? 'i-ph:eye-slash h-4 w-4' : 'i-ph:eye h-4 w-4'}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                  <div id="github-auth-token-help" className="mt-1 text-sm text-bolt-elements-textSecondary">
                    <a
                      href={GITHUB_TOKEN_URLS[tokenType]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 max-w-full items-center gap-1 break-words text-bolt-elements-borderColorActive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)]"
                    >
                      {copy['githubAuthDialog.token.get']}
                      <div className="i-ph:arrow-square-out h-4 w-4 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                </div>

                {hasValidationError && (
                  <div
                    id="github-auth-token-validation"
                    className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                    role="alert"
                  >
                    <p className="break-words text-sm text-red-800 dark:text-red-200">
                      {copy['githubAuthDialog.validation.tokenRequired']}
                    </p>
                  </div>
                )}

                {hasConnectionError && (
                  <div
                    id="github-auth-connection-error"
                    className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                    role="alert"
                  >
                    <p className="break-words text-sm font-medium text-red-800 dark:text-red-200">
                      {copy['githubAuthDialog.error.title']}
                    </p>
                    <p className="mt-1 break-words text-sm text-red-800 dark:text-red-200">
                      {getGitHubAuthDialogSafeError(language, error)}
                    </p>
                  </div>
                )}

                <div className="flex flex-col-reverse gap-3 pt-4 sm:flex-row sm:items-center sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isConnecting}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-lg px-4 py-2 text-center text-sm whitespace-normal text-bolt-elements-textSecondary transition-colors hover:bg-bolt-elements-background-depth-1 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ecode-focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {copy['githubAuthDialog.action.cancel']}
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting}
                    aria-busy={isConnecting}
                    className={classNames(
                      'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm whitespace-normal sm:w-auto',
                      'bg-[var(--vc-ide-accent-action)] text-white',
                      'hover:text-white hover:opacity-90',
                      'disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
                    )}
                  >
                    {isConnecting ? (
                      <>
                        <div className="i-ph:spinner-gap h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                        {copy['githubAuthDialog.action.connecting']}
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging h-4 w-4 shrink-0" aria-hidden="true" />
                        {copy['githubAuthDialog.action.connect']}
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
