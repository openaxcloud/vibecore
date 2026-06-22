import { describe, expect, it } from 'vitest';
import { shouldPreviewHandleInspectorMessage } from './Preview';

/*
 * Bug: INSPECTOR_CLICK was handled twice — once by the Inspector component
 * (which applies offsetRect() to translate the iframe-local rect into page
 * coordinates) and once by Preview's own postMessage handler (which stored the
 * raw, un-offset rect and ran the selection side-effects again). Whichever fired
 * last won, so the stored element frequently carried un-offset coordinates and
 * setSelectedElement was invoked twice per click.
 *
 * Fix: the Inspector component is the single source of truth for inspector
 * selection/hover events. Preview's own handler must skip them. This predicate
 * encodes that ownership and gates the handler's early return.
 */
describe('shouldPreviewHandleInspectorMessage', () => {
  it('does NOT handle inspector-selection events owned by the Inspector component', () => {
    // These carry rects the Inspector translates into page coordinates.
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_CLICK')).toBe(false);
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_HOVER')).toBe(false);
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_LEAVE')).toBe(false);
  });

  it('still handles INSPECTOR_READY (the activation handshake Preview owns)', () => {
    expect(shouldPreviewHandleInspectorMessage('INSPECTOR_READY')).toBe(true);
  });

  it('still handles non-inspector preview messages', () => {
    expect(shouldPreviewHandleInspectorMessage('PREVIEW_ERROR')).toBe(true);
    expect(shouldPreviewHandleInspectorMessage('PREVIEW_UNHANDLED_REJECTION')).toBe(true);
  });

  it('ignores non-string / malformed message types without throwing', () => {
    expect(shouldPreviewHandleInspectorMessage(undefined)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage(null)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage(42)).toBe(false);
    expect(shouldPreviewHandleInspectorMessage({})).toBe(false);
  });
});
