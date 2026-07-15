#!/usr/bin/env node
/**
 * cache-model-sweep — drive real cache-hit measurements across EVERY catalog model
 * of the 5 platform-keyed providers, in one pass, and emit the CACHE_MATRIX rows.
 *
 * WHY this exists. Live cache testing is gated on the test org's `ai.inputTokens`
 * quota (429 after ~12 gens). This script is the ready-to-run harness: the moment a
 * platform-admin lifts the quota
 *   POST /admin/orgs/<org>/quota-overrides {key:'ai.inputTokens', limit:1e8}
 * run it once and it fills every "tested live (chiffres)" cell with real
 * promptTokens | cachedPromptTokens | ratio.
 *
 * METHOD (mirrors the proven manual runs). For each model it POSTs TURNS
 * consecutive `/api/chat` requests with the SAME projectId (so the server's stable
 * `prompt_cache_key` / anthropic cache_control / gemini cachedContents all key to
 * one prefix), draining each SSE response to completion so the server logs its
 * `chat.completion.usage`. The usage line carries {provider, model,
 * promptTokens, cachedPromptTokens} — so after driving a model we read it back
 * (kubectl web-pod logs) and correlate by model id. Turn 1 is the cold write; turns
 * 2..N should report cachedPromptTokens > 0.
 *
 * AUTH. The `/api/chat` route is cookie-authenticated. Supply a real session cookie
 * from an authenticated app.e-code.ai browser session via ECODE_COOKIE, and a real
 * project id you own via ECODE_PROJECT_ID (it becomes the stable chatId). Nothing
 * here handles credentials — you paste an already-issued session cookie.
 *
 * SAFETY. Read-only w.r.t. code; it only sends chat turns (consumes AI quota — that
 * is the point). With no ECODE_COOKIE it runs as a DRY RUN: it prints the full plan
 * (every model + the exact request) and exits without calling anything.
 *
 * ENV
 *   ECODE_BASE_URL     default https://app.e-code.ai
 *   ECODE_COOKIE       session cookie (required to actually run; absent → dry run)
 *   ECODE_PROJECT_ID   stable chatId / projectId you own (required to run)
 *   TURNS              consecutive turns per model (default 4)
 *   CHAT_MODE          discuss | build (default discuss)
 *   TURN_DELAY_MS      pause between turns (default 1500)
 *   MODEL_DELAY_MS     pause between models (default 3000)
 *   ONLY               substring filter on "provider/model" (e.g. "Anthropic" or "gpt-4o")
 *   KUBECTL            "1" to auto-collect usage from web-pod logs after each model
 *   KUBE_NAMESPACE     default vibecore
 *   OUT                output markdown path (default outputs/CACHE_SWEEP_RESULT.md)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

/**
 * Every model of the 5 platform-keyed providers (OpenAI, Anthropic, Google, xAI,
 * Moonshot), mirroring the provider modules' static catalogs. `provider` is the
 * exact `provider.name` the `[Provider: …]` prefix expects. Per-model cache
 * minimum (tokens) noted where the provider enforces one.
 */
const MODELS = [
  // OpenAI — auto prefix cache ≥1024, routed by our prompt_cache_key (95% proven on gpt-4o)
  ...['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'].map(
    (id) => ({ provider: 'OpenAI', id, min: 1024 }),
  ),

  // Anthropic — cache_control breakpoint; min 1024 (Sonnet/Opus), 2048 (Haiku)
  { provider: 'Anthropic', id: 'claude-opus-4-8', min: 1024 },
  { provider: 'Anthropic', id: 'claude-sonnet-4-6', min: 1024 },
  { provider: 'Anthropic', id: 'claude-sonnet-4-5-20250929', min: 1024 },
  { provider: 'Anthropic', id: 'claude-opus-4-7', min: 1024 },
  { provider: 'Anthropic', id: 'claude-haiku-4-5-20251001', min: 2048 },

  // Google — explicit cachedContents (Flash 2048 / Pro 4096)
  { provider: 'Google', id: 'gemini-2.5-flash', min: 2048 },
  { provider: 'Google', id: 'gemini-2.5-pro', min: 4096 },
  { provider: 'Google', id: 'gemini-3.5-flash', min: 2048 },
  { provider: 'Google', id: 'gemini-2.5-flash-lite', min: 2048 },

  // xAI — cache affinity header; x.ai returns no streaming usage (billing floor applies)
  ...['grok-4', 'grok-4-07-09', 'grok-3-mini', 'grok-3-mini-fast', 'grok-code-fast-1'].map((id) => ({
    provider: 'xAI',
    id,
    min: 0,
  })),

  // Moonshot — support-only (no published cache contract); measured to confirm
  ...[
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
    'moonshot-v1-auto',
    'moonshot-v1-8k-vision-preview',
    'moonshot-v1-32k-vision-preview',
    'moonshot-v1-128k-vision-preview',
    'kimi-latest',
    'kimi-k2-0711-preview',
    'kimi-k2-turbo-preview',
    'kimi-thinking-preview',
  ].map((id) => ({ provider: 'Moonshot', id, min: 0 })),
];

const BASE_URL = process.env.ECODE_BASE_URL ?? 'https://app.e-code.ai';
const COOKIE = process.env.ECODE_COOKIE ?? '';
const PROJECT_ID = process.env.ECODE_PROJECT_ID ?? '';
const TURNS = Number(process.env.TURNS ?? 4);
const CHAT_MODE = process.env.CHAT_MODE ?? 'discuss';
const TURN_DELAY_MS = Number(process.env.TURN_DELAY_MS ?? 1500);
const MODEL_DELAY_MS = Number(process.env.MODEL_DELAY_MS ?? 3000);
const ONLY = process.env.ONLY ?? '';
const USE_KUBECTL = process.env.KUBECTL === '1';
const KUBE_NAMESPACE = process.env.KUBE_NAMESPACE ?? 'vibecore';
const OUT = process.env.OUT ?? 'outputs/CACHE_SWEEP_RESULT.md';

/** A short, fixed discuss prompt — long enough to be a real turn, cheap enough to be light. */
const PROMPT = 'In one short paragraph, explain what prompt caching is and why it lowers cost.';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function selected() {
  return ONLY ? MODELS.filter((m) => `${m.provider}/${m.id}`.toLowerCase().includes(ONLY.toLowerCase())) : MODELS;
}

/** Build the /api/chat request body for a single turn (last user msg carries the model/provider prefix). */
function buildBody(model, turnIndex) {
  const tagged = `[Model: ${model.id}]\n\n[Provider: ${model.provider}]\n\n${PROMPT} (turn ${turnIndex + 1})`;

  return {
    messages: [{ role: 'user', content: tagged }],
    files: {},
    projectId: PROJECT_ID,
    contextOptimization: true,
    chatMode: CHAT_MODE,
  };
}

/** Drive one turn: POST and fully drain the SSE stream so the server logs usage. Returns HTTP status. */
async function driveTurn(model, turnIndex) {
  const res = await fetch(`${BASE_URL.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: COOKIE, accept: 'text/event-stream' },
    body: JSON.stringify(buildBody(model, turnIndex)),
  });

  // Drain the body so the generation completes server-side (usage is logged in onFinish).
  if (res.body) {
    const reader = res.body.getReader();

    for (;;) {
      const { done } = await reader.read();

      if (done) {
        break;
      }
    }
  }

  return res.status;
}

/**
 * Read back the last TURNS `chat.completion.usage` log lines for a model from the
 * web pods (kubectl). Correlated by the log's own {provider, model} fields.
 */
function collectUsage(model, sinceSeconds) {
  try {
    const raw = execFileSync(
      'kubectl',
      [
        '-n',
        KUBE_NAMESPACE,
        'logs',
        '-l',
        'app.kubernetes.io/name=web',
        `--since=${sinceSeconds}s`,
        '--tail=-1',
        '--prefix=false',
      ],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );

    const rows = [];

    for (const line of raw.split('\n')) {
      const idx = line.indexOf('"event":"chat.completion.usage"');

      if (idx === -1) {
        continue;
      }

      try {
        const json = JSON.parse(line.slice(line.lastIndexOf('{', idx)));

        if (json.model === model.id) {
          rows.push({ promptTokens: json.promptTokens ?? 0, cachedPromptTokens: json.cachedPromptTokens ?? 0 });
        }
      } catch {
        // skip unparseable line
      }
    }

    return rows.slice(-TURNS);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function verdict(rows, model) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { cell: '❓ no usage logged', ratio: 0 };
  }

  const later = rows.slice(1); // turn 1 is the cold write
  const best = later.reduce((max, r) => Math.max(max, r.cachedPromptTokens || 0), 0);
  const base = later.reduce((max, r) => Math.max(max, r.promptTokens || 0), 0);
  const ratio = base > 0 ? Math.round((best / base) * 100) : 0;
  const nums = rows.map((r) => `${r.promptTokens}/${r.cachedPromptTokens}`).join(', ');

  if (best > 0) {
    return { cell: `✅ ${ratio}% — ${nums}`, ratio };
  }

  if (model.min === 0) {
    return { cell: `➖ no cache contract — ${nums}`, ratio: 0 };
  }

  return { cell: `⚠️ 0 cached — ${nums}`, ratio: 0 };
}

async function main() {
  const models = selected();

  if (!COOKIE || !PROJECT_ID) {
    console.log('# DRY RUN (set ECODE_COOKIE + ECODE_PROJECT_ID to execute)\n');
    console.log(`Base URL     : ${BASE_URL}`);
    console.log(`Turns/model  : ${TURNS}   chatMode: ${CHAT_MODE}`);
    console.log(`Models       : ${models.length}${ONLY ? ` (filtered by "${ONLY}")` : ''}`);
    console.log(`Est. gens    : ${models.length * TURNS} (each ~5k input tokens → mind the quota override)\n`);

    for (const m of models) {
      console.log(`  ${m.provider.padEnd(10)} ${m.id}${m.min ? `   (min ${m.min} tok)` : ''}`);
    }

    console.log('\nExample request body (turn 1):');
    console.log(JSON.stringify(buildBody(models[0], 0), null, 2));

    return;
  }

  const started = Date.now();
  const results = [];

  for (const model of models) {
    const label = `${model.provider}/${model.id}`;
    process.stdout.write(`▶ ${label} — ${TURNS} turns … `);

    const statuses = [];

    for (let t = 0; t < TURNS; t++) {
      try {
        statuses.push(await driveTurn(model, t));
      } catch (error) {
        statuses.push(`ERR:${error instanceof Error ? error.message : error}`);
      }

      if (t < TURNS - 1) {
        await sleep(TURN_DELAY_MS);
      }
    }

    let usageCell = '(collect manually: grep chat.completion.usage)';

    if (USE_KUBECTL) {
      const sinceSeconds = Math.ceil((Date.now() - started) / 1000) + 5;
      const rows = collectUsage(model, sinceSeconds);
      usageCell = Array.isArray(rows) ? verdict(rows, model).cell : `❓ kubectl error: ${rows.error}`;
    }

    console.log(`statuses=[${statuses.join(',')}]  ${usageCell}`);
    results.push({ provider: model.provider, id: model.id, statuses, usageCell });

    await sleep(MODEL_DELAY_MS);
  }

  // Emit the matrix rows.
  const lines = [
    `# Cache sweep result — ${new Date(started).toISOString()}`,
    '',
    `Base ${BASE_URL} · ${TURNS} turns/model · chatMode ${CHAT_MODE} · projectId ${PROJECT_ID}`,
    '',
    '| provider | model | statuses | promptTokens/cachedPromptTokens per turn → verdict |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.provider} | ${r.id} | ${r.statuses.join(',')} | ${r.usageCell} |`),
    '',
    'Turn 1 = cold write; turns 2..N should show cachedPromptTokens > 0 where the provider caches.',
    'If KUBECTL was not set, collect with:',
    '`kubectl -n vibecore logs -l app.kubernetes.io/name=web --since=30m | grep chat.completion.usage`',
  ];

  writeFileSync(OUT, lines.join('\n'));
  console.log(`\nWrote ${OUT} (${results.length} models).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
