/** @vitest-environment jsdom */

import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import { AuthOauthButton } from './AuthScreen';

it('starts pending feedback only when OAuth opens in the current tab', () => {
  const onStart = vi.fn();
  const browserClick = vi.fn();
  render(
    <MemoryRouter>
      <div
        onClick={(event) => {
          browserClick(event.defaultPrevented);
          event.preventDefault();
        }}
      >
        <AuthOauthButton provider="github" label="GitHub" icon={null} pendingProvider={null} onStart={onStart} />
      </div>
    </MemoryRouter>,
  );

  const link = screen.getByRole('link', { name: 'GitHub' });

  for (const modifiers of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }]) {
    fireEvent.click(link, modifiers);
    expect(browserClick).toHaveBeenLastCalledWith(false);
  }

  expect(onStart).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(onStart).toHaveBeenCalledExactlyOnceWith('github');
});
