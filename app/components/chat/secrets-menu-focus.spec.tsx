/** @vitest-environment jsdom */
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProjectSecretsPanel } from './ProjectSecretsPanel';
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('~/lib/reveler-un-secret', () => ({ revelerUnSecret: vi.fn() }));
afterEach(cleanup);

function mount() {
  const submit = vi.fn();

  const view = render(
    <>
      <button data-testid="outside">Outside</button>
      <ProjectSecretsPanel
        projectId="synthetic"
        data={{ secrets: [{ key: 'SYNTHETIC_KEY' }] }}
        busy={false}
        language="en"
        onSubmit={submit}
      />
    </>,
  );

  return { ...view, submit };
}
it.each(['header', 'row'])('returns focus on Escape from the %s menu', (kind) => {
  const view = mount();

  const trigger =
    kind === 'header'
      ? view.getByTestId('secrets-menu')
      : view.getByRole('button', { name: 'Actions for SYNTHETIC_KEY' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(view.getByRole('menu')).toBeTruthy();
  expect(document.activeElement?.getAttribute('role')).toBe('menuitem');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(view.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(view.submit).not.toHaveBeenCalled();
});
it('does not steal focus from an outside interaction', () => {
  const view = mount();
  fireEvent.click(view.getByTestId('secrets-menu'));

  const outside = view.getByTestId('outside');
  outside.focus();
  fireEvent.pointerDown(outside);
  expect(view.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(outside);
  expect(view.submit).not.toHaveBeenCalled();
});
it.each(['header', 'row'])('keeps outside keyboard focus when Escape closes the %s menu', (kind) => {
  const view = mount();

  const trigger =
    kind === 'header'
      ? view.getByTestId('secrets-menu')
      : view.getByRole('button', { name: 'Actions for SYNTHETIC_KEY' });
  fireEvent.click(trigger);
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });

  const outside = view.getByTestId('outside');

  // jsdom does not implement native Tab traversal; model its resulting focus explicitly.
  outside.focus();
  expect(view.getByRole('menu')).toBeTruthy();
  fireEvent.keyDown(outside, { key: 'Escape' });
  expect(view.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(outside);
  expect(view.submit).not.toHaveBeenCalled();
});
