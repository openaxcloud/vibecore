import { describe, expect, it } from 'vitest';
import { AGENT_DEMO_ANCHOR_ID, getReelDemoHref } from './ecode-marketing-reels';

describe('getReelDemoHref', () => {
  it('returns an in-page anchor pointing at the live demo section', () => {
    expect(getReelDemoHref()).toBe('#agent-demo');
  });

  it('stays in sync with the anchor id used to mark the demo section', () => {
    expect(getReelDemoHref()).toBe(`#${AGENT_DEMO_ANCHOR_ID}`);
  });
});
