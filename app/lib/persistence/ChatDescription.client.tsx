import { useStore } from '@nanostores/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { useTranslation } from 'react-i18next';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
import { getClientRuntimeResidualCopy } from '~/lib/i18n/catalogs/client-runtime-residual';
import { description as descriptionStore } from '~/lib/persistence';

/**
 * Compute the pixel width for the inline rename input. Grows with the title
 * length but is clamped to an upper bound so a long description (the validator
 * allows up to 100 chars) can't push the input wider than the header and force
 * horizontal overflow / shove the Save button off-screen on narrow viewports.
 */
export function computeChatTitleInputWidth(length: number): number {
  const MIN_WIDTH = 100;
  const MAX_WIDTH = 320;
  const perCharWidth = 8;

  return Math.min(Math.max(length * perCharWidth, MIN_WIDTH), MAX_WIDTH);
}

export function ChatDescription() {
  const { i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const copy = getClientRuntimeResidualCopy(language);
  const initialDescription = useStore(descriptionStore)!;

  const { editing, handleChange, handleBlur, handleSubmit, handleKeyDown, currentDescription, toggleEditMode } =
    useEditChatDescription({
      initialDescription,
      syncWithGlobalStore: true,
    });

  if (!initialDescription) {
    // doing this to prevent showing edit button until chat description is set
    return null;
  }

  return (
    <div className="flex items-center justify-center max-w-full min-w-0">
      {editing ? (
        <form onSubmit={handleSubmit} className="flex max-w-full min-w-0 items-center justify-center gap-2">
          <input
            type="text"
            aria-label={copy['clientRuntime.chatTitle.inputLabel']}
            className="bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary w-fit max-w-full min-w-0 rounded px-2"
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{ width: `${computeChatTitleInputWidth(currentDescription.length)}px` }}
          />
          <TooltipProvider>
            <WithTooltip tooltip={copy['clientRuntime.chatTitle.save']}>
              <button
                type="submit"
                aria-label={copy['clientRuntime.chatTitle.save']}
                className="i-ph:check-bold min-h-11 min-w-11 shrink-0 rounded-md bg-bolt-elements-item-backgroundAccent hover:text-bolt-elements-item-contentAccent"
                onMouseDown={(event) => event.preventDefault()}
              />
            </WithTooltip>
          </TooltipProvider>
        </form>
      ) : (
        <>
          {currentDescription}
          <TooltipProvider>
            <WithTooltip tooltip={copy['clientRuntime.chatTitle.rename']}>
              <button
                type="button"
                aria-label={copy['clientRuntime.chatTitle.rename']}
                className="i-ph:pencil-fill ml-1 min-h-11 min-w-11 shrink-0 rounded-md hover:text-bolt-elements-item-contentAccent"
                onClick={(event) => {
                  event.preventDefault();
                  toggleEditMode();
                }}
              />
            </WithTooltip>
          </TooltipProvider>
        </>
      )}
    </div>
  );
}
