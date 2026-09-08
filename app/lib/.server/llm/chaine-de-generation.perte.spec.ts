import { createDataStream } from 'ai';
import { describe, expect, it } from 'vitest';
import { creerSuiviDeChaine } from './chaine-de-generation';

/*
 * LA PERTE DE CONTINUATION, REPRODUITE SANS PRODUCTION.
 *
 * Ce fichier tient le correctif #500. Il a mis deux jours a etre compris et se
 * reproduit ici en moins d'une seconde — c'est la raison d'etre du harnais.
 *
 * LE MECANISME. `createDataStream` ferme son flux des que `execute()` rend la
 * main ET que les flux deja fusionnes se sont vides. Or la continuation d'un
 * segment tronque (`finishReason: 'length'`) est fusionnee depuis `onFinish`,
 * c'est-a-dire APRES ce moment. Le `safeEnqueue` du SDK avale alors l'erreur en
 * silence : le client ne recoit jamais la suite, et RIEN ne signale la perte.
 *
 * LE CORRECTIF. Un compteur d'en-vol (`creerSuiviDeChaine`) incremente AVANT
 * chaque generation et decremente a sa fin ; `execute()` attend que le compteur
 * retombe a zero avant de rendre la main. Le flux reste donc ouvert tant qu'une
 * continuation est attendue.
 *
 * CE QUI EST MESURE : les OCTETS RECUS PAR LE LECTEUR, jamais les caracteres
 * persistes — c'est la perte cote client qu'on cherche. Et la lecture s'arrete
 * sur la FIN DU FLUX, jamais sur un chronometre : une attente fixe fermerait la
 * connexion et fabriquerait exactement le symptome qu'on veut mesurer.
 *
 * MESURE DE REFERENCE (2026-09-07, harnais local, ~98 000 car./segment) :
 *   1 segment  ..............................  99,4 %  (pas de continuation)
 *   2 segments, SANS le correctif ...........  49,7 %  (la suite est jetee)
 *   4 segments, SANS le correctif ...........  24,8 %
 *   2 et 4 segments, AVEC le correctif ......  99,3 %
 * Production le 2026-09-08, projet cmts6qsyi00e70nfvowqquzsa, 2 segments :
 *   153 958 octets recus, `finishReason: stop`, 24 fichiers ecrits.
 */

const CAR_PAR_SEGMENT = 8_000;
const TAILLE_MORCEAU = 400;

/** Un « streamText » simule : il emet, puis appelle `onFinish` APRES la fin du flux — comme le SDK. */
function fauxStreamText(segment: number, segments: number, onFinish: (e: { finishReason: string; segment: number }) => void) {
  let emis = 0;

  const flux = new ReadableStream({
    pull(c) {
      if (emis >= CAR_PAR_SEGMENT) {
        c.close();
        const finishReason = segment + 1 < segments ? 'length' : 'stop';
        setTimeout(() => onFinish({ finishReason, segment }), 0);

        return;
      }

      const n = Math.min(TAILLE_MORCEAU, CAR_PAR_SEGMENT - emis);
      emis += n;
      c.enqueue(`0:"${'x'.repeat(n)}"\n`);
    },
  });

  return { mergeIntoDataStream: (ds: { merge: (f: ReadableStream) => void }) => ds.merge(flux) };
}

/** Rejoue la forme d'`api.chat.ts` et rend le nombre d'octets REELLEMENT recus. */
async function octetsRecus({ segments, avecCorrectif }: { segments: number; avecCorrectif: boolean }) {
  const suivi = creerSuiviDeChaine(30_000);

  const flux = createDataStream({
    async execute(dataStream) {
      const onFinish = async ({ finishReason, segment }: { finishReason: string; segment: number }) => {
        try {
          if (finishReason === 'length' && segment + 1 < segments) {
            suivi.debut(); // le suivant se compte AVANT que le precedent ne se decompte
            fauxStreamText(segment + 1, segments, onFinish).mergeIntoDataStream(dataStream);
          }
        } finally {
          suivi.fin();
        }
      };

      suivi.debut();
      fauxStreamText(0, segments, onFinish).mergeIntoDataStream(dataStream);

      if (avecCorrectif) {
        await suivi.attendre();
      }
    },
    onError: (error) => String(error),
  });

  // On lit jusqu'a la FIN DU FLUX. Jamais de minuterie.
  const lecteur = flux.getReader();
  let octets = 0;

  for (;;) {
    const { done, value } = await lecteur.read();

    if (done) {
      break;
    }

    octets += typeof value === 'string' ? value.length : 0;
  }

  return { octets, attendus: CAR_PAR_SEGMENT * segments };
}

const pourcentage = ({ octets, attendus }: { octets: number; attendus: number }) => (octets / attendus) * 100;

describe('la continuation est livree au client', () => {
  it('SANS le correctif, deux segments perdent la moitie du flux', async () => {
    const mesure = await octetsRecus({ segments: 2, avecCorrectif: false });

    // C'est le defaut lui-meme : la continuation est fusionnee apres la fermeture.
    expect(pourcentage(mesure)).toBeLessThan(60);
  });

  it('SANS le correctif, quatre segments en perdent les trois quarts', async () => {
    const mesure = await octetsRecus({ segments: 4, avecCorrectif: false });
    expect(pourcentage(mesure)).toBeLessThan(35);
  });

  it('AVEC le correctif, deux segments arrivent en entier', async () => {
    const mesure = await octetsRecus({ segments: 2, avecCorrectif: true });
    expect(pourcentage(mesure)).toBeGreaterThan(95);
  });

  it('AVEC le correctif, quatre segments arrivent en entier', async () => {
    const mesure = await octetsRecus({ segments: 4, avecCorrectif: true });
    expect(pourcentage(mesure)).toBeGreaterThan(95);
  });

  it("TEMOIN — un seul segment n'a jamais souffert, avec ou sans correctif", async () => {
    // Sans ce temoin, un harnais qui perdrait TOUT passerait les deux premiers
    // tests et ne prouverait rien. Il ancre l'echelle de la mesure.
    expect(pourcentage(await octetsRecus({ segments: 1, avecCorrectif: false }))).toBeGreaterThan(95);
    expect(pourcentage(await octetsRecus({ segments: 1, avecCorrectif: true }))).toBeGreaterThan(95);
  });
});
