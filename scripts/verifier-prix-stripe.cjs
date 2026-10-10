/*
 * VÉRIFIER LA GRILLE DANS STRIPE — à lancer DÈS que la clé live est renouvelée.
 *
 * S'exécute DANS un pod api de production (la clé n'en sort jamais, n'est jamais
 * affichée) ; lecture seule, côté base comme côté Stripe :
 *
 *   C=connectgateway_vibecore-495216_europe-west9_vibecore-prod-app
 *   P=$(kubectl --context $C -n vibecore get pods -o name | grep -m1 platform-api | sed 's#pod/##')
 *   kubectl --context $C -n vibecore exec -i $P -c api -- sh -c \
 *     'cd /runtime && cat > /tmp/verifier-prix.cjs && NODE_PATH=/runtime/node_modules node_modules/.bin/tsx /tmp/verifier-prix.cjs; rm -f /tmp/verifier-prix.cjs' \
 *     < scripts/verifier-prix-stripe.cjs
 *
 * Grille de référence (décision d'Avi du 2026-10-01) : Pro 29 €/mois, Team 99 €/mois,
 * 20 % de réduction en annuel (278,40 € et 950,40 €/an), Core sur mesure (pas de
 * prix). La clé suivie est celle que l'APPLICATION utilise : d'abord celle
 * enregistrée dans /admin/stripe (base, chiffrée), sinon l'environnement.
 */
const { decryptJson } = require('@vibecore/security');
const pg = require('pg');

// Surchargé UNIQUEMENT par le banc de test local (faux Stripe) ; en production : Stripe.
const BASE_STRIPE = process.env.VERIF_STRIPE_BASE ?? 'https://api.stripe.com';
const DEVISE_ATTENDUE = 'eur';
const REMISE_ANNUELLE = 0.2;
const ATTENDU = { pro: 2900, team: 9900 };
const estUnPrix = (v) => typeof v === 'string' && /^price_[A-Za-z0-9_]+$/.test(v.trim());
const annuelAttendu = (mensuel) => Math.round(mensuel * 12 * (1 - REMISE_ANNUELLE));
const ligne = (objet) => console.log(JSON.stringify(objet));

let ecarts = 0;

const ecart = (objet) => {
  ecarts += 1;
  ligne({ ECART: true, ...objet });
};

async function principal() {
  const base = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await base.connect();

  const config = (await base.query(`select "secretKeyEnc" from "StripeConfig" limit 1`)).rows[0];

  let cle;
  let source = 'environnement';

  if (config?.secretKeyEnc) {
    try {
      cle = decryptJson(config.secretKeyEnc).value || undefined;
      source = 'base (/admin/stripe)';
    } catch {
      ligne({ avertissement: 'clé en base indéchiffrable — repli sur l’environnement, comme l’application' });
    }
  }

  cle ??= process.env.STRIPE_SECRET_KEY;
  ligne({ cle: Boolean(cle), source, modeLive: cle ? cle.startsWith('sk_live_') : null });

  const stripe = async (chemin) => {
    const reponse = await fetch(`${BASE_STRIPE}${chemin}`, { headers: { authorization: `Bearer ${cle}` } });
    const corps = await reponse.json();

    return { ok: reponse.ok, statut: reponse.status, corps };
  };

  // 1. La clé est-elle acceptée ?
  const sonde = await stripe('/v1/prices?limit=1');

  if (!sonde.ok) {
    ligne({
      VERDICT: 'CLÉ REFUSÉE',
      statut: sonde.statut,
      erreur: sonde.corps?.error?.code ?? sonde.corps?.error?.type,
    });
    await base.end();
    process.exitCode = 1;

    return;
  }

  ligne({ cleAcceptee: true });

  // 2. Chaque forfait payant : un mensuel ET un annuel, cohérents.
  const plans = (
    await base.query(
      `select key, "monthlyCents", "stripeProductId", "stripePriceId", "stripePriceMonthlyId", "stripePriceAnnualId" from "Plan" where key in ('pro','team') order by key`,
    )
  ).rows;

  for (const plan of plans) {
    const mensuelAttendu = ATTENDU[plan.key];
    const idMensuel = [plan.stripePriceMonthlyId, plan.stripePriceId].find(estUnPrix);

    if (plan.monthlyCents !== mensuelAttendu) {
      ecart({ forfait: plan.key, quoi: 'montant mensuel en base', lu: plan.monthlyCents, attendu: mensuelAttendu });
    }

    let devise;

    if (!idMensuel) {
      ecart({ forfait: plan.key, quoi: 'aucun prix MENSUEL valable en base' });
    } else {
      const prix = await stripe(`/v1/prices/${idMensuel}`);
      const p = prix.corps;
      devise = p.currency;
      ligne({
        forfait: plan.key,
        intervalle: 'mensuel',
        prix: idMensuel,
        devise: p.currency,
        montant: p.unit_amount,
        recurrence: p.recurring?.interval,
        actif: p.active,
        live: p.livemode,
      });

      if (!prix.ok) {
        ecart({
          forfait: plan.key,
          quoi: 'prix mensuel introuvable chez Stripe',
          prix: idMensuel,
          statut: prix.statut,
        });
      }

      if (p.currency !== DEVISE_ATTENDUE) {
        ecart({ forfait: plan.key, quoi: 'DEVISE du mensuel', lue: p.currency, attendue: DEVISE_ATTENDUE });
      }

      if (p.unit_amount !== mensuelAttendu) {
        ecart({ forfait: plan.key, quoi: 'montant du mensuel', lu: p.unit_amount, attendu: mensuelAttendu });
      }

      if (p.recurring?.interval !== 'month') {
        ecart({ forfait: plan.key, quoi: 'récurrence du mensuel', lue: p.recurring?.interval });
      }

      if (!p.active) {
        ecart({ forfait: plan.key, quoi: 'prix mensuel INACTIF' });
      }

      if (!p.livemode) {
        ecart({ forfait: plan.key, quoi: 'prix mensuel en mode TEST' });
      }
    }

    const annuel = annuelAttendu(mensuelAttendu);

    if (!estUnPrix(plan.stripePriceAnnualId)) {
      ecart({
        forfait: plan.key,
        quoi: 'aucun prix ANNUEL valable en base',
        lu: plan.stripePriceAnnualId ? '(valeur qui n’est pas un identifiant de prix)' : null,
        attendu: `${annuel} centimes / an (${DEVISE_ATTENDUE})`,
      });

      // Ce qui existe déjà chez Stripe sur ce produit, pour savoir quel identifiant brancher.
      if (plan.stripeProductId) {
        const candidats = await stripe(`/v1/prices?product=${plan.stripeProductId}&active=true&limit=100`);

        for (const c of candidats.corps?.data ?? []) {
          if (c.recurring?.interval === 'year') {
            ligne({
              forfait: plan.key,
              candidatAnnuelChezStripe: c.id,
              devise: c.currency,
              montant: c.unit_amount,
              conforme: c.unit_amount === annuel && c.currency === DEVISE_ATTENDUE,
            });
          }
        }
      }
    } else {
      const prix = await stripe(`/v1/prices/${plan.stripePriceAnnualId}`);
      const p = prix.corps;
      ligne({
        forfait: plan.key,
        intervalle: 'annuel',
        prix: plan.stripePriceAnnualId,
        devise: p.currency,
        montant: p.unit_amount,
        recurrence: p.recurring?.interval,
        actif: p.active,
        live: p.livemode,
      });

      if (!prix.ok) {
        ecart({ forfait: plan.key, quoi: 'prix annuel introuvable chez Stripe', statut: prix.statut });
      }

      if (p.unit_amount !== annuel) {
        ecart({ forfait: plan.key, quoi: 'montant de l’annuel', lu: p.unit_amount, attendu: annuel });
      }

      if (p.recurring?.interval !== 'year') {
        ecart({ forfait: plan.key, quoi: 'récurrence de l’annuel', lue: p.recurring?.interval });
      }

      if (devise && p.currency !== devise) {
        ecart({ forfait: plan.key, quoi: 'devise annuelle ≠ devise mensuelle', annuel: p.currency, mensuel: devise });
      }

      if (!p.active) {
        ecart({ forfait: plan.key, quoi: 'prix annuel INACTIF' });
      }
    }
  }

  ligne({ VERDICT: ecarts === 0 ? 'GRILLE CONFORME' : `${ecarts} ÉCART(S) — voir les lignes ECART` });
  await base.end();
}

principal().catch((erreur) => {
  // Jamais le message brut : il pourrait citer une valeur de configuration.
  ligne({ VERDICT: 'ERREUR DU SCRIPT', type: erreur?.name ?? 'inconnue' });
  process.exit(2);
});
