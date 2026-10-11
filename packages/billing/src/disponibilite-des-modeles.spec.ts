/*
 * Un modèle listé n'est pas un modèle joignable — et le distinguer évite deux
 * défauts opposés :
 *
 *   afficher comme disponible ce qui casse au premier clic ;
 *   faire disparaître ce qui reviendra dès le rechargement, obligeant alors à
 *   redéployer pour le faire réapparaître.
 *
 * Les codes d'erreur testés ici ne sont pas inventés : ils ont été relevés le
 * 2026-09-16 sur nos propres comptes.
 */
import { describe, expect, it } from 'vitest';

import { coutMelange, type CatalogueDuMode } from './catalogue-de-modeles.js';
import { CATALOGUE_INTEGRE } from './catalogue-integre.js';
import {
  catalogueAvecEtats,
  etatDepuisReponse,
  etatDuModele,
  modeleAutomatiqueJoignable,
  type SondeFournisseur,
} from './disponibilite-des-modeles.js';

const MAX = CATALOGUE_INTEGRE.find((c) => c.mode === 'max')!;
const POWER = CATALOGUE_INTEGRE.find((c) => c.mode === 'power')!;

/** L'état réel du 2026-09-16 : OpenAI et Google répondent, Anthropic et Moonshot sont à sec. */
const SONDES_DU_JOUR: SondeFournisseur[] = [
  { fournisseur: 'openai', etat: 'joignable' },
  { fournisseur: 'google', etat: 'joignable' },
  { fournisseur: 'anthropic', etat: 'sans-credit' },
  { fournisseur: 'moonshot', etat: 'sans-credit' },
];

describe('lire la réponse d’un fournisseur', () => {
  it('reconnaît la panne de portefeuille d’Anthropic', () => {
    expect(
      etatDepuisReponse(400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}'),
    ).toBe('sans-credit');
  });

  it('reconnaît la suspension de Moonshot', () => {
    expect(
      etatDepuisReponse(429, '{"error":{"type":"exceeded_current_quota_error","message":"account is suspended"}}'),
    ).toBe('sans-credit');
  });

  it('un 200 vaut joignable', () => {
    expect(etatDepuisReponse(200, '{"content":[]}')).toBe('joignable');
  });

  it('une clé refusée n’est PAS une panne de crédit', () => {
    expect(etatDepuisReponse(401, '{"error":{"message":"invalid x-api-key"}}')).toBe('sans-cle');
  });

  it('le reste est « injoignable », pas « sans crédit » — on n’invente pas la cause', () => {
    expect(etatDepuisReponse(503, 'upstream unavailable')).toBe('injoignable');
    expect(etatDepuisReponse(500, '')).toBe('injoignable');
  });
});

describe('du fournisseur au modèle', () => {
  it('une panne de crédit rend le modèle momentanément indisponible, pas absent', () => {
    expect(etatDuModele('sans-credit')).toEqual({
      etat: 'momentanement-indisponible',
      raison: 'credit-fournisseur',
    });
  });

  it('l’absence de clé se distingue de la panne de crédit', () => {
    expect(etatDuModele('sans-cle').etat).toBe('non-configure');
    expect(etatDuModele('sans-cle').raison).toBe('cle-absente');
  });

  it('jamais sondé ≠ indisponible — l’absence de verdict n’est pas un verdict', () => {
    expect(etatDuModele('inconnu').etat).toBe('inconnu');
  });

  it('les deux causes de « momentanément indisponible » restent distinctes au journal', () => {
    expect(etatDuModele('sans-credit').raison).not.toBe(etatDuModele('injoignable').raison);
  });
});

describe('le catalogue tel qu’il était le 2026-09-16', () => {
  it('aucun modèle ne disparaît : ils sont tous là, avec leur état', () => {
    const etats = catalogueAvecEtats(MAX, SONDES_DU_JOUR);

    expect(etats).toHaveLength(MAX.modeles.length);
    expect(etats.map((m) => m.model)).toEqual(MAX.modeles.map((m) => m.model));
  });

  it('les Claude et le Kimi sont montrés indisponibles, les OpenAI disponibles', () => {
    const etats = catalogueAvecEtats(MAX, SONDES_DU_JOUR);

    const par = (nom: string, tier?: string) => etats.find((m) => m.model === nom && m.serviceTier === tier)!;

    expect(par('claude-opus-5').etat).toBe('momentanement-indisponible');
    expect(par('claude-fable-5-1').etat).toBe('momentanement-indisponible');
    expect(par('kimi-k3').etat).toBe('momentanement-indisponible');
    expect(par('gpt-5.6-sol').etat).toBe('disponible');
    expect(par('gpt-6-astra').etat).toBe('disponible');
  });
});

describe('« Choisir automatiquement » ne retient jamais un modèle en panne', () => {
  it('Max bascule de kimi-k3 vers gpt-5.6-sol quand Moonshot est à sec', () => {
    const retenu = modeleAutomatiqueJoignable(MAX, SONDES_DU_JOUR, coutMelange)!;

    expect(retenu.model).toBe('gpt-5.6-sol');
    expect(retenu.etat).toBe('disponible');
  });

  it('Power garde luna fast : OpenAI répond', () => {
    const retenu = modeleAutomatiqueJoignable(POWER, SONDES_DU_JOUR, coutMelange)!;

    expect(retenu.model).toBe('gpt-5.6-luna');
    expect(retenu.serviceTier).toBe('fast');
  });

  it('tout revient au moins cher dès que les comptes sont rechargés', () => {
    const rechargés: SondeFournisseur[] = SONDES_DU_JOUR.map((s) => ({ ...s, etat: 'joignable' }));

    expect(modeleAutomatiqueJoignable(MAX, rechargés, coutMelange)!.model).toBe('kimi-k3');
  });

  it('un mode entièrement en panne se dit, il ne se devine pas', () => {
    const toutEnPanne: SondeFournisseur[] = SONDES_DU_JOUR.map((s) => ({ ...s, etat: 'sans-credit' }));

    expect(modeleAutomatiqueJoignable(MAX, toutEnPanne, coutMelange)).toBeUndefined();
  });

  it('un modèle épinglé mais injoignable ne se substitue pas en silence', () => {
    const epingle: CatalogueDuMode = {
      ...MAX,
      automatique: { politique: 'epingle', modeleEpingle: 'claude-opus-5' },
    };

    expect(modeleAutomatiqueJoignable(epingle, SONDES_DU_JOUR, coutMelange)).toBeUndefined();
  });
});
