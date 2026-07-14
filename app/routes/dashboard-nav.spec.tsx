/**
 * @vitest-environment jsdom
 */
import { cleanup, render } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Link, MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { isExternalDashboardLink, resolveDashboardHeaderActions, shouldUseSpaNavigation } from './dashboard-nav';
import { importOptions } from '~/components/dashboard/SaaSLayout';

afterEach(() => {
  cleanup();
});

describe('isExternalDashboardLink', () => {
  it('treats in-app paths as internal (SPA)', () => {
    expect(isExternalDashboardLink('/import-github')).toBe(false);
    expect(isExternalDashboardLink('/dashboard/templates')).toBe(false);
    expect(isExternalDashboardLink('/projects/new')).toBe(false);
    expect(shouldUseSpaNavigation('/import-github')).toBe(true);
  });

  it('treats scheme and protocol-relative URLs as external', () => {
    expect(isExternalDashboardLink('https://github.com/ecode')).toBe(true);
    expect(isExternalDashboardLink('http://example.com')).toBe(true);
    expect(isExternalDashboardLink('mailto:team@e-code.ai')).toBe(true);
    expect(isExternalDashboardLink('tel:+15555555555')).toBe(true);
    expect(isExternalDashboardLink('//cdn.example.com/x')).toBe(true);
    expect(shouldUseSpaNavigation('https://github.com/ecode')).toBe(false);
  });
});

describe('dashboard import options', () => {
  /*
   * Every advertised import option is an in-app route, so the dashboard must
   * render them through client-side navigation rather than a full-reload
   * <a href>. This guards the regression where the cards used raw anchors.
   */
  it('are all internal SPA targets', () => {
    expect(importOptions.length).toBeGreaterThan(0);

    for (const option of importOptions) {
      expect(shouldUseSpaNavigation(option.to)).toBe(true);
    }
  });

  /*
   * Mirrors the route's render decision exactly: internal targets go through
   * <Link> (intercepted by react-router), external ones through <a>. A
   * react-router <Link> only navigates client-side when wrapped in a router —
   * the regression rendered a raw <a href> instead, which is not router-aware.
   */
  function renderOption(to: string): HTMLAnchorElement {
    const card: ReactNode = shouldUseSpaNavigation(to)
      ? createElement(Link, { to, 'data-testid': 'card' }, 'card')
      : createElement('a', { href: to, 'data-testid': 'card' }, 'card');

    const { getByTestId } = render(createElement(MemoryRouter, { initialEntries: ['/dashboard'] }, card));

    return getByTestId('card') as HTMLAnchorElement;
  }

  it('renders internal import cards as router-aware anchors with the internal href', () => {
    const anchor = renderOption('/import-github');

    expect(anchor.tagName).toBe('A');
    expect(anchor.getAttribute('href')).toBe('/import-github');

    /*
     * react-router's <Link> attaches its own click handler that calls
     * preventDefault for in-app navigation — a plain <a href> regression has
     * no such interception, so a cancelable click is the SPA signal.
     */
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps external targets as plain non-intercepted anchors', () => {
    const anchor = renderOption('https://github.com/ecode');

    expect(anchor.getAttribute('href')).toBe('https://github.com/ecode');

    const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
    anchor.dispatchEvent(event);

    /* No react-router interception on a raw <a>, so the default is not prevented. */
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('dashboard header actions', () => {
  it('keeps one creation action when several project cards already expose Open IDE', () => {
    expect(
      resolveDashboardHeaderActions([
        { ideUrl: '/acme/project-alpha', name: 'Project Alpha' },
        { ideUrl: '/acme/project-beta', name: 'Project Beta' },
      ]),
    ).toEqual({
      primary: { label: 'New project', to: '/projects/new' },
    });
  });

  it('uses the same focused creation action when one project exists', () => {
    expect(resolveDashboardHeaderActions([{ ideUrl: '/acme/project-alpha', name: 'Project Alpha' }])).toEqual({
      primary: { label: 'New project', to: '/projects/new' },
    });
  });

  it('starts with the agent when the workspace has no projects', () => {
    expect(resolveDashboardHeaderActions([])).toEqual({
      primary: { label: 'Start with the agent', to: '/projects/new' },
      secondary: { label: 'Browse templates', to: '/dashboard/templates' },
    });
  });
});
