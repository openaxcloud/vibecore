import { describe, expect, it } from 'vitest';
import { loader as githubLoader } from './import-github';
import { loader as zipLoader } from './import-zip';

describe('retired direct import routes', () => {
  it('routes GitHub through the validated Import Hub', () => {
    const response = githubLoader({ request: new Request('https://app.example/import-github') } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/templates?section=import&source=github');
  });

  it('routes ZIP through the validated Import Hub', () => {
    const response = zipLoader({ request: new Request('https://app.example/import-zip') } as never);
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/dashboard/templates?section=import&source=zip');
  });
});
