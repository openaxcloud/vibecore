import { motion, useReducedMotion } from 'framer-motion';
import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  formatConnectionFormCopy,
  getConnectionFormCopy,
  getConnectionFormErrorMessage,
  resolveConnectionFormLanguage,
  type ConnectionFormErrorCode,
} from '~/lib/i18n/catalogs/connection-form';
import { classNames } from '~/utils/classNames';

export type { ConnectionFormErrorCode } from '~/lib/i18n/catalogs/connection-form';

export interface TokenTypeOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConnectionFormProps {
  isConnected: boolean;
  isConnecting: boolean;
  token: string;
  onTokenChange: (token: string) => void;
  onConnect: (event: React.FormEvent) => void;
  onDisconnect: () => void;

  /**
   * Signals a failed upstream operation. The value is deliberately never
   * rendered because it may contain provider diagnostics, secrets, or
   * non-localized text. Use `errorCode` to choose reviewed user-facing copy.
   */
  error?: unknown;
  errorCode?: ConnectionFormErrorCode;
  serviceName: string;
  tokenLabel?: string;
  tokenPlaceholder?: string;
  getTokenUrl: string;
  environmentVariable?: string;
  tokenTypes?: TokenTypeOption[];
  selectedTokenType?: string;
  onTokenTypeChange?: (type: string) => void;
  connectedMessage?: string;
  children?: React.ReactNode;
}

export function ConnectionForm({
  isConnected,
  isConnecting,
  token,
  onTokenChange,
  onConnect,
  onDisconnect,
  error,
  errorCode,
  serviceName,
  tokenLabel,
  tokenPlaceholder,
  getTokenUrl,
  environmentVariable,
  tokenTypes,
  selectedTokenType,
  onTokenTypeChange,
  connectedMessage,
  children,
}: ConnectionFormProps) {
  const { i18n } = useTranslation();
  const language = resolveConnectionFormLanguage(i18n.resolvedLanguage ?? i18n.language);
  const copy = getConnectionFormCopy(language);
  const reduceMotion = useReducedMotion();
  const generatedId = useId();
  const [tokenTouched, setTokenTouched] = useState(false);

  const tokenInputId = `${generatedId}-token`;
  const tokenTypeId = `${generatedId}-token-type`;
  const tokenTypeDescriptionId = `${generatedId}-token-type-description`;
  const tokenValidationId = `${generatedId}-token-validation`;
  const connectionErrorId = `${generatedId}-connection-error`;
  const resolvedTokenLabel = tokenLabel ?? copy['connectionForm.token.defaultLabel'];

  const resolvedTokenPlaceholder =
    tokenPlaceholder ??
    formatConnectionFormCopy(copy['connectionForm.token.defaultPlaceholder'], {
      serviceName,
    });
  const resolvedConnectedMessage =
    connectedMessage ??
    formatConnectionFormCopy(copy['connectionForm.status.connected'], {
      serviceName,
    });

  const selectedTokenTypeDescription = tokenTypes?.find((type) => type.value === selectedTokenType)?.description;
  const tokenIsMissing = token.trim().length === 0;
  const showTokenValidation = tokenTouched && tokenIsMissing;
  const hasConnectionError = errorCode !== undefined || Boolean(error);

  const describedBy = [
    showTokenValidation ? tokenValidationId : undefined,
    hasConnectionError ? connectionErrorId : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');

  const handleSubmit = (event: React.FormEvent) => {
    if (tokenIsMissing) {
      event.preventDefault();
      setTokenTouched(true);

      return;
    }

    setTokenTouched(false);
    onConnect(event);
  };

  return (
    <motion.div
      className="min-w-0 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background"
      initial={reduceMotion ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { delay: 0.2 }}
    >
      <div className="min-w-0 space-y-6 p-4 sm:p-6">
        {!isConnected ? (
          <div className="min-w-0 space-y-4">
            {environmentVariable ? (
              <div className="mb-4 min-w-0 rounded-lg bg-bolt-elements-background-depth-1 p-3 text-xs text-bolt-elements-textSecondary">
                <p className="flex min-w-0 items-start gap-2 leading-5">
                  <span
                    className="i-ph:lightbulb mt-0.5 h-3.5 w-3.5 shrink-0 text-bolt-elements-icon-success"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{copy['connectionForm.tip.label']}</span>{' '}
                    {copy['connectionForm.tip.environmentPrefix']}{' '}
                    <code className="max-w-full break-all rounded bg-bolt-elements-background-depth-2 px-1 py-0.5">
                      {environmentVariable}
                    </code>{' '}
                    {copy['connectionForm.tip.environmentSuffix']}
                  </span>
                </p>
              </div>
            ) : null}

            <form
              onSubmit={handleSubmit}
              className="min-w-0 space-y-4"
              aria-label={formatConnectionFormCopy(copy['connectionForm.form.label'], { serviceName })}
              aria-busy={isConnecting || undefined}
            >
              {tokenTypes && tokenTypes.length > 1 && onTokenTypeChange ? (
                <div className="min-w-0">
                  <label
                    htmlFor={tokenTypeId}
                    className="mb-2 block break-words text-sm text-bolt-elements-textSecondary"
                  >
                    {copy['connectionForm.tokenType.label']}
                  </label>
                  <select
                    id={tokenTypeId}
                    value={selectedTokenType}
                    onChange={(event) => onTokenTypeChange(event.target.value)}
                    disabled={isConnecting}
                    aria-describedby={selectedTokenTypeDescription ? tokenTypeDescriptionId : undefined}
                    className={classNames(
                      'min-h-[44px] w-full min-w-0 rounded-lg px-3 py-2 text-sm',
                      'bg-bolt-elements-background-depth-1',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textPrimary',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-item-contentAccent',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                    )}
                  >
                    {tokenTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                  {selectedTokenTypeDescription ? (
                    <p
                      id={tokenTypeDescriptionId}
                      className="mt-1 break-words text-xs leading-5 text-bolt-elements-textTertiary"
                    >
                      {selectedTokenTypeDescription}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="min-w-0">
                <label
                  htmlFor={tokenInputId}
                  className="mb-2 block break-words text-sm text-bolt-elements-textSecondary"
                >
                  {resolvedTokenLabel}
                </label>
                <input
                  id={tokenInputId}
                  type="password"
                  value={token}
                  onChange={(event) => onTokenChange(event.target.value)}
                  onBlur={() => setTokenTouched(true)}
                  disabled={isConnecting}
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder={resolvedTokenPlaceholder}
                  aria-invalid={showTokenValidation || undefined}
                  aria-describedby={describedBy || undefined}
                  className={classNames(
                    'min-h-[44px] w-full min-w-0 rounded-lg px-3 py-2 text-sm',
                    'bg-bolt-elements-background-depth-1',
                    'border border-bolt-elements-borderColor',
                    'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive',
                    'disabled:cursor-not-allowed disabled:opacity-50',
                    showTokenValidation && 'border-red-500',
                  )}
                />
                {showTokenValidation ? (
                  <p
                    id={tokenValidationId}
                    className="mt-2 break-words text-sm text-red-700 dark:text-red-300"
                    role="alert"
                  >
                    {copy['connectionForm.token.required']}
                  </p>
                ) : null}
                <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                  <a
                    href={getTokenUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={copy['connectionForm.token.openInNewTab']}
                    className="inline-flex min-h-[44px] max-w-full min-w-[44px] items-center gap-1 break-words text-bolt-elements-borderColorActive underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bolt-elements-borderColorActive focus-visible:ring-offset-2"
                  >
                    <span>{copy['connectionForm.token.get']}</span>
                    <span className="i-ph:arrow-square-out h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">({copy['connectionForm.token.openInNewTab']})</span>
                  </a>
                </div>
              </div>

              {children}

              {hasConnectionError ? (
                <div
                  id={connectionErrorId}
                  className="min-w-0 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20"
                  role="alert"
                  aria-live="assertive"
                  aria-atomic="true"
                >
                  <p className="break-words text-sm font-medium text-red-900 dark:text-red-100">
                    {copy['connectionForm.error.title']}
                  </p>
                  <p className="mt-1 break-words text-sm leading-6 text-red-800 dark:text-red-200">
                    {getConnectionFormErrorMessage(errorCode, serviceName, language)}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isConnecting || tokenIsMissing}
                aria-busy={isConnecting || undefined}
                aria-label={formatConnectionFormCopy(copy['connectionForm.action.connectAria'], { serviceName })}
                className={classNames(
                  'inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium sm:w-auto',
                  'bg-[var(--vc-ide-accent-action)] text-[var(--vc-ide-text-on-accent)]',
                  'hover:opacity-90 hover:text-white',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)] focus-visible:ring-offset-2',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  'transform transition-all duration-200 active:scale-95 motion-reduce:transform-none motion-reduce:transition-none',
                )}
              >
                {isConnecting ? (
                  <>
                    <span className="i-ph:spinner-gap motion-safe:animate-spin" aria-hidden="true" />
                    <span>{copy['connectionForm.action.connecting']}</span>
                  </>
                ) : (
                  <>
                    <span className="i-ph:plug-charging h-4 w-4" aria-hidden="true" />
                    <span>{copy['connectionForm.action.connect']}</span>
                  </>
                )}
              </button>
            </form>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span
              className="flex min-w-0 items-start gap-2 break-words text-sm leading-6 text-bolt-elements-textSecondary"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="i-ph:check-circle mt-1 h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
              <span className="min-w-0 break-words">{resolvedConnectedMessage}</span>
            </span>
            <button
              type="button"
              onClick={onDisconnect}
              aria-label={formatConnectionFormCopy(copy['connectionForm.action.disconnectAria'], { serviceName })}
              className={classNames(
                'inline-flex min-h-[44px] w-full min-w-[44px] items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium sm:w-auto',
                'bg-red-600 text-white hover:bg-red-700',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2',
                'transition-colors motion-reduce:transition-none',
              )}
            >
              <span className="i-ph:plug h-4 w-4" aria-hidden="true" />
              <span>{copy['connectionForm.action.disconnect']}</span>
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
