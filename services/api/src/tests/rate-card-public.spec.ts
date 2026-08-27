import { describe, expect, it } from 'vitest';

import { publicMachineSizeError } from '../rate-card-public.js';
import { MachineSizeError } from '../rate-card-service.js';

describe('public machine-size errors', () => {
  it.each([
    [
      new MachineSizeError({ code: 'MACHINE_SIZE_UNKNOWN', values: { requested: 'mega-64' } }),
      'Taille de machine « mega-64 » inconnue.',
    ],
    [
      new MachineSizeError({ code: 'MACHINE_SIZE_PLAN', values: { label: '8 vCPU · 32 GiB', planKey: 'free' } }),
      'La taille 8 vCPU · 32 GiB n’est pas disponible avec l’offre free.',
    ],
    [
      new MachineSizeError({ code: 'MACHINE_SIZE_CAPACITY', values: { label: '4 vCPU · 16 GiB' } }),
      'La taille 4 vCPU · 16 GiB est temporairement indisponible en raison de la capacité actuelle.',
    ],
  ])('localizes %s without serializing its internal sentinel', (error, expected) => {
    const payload = publicMachineSizeError(error, 'fr');

    expect(payload).toEqual({ error: expected, code: error.code });
    expect(payload.error).not.toBe(error.message);
  });
});
