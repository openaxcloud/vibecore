import { describe, expect, it } from 'vitest';
import { toProjectCards, type ApiProject } from './dashboard-projects';

const project = (overrides: Partial<ApiProject> & { id: string }): ApiProject => ({
  name: `Project ${overrides.id}`,
  ...overrides,
});

describe('toProjectCards', () => {
  it('returns an empty list for no projects (so the palette has only static actions)', () => {
    expect(toProjectCards([])).toEqual([]);
  });

  it('maps API projects into ProjectCards usable by the command palette', () => {
    const [card] = toProjectCards([project({ id: 'p1', name: 'Checkout', updatedAt: '2026-01-02T00:00:00Z' })], {
      slug: 'acme',
    });

    expect(card.id).toBe('p1');
    expect(card.name).toBe('Checkout');
    expect(card.status).toBe('Draft');
    expect(card.lifecycle).toBe('draft');
    expect(card.updatedAtIso).toBe('2026-01-02T00:00:00Z');

    // The palette navigates via ideUrl, so it must be populated.
    expect(card.ideUrl).toBeTruthy();
    expect(card.previewImageUrl).toBe('/api/projects/p1/thumbnail');
  });

  it('marks projects with deployments as deployed', () => {
    const [card] = toProjectCards([project({ id: 'p1', deploymentCount: 2 })]);

    expect(card.status).toBe('Deployed');
    expect(card.lifecycle).toBe('deployed');
    expect(card.deploymentCount).toBe(2);
  });

  it('sorts most-recently-updated first', () => {
    const cards = toProjectCards([
      project({ id: 'old', updatedAt: '2025-01-01T00:00:00Z' }),
      project({ id: 'new', updatedAt: '2026-06-01T00:00:00Z' }),
      project({ id: 'mid', updatedAt: '2025-09-01T00:00:00Z' }),
    ]);

    expect(cards.map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('caps the result to the requested limit', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      project({ id: `p${i}`, updatedAt: new Date(2026, 0, i + 1).toISOString() }),
    );

    expect(toProjectCards(many)).toHaveLength(6);
    expect(toProjectCards(many, null, 3)).toHaveLength(3);
  });

  it('falls back to a friendly stack label and "recently" timestamp', () => {
    const [card] = toProjectCards([project({ id: 'p1' })]);

    expect(card.stack).toBe('E-Code project');
    expect(card.updated).toBe('recently');
  });

  it('uses customer-facing source labels without exposing repository URLs or identifiers', () => {
    const [gitCard] = toProjectCards([project({ id: 'g', gitRepositoryUrl: 'https://git/x', sourceType: 'github' })]);
    const [srcCard] = toProjectCards([project({ id: 's', sourceType: 'github' })]);

    expect(gitCard.stack).toBe('Git repository');
    expect(srcCard.stack).toBe('GitHub repository');
  });

  it('maps project card labels and fallback time in French', () => {
    const [card] = toProjectCards([project({ id: 'fr', sourceType: 'github' })], null, 6, 'fr');

    expect(card.status).toBe('Brouillon');
    expect(card.stack).toBe('Dépôt GitHub');
    expect(card.updated).toBe('récemment');
  });

  it('does not mutate the input array order', () => {
    const input = [
      project({ id: 'a', updatedAt: '2025-01-01T00:00:00Z' }),
      project({ id: 'b', updatedAt: '2026-01-01T00:00:00Z' }),
    ];
    toProjectCards(input);

    expect(input.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
