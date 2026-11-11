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

it.each(['header', 'row'])('keeps the %s menu and its focus during scrolling that does not move its anchor', (kind) => {
  const view = mount();
  const trigger = kind === 'header' ? view.getByTestId('secrets-menu') : view.getByTestId('secret-menu-SYNTHETIC_KEY');
  const bounds = vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 80, 32, 32));
  fireEvent.click(trigger);

  const menu = view.getByRole('menu');
  const focused = document.activeElement;

  // A sibling, a queued ancestor scroll and scrolling inside the menu must not dismiss it.
  for (const target of [view.getByTestId('outside'), view.container, document, window, menu]) {
    fireEvent.scroll(target);
    expect(view.getByRole('menu')).toBe(menu);
    expect(document.activeElement).toBe(focused);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  }
  expect(view.submit).not.toHaveBeenCalled();
  bounds.mockRestore();
});

it('allows the actual Edit action after the exterior scroll sequence seen in runtime CI', () => {
  const view = mount();
  fireEvent.click(view.getByTestId('secret-menu-SYNTHETIC_KEY'));
  fireEvent.scroll(view.container);
  fireEvent.scroll(window);

  const edit = view.getByRole('menuitem', { name: 'Edit' });
  fireEvent.pointerDown(edit);
  fireEvent.click(edit);
  expect(view.queryByRole('menu')).toBeNull();
  expect(view.getByTestId('secrets-form-key').getAttribute('value')).toBe('SYNTHETIC_KEY');
  expect(document.activeElement).toBe(view.getByTestId('secrets-form-value'));
  expect(view.submit).not.toHaveBeenCalled();
});

it.each(['header', 'row'])(
  'closes the %s menu when scrolling moves its anchor, then measures a reopened menu afresh',
  (kind) => {
    const view = mount();

    const trigger =
      kind === 'header' ? view.getByTestId('secrets-menu') : view.getByTestId('secret-menu-SYNTHETIC_KEY');

    let rect = new DOMRect(100, 80, 32, 32);

    const bounds = vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(() => rect);
    fireEvent.click(trigger);
    rect = new DOMRect(100, 70, 32, 32);
    fireEvent.scroll(view.container);
    expect(view.queryByRole('menu')).toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    fireEvent.scroll(view.container);
    expect(view.getByRole('menu')).toBeTruthy();
    rect = new DOMRect(90, 70, 32, 32);
    fireEvent.scroll(window);
    expect(view.queryByRole('menu')).toBeNull();
    bounds.mockRestore();
  },
);

it.each(['header', 'row'])('still dismisses the %s menu on resize', (kind) => {
  const view = mount();
  fireEvent.click(kind === 'header' ? view.getByTestId('secrets-menu') : view.getByTestId('secret-menu-SYNTHETIC_KEY'));
  fireEvent.resize(window);
  expect(view.queryByRole('menu')).toBeNull();
});

it('cleans up global menu listeners when unmounted', () => {
  const added = vi.spyOn(window, 'addEventListener');
  const removed = vi.spyOn(window, 'removeEventListener');
  const view = mount();
  fireEvent.click(view.getByTestId('secret-menu-SYNTHETIC_KEY'));

  const registrations = added.mock.calls.filter(([type]) => ['scroll', 'resize', 'keydown'].includes(type));
  view.unmount();

  for (const registration of registrations) {
    expect(removed.mock.calls).toContainEqual(registration);
  }
  expect(registrations).toHaveLength(3);
  added.mockRestore();
  removed.mockRestore();
});

it('dismisses a menu whose anchor is detached before a captured scroll', () => {
  const view = mount();
  const trigger = view.getByTestId('secret-menu-SYNTHETIC_KEY');
  fireEvent.click(trigger);
  trigger.remove();
  fireEvent.scroll(window);
  expect(view.queryByRole('menu')).toBeNull();
});
