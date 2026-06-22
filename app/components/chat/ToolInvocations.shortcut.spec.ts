import { describe, expect, it } from 'vitest';

import { resolveShortcutTargetId } from './ToolInvocations';

describe('resolveShortcutTargetId', () => {
  it('targets the single pending tool call', () => {
    expect(resolveShortcutTargetId(['call-1'])).toBe('call-1');
  });

  it('returns null when no tool calls are pending', () => {
    expect(resolveShortcutTargetId([])).toBeNull();
  });

  it('returns null when multiple tool calls are pending so the shortcut does not guess', () => {
    /*
     * This is the bug: previously the handler approved/rejected the first-keyed id regardless of
     * which prompt the user was looking at. With >1 pending call the shortcut must be a no-op.
     */
    expect(resolveShortcutTargetId(['call-1', 'call-2'])).toBeNull();
    expect(resolveShortcutTargetId(['call-a', 'call-b', 'call-c'])).toBeNull();
  });

  it('does not depend on key ordering / which id comes first', () => {
    expect(resolveShortcutTargetId(['z-call', 'a-call'])).toBeNull();
    expect(resolveShortcutTargetId(['a-call', 'z-call'])).toBeNull();
  });
});
