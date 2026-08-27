import React from 'react';
import { useTranslation } from 'react-i18next';

import { getSharedComponentsCopy } from '~/lib/i18n/catalogs/shared-components';

const PROMPT_KEYS = [
  'examplePrompts.workouts',
  'examplePrompts.todo',
  'examplePrompts.blog',
  'examplePrompts.cookies',
  'examplePrompts.spaceInvaders',
  'examplePrompts.ticTacToe',
] as const;

export const EXAMPLE_PROMPTS = PROMPT_KEYS.map((key) => ({ text: getSharedComponentsCopy('en')[key] }));

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return <LocalizedExamplePrompts sendMessage={sendMessage} />;
}

function LocalizedExamplePrompts({
  sendMessage,
}: {
  sendMessage?: (event: React.UIEvent, messageInput?: string) => void | undefined;
}) {
  const { i18n } = useTranslation();
  const copy = getSharedComponentsCopy(i18n.resolvedLanguage ?? i18n.language);

  return (
    <div id="examples" className="relative mx-auto mt-6 flex w-full max-w-3xl flex-col justify-center gap-9">
      <div
        className="flex flex-wrap justify-center gap-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {PROMPT_KEYS.map((key) => {
          const prompt = copy[key];

          return (
            <button
              key={key}
              type="button"
              onClick={(event) => {
                sendMessage?.(event, prompt);
              }}
              className="min-h-11 min-w-11 max-w-full whitespace-normal rounded-full border border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 px-4 py-2 text-xs text-bolt-elements-textSecondary transition-theme hover:bg-bolt-elements-background-depth-3 hover:text-bolt-elements-textPrimary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--vc-ide-accent-action)]"
            >
              {prompt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
