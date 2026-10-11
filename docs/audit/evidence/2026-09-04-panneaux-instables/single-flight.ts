/*
 * Déduplication des appels EN VOL, par clé.
 *
 * BUG-PANEL-PERF-004 / BUG-PANEL-ZIP-005 — le même défaut, mesuré à deux
 * endroits : un chargeur asynchrone dont le cache n'est rempli qu'à l'ARRIVÉE
 * de la réponse. Tout appelant qui arrive avant cette arrivée manque le cache
 * et lance sa propre requête. Rien n'échoue, rien ne se voit : le travail est
 * simplement fait N fois.
 *
 * Mesuré en production le 2026-09-04, projet de 401 fichiers :
 *
 *  - `getProjectIdeMemory` — 9 sites d'appel, 9 GET `ide-state` pour UNE
 *    ouverture à froid ;
 *  - `loadProjectStorageFiles` — l'hydratation prévue et le repli de
 *    `loadRuntimeFiles` partent à **14 ms d'écart**, le second voyant
 *    `filesCount === 0` uniquement parce que le premier est encore en vol.
 *    Chacun télécharge l'archive ENTIÈRE du projet : 5,07 Mio décodés.
 *    Ce n'est pas une reprise après échec, c'est une course.
 *
 * La clé doit désigner la ressource (`${projectId}:${panneau}`, `workspace:<id>`…),
 * jamais l'appelant : c'est précisément entre appelants différents qu'il faut
 * mutualiser.
 */
export interface SingleFlight<T> {
  /** Exécute `fn` — ou rend la promesse déjà en vol pour la même clé. */
  run(key: string, fn: () => Promise<T>): Promise<T>;
  /** Nombre d'appels actuellement en vol (tests et diagnostic). */
  readonly size: number;
}

export interface SingleFlightOptions {
  /**
   * Garde SECONDAIRE. Pendant ce délai après un succès, un nouvel appel pour la
   * même clé rend le résultat précédent au lieu de refaire le travail.
   *
   * Mesure à l'appui : la tempête d'archives observée était ENTIÈREMENT
   * concurrente — les 7 requêtes sont parties entre 7,3 s et 12,6 s, la
   * première réponse est arrivée à 24,7 s. La déduplication en vol suffit donc
   * à la ramener à 1. Ce délai ne couvre PAS un cas mesuré : il borne les
   * répétitions SÉQUENTIELLES, que je n'ai pas observées. C'est pourquoi c'est
   * un délai et non un plafond dur — un plafond aurait pu désactiver
   * définitivement l'hydratation, ce qui est pire que le défaut corrigé.
   *
   * Seuls les SUCCÈS sont mémorisés : mémoriser un échec reproduirait
   * BUG-PANEL-CACHE-003, où une enveloppe d'erreur était mise en cache comme
   * si elle était une charge utile valide.
   */
  cooldownMs?: number;
  /** Injectable pour les tests ; `Date.now` par défaut. */
  now?: () => number;
}

export function createSingleFlight<T>(options: SingleFlightOptions = {}): SingleFlight<T> {
  const cooldownMs = options.cooldownMs ?? 0;
  const now = options.now ?? (() => Date.now());
  const inFlight = new Map<string, Promise<T>>();
  const recent = new Map<string, { at: number; value: T }>();

  return {
    run(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key);

      if (existing) {
        return existing;
      }

      if (cooldownMs > 0) {
        const last = recent.get(key);

        if (last && now() - last.at < cooldownMs) {
          return Promise.resolve(last.value);
        }

        if (last) {
          recent.delete(key);
        }
      }

      let promise: Promise<T>;

      try {
        promise = fn();
      } catch (error) {
        /*
         * `fn` peut lancer de façon SYNCHRONE (garde d'argument, accès à une
         * ressource absente). Sans ce rattrapage, rien n'est enregistré et
         * l'erreur remonte sous une forme différente de celle du chemin
         * asynchrone — deux comportements pour un seul défaut.
         */
        return Promise.reject(error);
      }

      /*
       * On enregistre la promesse D'ORIGINE, pas celle rendue par `finally` :
       * les appelants doivent recevoir exactement la même valeur et le même
       * rejet. Le nettoyage est branché à part.
       *
       * `void` sur la chaîne de nettoyage : elle ne doit jamais devenir une
       * seconde source de rejet non traité.
       */
      inFlight.set(key, promise);
      void promise.then(
        (value) => {
          inFlight.delete(key);

          if (cooldownMs > 0) {
            recent.set(key, { at: now(), value });
          }
        },
        () => inFlight.delete(key),
      );

      return promise;
    },
    get size() {
      return inFlight.size;
    },
  };
}
