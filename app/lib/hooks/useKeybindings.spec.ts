import { describe, expect, it } from 'vitest';

import { resolveEditableTargetDisposition } from './useKeybindings';

const escape = { action: 'overlay.close' } as const;
const save = { action: 'file.save' } as const;

describe('resolveEditableTargetDisposition', () => {
  it('ignores events outside editable targets so global shortcuts run normally', () => {
    expect(
      resolveEditableTargetDisposition({
        editableTarget: false,
        commandLike: false,
        binding: escape,
        overlayOpen: false,
      }),
    ).toBe('ignore');
  });

  it('handles command-like combos even inside inputs (e.g. cmd+s)', () => {
    expect(
      resolveEditableTargetDisposition({
        editableTarget: true,
        commandLike: true,
        binding: save,
        overlayOpen: false,
      }),
    ).toBe('handle');
  });

  it('skips plain non-escape keys typed into an input', () => {
    expect(
      resolveEditableTargetDisposition({
        editableTarget: true,
        commandLike: false,
        binding: save,
        overlayOpen: false,
      }),
    ).toBe('skip');
  });

  it('passes Escape through to the input when no overlay is open (the bug)', () => {
    /*
     * Regression: capture-phase handler must NOT preventDefault/stopPropagation here, so
     * native input behavior (IME cancel, blur) and bubbling child cancel handlers still fire.
     */
    expect(
      resolveEditableTargetDisposition({
        editableTarget: true,
        commandLike: false,
        binding: escape,
        overlayOpen: false,
      }),
    ).toBe('passthrough');
  });

  it('handles Escape (suppresses native event) when an overlay is actually open', () => {
    expect(
      resolveEditableTargetDisposition({
        editableTarget: true,
        commandLike: false,
        binding: escape,
        overlayOpen: true,
      }),
    ).toBe('handle');
  });
});
