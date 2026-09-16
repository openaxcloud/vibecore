import { describe, expect, it } from 'vitest';
import {
  describeByteGauge,
  describeCpuGauge,
  formatResourceBytes,
  formatResourceRatio,
} from './project-overview-resources';

const BYTE_COPY = {
  unknown: 'Non communiqué',
  noLimit: 'Aucune limite posée',
  usedOfLimit: '{used} sur {limit}',
};

describe('formatResourceBytes', () => {
  it('rend les unités binaires du relevé cgroup de production', () => {
    // 400769024 / 536870912 : les valeurs lues sur la prod le 19/08.
    expect(formatResourceBytes(400_769_024, 'fr')).toBe('382 Mio');
    expect(formatResourceBytes(536_870_912, 'fr')).toBe('512 Mio');
    expect(formatResourceBytes(536_870_912, 'en')).toBe('512 MiB');

    // Sous 100, une décimale garde la jauge lisible.
    expect(formatResourceBytes(1_610_612_736, 'en')).toBe('1.5 GiB');
  });

  it('ne rend PAS de valeur quand le noyau n’expose rien', () => {
    expect(formatResourceBytes(null, 'fr')).toBeUndefined();
    expect(formatResourceBytes(undefined, 'fr')).toBeUndefined();
    expect(formatResourceBytes(Number.NaN, 'fr')).toBeUndefined();
  });

  it('distingue un vrai zéro d’une absence', () => {
    // Zéro mesuré est une information ; `null` n'en est pas une.
    expect(formatResourceBytes(0, 'fr')).toBe('0 o');
    expect(formatResourceBytes(null, 'fr')).toBeUndefined();
  });
});

describe('formatResourceRatio', () => {
  it('borne à 100 % et garde une décimale sous 10 %', () => {
    expect(formatResourceRatio(0.037, 'en')).toBe('3.7%');
    expect(formatResourceRatio(0.42, 'en')).toBe('42%');
    expect(formatResourceRatio(3, 'en')).toBe('100%');
  });

  it('rend `undefined` — jamais 0 % — quand le taux n’existe pas encore', () => {
    expect(formatResourceRatio(null, 'en')).toBeUndefined();
  });
});

describe('describeByteGauge', () => {
  it('affiche « utilisé sur limite » et remplit la barre', () => {
    const gauge = describeByteGauge({ used: 400_769_024, limit: 536_870_912 }, BYTE_COPY, 'fr');

    expect(gauge.value).toBe('382 Mio sur 512 Mio');
    expect(gauge.fill).toBeCloseTo(0.7466, 3);
  });

  it('n’invente pas de barre quand aucune limite n’est posée', () => {
    const gauge = describeByteGauge({ used: 400_769_024, limit: null }, BYTE_COPY, 'fr');

    expect(gauge.value).toContain('Aucune limite posée');
    expect(gauge.fill).toBeNull();
  });

  it('dit « non communiqué » plutôt que zéro quand la mesure manque', () => {
    const gauge = describeByteGauge({ used: null, limit: 536_870_912 }, BYTE_COPY, 'fr');

    expect(gauge.value).toBe('Non communiqué');
    expect(gauge.value).not.toContain('0');
    expect(gauge.fill).toBeNull();
  });

  it('traite une jauge entièrement absente comme non communiquée', () => {
    expect(describeByteGauge(undefined, BYTE_COPY, 'fr')).toEqual({ value: 'Non communiqué', fill: null });
  });
});

describe('describeCpuGauge', () => {
  it('annonce la mesure en cours au premier relevé, sans afficher 0 %', () => {
    const gauge = describeCpuGauge({ ratio: null, limitCores: 2 }, { pending: 'Mesure en cours' }, 'fr');

    expect(gauge.value).toBe('Mesure en cours');
    expect(gauge.value).not.toContain('0');
    expect(gauge.fill).toBeNull();
  });

  it('rend le taux dès qu’il existe', () => {
    const gauge = describeCpuGauge({ ratio: 0.42, limitCores: 2 }, { pending: 'Mesure en cours' }, 'en');

    expect(gauge.value).toBe('42%');
    expect(gauge.fill).toBeCloseTo(0.42, 5);
  });
});
