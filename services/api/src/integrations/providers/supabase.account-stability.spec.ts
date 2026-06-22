import { describe, expect, it } from 'vitest';
import { supabaseConnector } from './supabase.js';

interface SupabaseProjectLike {
  id?: string;
  ref?: string;
  name?: string;
  organization_id?: string;
}

function jsonFetch(projects: SupabaseProjectLike[]): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(projects), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
}

async function idFor(projects: SupabaseProjectLike[]): Promise<string> {
  const info = await supabaseConnector.fetchUserInfo({ accessToken: 'sb', fetchImpl: jsonFetch(projects) });

  return info.externalAccountId;
}

describe('supabaseConnector externalAccountId stability', () => {
  it('is independent of project ordering when organizations are present', async () => {
    const projects: SupabaseProjectLike[] = [
      { ref: 'beta', name: 'Beta', organization_id: 'org-b' },
      { ref: 'alpha', name: 'Alpha', organization_id: 'org-a' },
      { ref: 'gamma', name: 'Gamma', organization_id: 'org-c' },
    ];

    const original = await idFor(projects);
    const reversed = await idFor([...projects].reverse());
    const rotated = await idFor([projects[2], projects[0], projects[1]]);

    expect(original).toBe(reversed);
    expect(original).toBe(rotated);

    // Deterministically the lexicographically smallest org id.
    expect(original).toBe('org-a');
  });

  it('stays stable as projects are added or removed within the same org', async () => {
    const before = await idFor([
      { ref: 'p1', name: 'One', organization_id: 'org-x' },
      { ref: 'p2', name: 'Two', organization_id: 'org-x' },
    ]);

    // User creates a third project; the API now returns it first.
    const after = await idFor([
      { ref: 'p3', name: 'Three', organization_id: 'org-x' },
      { ref: 'p1', name: 'One', organization_id: 'org-x' },
      { ref: 'p2', name: 'Two', organization_id: 'org-x' },
    ]);

    expect(before).toBe('org-x');
    expect(after).toBe('org-x');
  });

  it('falls back to a stable ref/id when no organization is exposed', async () => {
    const projects: SupabaseProjectLike[] = [
      { ref: 'zeta', name: 'Zeta' },
      { ref: 'alpha', name: 'Alpha' },
    ];

    const original = await idFor(projects);
    const reversed = await idFor([...projects].reverse());

    expect(original).toBe(reversed);
    expect(original).toBe('alpha');
  });

  it('uses id when ref is absent and remains order-independent', async () => {
    const projects: SupabaseProjectLike[] = [{ id: 'zzz' }, { id: 'aaa' }];

    expect(await idFor(projects)).toBe('aaa');
    expect(await idFor([...projects].reverse())).toBe('aaa');
  });

  it('preserves the single-project organization behavior', async () => {
    const info = await supabaseConnector.fetchUserInfo({
      accessToken: 'sb',
      fetchImpl: jsonFetch([{ ref: 'abc', name: 'my-proj', organization_id: 'org-1' }]),
    });

    expect(info.externalAccountId).toBe('org-1');
    expect(info.externalAccountLabel).toBe('Supabase org org-1');
  });

  it('matches between testApiKey and fetchUserInfo for the same payload', async () => {
    const projects: SupabaseProjectLike[] = [
      { ref: 'b', name: 'B', organization_id: 'org-2' },
      { ref: 'a', name: 'A', organization_id: 'org-1' },
    ];

    const fromUserInfo = await idFor(projects);
    const tested = await supabaseConnector.testApiKey!({ apiKey: 'good', fetchImpl: jsonFetch(projects) });

    expect(tested.ok).toBe(true);
    expect(tested.userInfo?.externalAccountId).toBe(fromUserInfo);
    expect(tested.userInfo?.externalAccountId).toBe('org-1');
  });
});
