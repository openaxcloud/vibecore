/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmptyState } from './EmptyState';

afterEach(cleanup);

describe('<EmptyState />', () => {
  it('wraps long actions and keeps both touch targets at least 44px high', () => {
    render(
      <EmptyState
        title="Aucun déploiement disponible"
        description="Créez votre premier déploiement pour publier cette application."
        actionLabel="Créer le premier déploiement"
        onAction={vi.fn()}
        secondaryActionLabel="Consulter la documentation"
        onSecondaryAction={vi.fn()}
        variant="compact"
      />,
    );

    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(2);

    for (const action of actions) {
      expect(action.className).toContain('min-h-11');
      expect(action.className).toContain('whitespace-normal');
    }

    expect(actions[0].parentElement?.className).toContain('flex-wrap');
  });
});
