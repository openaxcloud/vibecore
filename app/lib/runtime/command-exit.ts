import type { CommandEvent } from '@vibecore/runtime-contract';

/**
 * Fold a streamed CommandEvent into the running exit code.
 *
 * A clean `exit` uses its code. Critically, an `error` event — the adapter's
 * synthetic "stream closed before completion" emitted when a command's WebSocket
 * drops before any exit (a long `npm install` interrupted by a pod restart, an LB
 * idle-kill, or a network blip during cold start) — must surface as a NON-zero exit.
 * Otherwise the default exit code 0 is returned and callers treat a half-finished
 * install as success, launching the preview against a broken node_modules (blank
 * page / 404s). Other event types (stdout/stderr) leave the code unchanged.
 */
export function foldCommandExitCode(current: number, event: CommandEvent): number {
  if (event.type === 'exit') {
    /*
     * BUG-DEPLOY-010, suspect n°2 — un `exit` SANS code n'est pas un exit 0.
     *
     * Node rend `code === null` quand le processus meurt par SIGNAL. Le `?? 0`
     * transformait donc toute commande TUÉE — OOM, moisson du pod, SIGKILL de
     * délai — en réussite, et l'aperçu partait sur un `node_modules` à moitié
     * installé. C'est exactement ce que le paragraphe ci-dessus reproche déjà à
     * l'événement `error` ; le même raisonnement vaut ici, et il manquait.
     *
     * On retombe donc sur la MÊME règle que `error` : au moins 1, et on garde un
     * code déjà non nul plutôt que de l'écraser.
     *
     * ⚠️ `current || 1`, PAS `current ?? 1` : `current` vaut 0 dans le cas
     * normal, et `0 ?? 1` rend 0 — ce qui réintroduirait exactement le défaut
     * qu'on corrige. Le `||` est ici le bon opérateur, et c'est celui que la
     * branche `error` utilise déjà.
     */
    return event.exitCode ?? (current || 1);
  }

  if (event.type === 'error') {
    return current || 1;
  }

  return current;
}
