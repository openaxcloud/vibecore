import type { CommandEvent } from '@vibecore/runtime-contract';
import { describe, expect, it } from 'vitest';
import { foldCommandExitCode } from './command-exit';

const ev = (e: Partial<CommandEvent> & { type: CommandEvent['type'] }): CommandEvent =>
  ({ timestamp: '2026-01-01T00:00:00Z', ...e }) as CommandEvent;

describe('foldCommandExitCode', () => {
  it('uses the exit code from a clean exit event', () => {
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: 0 }))).toBe(0);
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: 2 }))).toBe(2);
  });

  it('treats an error event (interrupted stream) as a non-zero exit', () => {
    // The core fix: an interrupted npm install must NOT read as success.
    expect(foldCommandExitCode(0, ev({ type: 'error' }))).toBe(1);
  });

  /*
   * BUG-DEPLOY-010, suspect n°2 — UN `exit` SANS CODE N'EST PAS UN EXIT 0.
   *
   * Node rend `code === null` quand le processus meurt par SIGNAL. Le `?? 0`
   * d'origine transformait donc toute commande TUÉE — OOM du pod, moisson,
   * SIGKILL de délai — en réussite. C'est le raisonnement que ce fichier tenait
   * DÉJÀ pour l'événement `error` ; il manquait pour l'`exit`.
   *
   * Trouvé du côté de l'agent d'espace de travail, qui envoyait `code ?? 0` :
   * corriger l'agent seul aurait DÉPLACÉ le défaut ici, où le `??` l'aurait
   * ramené à 0. Les deux moitiés vont ensemble.
   */
  it('un exit SANS code (processus tué) ne vaut jamais 0', () => {
    expect(foldCommandExitCode(0, ev({ type: 'exit' }))).toBe(1);
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: undefined }))).toBe(1);
  });

  it('…et n’écrase pas un code d’échec déjà relevé', () => {
    expect(foldCommandExitCode(127, ev({ type: 'exit' }))).toBe(127);
  });

  it('un exit 0 EXPLICITE reste 0 — sinon on inventerait des échecs', () => {
    expect(foldCommandExitCode(0, ev({ type: 'exit', exitCode: 0 }))).toBe(0);

    /*
     * Le cas qui distingue `??` de `||` : après un `exit 0` explicite, un
     * `current` à 0 ne doit pas devenir 1. C'est l'erreur que j'ai commise en
     * écrivant `current ?? 1` d'abord.
     */
    expect(foldCommandExitCode(0, ev({ type: 'stdout', data: 'x' }))).toBe(0);
  });

  it('keeps an existing non-zero code when an error follows', () => {
    expect(foldCommandExitCode(127, ev({ type: 'error' }))).toBe(127);
  });

  it('leaves the code unchanged for stdout/stderr output', () => {
    expect(foldCommandExitCode(0, ev({ type: 'stdout', data: 'installing…' }))).toBe(0);
    expect(foldCommandExitCode(3, ev({ type: 'stderr', data: 'warn' }))).toBe(3);
  });

  it('a stream that ends with an error and never exits yields a failure code (folded)', () => {
    const events: CommandEvent[] = [ev({ type: 'stdout', data: 'npm install' }), ev({ type: 'error' })];
    const exit = events.reduce(foldCommandExitCode, 0);
    expect(exit).toBe(1);
  });
});
