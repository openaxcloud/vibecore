/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PRODUCT_TOUR_STORAGE_KEY,
  ProductTour,
  persistProductTourProgress,
  readProductTourProgress,
} from './ProductTour';

beforeEach(() => window.localStorage.clear());

afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-vc-tour-active]').forEach((element) => {
    element.removeAttribute('data-vc-tour-active');
  });
  document.querySelectorAll('[data-vc-tour-fixture]').forEach((element) => element.remove());
});

describe('ProductTour', () => {
  it('opens on first use, preserves progress, and resumes from the help action', async () => {
    const { rerender } = render(<ProductTour restartToken={0} />);

    expect(await screen.findByRole('dialog', { name: 'Navigate your workspace' })).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Build from a prompt' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readProductTourProgress(window.localStorage)).toEqual({ status: 'dismissed', step: 1 });

    rerender(<ProductTour restartToken={1} />);
    expect(await screen.findByRole('dialog', { name: 'Build from a prompt' })).toBeTruthy();
  });

  it('finishes without blocking later visits', async () => {
    persistProductTourProgress(window.localStorage, { status: 'in_progress', step: 3 });
    render(<ProductTour restartToken={0} />);

    expect(await screen.findByRole('dialog', { name: 'Return whenever you need it' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(readProductTourProgress(window.localStorage)).toEqual({ status: 'completed', step: 0 });
  });

  it('dismisses with Escape and keeps every control touch-friendly', async () => {
    render(<ProductTour restartToken={0} />);

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close guided tour' }).className).toContain('h-[44px]');
    expect(screen.getByRole('button', { name: 'Back' }).className).toContain('min-h-[44px]');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readProductTourProgress(window.localStorage).status).toBe('dismissed');
  });

  it('recovers from invalid or unavailable persistence', () => {
    window.localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, '{invalid');
    expect(readProductTourProgress(window.localStorage)).toEqual({ status: 'new', step: 0 });
    expect(readProductTourProgress(null)).toEqual({ status: 'new', step: 0 });
  });

  it('moves the active target to the visible mobile menu when the responsive layout changes', async () => {
    persistProductTourProgress(window.localStorage, { status: 'in_progress', step: 1 });

    const fixture = document.createElement('div');
    const navigation = document.createElement('button');
    const drawer = document.createElement('div');
    const createProject = document.createElement('a');
    const visibleRect = { bottom: 44, height: 44, left: 0, right: 44, top: 0, width: 44, x: 0, y: 0 } as DOMRect;

    fixture.dataset.vcTourFixture = 'true';
    navigation.dataset.vcTourTarget = 'navigation';
    navigation.getBoundingClientRect = () => visibleRect;
    createProject.dataset.vcTourTarget = 'create-project';
    createProject.getBoundingClientRect = () => visibleRect;
    drawer.append(createProject);
    fixture.append(navigation, drawer);
    document.body.append(fixture);

    render(<ProductTour restartToken={0} />);

    expect(await screen.findByRole('dialog', { name: 'Build from a prompt' })).toBeTruthy();
    expect(createProject.getAttribute('data-vc-tour-active')).toBe('true');

    drawer.setAttribute('aria-hidden', 'true');
    fireEvent.resize(window);

    await waitFor(() => expect(navigation.getAttribute('data-vc-tour-active')).toBe('true'));
    expect(createProject.hasAttribute('data-vc-tour-active')).toBe(false);
  });
});
