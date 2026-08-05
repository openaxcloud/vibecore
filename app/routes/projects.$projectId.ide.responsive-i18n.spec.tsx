/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';

import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/components/chat/BaseChat', () => ({ BaseChat: () => null }));
vi.mock('~/lib/project-ide-loader.server', () => ({ loadProjectIdeData: vi.fn() }));
vi.mock('~/lib/runtime/CurrentWorkspaceContext', () => ({
  CurrentWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('~/lib/runtime/ProjectWorkspaceProvider', () => ({
  ProjectWorkspaceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('~/lib/stores/workbench', () => ({ workbenchStore: {} }));

import { MobileIdeLanguageSwitchPortal } from './projects.$projectId.ide';
import { createI18nInstance } from '~/lib/i18n/runtime';

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('project IDE responsive language switch', () => {
  it('portals to the document body without entering or mutating the frozen mobile header', async () => {
    const header = document.createElement('header');
    header.dataset.testid = 'mobile-ide-header';
    header.innerHTML = `
      <div class="bolt-mobile-ecode-header-inner">
        <div class="bolt-mobile-ecode-header-side">
          <button type="button" data-testid="button-back">Back</button>
          <button type="button" data-testid="button-history">Activity</button>
        </div>
        <div class="bolt-mobile-ecode-header-title"><span>Terminal</span></div>
        <div class="bolt-mobile-ecode-header-side bolt-mobile-ecode-header-side--right">
          <button type="button" data-testid="button-new-tab">New tab</button>
          <button type="button" data-testid="button-more">More</button>
        </div>
      </div>
    `;
    document.body.append(header);

    render(
      <I18nextProvider i18n={createI18nInstance('fr')}>
        <MobileIdeLanguageSwitchPortal />
      </I18nextProvider>,
    );

    const slot = await screen.findByTestId('mobile-ide-language-switch-slot');
    const switchGroup = within(slot).getByTestId('language-switch');

    expect(slot.parentElement).toBe(document.body);
    expect(header).not.toContainElement(slot);
    expect(header.querySelector('.bolt-mobile-ecode-header-inner')).toHaveTextContent(
      /Back\s*Activity\s*Terminal\s*New tab\s*More/u,
    );
    expect(header.querySelector('.bolt-mobile-ecode-header-inner')).toHaveProperty('childElementCount', 3);
    expect(within(switchGroup).getByRole('button', { name: 'Langue actuelle : Français' })).toBeVisible();
    expect(within(switchGroup).getByRole('button', { name: 'Anglais' })).toBeVisible();
    expect(screen.getByTestId('button-back')).toBeInTheDocument();
    expect(screen.getByTestId('button-history')).toBeInTheDocument();
    expect(screen.getByTestId('button-new-tab')).toBeInTheDocument();
    expect(screen.getByTestId('button-more')).toBeInTheDocument();
  });

  it('positions the mobile switch below the header without reordering frozen controls', () => {
    const styles = readFileSync('app/styles/index.scss', 'utf8');

    expect(styles).toMatch(
      /\.bolt-project-mobile-language-switch-slot\s*\{[^}]*position:\s*fixed;[^}]*top:\s*calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*56px\);[^}]*right:\s*max\(12px,\s*env\(safe-area-inset-right,\s*0px\)\);[^}]*display:\s*inline-flex;/u,
    );
    expect(styles).toMatch(
      /body:has\(\.bolt-responsive-ide-mobile\[data-mobile-agent-context='true'\]\)\s*\.bolt-project-mobile-language-switch-slot\s*\{[^}]*top:\s*calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*108px\);/u,
    );
    expect(styles).toContain('--vc-mobile-language-switch-reserved-height: 58px;');
    expect(styles).toMatch(
      /--vc-mobile-shell-top:\s*calc\([^;]*var\(--vc-mobile-language-switch-reserved-height,\s*58px\)/u,
    );
    expect(styles).toMatch(
      /\.bolt-mobile-agent-start-state\s*\{[^}]*margin:\s*calc\(55px\s*\+\s*var\(--vc-mobile-language-switch-reserved-height,\s*58px\)\)\s*auto\s*0;/u,
    );
    expect(styles).not.toMatch(/\.bolt-mobile-ecode-header-side(?:--right)?\s*\{[^}]*order:/u);
    expect(styles).not.toMatch(/\.bolt-mobile-ecode-header-title\s*\{[^}]*order:/u);
  });
});
