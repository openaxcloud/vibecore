import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/*
 * R-4 — two cards that read the same are a duplicate as far as the user is
 * concerned, even when the panels behind them are genuinely different.
 *
 * `env` and `secrets` both pointed at `chat.copy.environmentVariables_1173b2e1`
 * ("Environment variables" / "Variables d'environnement"), so the All-tools grid
 * showed two cards with an identical subtitle and no way to tell which one to
 * open — while the panels behind them write to different stores
 * (`/projects/:id/env-vars` vs `/projects/:id/secrets`).
 *
 * `IDE_TOOL_DESCRIPTIONS` lives inside `BaseChat.tsx` (it holds i18n KEYS that
 * `t()` resolves at render time) and BaseChat is far too large to import in a
 * unit test. This guard therefore reads the TABLE from source. That is
 * deliberate and it is not "a test anchored on prose": the table is data, the
 * assertion is on key IDENTITY, and the parse itself is checked below so a
 * regex that stops matching fails loudly instead of passing on nothing.
 */
const BASE_CHAT = new URL('./BaseChat.tsx', import.meta.url);

function toolDescriptionKeys(): Array<{ tool: string; key: string }> {
  const source = readFileSync(BASE_CHAT, 'utf8');

  const table = source.match(
    /const IDE_TOOL_DESCRIPTIONS: Record<IdeWorkspacePanel \| IdeRightPanel, string> = \{([\s\S]*?)\n\};/u,
  );

  if (!table) {
    throw new Error('IDE_TOOL_DESCRIPTIONS was not found in BaseChat.tsx — this guard cannot report anything');
  }

  return [...table[1].matchAll(/^\s{2}'?([\w-]+)'?:\s*'([^']+)'/gmu)].map(([, tool, key]) => ({ tool, key }));
}

describe('IDE tool descriptions', () => {
  /**
   * Règle 14 — a "0 duplicates" result only means something if the search ran.
   * A regex that silently matches nothing would make every assertion below pass
   * on a table full of duplicates.
   */
  it('really parses the description table', () => {
    const entries = toolDescriptionKeys();

    expect(entries.length).toBeGreaterThan(20);
    expect(entries.map((entry) => entry.tool)).toContain('env');
    expect(entries.map((entry) => entry.tool)).toContain('secrets');

    for (const entry of entries) {
      expect(entry.key, `${entry.tool} has no i18n key`).toMatch(/^[a-zA-Z]+\.[\w.]+$/u);
    }
  });

  it('gives every tool a description no other tool shares', () => {
    const byKey = new Map<string, string[]>();

    for (const entry of toolDescriptionKeys()) {
      byKey.set(entry.key, [...(byKey.get(entry.key) ?? []), entry.tool]);
    }

    const shared = [...byKey.entries()]
      .filter(([, tools]) => tools.length > 1)
      .map(([key, tools]) => `${tools.join(' + ')} → ${key}`);

    expect(shared, 'these tools are indistinguishable in the All-tools grid').toEqual([]);
  });

  /**
   * The specific pair that named this defect, pinned by identity so that
   * "fixing" it by pointing both at some third shared key cannot pass.
   */
  it('separates Env vars from Secrets', () => {
    const entries = toolDescriptionKeys();
    const env = entries.find((entry) => entry.tool === 'env');
    const secrets = entries.find((entry) => entry.tool === 'secrets');

    expect(env?.key).toBeDefined();
    expect(secrets?.key).toBeDefined();
    expect(secrets!.key).not.toBe(env!.key);
  });
});
