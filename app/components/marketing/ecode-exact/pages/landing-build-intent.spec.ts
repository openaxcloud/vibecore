import { describe, expect, it } from 'vitest';
import { DESIGN_FIRST_PROMPT_PREFIX, buildPromptForMode, resolveDemoScrollTarget } from './landing-build-intent';

describe('buildPromptForMode', () => {
  it('prepends a design-first directive so the choice actually changes generation', () => {
    /*
     * The bug: design-first and full-app produced identical prompts because
     * /projects/new only reads ?prompt=. The two modes must now diverge.
     */
    const userPrompt = 'A todo app with auth';
    const designFirst = buildPromptForMode('design-first', userPrompt);
    const fullApp = buildPromptForMode('full-app', userPrompt);

    expect(designFirst).not.toBe(fullApp);
    expect(designFirst.startsWith(DESIGN_FIRST_PROMPT_PREFIX)).toBe(true);
    expect(designFirst).toContain(userPrompt);
  });

  it('passes a full-app prompt through unchanged (only trimmed)', () => {
    expect(buildPromptForMode('full-app', '  Build a CRM  ')).toBe('Build a CRM');
  });

  it('does not stack the design-first prefix when applied twice', () => {
    const once = buildPromptForMode('design-first', 'A blog');
    const twice = buildPromptForMode('design-first', once);

    expect(twice).toBe(once);
  });

  it('treats continue-planning like a pass-through (no directive injected)', () => {
    expect(buildPromptForMode('continue-planning', 'A blog')).toBe('A blog');
  });
});

describe('resolveDemoScrollTarget', () => {
  it('scrolls straight to the anchor when it is already present', () => {
    expect(resolveDemoScrollTarget(true, 10)).toEqual({ kind: 'scroll-to-anchor' });
  });

  it('reveals-and-retries when the lazy section has not mounted yet and attempts remain', () => {
    /*
     * The bug: on first paint #video-demo is absent (lazy section unmounted), so
     * the demo CTA silently did nothing. We must instead nudge + retry.
     */
    expect(resolveDemoScrollTarget(false, 3)).toEqual({ kind: 'reveal-and-retry' });
  });

  it('gives up once attempts are exhausted so a missing section never loops forever', () => {
    expect(resolveDemoScrollTarget(false, 0)).toEqual({ kind: 'give-up' });
  });

  it('still scrolls to a now-present anchor even on the last attempt', () => {
    expect(resolveDemoScrollTarget(true, 0)).toEqual({ kind: 'scroll-to-anchor' });
  });
});
