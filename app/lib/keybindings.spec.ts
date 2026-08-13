import { describe, expect, it } from 'vitest';

import {
  applyKeybindingOverrides,
  defaultProjectKeybindings,
  detectKeybindingConflicts,
  findKeybinding,
  formatKeybindingCombo,
  normalizeCombo,
  serializeKeybindingOverrides,
  serializeKeyEvent,
} from './keybindings';

function event(input: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'key'>) {
  return {
    code: '',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...input,
  } as KeyboardEvent;
}

describe('keybindings', () => {
  it('normalizes modifier order and aliases', () => {
    expect(normalizeCombo('shift+cmd+p')).toBe('cmd+shift+p');
    expect(normalizeCombo('mod+return')).toBe('cmd+enter');
    expect(normalizeCombo('esc')).toBe('escape');
  });

  it('serializes keyboard events into registry combos', () => {
    expect(serializeKeyEvent(event({ key: 'S', metaKey: true }))).toBe('cmd+s');
    expect(serializeKeyEvent(event({ key: 'P', ctrlKey: true, shiftKey: true }))).toBe('cmd+shift+p');
    expect(serializeKeyEvent(event({ key: '?', shiftKey: true }))).toBe('shift+/');
    expect(serializeKeyEvent(event({ key: 'F12', shiftKey: true }))).toBe('shift+f12');
  });

  it('prioritizes contextual bindings over global bindings', () => {
    const binding = findKeybinding(defaultProjectKeybindings, 'cmd+/', {
      activePanel: 'editor',
      isEditableTarget: false,
    });

    expect(binding?.action).toBe('editor.toggleComment');
  });

  it('detects only non-contextual binding collisions', () => {
    expect(detectKeybindingConflicts(defaultProjectKeybindings)).toEqual([]);
    expect(
      detectKeybindingConflicts([
        ...defaultProjectKeybindings,
        {
          combo: 'cmd+p',
          action: 'duplicate',
          label: 'Duplicate',
          description: 'Duplicate binding',
          category: 'Navigation',
        },
      ]),
    ).toEqual([{ combo: 'cmd+p', actions: ['file.quickOpen', 'duplicate'] }]);
  });

  it('formats combos for mac and non-mac displays', () => {
    expect(formatKeybindingCombo('cmd+shift+p', true)).toBe('⌘⇧P');
    expect(formatKeybindingCombo('cmd+shift+p', false)).toBe('Ctrl+⇧+P');
  });

  it('applies user overrides without mutating the default registry', () => {
    const customized = applyKeybindingOverrides(defaultProjectKeybindings, {
      'file.quickOpen': 'cmd+alt+p',
    });

    expect(defaultProjectKeybindings.find((binding) => binding.action === 'file.quickOpen')?.combo).toBe('cmd+p');
    expect(customized.find((binding) => binding.action === 'file.quickOpen')?.combo).toBe('cmd+alt+p');
  });

  it('serializes only changed keybinding overrides', () => {
    expect(
      serializeKeybindingOverrides(defaultProjectKeybindings, {
        'file.save': 'cmd+s',
        'file.quickOpen': 'cmd+alt+p',
        'unknown.action': 'cmd+u',
      }),
    ).toEqual({ 'file.quickOpen': 'cmd+alt+p' });
  });
});
