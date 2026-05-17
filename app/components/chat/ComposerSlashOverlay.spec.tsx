/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComposerSlashOverlay, detectSlashTrigger } from './ComposerSlashOverlay';
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
    },
  ) {
    const ref = createRef<HTMLTextAreaElement>();

    const result = render(
      <>
        <textarea ref={ref} defaultValue={input} aria-label="composer" />
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
});
