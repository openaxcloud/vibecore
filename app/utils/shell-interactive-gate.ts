/**
 * Porte d'entrée du terminal : décide QUAND les frappes de l'utilisateur peuvent
 * être écrites dans le PTY, et surtout ce qu'on en fait avant.
 *
 * Le shell `jsh` annonce qu'il est prêt en émettant le marqueur OSC
 * `\x1b]654;interactive\x07`. Tant qu'il n'est pas vu, écrire dans le PTY est
 * inutile (le shell n'est pas encore là pour lire).
 *
 * L'implémentation précédente gardait l'écriture derrière un simple booléen et
 * **jetait silencieusement** toute frappe reçue avant le marqueur, avec une
 * détection qui ne regardait que le PREMIER marqueur de chaque chunk et sans
 * aucun report entre chunks. Deux façons de rater le marqueur pour toujours :
 *
 *   1. le chunk contient `…]654;exit=0:0\x07…]654;interactive\x07` — seul le
 *      premier marqueur était examiné, donc `interactive` passait inaperçu ;
 *   2. le marqueur était coupé entre deux frames WebSocket (`…]654;inter` +
 *      `active\x07`) — aucun des deux morceaux ne correspondait.
 *
 * Une fois le marqueur raté, rien ne rattrapait : le terminal restait ouvert,
 * affichait son invite, et avalait chaque frappe sans le moindre signe. C'est
 * BUG-TERM-001.
 *
 * Cette porte corrige les deux points et pose une garantie plus forte :
 * **aucune frappe n'est jamais perdue**. Avant l'ouverture, l'entrée est mise en
 * file ; à l'ouverture, la file est vidée dans le PTY dans l'ordre.
 */

/** Marqueur OSC du protocole jsh. `g` : on inspecte TOUS les marqueurs du chunk. */
const OSC_MARKER_PATTERN = /\x1b\]654;([^\x07]*)\x07/g;

/**
 * Report conservé entre deux chunks pour recoller un marqueur coupé. La valeur
 * est la longueur du plus long marqueur qui nous intéresse, moins un octet —
 * au-delà, le marqueur aurait été complet dans le chunk précédent.
 */
const CARRY_MAX_LENGTH = ']654;interactive'.length - 1;

/**
 * Plafond de la file d'entrée, pour qu'un shell qui ne démarre jamais ne fasse
 * pas croître la mémoire sans fin. 64 Kio, soit très au-delà de ce qu'un humain
 * tape avant qu'une invite apparaisse ; on garde la fin (la frappe la plus
 * récente) plutôt que le début.
 */
const MAX_QUEUED_INPUT_CHARS = 64 * 1024;

export interface InteractiveInputGate {
  /** La porte est-elle ouverte (écriture directe) ? */
  readonly isOpen: boolean;

  /** Nombre de caractères actuellement en file (diagnostic/tests). */
  readonly queuedLength: number;

  /** Alimente la porte avec la SORTIE du shell ; ouvre si le marqueur est vu. */
  observeOutput(data: string): void;

  /** Ouvre la porte et vide la file. Idempotent. */
  open(): void;

  /** Alimente la porte avec l'ENTRÉE utilisateur : écrite, ou mise en file. */
  send(data: string): void;
}

export function createInteractiveInputGate({
  write,
  initiallyOpen = false,
}: {
  write: (data: string) => void;
  initiallyOpen?: boolean;
}): InteractiveInputGate {
  let open = initiallyOpen;
  let carry = '';
  let queued = '';

  const openGate = () => {
    if (open) {
      return;
    }

    open = true;
    carry = '';

    const pending = queued;
    queued = '';

    if (pending) {
      write(pending);
    }
  };

  return {
    get isOpen() {
      return open;
    },
    get queuedLength() {
      return queued.length;
    },
    observeOutput(data: string) {
      if (open || !data) {
        return;
      }

      const haystack = carry + data;

      OSC_MARKER_PATTERN.lastIndex = 0;

      let match: RegExpExecArray | null;
      let sawInteractive = false;

      while ((match = OSC_MARKER_PATTERN.exec(haystack)) !== null) {
        /*
         * `interactive` n'est émis qu'à la NAISSANCE du shell. Sur un reattach
         * (le client se rebranche sur une session existante), l'agent repeint le
         * scrollback et l'invite, mais ne rejoue jamais ce marqueur : une porte
         * qui n'attendrait que lui resterait close pour toujours, et le terminal
         * afficherait son invite en avalant chaque frappe. `prompt` est repeint,
         * lui, et signale précisément un shell posé à son invite, prêt à lire —
         * c'est donc un signal de disponibilité au moins aussi fort.
         */
        if (match[1] === 'interactive' || match[1] === 'prompt') {
          sawInteractive = true;
        }
      }

      /*
       * Ne garder que la queue du flux : assez pour recoller un marqueur scindé
       * au prochain chunk, sans accumuler tout le scrollback.
       */
      carry = haystack.slice(-CARRY_MAX_LENGTH);

      if (sawInteractive) {
        openGate();
      }
    },
    open: openGate,
    send(data: string) {
      if (open) {
        write(data);
        return;
      }

      queued = (queued + data).slice(-MAX_QUEUED_INPUT_CHARS);
    },
  };
}
