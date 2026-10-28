import { createOpenAI } from '@ai-sdk/openai';
import {
  EXPLICIT_RUN_PROVIDER_INPUT_CENTS,
  EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS,
  type ExplicitRunPermit,
} from '@vibecore/billing/src/explicit-run';

import { readRuntimeEnv } from '~/lib/modules/llm/runtime-env';

export interface ExplicitRunExecution {
  readonly permit: Readonly<ExplicitRunPermit>;
  readonly calls: number;
}

const counters = new WeakMap<ExplicitRunExecution, { calls: number }>();
const ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function refuse(message: string): never {
  throw Object.assign(new Error(message), { code: 'EXPLICIT_RUN_LIMIT', isRetryable: false, statusCode: 400 });
}

export function createExplicitRunExecution(permit: ExplicitRunPermit): ExplicitRunExecution {
  if (
    permit.kind !== 'bounded-explicit-v1' ||
    permit.provider !== 'openai' ||
    permit.model !== 'gpt-5.6-luna' ||
    permit.serviceTier !== 'default' ||
    !Number.isInteger(permit.maxCalls) ||
    permit.maxCalls < 1 ||
    permit.maxCalls > 8 ||
    permit.maxInputTokens !== 64000 ||
    !('maxBillableInputTokens' in permit) ||
    permit.maxBillableInputTokens !== 1050000 ||
    permit.maxOutputTokens !== 8192
  ) {
    refuse('Unsupported explicit run permit.');
  }

  const pricing = permit.pricing;

  if (
    !pricing ||
    pricing.providerInputCentsPerMillion !== EXPLICIT_RUN_PROVIDER_INPUT_CENTS ||
    pricing.providerOutputCentsPerMillion !== EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS ||
    ![pricing.platformInputCentsPerMillion, pricing.platformOutputCentsPerMillion].every(
      (price) => Number.isFinite(price) && price > 0,
    ) ||
    permit.budgetLimitMicros !== 20000000
  ) {
    refuse('Unsupported explicit run pricing.');
  }

  const charge = (input: number, output: number) =>
    Math.ceil((permit.maxBillableInputTokens * input + permit.maxOutputTokens * output) / 1000000) * 10000;
  const required =
    permit.maxCalls *
    (charge(EXPLICIT_RUN_PROVIDER_INPUT_CENTS, EXPLICIT_RUN_PROVIDER_OUTPUT_CENTS) +
      charge(pricing.platformInputCentsPerMillion, pricing.platformOutputCentsPerMillion));

  if (
    !Number.isSafeInteger(required) ||
    required <= 0 ||
    required > permit.budgetLimitMicros ||
    !Number.isSafeInteger(permit.reservedBudgetMicros) ||
    permit.reservedBudgetMicros < required ||
    permit.reservedBudgetMicros > permit.budgetLimitMicros
  ) {
    refuse('Invalid explicit run reservation.');
  }

  const counter = { calls: 0 };

  const execution: ExplicitRunExecution = Object.freeze({
    permit: Object.freeze({ ...permit, pricing: Object.freeze({ ...pricing }) }),
    get calls() {
      return counter.calls;
    },
  });
  counters.set(execution, counter);

  return execution;
}

/**
 * Conservative request SIZE guard, not a tokenizer or billing bound. The API
 * reservation covers the model's FULL billable context window independently.
 * Count all JSON UTF-8 bytes plus generous framing; refuse nontext input, tools
 * and unknown wire fields. Never use this estimate to release reserved budget.
 */
export function createExplicitRunFetch(execution: ExplicitRunExecution, baseFetch: typeof fetch): typeof fetch {
  const counter = counters.get(execution);

  if (!counter) {
    refuse('Invalid explicit run execution.');
  }

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url !== ENDPOINT || init?.method !== 'POST' || typeof init.body !== 'string') {
      refuse('Unsupported explicit run endpoint or body.');
    }

    let payload: Record<string, unknown>;

    try {
      payload = JSON.parse(init.body);
    } catch {
      refuse('Invalid explicit run body.');
    }

    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      refuse('Invalid explicit run body.');
    }

    const allowed = new Set([
      'model',
      'messages',
      'stream',
      'stream_options',
      'max_tokens',
      'max_completion_tokens',
      'service_tier',
      'temperature',
      'top_p',
      'frequency_penalty',
      'presence_penalty',
      'seed',
      'stop',
    ]);

    if (Object.keys(payload).some((key) => !allowed.has(key))) {
      refuse('Unsupported explicit run parameter.');
    }

    if (
      payload.model !== execution.permit.model ||
      (payload.service_tier !== undefined && payload.service_tier !== 'default')
    ) {
      refuse('Unsupported explicit run model or tier.');
    }

    if (!Array.isArray(payload.messages) || !payload.messages.length || payload.messages.length > 64) {
      refuse('Explicit run message limit exceeded.');
    }

    for (const message of payload.messages) {
      if (
        !message ||
        typeof message !== 'object' ||
        Object.keys(message).some((key) => !['role', 'content'].includes(key)) ||
        !['system', 'developer', 'user', 'assistant'].includes(message.role) ||
        typeof message.content !== 'string'
      ) {
        refuse('Explicit runs accept text messages only.');
      }
    }

    // Canonicalize the final request, independent of old SDK parameter support.
    delete payload.max_tokens;
    delete payload.temperature;
    delete payload.top_p;
    delete payload.frequency_penalty;
    delete payload.presence_penalty;
    delete payload.seed;
    delete payload.stop;
    payload.max_completion_tokens = execution.permit.maxOutputTokens;
    payload.service_tier = 'default';
    payload.stream = true;
    payload.stream_options = { include_usage: true };

    const body = JSON.stringify(payload);
    const upperBound = new TextEncoder().encode(body).length + 1024 * (payload.messages.length + 1);

    if (upperBound > execution.permit.maxInputTokens) {
      refuse('Explicit run input limit exceeded.');
    }

    if (counter.calls >= execution.permit.maxCalls) {
      refuse('Explicit run call limit exceeded.');
    }

    counter.calls += 1;

    // Never refund failed/aborted calls: upstream billing may be uncertain.
    return baseFetch(ENDPOINT, { ...init, body, redirect: 'error' });
  };
}

export function createExplicitRunModel(execution: ExplicitRunExecution, serverEnv?: Record<string, unknown>) {
  const rawKey = serverEnv?.OPENAI_API_KEY || readRuntimeEnv('OPENAI_API_KEY');

  if (typeof rawKey !== 'string' || !rawKey.trim()) {
    refuse('Managed OpenAI credential unavailable.');
  }

  const openai = createOpenAI({
    apiKey: rawKey.replace(/\s+/g, ''),
    baseURL: 'https://api.openai.com/v1',
    compatibility: 'strict',
    fetch: createExplicitRunFetch(execution, globalThis.fetch),
  });

  return openai(execution.permit.model);
}
