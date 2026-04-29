#!/usr/bin/env node
const baseUrl = process.env.SYNTHETIC_BASE_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
const checks = [
  { name: 'health', path: '/health' },
  { name: 'ready', path: '/ready' },
  { name: 'synthetic', path: '/synthetic/health' },
  { name: 'metrics', path: '/metrics' },
];

const results = [];
for (const check of checks) {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL(check.path, baseUrl), { headers: { accept: check.path === '/metrics' ? 'text/plain' : 'application/json' } });
    results.push({
      name: check.name,
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    results.push({
      name: check.name,
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ ok, baseUrl, results }));
process.exit(ok ? 0 : 1);
