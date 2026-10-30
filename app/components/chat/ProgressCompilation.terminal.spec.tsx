/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it } from 'vitest';
import ProgressCompilation from './ProgressCompilation';
import { createI18nInstance } from '~/lib/i18n/runtime';

describe('terminal response progress', () => {
  afterEach(cleanup);
  it.each(['incomplete', 'error'] as const)('does not present a finished %s stage as success', (outcome) => {
    render(
      <I18nextProvider i18n={createI18nInstance('en')}>
        <ProgressCompilation
          streaming={false}
          data={[
            { type: 'progress', label: 'response', status: 'complete', order: 1, message: 'Earlier' },
            { type: 'progress', label: 'response', status: 'complete', outcome, order: 2, message: 'Synthetic' },
          ]}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole('status').getAttribute('data-progress-state')).toBe('interrupted');
  });
});
