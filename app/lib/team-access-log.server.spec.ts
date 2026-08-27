import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiRequestMock = vi.hoisted(() => vi.fn());

vi.mock('~/lib/enterprise-api.server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/enterprise-api.server')>();

  return { ...actual, apiRequest: (...args: unknown[]) => apiRequestMock(...args) };
});

import { loadTeamAccessLog } from './team-access-log.server';

beforeEach(() => apiRequestMock.mockReset());

describe('localized team access-log loader', () => {
  it('returns the detected locale and response headers with the audit data', async () => {
    apiRequestMock.mockResolvedValueOnce({ accessLog: [{ action: 'member.invited' }] });

    const result = (await loadTeamAccessLog(
      new Request('https://e-code.ai/teams/team-1', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } }),
      'team-1',
      '/teams/team-1',
    )) as {
      data: { language: string; entries: Array<{ action: string }> };
      init: { headers: HeadersInit };
    };

    const headers = new Headers(result.init.headers);

    expect(result.data.language).toBe('fr');
    expect(result.data.entries).toEqual([{ action: 'member.invited' }]);
    expect(headers.get('Content-Language')).toBe('fr');
    expect(headers.get('Set-Cookie')).toContain('vibecore-auto-lang=fr');
  });

  it('adds locale headers to real CSV exports without changing the exported audit content', async () => {
    apiRequestMock.mockResolvedValueOnce('createdAt,action\n2026-08-04T12:00:00Z,member.invited');

    const response = (await loadTeamAccessLog(
      new Request('https://e-code.ai/teams/team-1?export=csv&lang=fr'),
      'team-1',
      '/teams/team-1',
    )) as Response;

    expect(response.headers.get('Content-Language')).toBe('fr');
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toContain('team-access-log-team-1-');
    expect(await response.text()).toContain('member.invited');
  });
});
