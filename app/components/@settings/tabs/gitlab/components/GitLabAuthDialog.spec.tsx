/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GitLabAuthDialog } from './GitLabAuthDialog';

const connect = vi.fn(() => Promise.resolve());

let connectionState: {
  isConnecting: boolean;
  error: string | null;
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
}));

vi.mock('react-toastify', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('~/lib/hooks', () => ({
  useGitLabConnection: () => ({
    ...connectionState,
    connect,
  }),
}));

const SECRET_TOKEN = 'glpat-supersecrettoken123456';

describe('GitLabAuthDialog', () => {
  beforeEach(() => {
    connectionState = { isConnecting: false, error: null };
    connect.mockClear();
    (toast.success as ReturnType<typeof vi.fn>).mockClear();
    (toast.error as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not fire its own success toast on connect (the hook owns the success toast)', async () => {
    const onClose = vi.fn();
    render(<GitLabAuthDialog isOpen onClose={onClose} />);

    fireEvent.change(screen.getByPlaceholderText('Enter your GitLab access token'), {
      target: { value: SECRET_TOKEN },
    });
    fireEvent.click(screen.getByRole('button', { name: /connect to gitlab/i }));

    await waitFor(() => expect(connect).toHaveBeenCalledWith(SECRET_TOKEN, 'https://gitlab.com'));

    /*
     * The dialog must NOT fire a success toast itself; useGitLabConnection.connect already does.
     * Showing one here would stack two success toasts on a single successful connect.
     */
    expect(toast.success).not.toHaveBeenCalled();

    // The dialog still closes on success.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('shows a validation error toast (and skips connect) when the token is empty', async () => {
    render(<GitLabAuthDialog isOpen onClose={vi.fn()} />);

    // Submit the form directly with an empty token to exercise the validation branch.
    const form = screen.getByPlaceholderText('Enter your GitLab access token').closest('form')!;
    fireEvent.submit(form);

    expect(toast.error).toHaveBeenCalledWith('Please enter your GitLab access token');
    expect(connect).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
