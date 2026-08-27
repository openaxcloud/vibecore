/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectAgentRunStatus } from './ProjectAgentRunStatus';
import { workspaceMiscEn, workspaceMiscFr } from '~/lib/i18n/catalogs/workspace-misc';

function renderRunStatus(onStop = vi.fn()) {
  const i18n = createInstance();

  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: workspaceMiscEn },
      fr: { translation: workspaceMiscFr },
    },
    initImmediate: false,
  });

  render(
    <I18nextProvider i18n={i18n}>
      <ProjectAgentRunStatus stopLabel="Stop Claude" onStop={onStop} />
    </I18nextProvider>,
  );
}

describe('<ProjectAgentRunStatus />', () => {
  afterEach(() => {
    cleanup();
  });

  it('anchors the stop action in a labelled AI agent status bar', () => {
    renderRunStatus();

    expect(screen.getByTestId('project-agent-run-status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Agent running');
    expect(screen.getByRole('button', { name: 'Stop Claude' })).toBeTruthy();
  });

  it('calls the stop handler from the status bar action', () => {
    const onStop = vi.fn();

    renderRunStatus(onStop);

    fireEvent.click(screen.getByRole('button', { name: 'Stop Claude' }));

    expect(onStop).toHaveBeenCalledTimes(1);
  });
});
