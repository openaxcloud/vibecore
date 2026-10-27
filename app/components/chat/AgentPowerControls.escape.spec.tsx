/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPowerControls } from './AgentPowerControls';
import { useKeybindings } from '~/lib/hooks/useKeybindings';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));

const listeners: Array<() => void> = [];
afterEach(() => {
  cleanup();
  listeners.splice(0).forEach((remove) => remove());
  document.body.innerHTML = '';
  localStorage.clear();
});

function setup(mobile = false) {
  if (mobile) {
    const root = document.createElement('div');
    root.className = 'bolt-responsive-ide-mobile';
    document.body.append(root);
  }

  const runAction = vi.fn();
  const stop = vi.fn();

  // The streaming listener may predate the popover's document listener.
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('[role="dialog"]')) {
      stop();
    }
  };
  document.addEventListener('keydown', onKey);
  listeners.push(() => document.removeEventListener('keydown', onKey));

  function Harness() {
    useKeybindings({
      bindings: [
        { combo: 'escape', action: 'overlay.close', label: '', description: '', category: 'Help' },
        { combo: 'cmd+s', action: 'file.save', label: '', description: '', category: 'File' },
      ],
      getContext: () => ({}),
      runAction,
    });

    return (
      <AgentPowerControls
        variant="compact"
        value={{
          buildTier: 'power',
          highEffort: false,
          highPowerModel: false,
          turboMode: false,
          extendedThinking: false,
        }}
        onChange={vi.fn()}
      />
    );
  }
  render(<Harness />);

  const trigger = screen.getByTestId('agent-mode-advanced');
  trigger.focus();
  fireEvent.click(trigger);

  return { trigger, runAction, stop };
}

it.each([false, true])('Escape closes actual model subpanel and restores opener (mobile=%s)', (mobile) => {
  const { trigger, runAction, stop } = setup(mobile);
  fireEvent.click(screen.getByTestId('feuille-entree-modele'));

  const target = screen.getAllByRole('radio').at(-1)!;
  target.focus();
  fireEvent.keyDown(target, { key: 's', ctrlKey: true });
  expect(runAction.mock.calls.map(([action]) => action)).toEqual(['file.save']);
  fireEvent.keyDown(target, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByTestId('feuille-second-panneau')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(stop).not.toHaveBeenCalled();
  expect(runAction).toHaveBeenCalledTimes(1);
  fireEvent.click(trigger);
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(stop).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(runAction.mock.calls.map(([action]) => action)).toEqual(['file.save', 'overlay.close']);
});

it('keeps a consumed child Escape local before closing on the next Escape', () => {
  const { runAction, stop } = setup();
  const target = screen.getByTestId('feuille-entree-modele');
  const consume = (event: Event) => event.preventDefault();
  target.addEventListener('keydown', consume);
  fireEvent.keyDown(target, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeNull();
  expect(runAction).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
  target.removeEventListener('keydown', consume);
  fireEvent.keyDown(target, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([false, true])('preserves subpanel Back and outside dismissal (mobile=%s)', (mobile) => {
  const { trigger, runAction, stop } = setup(mobile);
  fireEvent.click(screen.getByTestId('feuille-entree-modele'));

  const back = screen.getByTestId('feuille-retour');
  fireEvent.pointerDown(back);
  fireEvent.click(back);
  expect(screen.queryByRole('dialog')).not.toBeNull();
  expect(screen.getByTestId('feuille-entree-modele')).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(runAction).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});

it('closes when removing the focused subpanel control has returned focus to body', () => {
  const { trigger, runAction, stop } = setup();
  fireEvent.click(screen.getByTestId('feuille-entree-modele'));

  const back = screen.getByTestId('feuille-retour');
  back.focus();
  fireEvent.click(back);
  expect(document.activeElement).toBe(document.body);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(runAction).not.toHaveBeenCalled();
  expect(stop).not.toHaveBeenCalled();
});
