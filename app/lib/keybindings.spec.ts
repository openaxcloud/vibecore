import { describe, expect, it } from 'vitest';

import {
  applyKeybindingOverrides,
  createProjectFocusTabKeybinding,
  defaultProjectKeybindings,
  detectKeybindingConflicts,
  findKeybinding,
  formatKeybindingCombo,
  getKeybindingCategoryLabel,
  localizeProjectKeybindings,
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

  it('localizes labels, descriptions, categories, and generated tab bindings without changing actions', () => {
    const french = localizeProjectKeybindings(defaultProjectKeybindings, 'fr');
    const save = french.find((binding) => binding.action === 'file.save');

    expect(save).toMatchObject({
      combo: 'cmd+s',
      action: 'file.save',
      label: 'Enregistrer le fichier actif',
      description: 'Enregistrez le fichier ouvert dans l’éditeur.',
      category: 'File',
    });
    expect(getKeybindingCategoryLabel('fr', 'Workbench')).toBe('Espace de travail');
    expect(getKeybindingCategoryLabel('de', 'Editor')).toBe('Editor');
    expect(createProjectFocusTabKeybinding(3, 'fr')).toMatchObject({
      combo: 'cmd+3',
      action: 'tab.focus.3',
      label: 'Activer l’onglet 3',
      description: 'Activez l’onglet 3 de l’espace de travail.',
    });
  });

  /*
   * SCR-006 — ⌘K sur les coques mobile et tablette.
   *
   * La garde « le terminal possède ⌘K » (sémantique VS Code) se déclenchait AVANT
   * toute intention de l'utilisateur : mesuré live le 20/08 sur prod, xterm prend
   * le focus tout seul sur son `textarea.xterm-helper-textarea` dès le chargement
   * de la coque mobile, donc `focusTarget` valait déjà 'terminal'. Sur téléphone,
   * ⌘⇧P n'est pas une porte de sortie praticable : ⌘K doit ouvrir la palette.
   */
  describe('⌘K sur mobile / tablette (SCR-006)', () => {
    it('ouvre la palette même quand le terminal a le focus, sur une coque mobile', () => {
      const binding = findKeybinding(defaultProjectKeybindings, 'cmd+k', {
        focusTarget: 'terminal',
        useMobileIde: true,
        isEditableTarget: true,
      });

      expect(binding?.action).toBe('command.palette');
    });

    it('laisse ⌘K au shell quand le terminal a le focus sur le BUREAU (garde conservée)', () => {
      const binding = findKeybinding(defaultProjectKeybindings, 'cmd+k', {
        focusTarget: 'terminal',
        useMobileIde: false,
        isEditableTarget: true,
      });

      expect(binding).toBeUndefined();
    });

    it('ouvre la palette au bureau dès que le terminal n’a plus le focus', () => {
      const binding = findKeybinding(defaultProjectKeybindings, 'cmd+k', {
        focusTarget: 'editor',
        useMobileIde: false,
        isEditableTarget: false,
      });

      expect(binding?.action).toBe('command.palette');
    });

    it('garde ⌘⇧P inconditionnel — c’est lui qui a prouvé le diagnostic en prod', () => {
      const binding = findKeybinding(defaultProjectKeybindings, 'cmd+shift+p', {
        focusTarget: 'terminal',
        useMobileIde: false,
        isEditableTarget: true,
      });

      expect(binding?.action).toBe('command.palette');
    });
  });
});
