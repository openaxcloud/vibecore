/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LandingVideo from './LandingVideo';
import {
  getMarketingLandingVideoCopy,
  marketingLandingVideoEn,
  marketingLandingVideoFr,
} from '~/lib/i18n/catalogs/marketing-landing-templates-video';

let language = 'en';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language, resolvedLanguage: language } }),
}));

function interpolationTokens(value: string): string[] {
  return [...value.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu)].map((match) => match[1]).sort();
}

describe('<LandingVideo />', () => {
  beforeEach(() => {
    language = 'en';
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps a complete flat EN/FR catalog with interpolation parity and an English fallback', () => {
    expect(Object.keys(marketingLandingVideoFr)).toEqual(Object.keys(marketingLandingVideoEn));

    for (const key of Object.keys(marketingLandingVideoEn) as (keyof typeof marketingLandingVideoEn)[]) {
      expect(marketingLandingVideoEn[key].trim().length, key).toBeGreaterThan(0);
      expect(marketingLandingVideoFr[key].trim().length, key).toBeGreaterThan(0);
      expect(interpolationTokens(marketingLandingVideoFr[key]), key).toEqual(
        interpolationTokens(marketingLandingVideoEn[key]),
      );
    }

    expect(getMarketingLandingVideoCopy('de-DE')['marketingLandingVideo.title']).toBe('See E-Code Platform in action');
  });

  it('renders the complete French copy while preserving media URLs and language identifiers', () => {
    language = 'fr';

    render(<LandingVideo />);

    const video = screen.getByLabelText('Démonstration produit d’E-Code Platform');
    const source = video.querySelector('source');
    const track = video.querySelector('track');

    expect(screen.getByRole('heading', { name: 'Découvrez E-Code Platform en action' })).toBeTruthy();
    expect(
      screen.getByText(
        'Découvrez une démonstration réelle : créez et déployez une application complète, côté client comme côté serveur, en moins de 2 minutes grâce à des agents IA',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Démonstration en direct de la plateforme' })).toBeTruthy();
    expect(screen.getByText('Génération de code par IA')).toBeTruthy();
    expect(screen.getByText('Aperçu en temps réel')).toBeTruthy();
    expect(screen.getByText('Déploiement instantané')).toBeTruthy();
    expect(video.getAttribute('poster')).toBe('/ecode-static/assets/product/ide.png');
    expect(video.getAttribute('aria-describedby')).toBe('landing-video-description landing-video-demo-description');
    expect(source?.getAttribute('src')).toBe('/assets/platform-demo.mp4');
    expect(track?.getAttribute('src')).toBe('/captions/landing-demo.fr.vtt');
    expect(track?.getAttribute('srclang')).toBe('fr');
    expect(track?.getAttribute('label')).toBe('Français');
    expect(readFileSync('public/captions/landing-demo.fr.vtt', 'utf8')).toContain(
      '[Aucune parole — enregistrement d’écran silencieux de la démonstration E-Code]',
    );
  });

  it('labels every icon-only control and updates all labels during a hot FR to EN switch', () => {
    language = 'fr';

    const { rerender } = render(<LandingVideo />);

    expect(screen.getByRole('button', { name: 'Lire la vidéo de démonstration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activer le son de la vidéo de démonstration' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Afficher les sous-titres' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Passer en plein écran' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Commandes de la vidéo' })).toBeTruthy();

    language = 'en';
    rerender(<LandingVideo />);

    expect(screen.getByRole('heading', { name: 'See E-Code Platform in action' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play demo video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Unmute demo video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Show captions' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Video controls' })).toBeTruthy();
    expect(document.querySelector('track')?.getAttribute('src')).toBe('/captions/landing-demo.en.vtt');
    expect(document.querySelector('track')?.getAttribute('srclang')).toBe('en');
    expect(document.querySelector('track')?.getAttribute('label')).toBe('English');
    expect(document.body.textContent).not.toContain('Découvrez E-Code Platform en action');
  });

  it('updates the captions and mute labels with accurate pressed states', () => {
    render(<LandingVideo />);

    const captionsButton = screen.getByTestId('button-video-captions-toggle');
    const muteButton = screen.getByTestId('button-video-mute-toggle');

    expect(captionsButton.getAttribute('aria-label')).toBe('Show captions');
    expect(captionsButton.getAttribute('aria-pressed')).toBe('false');
    expect(muteButton.getAttribute('aria-label')).toBe('Unmute demo video');
    expect(muteButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(captionsButton);
    fireEvent.click(muteButton);

    expect(captionsButton.getAttribute('aria-label')).toBe('Hide captions');
    expect(captionsButton.getAttribute('aria-pressed')).toBe('true');
    expect(muteButton.getAttribute('aria-label')).toBe('Mute demo video');
    expect(muteButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('synchronizes the play control with native media events', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);

    render(<LandingVideo />);

    const video = screen.getByLabelText('E-Code Platform product demonstration');
    const playButton = screen.getByTestId('button-video-play-toggle');

    fireEvent.click(playButton);
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.play(video);
    expect(playButton.getAttribute('aria-label')).toBe('Pause demo video');
    expect(playButton.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(playButton);
    expect(pause).toHaveBeenCalledTimes(1);

    fireEvent.pause(video);
    expect(playButton.getAttribute('aria-label')).toBe('Play demo video');
    expect(playButton.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a localized generic error when playback fails without exposing technical details', async () => {
    language = 'fr';
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('MEDIA_ERR_DECODE raw detail'));

    render(<LandingVideo />);

    fireEvent.click(screen.getByTestId('button-video-play-toggle'));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(
        'Impossible de lire la vidéo de démonstration. Veuillez réessayer.',
      );
    });
    expect(document.body.textContent).not.toContain('MEDIA_ERR_DECODE');
  });

  it('gives compact controls a 44px touch target and keyboard-visible focus treatment', () => {
    render(<LandingVideo />);

    for (const testId of ['button-video-mute-toggle', 'button-video-captions-toggle', 'button-video-fullscreen']) {
      const button = screen.getByTestId(testId);

      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
      expect(button.className).toContain('focus-visible:ring-2');
    }
  });

  it('has zero targeted scanner findings and explicit responsive, theme, long-copy, and reduced-motion safeguards', async () => {
    const sourcePath = 'app/components/marketing/ecode-exact/landing/sections/LandingVideo.tsx';
    const source = readFileSync(sourcePath, 'utf8');
    const { scanSource } = await import('../../../../../../scripts/i18n/source-scanner.mjs');
    const result = scanSource(source, sourcePath);

    render(<LandingVideo />);

    expect(result.parseErrors).toEqual([]);
    expect(result.findings).toEqual([]);
    expect(source).toContain('sm:py-20');
    expect(source).toContain('sm:h-20');
    expect(source).toContain('sm:gap-4');
    expect(source).toContain('min-w-0');
    expect(source).toContain('break-words');
    expect(source).toContain('[overflow-wrap:anywhere]');
    expect(source).toContain('whitespace-normal');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('motion-reduce:animate-none');
    expect(source).toContain('motion-reduce:transition-none');
    expect(source).toContain('var(--ecode-surface-tertiary)');
    expect(source).toContain('var(--ecode-text)');
    expect(source).not.toContain('error.message');
  });
});
