import { describe, expect, it } from 'vitest';

import { loader } from './solutions.internal-ai';

describe('legacy Internal AI solution route', () => {
  it('redirects permanently to the Internal AI Builder route', () => {
    const response = loader();

    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('/solutions/internal-ai-builder');
  });
});
