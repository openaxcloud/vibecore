import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';

/*
 * BUG-QA-PROVIDERS-SSR-ENV-001 — the Connections UI reported "no provider
 * configured" while the key was set and the provider actually worked.
 *
 * `vite-plugin-node-polyfills` shims `process` in the SSR bundle, so
 * `process.env` is an EMPTY object there: a bare `process.env[NAME]` read
 * silently returns undefined for every variable, no matter what the pod's real
 * environment holds. The real values live on `globalThis.process.env`, which is
 * what `readRuntimeEnv` reads — the same workaround already used by
 * require-session / ai-usage / preview-tenant.
 *
 * Both routes below feed the SAME Connections surface, so both had to be fixed.
 */

const ROUTES = ['api.configured-providers.ts', 'api.check-env-key.ts'] as const;

function source(file: string) {
  return readFileSync(join(__dirname, file), 'utf8');
}

describe('BUG-QA-PROVIDERS-SSR-ENV-001 — provider env must survive the SSR shim', () => {
  for (const file of ROUTES) {
    it(`${file} never reads a bare process.env[...]`, () => {
      const text = source(file);

      // Strip comments so the explanatory blocks above don't trip the guard.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

      expect(code).not.toMatch(/\bprocess\.env\s*\[/);
    });

    it(`${file} goes through readRuntimeEnv`, () => {
      expect(source(file)).toMatch(/readRuntimeEnv\s*\(/);
    });
  }

  it('readRuntimeEnv reads globalThis.process.env, not the shimmed binding', () => {
    const holder = globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    };

    const previous = holder.process;

    try {
      holder.process = { env: { ANTHROPIC_API_KEY: 'sk-ant-test-value' } };
      expect(readRuntimeEnv('ANTHROPIC_API_KEY')).toBe('sk-ant-test-value');
      expect(readRuntimeEnv('ABSENT_KEY')).toBeUndefined();
      expect(readRuntimeEnv(undefined)).toBeUndefined();
    } finally {
      holder.process = previous;
    }
  });

  it('degrades to undefined when no process object exists at all', () => {
    const holder = globalThis as typeof globalThis & { process?: unknown };
    const previous = holder.process;

    try {
      delete holder.process;
      expect(() => readRuntimeEnv('ANTHROPIC_API_KEY')).not.toThrow();
      expect(readRuntimeEnv('ANTHROPIC_API_KEY')).toBeUndefined();
    } finally {
      holder.process = previous;
    }
  });
});
