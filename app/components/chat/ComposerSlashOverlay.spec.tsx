/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComposerSlashOverlay, detectSlashTrigger } from './ComposerSlashOverlay';
import { shouldForwardKeyToSlashPalette } from './composer-slash-keys';
import type { SlashCommandContext } from '~/lib/chat/slash-commands';

describe('detectSlashTrigger', () => {
  it('returns null when the input does not start with a slash', () => {
    expect(detectSlashTrigger('hello')).toBeNull();
  });

  it('returns null on bare slash or slash + space', () => {
    expect(detectSlashTrigger('/')).toBeNull();
    expect(detectSlashTrigger('/ ')).toBeNull();
  });

  it('parses keyword + empty argument', () => {
    expect(detectSlashTrigger('/clear')).toEqual({ keyword: 'clear', argument: '' });
  });

  it('parses keyword + argument', () => {
    expect(detectSlashTrigger('/explain reactivity model')).toEqual({
      keyword: 'explain',
      argument: 'reactivity model',
    });
  });
});

describe('<ComposerSlashOverlay />', () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithTextarea(
    input: string,
    options?: {
      handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
      context?: SlashCommandContext;

      /**
       * Mirrors ChatBox's textarea onKeyDown (Enter -> handleSendMessage)
       * so the keyboard-bridge integration tests reflect production: if
       * the overlay does NOT intercept Enter, the raw command would be
       * "sent".
       */
      onSend?: () => void;
    },
  ) {
    const ref = createRef<HTMLTextAreaElement>();

    const result = render(
      <>
        <textarea
          ref={ref}
          defaultValue={input}
          aria-label="composer"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              options?.onSend?.();
            }
          }}
        />
        <ComposerSlashOverlay
          textareaRef={ref}
          input={input}
          handleInputChange={options?.handleInputChange}
          context={options?.context}
        />
      </>,
    );

    const textarea = screen.getByLabelText('composer') as HTMLTextAreaElement;
    textarea.focus();
    fireEvent.focus(textarea);

    return { ref, textarea, result };
  }

  it('renders nothing for input without a slash trigger', () => {
    const { result } = renderWithTextarea('hello');
    expect(result.container.querySelector('.bolt-composer-slash-overlay')).toBeNull();
  });

  it('renders the palette when input starts with /', () => {
    renderWithTextarea('/cl');
    expect(screen.getByText('/clear')).toBeTruthy();
  });

  it('runs command execute() on select and clears the input', async () => {
    const setChatMode = vi.fn();
    const handleInputChange = vi.fn();

    renderWithTextarea('/build', {
      handleInputChange,
      context: { chatMode: 'discuss', setChatMode },
    });

    // Pick the build option inside the palette (not the textarea text).
    const buildOption = screen.getAllByRole('option').find((opt) => opt.textContent?.includes('/build'));

    if (!buildOption) {
      throw new Error('expected /build option in palette');
    }

    fireEvent.click(buildOption);

    /*
     * The select handler awaits a microtask before clearing — flush
     * promises by yielding once.
     */
    await Promise.resolve();
    await Promise.resolve();

    expect(setChatMode).toHaveBeenCalledWith('build');
    expect(handleInputChange).toHaveBeenCalledTimes(1);
    expect(handleInputChange.mock.calls[0][0].target.value).toBe('');
  });

  it('Escape clears the leading slash via handleInputChange', () => {
    const handleInputChange = vi.fn();
    renderWithTextarea('/clear', { handleInputChange });

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });

    expect(handleInputChange).toHaveBeenCalledTimes(1);
    expect(handleInputChange.mock.calls[0][0].target.value).toBe('');
  });

  /*
   * The core bug: pressing Enter on the (focused) textarea while a slash
   * trigger is active must run the command — NOT submit the literal
   * `/command` text to the chat. We dispatch a real keydown on the
   * textarea (capture phase) like the browser would.
   */
  it('Enter on the textarea executes the selected command and does NOT send the raw text', async () => {
    const setChatMode = vi.fn();
    const handleInputChange = vi.fn();
    const onSend = vi.fn();

    const { textarea } = renderWithTextarea('/build', {
      handleInputChange,
      onSend,
      context: { chatMode: 'discuss', setChatMode },
    });

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    textarea.dispatchEvent(enter);

    await Promise.resolve();
    await Promise.resolve();

    // Command ran...
    expect(setChatMode).toHaveBeenCalledWith('build');

    // ...input cleared...
    expect(handleInputChange.mock.calls.at(-1)?.[0].target.value).toBe('');

    // ...and the composer's own send handler never fired.
    expect(onSend).not.toHaveBeenCalled();

    // The captured event was prevented so it cannot fall through.
    expect(enter.defaultPrevented).toBe(true);
  });

  it('Escape on the textarea dismisses the palette (clears the slash)', () => {
    const handleInputChange = vi.fn();
    const { textarea } = renderWithTextarea('/clear', { handleInputChange });

    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    textarea.dispatchEvent(esc);

    expect(handleInputChange).toHaveBeenCalledTimes(1);
    expect(handleInputChange.mock.calls[0][0].target.value).toBe('');
    expect(esc.defaultPrevented).toBe(true);
  });

  it('ArrowDown on the textarea moves the palette selection', () => {
    /*
     * `/c` matches several commands (clear, discuss/code, build/code, ...),
     * so there is more than one row to move between.
     */
    const { textarea } = renderWithTextarea('/c', { handleInputChange: vi.fn() });

    const activeKeyword = () =>
      document.querySelector('.bolt-slash-commands-item[data-active="true"] .bolt-slash-commands-keyword')
        ?.textContent ?? null;

    const firstId = activeKeyword();
    expect(firstId).toBeTruthy();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });

    const secondId = activeKeyword();
    expect(secondId).toBeTruthy();
    expect(secondId).not.toBe(firstId);
  });

  it('Shift+Enter is NOT intercepted (newline passes through to the composer)', () => {
    const handleInputChange = vi.fn();
    const onSend = vi.fn();
    const { textarea } = renderWithTextarea('/build', { handleInputChange, onSend });

    const shiftEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(shiftEnter);

    /*
     * The bridge ignores Shift+Enter; the composer's own handler also
     * bails on shiftKey, so neither send nor command execution happens.
     */
    expect(onSend).not.toHaveBeenCalled();
    expect(shiftEnter.defaultPrevented).toBe(false);
  });
});

describe('shouldForwardKeyToSlashPalette', () => {
  const base = { key: '', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, isComposing: false };

  it('returns false when no trigger is active', () => {
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'Enter' }, false)).toBe(false);
  });

  it('forwards the nav keys when a trigger is active', () => {
    for (const key of ['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape']) {
      expect(shouldForwardKeyToSlashPalette({ ...base, key }, true)).toBe(true);
    }
  });

  it('does not forward ordinary character keys', () => {
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'a' }, true)).toBe(false);
  });

  it('does not forward Shift+Enter (newline) or modifier combos', () => {
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'Enter', shiftKey: true }, true)).toBe(false);
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'Enter', metaKey: true }, true)).toBe(false);
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'ArrowDown', ctrlKey: true }, true)).toBe(false);
  });

  it('does not forward Enter during IME composition', () => {
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'Enter', isComposing: true }, true)).toBe(false);
  });

  it('always forwards Escape, even with modifiers held', () => {
    expect(shouldForwardKeyToSlashPalette({ ...base, key: 'Escape', metaKey: true }, true)).toBe(true);
  });
});
