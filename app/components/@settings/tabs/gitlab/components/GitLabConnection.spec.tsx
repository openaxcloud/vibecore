/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GitLabConnection from './GitLabConnection';

const connect = vi.fn(() => Promise.resolve());
const disconnect = vi.fn();

let connectionState: {
  isConnected: boolean;
  isConnecting: boolean;
  connection: unknown;
  error: string | null;
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('~/lib/hooks', () => ({
  useGitLabConnection: () => ({
    ...connectionState,
    connect,
    disconnect,
  }),
}));

const SECRET_TOKEN = 'glpat-supersecrettoken123456';

describe('GitLabConnection', () => {
  beforeEach(() => {
    connectionState = { isConnected: false, isConnecting: false, connection: null, error: null };
    connect.mockClear();
    disconnect.mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not log the access token (or any console.log) on a manual connect attempt', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Access Token'), { target: { value: SECRET_TOKEN } });
    fireEvent.click(screen.getByRole('button', { name: /connect/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith(SECRET_TOKEN, 'https://gitlab.com'));

    // No console.log at all on the connect path, and certainly nothing carrying the token prefix.
    expect(logSpy).not.toHaveBeenCalled();

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).not.toContain(SECRET_TOKEN.substring(0, 10));
  });

  it('does not render the debug "Test Values" button', () => {
    render(<GitLabConnection connectionTest={null} onTestConnection={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /test values/i })).toBeNull();
  });
});
