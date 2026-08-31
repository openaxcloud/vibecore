import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AUTH-HERO-001 — le panneau d'accroche des pages d'authentification ne peut pas
 * être écrit en blanc.
 *
 * Mesuré en production le 2026-08-31 sur les pixels rendus (`/login`, bureau
 * 1440, LES DEUX thèmes) : titre **2,70:1**, corps **2,40:1**, libellés de
 * statistiques **2,05:1**. Onze éléments sous le seuil AA.
 *
 * Ce n'est pas rattrapable en jouant sur l'opacité : le blanc plafonne à 2,62:1
 * même à pleine opacité sur le ton le plus foncé du dégradé. Seule l'encre
 * sombre passe — 6,58 à 8,34:1 — et c'est déjà le parti retenu ailleurs, où les
 * boutons d'action posent `#111827` sur l'orange de marque.
 *
 * Remesuré sur la vraie page après application : 2,70 → 6,58 / 2,40 → 6,94 /
 * 2,05 → 6,13.
 *
 * MÉTHODE — deux faux négatifs rencontrés en mesurant, évités ici :
 *   * lire une CAPTURE à l'œil : le blanc sur orange à petite taille se lit
 *     comme du texte sombre. Deux captures avant/après paraissaient identiques
 *     alors que rien n'avait été appliqué. Seul `getComputedStyle` tranche.
 *   * chercher un élément par sa classe utilitaire échappée : le sélecteur ne
 *     matche pas et la sonde rend « introuvable » ou attrape le bloc mobile
 *     caché. Ancrer sur le TEXTE, dans le panneau, et compter les éléments
 *     réellement touchés.
 */

const STYLESHEET = readFileSync(join(__dirname, 'index.scss'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const AA_BODY_TEXT = 4.5;

/** Les tons du dégradé `--ecode-orange` → `#f99d25`, relevés en production. */
const DEGRADE = ['#f38218', '#f47d15', '#f7944a', '#f99d25'];

const canal = (v: number) => {
  const x = v / 255;

  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};

const pixels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (c: number[]) => 0.2126 * canal(c[0]) + 0.7152 * canal(c[1]) + 0.0722 * canal(c[2]);

const contraste = (a: number[], b: number[]) => {
  const [l1, l2] = [luminance(a), luminance(b)];

  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

const encre = () => {
  const valeur = STYLESHEET.match(/--vc-auth-hero-ink:\s*(#[0-9a-f]{6})/i)?.[1];

  expect(valeur, '--vc-auth-hero-ink').toBeTruthy();

  return pixels(valeur!);
};

const opacite = (classe: string) => {
  const bloc = STYLESHEET.match(new RegExp(`\\.${classe}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  const mix = bloc.match(/color-mix\(in srgb,\s*var\(--vc-auth-hero-ink\)\s*(\d+)%/);

  return mix ? Number(mix[1]) / 100 : bloc.includes('var(--vc-auth-hero-ink)') ? 1 : Number.NaN;
};

describe('AUTH-HERO-001 — le panneau d’accroche reste lisible sur son dégradé', () => {
  it.each(['vc-auth-hero-copy', 'vc-auth-hero-body', 'vc-auth-hero-feature', 'vc-auth-hero-stat-label'])(
    '%s tient AA sur les quatre tons du dégradé',
    (classe) => {
      const alpha = opacite(classe);

      expect(alpha, `${classe} n'utilise pas --vc-auth-hero-ink`).toBeGreaterThan(0);

      for (const ton of DEGRADE) {
        const fond = pixels(ton);
        const composee = encre().map((v, i) => v * alpha + fond[i] * (1 - alpha));

        expect(contraste(composee, fond), `${classe} sur ${ton}`).toBeGreaterThanOrEqual(AA_BODY_TEXT);
      }
    },
  );

  it('ne repeint plus le panneau en blanc dans le composant', () => {
    const source = readFileSync(join(__dirname, '..', 'components', 'auth', 'AuthScreen.tsx'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );

    const panneau = source.slice(source.indexOf('vc-auth-hero-copy'), source.indexOf('vc-auth-hero-copy') + 1400);

    expect(source).toContain('vc-auth-hero-copy');
    expect(panneau).not.toMatch(/text-white\b/);
    expect(panneau).not.toMatch(/text-white\/\d+/);
  });

  it('garde le gris discret des pages d’auth lisible sur leur dégradé chaud', () => {
    /*
     * Le fond de la colonne du formulaire n'est pas blanc : c'est un dégradé
     * chaud qui descend jusqu'à #e1d6d2 (relevé en production). La mention
     * légale et « Back to home » y tombaient à 3,91:1 en thème clair.
     */
    /*
     * On lit le BLOC, pas le fichier : `--vc-auth-muted` est défini deux fois
     * (sombre puis clair) et un simple `split` attrape le mauvais.
     */
    const blocs = [...STYLESHEET.matchAll(/([^{}]+)\{([^{}]*)\}/g)];

    const clair = blocs.find(
      ([, selecteur, corps]) => /\[data-theme='light'\]/.test(selecteur) && /--vc-auth-muted:/.test(corps),
    );

    const muted = clair?.[2].match(/--vc-auth-muted:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(muted, '--vc-auth-muted en thème clair').toBeTruthy();
    expect(contraste(pixels(muted!), pixels('#e1d6d2'))).toBeGreaterThanOrEqual(AA_BODY_TEXT);
  });
});
