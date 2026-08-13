import { useStore } from '@nanostores/react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import WithTooltip from '~/components/ui/Tooltip';
import { useEditChatDescription } from '~/lib/hooks';
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
        <form onSubmit={handleSubmit} className="flex items-center justify-center max-w-full min-w-0">
          <input
            type="text"
            aria-label="Chat title"
            className="bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary rounded px-2 mr-2 w-fit max-w-full min-w-0"
            autoFocus
            value={currentDescription}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            style={{ width: `${computeChatTitleInputWidth(currentDescription.length)}px` }}
          />
          <TooltipProvider>
            <WithTooltip tooltip="Save title">
              <div className="flex justify-between items-center p-2 rounded-md bg-bolt-elements-item-backgroundAccent">
                <button
                  type="submit"
                  aria-label="Save title"
                  className="i-ph:check-bold scale-110 hover:text-bolt-elements-item-contentAccent"
                  onMouseDown={(event) => event.preventDefault()}
                />
              </div>
            </WithTooltip>
          </TooltipProvider>
        </form>
      ) : (
        <>
          {currentDescription}
          <TooltipProvider>
            <WithTooltip tooltip="Rename chat">
              <button
                type="button"
                aria-label="Rename chat"
                className="ml-2 i-ph:pencil-fill scale-110 hover:text-bolt-elements-item-contentAccent"
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
