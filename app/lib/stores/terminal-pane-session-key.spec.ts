import type { RuntimeAdapter } from '@vibecore/runtime-contract';
import { describe, expect, it, vi } from 'vitest';
import { TerminalStore } from './terminal';
import type { ITerminal } from '~/types/terminal';

/*
 * Le panneau Terminal identifie sa session par `?sessionId`, et c'est cet
 * identifiant qui permet à l'agent de rattacher un panneau à SON shell. Il était
 * dérivé de `#terminals.length`, ce qui n'est pas l'identité du panneau : le
 * tableau ne fait que croître (un spawn en échec n'ajoute rien, la fermeture d'un
 * panneau ne retire rien), donc l'index dérive vers le haut à chaque montage.
 * Mesuré en réel : un seul clic « Nouveau shell » sur une page fraîchement
 * chargée demandait `terminal-user-6`. Conséquence : jamais de rattachement, et
 * sur une offre dont le créneau terminal est déjà pris, un 429 et un panneau
 * bloqué sur « Connexion à l'espace de travail… » indéfiniment.
 */

function fakeTerminal(): ITerminal {
  return {
    cols: 80,
    rows: 24,
    reset: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    input: vi.fn(),
  } as unknown as ITerminal;
}

/** Runtime qui enregistre le `sessionKey` de chaque openTerminal et les sessions créées. */
function recordingRuntime() {
  const sessionKeys: Array<string | undefined> = [];
  const sessions: Array<{ resize: ReturnType<typeof vi.fn> }> = [];

  const runtime = {
    async openTerminal(request: { sessionKey?: string } = {}) {
      sessionKeys.push(request.sessionKey);

      const session = {
        id: request.sessionKey ?? 'anonyme',
        events: (async function* () {
          /*
           * Aucun événement : `newShellProcess` ne consomme ce flux qu'en tâche de
           * fond, et le shell n'est pas `/bin/jsh` ici donc rien n'attend de
           * poignée de main.
           */
        })(),
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn(),
      };

      sessions.push(session);

      return session;
    },
  } as unknown as RuntimeAdapter;

  return { runtime, sessionKeys, sessions };
}

describe("l'identifiant de session suit le PANNEAU, pas la longueur du tableau", () => {
  it('redonne au même panneau le même identifiant à chaque montage (rattachement)', async () => {
    const { runtime, sessionKeys } = recordingRuntime();
    const store = new TerminalStore(runtime);

    // Panneau 1 monté, démonté (rechargement), remonté : même identité.
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);

    expect(sessionKeys).toEqual(['user-1', 'user-1', 'user-1']);
  });

  it("ne fait pas dériver l'identifiant quand un spawn a échoué avant", async () => {
    const { runtime, sessionKeys } = recordingRuntime();

    const failing = {
      openTerminal: vi
        .fn()
        .mockRejectedValueOnce(new Error('agent injoignable'))
        .mockImplementation((request: { sessionKey?: string }) => runtime.openTerminal(request)),
    } as unknown as RuntimeAdapter;

    const store = new TerminalStore(failing);

    // Le 1er échoue (rien n'est ajouté au tableau), le 2e doit garder SON identité.
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);

    expect(sessionKeys).toEqual(['user-1']);
  });

  it('donne des identifiants distincts à des panneaux distincts', async () => {
    const { runtime, sessionKeys } = recordingRuntime();
    const store = new TerminalStore(runtime);

    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 2);

    expect(sessionKeys).toEqual(['user-1', 'user-2']);
  });

  it("ne garde qu'un seul suivi par panneau à travers les remontages", async () => {
    const { runtime, sessions } = recordingRuntime();
    const store = new TerminalStore(runtime);

    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 1);
    await store.attachTerminal(fakeTerminal(), '/bin/bash', 2);

    store.onTerminalResize(100, 30);

    /*
     * Observable sans API de test : onTerminalResize parcourt les sessions
     * suivies. Trois montages pour DEUX panneaux ne doivent produire que deux
     * redimensionnements — la 1re session du panneau 1 a été remplacée, pas
     * empilée. Sans cela le tableau grossit à chaque montage et on redimensionne
     * des PTY derrière des xterm démontés.
     */
    const resized = sessions.filter((session) => (session.resize as ReturnType<typeof vi.fn>).mock.calls.length > 0);

    expect(resized).toHaveLength(2);
  });
});
