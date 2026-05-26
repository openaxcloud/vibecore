/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Message } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ShareConversationButton } from './ShareConversationButton';

const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('react-toastify', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

describe('<ShareConversationButton />', () => {
  beforeEach(() => {
    toastSuccess.mockClear();
    toastError.mockClear();

    vi.stubGlobal('navigator', {
      ...globalThis.navigator,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders a disabled button when there are no messages to share', () => {
    render(<ShareConversationButton conversationId="conv-1" projectId="proj-1" authorUserId="user-1" messages={[]} />);

    const button = screen.getByRole('button', { name: /Share this conversation/ });
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('builds + copies the share URL when clicked with messages', async () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'do the thing' },
      { id: 'a1', role: 'assistant', content: 'doing it' },
    ];

    render(
      <ShareConversationButton
        conversationId="conv-1"
        projectId="proj-1"
        authorUserId="user-1"
        title="Demo"
        messages={messages}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Share this conversation/ }));

    await waitFor(() => {
      expect(globalThis.navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const copiedUrl = (globalThis.navigator.clipboard.writeText as unknown as { mock: { calls: string[][] } }).mock
      .calls[0][0];
    expect(copiedUrl).toMatch(/\/share\//);
    expect(toastSuccess).toHaveBeenCalledWith('Share link copied to clipboard');
  });

  it('surfaces an error toast when the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', { ...globalThis.navigator, clipboard: undefined });

    render(
      <ShareConversationButton
        conversationId="conv-1"
        projectId="proj-1"
        authorUserId="user-1"
        messages={[{ id: 'u1', role: 'user', content: 'hi' }]}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Share this conversation/ }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
