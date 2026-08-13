/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import LandingVideo from './LandingVideo';

describe('<LandingVideo />', () => {
  afterEach(() => {
    cleanup();
  });

  it('labels every icon-only control for assistive technology', () => {
    render(<LandingVideo />);

    // Default state: not playing, muted.
    expect(screen.getByRole('button', { name: 'Play demo video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unmute demo video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show captions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
  });

  it('updates the captions label and aria-pressed when toggled', () => {
    render(<LandingVideo />);

    const captionsButton = screen.getByTestId('button-video-captions-toggle');
    expect(captionsButton.getAttribute('aria-label')).toBe('Show captions');
    expect(captionsButton.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(captionsButton);

    expect(captionsButton.getAttribute('aria-label')).toBe('Hide captions');
    expect(captionsButton.getAttribute('aria-pressed')).toBe('true');
  });

  it('updates the mute label and aria-pressed when toggled', () => {
    render(<LandingVideo />);

    const muteButton = screen.getByTestId('button-video-mute-toggle');
    expect(muteButton.getAttribute('aria-label')).toBe('Unmute demo video');
    expect(muteButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(muteButton);

    expect(muteButton.getAttribute('aria-label')).toBe('Mute demo video');
    expect(muteButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('gives the mute and fullscreen controls a 44px minimum touch target', () => {
    render(<LandingVideo />);

    for (const testId of ['button-video-mute-toggle', 'button-video-fullscreen']) {
      const button = screen.getByTestId(testId);
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
    }
  });
});
