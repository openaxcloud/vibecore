/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RelativeTime } from './RelativeTime';
import { createI18nInstance } from '~/lib/i18n/runtime';

beforeEach(() => vi.useFakeTimers().setSystemTime(new Date('2026-07-03T12:00:00.000Z')));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('RelativeTime', () => {
  it('uses the active French locale for its label and tooltip', () => {
    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <RelativeTime value="2026-07-03T10:00:00.000Z" prefix="Mis à jour" />
      </I18nextProvider>,
    );

    const time = screen.getByText('Mis à jour il y a 2 heures');

    expect(time.getAttribute('datetime')).toBe('2026-07-03T10:00:00.000Z');
    expect(time.getAttribute('title')).toMatch(/3 juil\. 2026/);
  });
});
