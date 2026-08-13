import { afterEach, describe, expect, it } from 'vitest';

import { BILLING_ENABLED_ENV, BillingDisabledError, billingEnabled, billingKillSwitchArmed } from './kill-switch';

/*
 * Le kill-switch protège des ENCAISSEMENTS. Sa seule propriété non négociable
 * est le fail-closed : tout ce qui n'est pas un « oui » explicite doit valoir
 * NON. Ces tests énumèrent donc les façons de se tromper, pas seulement le cas
 * nominal.
 */

describe('billingEnabled — fail-closed', () => {
  it('OFF quand la variable est absente', () => {
    expect(billingEnabled({})).toBe(false);
  });

  it('OFF quand l_environnement lui-même est absent', () => {
    expect(billingEnabled(undefined as never)).toBe(false);
  });

  it('OFF sur une valeur vide ou blanche', () => {
    for (const raw of ['', ' ', '\t', '\n']) {
      expect(billingEnabled({ [BILLING_ENABLED_ENV]: raw }), JSON.stringify(raw)).toBe(false);
    }
  });

  it('OFF sur toutes les négations usuelles', () => {
    for (const raw of ['false', 'FALSE', '0', 'off', 'OFF', 'no', 'disabled', 'null', 'undefined']) {
      expect(billingEnabled({ [BILLING_ENABLED_ENV]: raw }), raw).toBe(false);
    }
  });

  it('OFF sur une valeur INATTENDUE — le défaut n_est jamais « ouvert »', () => {
    /*
     * Le cas qui compte : une faute de frappe dans la configuration ne doit pas
     * ouvrir la caisse. `'ture'`, `'2'`, `'maybe'` ne sont pas des « oui ».
     */
    for (const raw of ['ture', 'maybe', '2', 'ON!', 'true false', '{"enabled":true}']) {
      expect(billingEnabled({ [BILLING_ENABLED_ENV]: raw }), raw).toBe(false);
    }
  });

  it('OFF quand la lecture de l_environnement LÈVE', () => {
    // Un proxy/getter hostile ne doit pas propager : il vaut absence, donc OFF.
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('env indisponible');
        },
      },
    ) as Record<string, string | undefined>;

    expect(() => billingEnabled(hostile)).not.toThrow();
    expect(billingEnabled(hostile)).toBe(false);
  });

  it('OFF quand la valeur n_est pas une chaîne', () => {
    expect(billingEnabled({ [BILLING_ENABLED_ENV]: 1 as never })).toBe(false);
    expect(billingEnabled({ [BILLING_ENABLED_ENV]: true as never })).toBe(false);
    expect(billingEnabled({ [BILLING_ENABLED_ENV]: {} as never })).toBe(false);
  });
});

describe('billingEnabled — activation explicite (réversibilité)', () => {
  it('ON sur les affirmations reconnues, insensible à la casse et aux espaces', () => {
    for (const raw of ['true', 'TRUE', ' true ', '1', 'on', 'ON', 'yes', 'enabled', 'Enabled']) {
      expect(billingEnabled({ [BILLING_ENABLED_ENV]: raw }), raw).toBe(true);
    }
  });

  it('le passage au payant est bien un simple changement de variable', () => {
    const env: Record<string, string | undefined> = {};
    expect(billingEnabled(env)).toBe(false);

    env[BILLING_ENABLED_ENV] = 'true';
    expect(billingEnabled(env)).toBe(true);
  });
});

describe('billingKillSwitchArmed — lecture inverse', () => {
  it('armé exactement quand la facturation est éteinte', () => {
    expect(billingKillSwitchArmed({})).toBe(true);
    expect(billingKillSwitchArmed({ [BILLING_ENABLED_ENV]: 'true' })).toBe(false);
  });
});

describe('lecture ambiante — le piège du shim SSR', () => {
  const holder = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  const previous = holder.process;

  afterEach(() => {
    holder.process = previous;
  });

  it('lit globalThis.process.env, pas la liaison `process` shimée', () => {
    /*
     * Le bundle SSR remplace `process.env` par un objet VIDE. Lire la liaison nue
     * aurait rendu `undefined` quelles que soient les variables réelles du pod —
     * une panne SILENCIEUSE et fail-closed, donc invisible : la facturation
     * serait restée éteinte après un passage au payant.
     */
    holder.process = { env: { [BILLING_ENABLED_ENV]: 'true' } };
    expect(billingEnabled()).toBe(true);

    holder.process = { env: {} };
    expect(billingEnabled()).toBe(false);
  });

  it('ne lève pas quand aucun objet `process` n_existe (navigateur)', () => {
    delete holder.process;
    expect(() => billingEnabled()).not.toThrow();
    expect(billingEnabled()).toBe(false);
  });
});

describe('BillingDisabledError', () => {
  it('répond 404 et non 403 : la route ne doit pas EXISTER à OFF', () => {
    /*
     * Un 403 confirmerait à un appelant — ou à un scanner — qu'un point d'entrée
     * de paiement est là, simplement fermé.
     */
    const error = new BillingDisabledError('checkout');

    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('BILLING_DISABLED');
    expect(error).toBeInstanceOf(Error);
  });

  it('nomme la surface refusée pour le diagnostic', () => {
    expect(new BillingDisabledError('stripe webhook').message).toContain('stripe webhook');
  });
});
