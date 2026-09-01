import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearPendingComposerInput,
  composerHandoffScope,
  peekPendingComposerInput,
  setPendingComposerInput,
  takePendingComposerInput,
} from './composer-handoff';

beforeEach(() => clearPendingComposerInput());

describe('passe-plat du composeur', () => {
  it('rend la frappe en attente à la même portée, une seule fois', () => {
    setPendingComposerInput('project:p1', 'ajoute une page de contact');

    expect(takePendingComposerInput('project:p1')).toBe('ajoute une page de contact');
    expect(takePendingComposerInput('project:p1')).toBeNull();
  });

  it('ne livre pas la frappe d’un autre composeur — et ne la détruit pas', () => {
    setPendingComposerInput('project:p1', 'texte du projet A');

    expect(takePendingComposerInput('project:p2')).toBeNull();

    // Elle attend toujours son destinataire.
    expect(takePendingComposerInput('project:p1')).toBe('texte du projet A');
  });

  it('un composeur vidé n’a rien à transmettre', () => {
    setPendingComposerInput('project:p1', 'un début');
    setPendingComposerInput('project:p1', '');

    expect(peekPendingComposerInput()).toBeNull();
    expect(takePendingComposerInput('project:p1')).toBeNull();
  });

  it('distingue un projet d’une conversation autonome', () => {
    expect(composerHandoffScope('p1', '/projects/p1/ide')).toBe('project:p1');
    expect(composerHandoffScope(undefined, '/chat/abc')).toBe('path:/chat/abc');
    expect(composerHandoffScope(undefined, '/chat/def')).not.toBe(composerHandoffScope(undefined, '/chat/abc'));
  });
});
