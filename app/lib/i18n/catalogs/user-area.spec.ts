import { describe, expect, it } from 'vitest';

import { userAreaEn, userAreaFr } from './user-area';

describe('user-area translation catalog', () => {
  it('keeps English and French keys and interpolation tokens in exact parity', () => {
    expect(Object.keys(userAreaFr).sort()).toEqual(Object.keys(userAreaEn).sort());

    for (const key of Object.keys(userAreaEn) as Array<keyof typeof userAreaEn>) {
      const tokens = (value: string) => [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((match) => match[1]).sort();
      expect(tokens(userAreaFr[key]), key).toEqual(tokens(userAreaEn[key]));
    }
  });
});
