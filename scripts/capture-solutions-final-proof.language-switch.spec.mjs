/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { collectLightweightSnapshot, languageSwitchContractErrors } from './capture-solutions-final-proof.mjs';

const MAIN_SELECTOR = '[data-testid="solution-page"][data-solution-slug="startups"]';

function visibleRectangle() {
  return {
    x: 0,
    y: 0,
    top: 0,
    right: 88,
    bottom: 44,
    left: 0,
    width: 88,
    height: 44,
    toJSON: () => ({}),
  };
}

function renderLanguageFixture() {
  document.documentElement.lang = 'en';
  document.documentElement.className = 'light';
  document.documentElement.setAttribute('data-theme', 'light');
  document.head.innerHTML = '<link rel="canonical" href="https://e-code.ai/solutions/startups">';
  document.body.innerHTML = `
    <header>
      <nav aria-label="Main navigation">
        <div data-testid="language-switch" role="group" aria-label="Choose display language">
          <button type="button" lang="en" aria-pressed="true">EN</button>
          <button type="button" lang="fr" aria-pressed="false">FR</button>
        </div>
      </nav>
    </header>
    <main data-testid="solution-page" data-solution-slug="startups" lang="en">
      <h1>Launch your startup</h1>
    </main>
  `;
  window.history.replaceState({}, '', '/solutions/startups?lang=en');
}

describe('Solutions live-proof global LanguageSwitch contract', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(visibleRectangle);
    renderLanguageFixture();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts one visible EN/FR button group in the header and outside main', () => {
    const snapshot = collectLightweightSnapshot({ mainSelector: MAIN_SELECTOR });

    expect(snapshot).toMatchObject({
      pathname: '/solutions/startups',
      queryLanguage: 'en',
      htmlLanguage: 'en',
      mainLanguage: 'en',
      currentLanguage: 'en',
      canonical: 'https://e-code.ai/solutions/startups',
    });
    expect(snapshot.languageSwitch).toMatchObject({
      totalCount: 1,
      visibleCount: 1,
      headerCount: 1,
      insideMainCount: 0,
      activeLanguages: ['en'],
      localControlCount: 0,
    });
    expect(languageSwitchContractErrors(snapshot.languageSwitch, 'en')).toEqual([]);
  });

  it('fails closed when a second global switch is present, even if hidden', () => {
    const duplicate = document.querySelector('[data-testid="language-switch"]').cloneNode(true);
    duplicate.setAttribute('style', 'display: none');
    document.querySelector('header').append(duplicate);

    const snapshot = collectLightweightSnapshot({ mainSelector: MAIN_SELECTOR });
    const errors = languageSwitchContractErrors(snapshot.languageSwitch, 'en');

    expect(snapshot.languageSwitch).toMatchObject({ totalCount: 2, visibleCount: 1 });
    expect(errors).toContain('Expected exactly one global LanguageSwitch; found 2');
  });

  it('fails closed when the obsolete Solutions-local links return', () => {
    document
      .querySelector('main')
      .insertAdjacentHTML(
        'afterbegin',
        '<nav class="sol-language-switch"><a lang="en" href="?lang=en">English</a><a lang="fr" href="?lang=fr">Français</a></nav>',
      );

    const snapshot = collectLightweightSnapshot({ mainSelector: MAIN_SELECTOR });
    const errors = languageSwitchContractErrors(snapshot.languageSwitch, 'en');

    expect(snapshot.languageSwitch.localControlCount).toBe(3);
    expect(errors.some((error) => error.startsWith('Expected no Solutions-local language control'))).toBe(true);
  });

  it('rejects ambiguous aria-pressed state instead of inferring the locale', () => {
    document.querySelector('button[lang="fr"]').setAttribute('aria-pressed', 'true');

    const snapshot = collectLightweightSnapshot({ mainSelector: MAIN_SELECTOR });
    const errors = languageSwitchContractErrors(snapshot.languageSwitch, 'en');

    expect(snapshot.currentLanguage).toBeNull();
    expect(errors.some((error) => error.includes('Expected only EN to expose aria-pressed="true"'))).toBe(true);
  });
});
