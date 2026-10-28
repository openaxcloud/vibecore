/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentPowerControls } from './AgentPowerControls';
import { lireChoix } from './choix-de-modele';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ i18n: { language: 'en' } }) }));
afterEach(() => {
  cleanup();
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
    fireEvent.click(screen.getByTestId('feuille-entree-modele'));
    expect(screen.getByTestId('feuille-modele-gpt-5.6-luna-std').getAttribute('aria-checked')).toBe('true');
  },
);
