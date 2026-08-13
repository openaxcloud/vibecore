import * as Dialog from '@radix-ui/react-dialog';
import { motion } from 'framer-motion';
import React, { useState } from 'react';
import { RevealButton } from '~/components/ui/RevealButton';
import { useGitHubConnection } from '~/lib/hooks';
import { classNames } from '~/utils/classNames';

interface GitHubAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function GitHubAuthDialog({ isOpen, onClose, onSuccess }: GitHubAuthDialogProps) {
  const { connect, isConnecting, error } = useGitHubConnection();
  const [token, setToken] = useState('');
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [tokenType, setTokenType] = useState<'classic' | 'fine-grained'>('classic');

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token.trim()) {
      return;
    }

    try {
      await connect(token, tokenType);
      setToken(''); // Clear token on successful connection
      onSuccess?.();
      onClose();
    } catch {
      // Error handling is done in the hook
    }
  };

  const handleClose = () => {
    setToken('');
    onClose();
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[10000]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] w-full max-w-md"
          onEscapeKeyDown={handleClose}
          onPointerDownOutside={handleClose}
        >
          <motion.div
            className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Connect to GitHub</h2>
                <button
                  type="button"
                  aria-label="Close"
                  title="Close"
                  onClick={handleClose}
                  className="p-1 rounded-md hover:bg-bolt-elements-item-backgroundActive/10"
                >
                  <div className="i-ph:x w-4 h-4 text-bolt-elements-textSecondary" aria-hidden />
                </button>
              </div>

              <div className="text-xs text-bolt-elements-textSecondary bg-bolt-elements-background-depth-1 p-3 rounded-lg">
                <p className="flex items-center gap-1 mb-1">
                  <span className="i-ph:lightbulb w-3.5 h-3.5 text-bolt-elements-icon-success" />
                  <span className="font-medium">Tip:</span> You need a GitHub token to deploy repositories.
                </p>
                <p>Required scopes: repo, read:org, read:user</p>
              </div>

              <form onSubmit={handleConnect} className="space-y-4">
                <div>
                  <label className="block text-sm text-bolt-elements-textSecondary mb-2">Token Type</label>
                  <select
                    value={tokenType}
                    onChange={(e) => setTokenType(e.target.value as 'classic' | 'fine-grained')}
                    disabled={isConnecting}
                    className={classNames(
                      'w-full px-3 py-2 rounded-lg text-sm',
                      'bg-bolt-elements-background-depth-1',
                      'border border-bolt-elements-borderColor',
                      'text-bolt-elements-textPrimary',
                      'focus:outline-none focus:ring-1 focus:ring-bolt-elements-item-contentAccent',
                      'disabled:opacity-50',
                    )}
                  >
                    <option value="classic">Personal Access Token (Classic)</option>
                    <option value="fine-grained">Fine-grained Token</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-bolt-elements-textSecondary mb-2">
                    {tokenType === 'classic' ? 'Personal Access Token' : 'Fine-grained Token'}
                  </label>
                  <div className="relative">
                    <input
                      type={tokenRevealed ? 'text' : 'password'}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onPaste={(e) => {
                        e.preventDefault();
                        setToken(e.clipboardData.getData('text').trim());
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={isConnecting}
                      placeholder={`Enter your GitHub ${
                        tokenType === 'classic' ? 'personal access token' : 'fine-grained token'
                      }`}
                      style={{ fontFamily: 'var(--vc-font-code)' }}
                      className={classNames(
                        'w-full pl-3 pr-11 py-2 rounded-lg text-sm',
                        'bg-bolt-elements-background-depth-1',
                        'border border-bolt-elements-borderColor',
                        'text-bolt-elements-textPrimary placeholder-bolt-elements-textTertiary',
                        'focus:outline-none focus:ring-1 focus:ring-bolt-elements-borderColorActive',
                        'disabled:opacity-50',
                      )}
                    />
                    <RevealButton
                      revealed={tokenRevealed}
                      onToggle={() => setTokenRevealed((current) => !current)}
                      subject="token"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2"
                    />
                  </div>
                  <div className="mt-2 text-sm text-bolt-elements-textSecondary">
                    <a
                      href={`https://github.com/settings/tokens${tokenType === 'fine-grained' ? '/beta' : '/new'}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bolt-elements-borderColorActive hover:underline inline-flex items-center gap-1"
                    >
                      Get your token
                      <div className="i-ph:arrow-square-out w-4 h-4" />
                    </a>
                  </div>
                </div>

                {error && (
                  <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-700">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isConnecting || !token.trim()}
                    className={classNames(
                      'px-4 py-2 rounded-lg text-sm flex items-center gap-2',
                      'bg-[var(--vc-ide-accent-action)] text-white',
                      'hover:opacity-90 hover:text-white',
                      'disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200',
                    )}
                  >
                    {isConnecting ? (
                      <>
                        <div className="i-ph:spinner-gap animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <div className="i-ph:plug-charging w-4 h-4" />
                        Connect
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
