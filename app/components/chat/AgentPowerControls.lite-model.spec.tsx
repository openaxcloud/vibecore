/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPowerControls } from './AgentPowerControls';
import { ecrireChoix, lireChoix } from './choix-de-modele';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = '';
});

it.each([false, true])(
  'opens Lite model through the composer, persists Luna and shows budget (mobile=%s)',
  (mobile) => {
    if (mobile) {
      const root = document.createElement('div');
      root.className = 'bolt-responsive-ide-mobile';
      document.body.append(root);
    }

    const controls = (
      <AgentPowerControls
        variant="compact"
        value={{
          buildTier: 'lite',
          highEffort: false,
          highPowerModel: false,
          turboMode: false,
          extendedThinking: false,
        }}
        onChange={vi.fn()}
      />
    );

    const first = render(controls);
    fireEvent.click(screen.getByTestId('agent-mode-advanced'));

    const modelEntry = screen.getByTestId('feuille-entree-modele') as HTMLButtonElement;
    expect(modelEntry.disabled).toBe(false);
    expect((screen.getByTestId('feuille-entree-avance') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(modelEntry);
    expect(screen.queryByRole('slider')).toBeNull();
    fireEvent.click(screen.getByTestId('feuille-modele-gpt-5.6-luna-std'));
    expect(lireChoix().lite).toEqual({ modele: 'gpt-5.6-luna' });
    expect(screen.getByRole('note').textContent).toContain('$20');
    first.unmount();
    render(controls);
    fireEvent.click(screen.getByTestId('agent-mode-advanced'));
    expect(screen.getByRole('note').textContent).toContain('Provider credits are not guaranteed');
    expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('gpt-5.6-luna');
    expect(screen.getByTestId('feuille-entree-modele').textContent).not.toContain('Auto · default');
    fireEvent.click(screen.getByTestId('feuille-entree-modele'));
    expect(screen.getByTestId('feuille-modele-gpt-5.6-luna-std').getAttribute('aria-checked')).toBe('true');
  },
);

it('keeps the summary aligned across mode and project changes without changing persisted choices', () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>(() => {
          /* Keep the synthetic budget read pending until unmount. */
        }),
    ),
  );

  const choices = { lite: { modele: 'gpt-5.6-luna' }, max: { modele: 'gpt-5.6-sol', serviceTier: 'fast' as const } };
  ecrireChoix(choices);

  const onChange = vi.fn();

  const controls = (projectId: string, buildTier: 'lite' | 'power' | 'max') => (
    <AgentPowerControls
      variant="compact"
      projectId={projectId}
      value={{ buildTier, highEffort: false, highPowerModel: false, turboMode: false, extendedThinking: false }}
      onChange={onChange}
    />
  );

  const view = render(controls('project-a', 'lite'));
  fireEvent.click(screen.getByTestId('agent-mode-advanced'));
  expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('gpt-5.6-luna');
  view.rerender(controls('project-a', 'max'));
  expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('gpt-5.6-sol · fast');
  view.rerender(controls('project-b', 'power'));
  expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('Auto · default');
  view.rerender(controls('project-b', 'lite'));
  expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('gpt-5.6-luna');
  fireEvent.click(screen.getByTestId('feuille-entree-modele'));
  expect(screen.getByTestId('feuille-modele-gpt-5.6-luna-std').getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByTestId('feuille-modele-auto'));
  fireEvent.click(screen.getByTestId('feuille-retour'));
  expect(screen.getByTestId('feuille-entree-modele').textContent).toContain('Auto · default');
  expect(lireChoix()).toEqual({ max: choices.max });
  expect(onChange).not.toHaveBeenCalled();
});
