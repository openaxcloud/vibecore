#!/usr/bin/env node
// Seed the Stripe catalog (Products + recurring monthly Prices) for every plan
// declared in @vibecore/billing. Idempotent: re-runs reuse existing entities
// matched by metadata.planKey.
//
// Usage:
//   STRIPE_SECRET_KEY=sk_live_... node scripts/seed-stripe-catalog.mjs
//   STRIPE_SECRET_KEY=sk_test_... node scripts/seed-stripe-catalog.mjs --json
//
// On success, writes lines like:
//   STRIPE_FREE_PRODUCT_ID=prod_...
//   STRIPE_FREE_PRICE_ID=price_...
// for every plan, suitable for piping into your secret store.
//
// Notes:
// - Free / Enterprise plans declare monthlyCents=0; we still create a $0 Price
//   so the validator's stripe-catalog gate passes and Checkout can reference
//   them uniformly. Replace the Enterprise price with a custom-quote workflow
//   if your sales process requires it.
// - Stripe's /v1/products/search and /v1/prices/search may take 30-60s to
//   index newly-created entities; this script tolerates eventual consistency
//   by re-using freshly-created IDs in memory.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const billingSrc = resolve(__dirname, '..', 'packages', 'billing', 'src', 'index.ts');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY is required');
  process.exit(2);
}

const args = new Set(process.argv.slice(2));
const json = args.has('--json');
const live = process.env.STRIPE_SECRET_KEY.startsWith('sk_live_');
const baseUrl = process.env.STRIPE_API_BASE_URL ?? 'https://api.stripe.com';

const sourceText = readFileSync(billingSrc, 'utf8');
const plans = parsePlansFromSource(sourceText);

if (plans.length === 0) {
  console.error('Could not parse billingPlans from packages/billing/src/index.ts');
  process.exit(2);
}

const results = {};

for (const plan of plans) {
  process.stderr.write(`[seed-stripe] ${plan.key} (${plan.name}, ${plan.monthlyCents}c)\n`);

  const productId = (await findProductByPlanKey(plan.key))?.id ?? (await createProduct(plan)).id;
  const priceId = (await findPriceByPlanKey(productId, plan.key))?.id ?? (await createPrice(plan, productId)).id;

  results[plan.stripeProductEnv] = productId;
  results[plan.stripePriceEnv] = priceId;
}

if (json) {
  process.stdout.write(`${JSON.stringify({ mode: live ? 'live' : 'test', ...results }, null, 2)}\n`);
} else {
  process.stdout.write(`# Stripe seed (${live ? 'live' : 'test'} mode)\n`);

  for (const [name, value] of Object.entries(results)) {
    process.stdout.write(`${name}=${value}\n`);
  }
}

async function createProduct(plan) {
  return postForm('/v1/products', {
    name: `VibeCore ${plan.name}`,
    description: plan.features.join(', '),
    'metadata[planKey]': plan.key,
  });
}

async function createPrice(plan, productId) {
  return postForm('/v1/prices', {
    product: productId,
    currency: 'usd',
    unit_amount: String(plan.monthlyCents),
    'recurring[interval]': 'month',
    'metadata[planKey]': plan.key,
  });
}

async function findProductByPlanKey(planKey) {
  const query = `metadata['planKey']:'${planKey}' AND active:'true'`;
  const response = await getJson(`/v1/products/search?query=${encodeURIComponent(query)}`);
  return response.data?.[0];
}

async function findPriceByPlanKey(productId, planKey) {
  const query = `product:'${productId}' AND metadata['planKey']:'${planKey}' AND active:'true'`;
  const response = await getJson(`/v1/prices/search?query=${encodeURIComponent(query)}`);
  return response.data?.[0];
}

async function postForm(path, fields) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields),
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`Stripe ${path} failed (${response.status}): ${formatStripeError(body)}`);
    process.exit(1);
  }

  return body;
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 400 && /search/i.test(path) && /not allowed/i.test(JSON.stringify(body))) {
      return { data: [] };
    }

    console.error(`Stripe GET ${path} failed (${response.status}): ${formatStripeError(body)}`);
    process.exit(1);
  }

  return body;
}

function formatStripeError(body) {
  const error = body?.error;

  if (!error || typeof error !== 'object') {
    return 'request failed';
  }

  const fields = [
    error.code ? `code=${error.code}` : undefined,
    error.type ? `type=${error.type}` : undefined,
    error.doc_url ? `doc=${error.doc_url}` : undefined,
  ].filter(Boolean);

  return fields.length > 0 ? fields.join(' ') : 'request failed';
}

function parsePlansFromSource(source) {
  const plans = [];
  const planRegex = /\{\s*key:\s*'(free|pro|team|enterprise)',\s*name:\s*'([^']+)',\s*monthlyCents:\s*(\d+),\s*stripeProductEnv:\s*'([^']+)',\s*stripePriceEnv:\s*'([^']+)',[\s\S]*?features:\s*\[([^\]]+)\]/g;
  let match;

  while ((match = planRegex.exec(source)) !== null) {
    plans.push({
      key: match[1],
      name: match[2],
      monthlyCents: Number(match[3]),
      stripeProductEnv: match[4],
      stripePriceEnv: match[5],
      features: match[6].split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean),
    });
  }

  return plans;
}
