/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComposerMentionsOverlay, detectMentionTrigger } from './ComposerMentionsOverlay';
import type { FileMentionCandidate } from '~/lib/hooks/useFileMentions';

vi.mock('~/lib/hooks/useFileMentions', () => ({
  useFileMentions: (query: string): FileMentionCandidate[] => {
    const all: FileMentionCandidate[] = [
      { absolutePath: '/home/project/src/App.tsx', displayPath: 'src/App.tsx', basename: 'App.tsx', score: 100 },
      {
        absolutePath: '/home/project/src/components/Header.tsx',
        displayPath: 'src/components/Header.tsx',
        basename: 'Header.tsx',
        score: 80,
      },
    ];

    const trimmed = query.trim().toLowerCase();

    if (trimmed === '') {
      return all;
    }

    return all.filter((candidate) => candidate.basename.toLowerCase().includes(trimmed));
  },
}));

describe('detectMentionTrigger', () => {
  it('returns null when no @ is present', () => {
    expect(detectMentionTrigger('hello world', 5)).toBeNull();
  });

  it('detects @ at start of input', () => {
    expect(detectMentionTrigger('@App', 4)).toEqual({ start: 0, end: 4, query: 'App' });
  });

  it('detects @ after whitespace', () => {
    expect(detectMentionTrigger('look at @He', 11)).toEqual({ start: 8, end: 11, query: 'He' });
  });

  it('rejects @ embedded in a word (e.g. email)', () => {
    expect(detectMentionTrigger('email@example.com', 17)).toBeNull();
  });

  it('returns null when whitespace lies between @ and caret', () => {
    expect(detectMentionTrigger('@foo bar', 8)).toBeNull();
  });

  it('returns null on empty input', () => {
    expect(detectMentionTrigger('', 0)).toBeNull();
  });
});

describe('<ComposerMentionsOverlay />', () => {
  afterEach(() => {
    cleanup();
  });

  function renderWithTextarea(props: {
    input: string;
    handleInputChange?: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
    caret?: number;
  }) {
    const ref = createRef<HTMLTextAreaElement>();

    const result = render(
      <>
        <textarea ref={ref} defaultValue={props.input} aria-label="composer" />
        <ComposerMentionsOverlay textareaRef={ref} input={props.input} handleInputChange={props.handleInputChange} />
      </>,
    );

    const textarea = screen.getByLabelText('composer') as HTMLTextAreaElement;
    const caret = props.caret ?? props.input.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    fireEvent.focus(textarea);

    return { ref, textarea, result };
  }

  it('renders nothing for input without an active trigger', () => {
    const { result } = renderWithTextarea({ input: 'hello' });
    expect(result.container.querySelector('.bolt-composer-mentions-overlay')).toBeNull();
  });

  it('renders the palette when an active @ token is at the caret', () => {
    renderWithTextarea({ input: '@App', caret: 4 });
    expect(screen.getByText('App.tsx')).toBeTruthy();
  });

  it('inserts @<displayPath> on select and fires handleInputChange', () => {
    const handleInputChange = vi.fn();
    renderWithTextarea({ input: '@He', caret: 3, handleInputChange });

    fireEvent.click(screen.getByText('Header.tsx'));

    expect(handleInputChange).toHaveBeenCalledTimes(1);

    const [event] = handleInputChange.mock.calls[0];
    expect((event.target as HTMLTextAreaElement).value).toBe('@src/components/Header.tsx ');
  });

  it('replaces only the @token substring when context surrounds it', () => {
    const handleInputChange = vi.fn();
    renderWithTextarea({ input: 'fix @He please', caret: 7, handleInputChange });

    fireEvent.click(screen.getByText('Header.tsx'));

    const [event] = handleInputChange.mock.calls[0];
    expect((event.target as HTMLTextAreaElement).value).toBe('fix @src/components/Header.tsx  please');
  });
});
