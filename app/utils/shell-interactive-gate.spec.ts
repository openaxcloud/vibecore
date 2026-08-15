import { describe, expect, it } from 'vitest';

import { createInteractiveInputGate } from './shell-interactive-gate';

const INTERACTIVE = ']654;interactive';
const PROMPT = ']654;prompt';
const EXIT_OK = ']654;exit=0:0';

describe('createInteractiveInputGate', () => {
  it('écrit directement une fois le marqueur interactive vu', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.observeOutput(INTERACTIVE);
    gate.send('ls\n');

    expect(gate.isOpen).toBe(true);
    expect(writes).toEqual(['ls\n']);
  });

  /**
   * BUG-TERM-001, cause n°1 : le chunk réel observé en production commence par
   * `interactive` PUIS `exit` PUIS `prompt`. L'ancienne détection ne regardait
   * que le premier marqueur — ici ça passait. Mais au reattach l'ordre
   * s'inverse et `interactive` arrive APRÈS un autre marqueur : il était alors
   * ignoré pour toujours.
   */
  it("détecte interactive même s'il n'est pas le PREMIER marqueur du chunk", () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.observeOutput(`${EXIT_OK}${PROMPT}${INTERACTIVE}/workspace $ `);
    gate.send('whoami\n');

    expect(gate.isOpen).toBe(true);
    expect(writes).toEqual(['whoami\n']);
  });

  /** BUG-TERM-001, cause n°2 : marqueur coupé entre deux frames WebSocket. */
  it('détecte interactive scindé sur deux chunks', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.observeOutput(']654;inter');
    expect(gate.isOpen).toBe(false);

    gate.observeOutput('active/workspace $ ');

    expect(gate.isOpen).toBe(true);
    gate.send('pwd\n');
    expect(writes).toEqual(['pwd\n']);
  });

  it('détecte interactive scindé caractère par caractère', () => {
    const gate = createInteractiveInputGate({ write: () => {} });

    for (const char of INTERACTIVE) {
      gate.observeOutput(char);
    }

    expect(gate.isOpen).toBe(true);
  });

  /**
   * La garantie centrale : une frappe reçue avant le marqueur n'est PAS perdue.
   * C'est ce qui rendait le terminal définitivement muet.
   */
  it("met l'entrée en file avant l'ouverture puis la vide dans l'ordre", () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.send('echo ');
    gate.send('bonjour\n');

    expect(writes).toEqual([]);
    expect(gate.queuedLength).toBe('echo bonjour\n'.length);

    gate.observeOutput(INTERACTIVE);

    expect(writes).toEqual(['echo bonjour\n']);
    expect(gate.queuedLength).toBe(0);
  });

  it('ne rejoue pas la file une seconde fois', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.send('a');
    gate.observeOutput(INTERACTIVE);
    gate.observeOutput(`${PROMPT}${INTERACTIVE}`);

    expect(writes).toEqual(['a']);
  });

  it('open() force l’ouverture et vide la file', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.send('secours\n');
    gate.open();

    expect(gate.isOpen).toBe(true);
    expect(writes).toEqual(['secours\n']);
  });

  it('initiallyOpen écrit sans attendre de marqueur (shell non-jsh)', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d), initiallyOpen: true });

    gate.send('ls\n');

    expect(writes).toEqual(['ls\n']);
  });

  it('plafonne la file et conserve la frappe la plus RÉCENTE', () => {
    const writes: string[] = [];
    const gate = createInteractiveInputGate({ write: (d) => writes.push(d) });

    gate.send('x'.repeat(64 * 1024));
    gate.send('FIN');
    gate.open();

    expect(writes).toHaveLength(1);
    expect(writes[0]).toHaveLength(64 * 1024);
    expect(writes[0].endsWith('FIN')).toBe(true);
  });

  it('ne garde pas tout le scrollback en mémoire pendant l’attente', () => {
    const gate = createInteractiveInputGate({ write: () => {} });

    for (let i = 0; i < 200; i++) {
      gate.observeOutput('du texte sans aucun marqueur '.repeat(50));
    }

    expect(gate.isOpen).toBe(false);

    // Le marqueur qui suit reste détectable malgré tout ce bruit.
    gate.observeOutput(INTERACTIVE);
    expect(gate.isOpen).toBe(true);
  });
});
