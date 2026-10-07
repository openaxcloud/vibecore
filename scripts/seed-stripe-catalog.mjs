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
  console.error('Could not parse creditPlanCatalog from packages/billing/src/index.ts');
  process.exit(2);
}

const results = {};

for (const plan of plans) {
  process.stderr.write(
    `[seed-stripe] ${plan.key} (${plan.name}, monthly=${plan.monthlyCents}c annual=${plan.annualCents}c EUR)\n`,
  );

  const productId = (await findProductByPlanKey(plan.key))?.id ?? (await createProduct(plan)).id;
  results[plan.stripeProductEnv] = productId;

  // Monthly recurring price (every plan, incl. €0 Starter/Enterprise so the
  // catalog is complete and the checkout price-resolution never 404s).
  const monthlyId =
    (await findPriceByPlanKey(productId, plan.key, 'month'))?.id ??
    (await createPrice(plan, productId, 'month', plan.monthlyCents)).id;
  results[plan.stripePriceMonthlyEnv] = monthlyId;

  // Annual recurring price only for the paid self-serve tiers (annualCents > 0).
  if (plan.annualCents > 0) {
    const annualId =
      (await findPriceByPlanKey(productId, plan.key, 'year'))?.id ??
      (await createPrice(plan, productId, 'year', plan.annualCents)).id;
    results[plan.stripePriceAnnualEnv] = annualId;
  }
}

// ---------------------------------------------------------------------------
// Usage-based (PAYG) + add-on catalog — Replit parity, EUR (verified 2026-08-02
// on docs.replit.com, see docs/BILLING_PAYG_DEPLOYMENTS_PLAN.md §8). All values
// 1:1 EUR. 1 credit = €0.01.
// ---------------------------------------------------------------------------

// Two METERED recurring prices (usage_type=metered, aggregate=sum). Overage
// beyond monthly credits is reported against these as whole credits (cents).
for (const [key, env] of [
  ['payg-ai', 'STRIPE_PAYG_AI_PRICE_ID'],
  ['payg-usage', 'STRIPE_PAYG_USAGE_PRICE_ID'],
]) {
  process.stderr.write(`[seed-stripe] ${key} (metered, €0.01/credit EUR)\n`);
  const productId = (await findProductByPlanKey(key))?.id ?? (await createMeteredProduct(key)).id;
  const priceId = (await findMeteredPrice(productId, key))?.id ?? (await createMeteredPrice(productId, key)).id;
  results[env] = priceId;
}

// Credit packs (one-time): pay X → grant Y credits. Prices = what you PAY.
for (const pack of [
  { key: 'pack-100', payCents: 10_000, env: 'STRIPE_CREDIT_PACK_100_PRICE_ID' },
  { key: 'pack-300', payCents: 29_000, env: 'STRIPE_CREDIT_PACK_300_PRICE_ID' },
  { key: 'pack-500', payCents: 48_000, env: 'STRIPE_CREDIT_PACK_500_PRICE_ID' },
  { key: 'pack-1000', payCents: 95_000, env: 'STRIPE_CREDIT_PACK_1000_PRICE_ID' },
]) {
  process.stderr.write(`[seed-stripe] ${pack.key} (one-time €${pack.payCents / 100} EUR)\n`);
  const productId = (await findProductByPlanKey(pack.key))?.id ?? (await createSimpleProduct(pack.key)).id;
  const priceId =
    (await findOneTimePrice(productId, pack.key))?.id ?? (await createOneTimePrice(productId, pack.key, pack.payCents)).id;
  results[pack.env] = priceId;
}

// Reserved VM (recurring flat monthly subscription add-on, Avi decision a).
for (const vm of [
  { key: 'reserved-shared-0.5', cents: 2_000, env: 'STRIPE_RESERVED_VM_SHARED_HALF_PRICE_ID' },
  { key: 'reserved-dedicated-1', cents: 4_000, env: 'STRIPE_RESERVED_VM_DEDICATED_1_PRICE_ID' },
  { key: 'reserved-dedicated-2', cents: 8_000, env: 'STRIPE_RESERVED_VM_DEDICATED_2_PRICE_ID' },
  { key: 'reserved-dedicated-4', cents: 16_000, env: 'STRIPE_RESERVED_VM_DEDICATED_4_PRICE_ID' },
]) {
  process.stderr.write(`[seed-stripe] ${vm.key} (recurring €${vm.cents / 100}/mo EUR)\n`);
  const productId = (await findProductByPlanKey(vm.key))?.id ?? (await createSimpleProduct(vm.key)).id;
  const priceId =
    (await findFlatRecurringPrice(productId, vm.key))?.id ?? (await createFlatRecurringPrice(productId, vm.key, vm.cents)).id;
  results[vm.env] = priceId;
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
    description: `VibeCore ${plan.name} plan`,
    'metadata[planKey]': plan.key,
  });
}

async function createPrice(plan, productId, interval, amountCents) {
  return postForm('/v1/prices', {
    product: productId,
    currency: 'eur',
    unit_amount: String(amountCents),
    'recurring[interval]': interval,
    'metadata[planKey]': plan.key,
    'metadata[interval]': interval,
  });
}

async function findProductByPlanKey(planKey) {
  const query = `metadata['planKey']:'${planKey}' AND active:'true'`;
  const response = await getJson(`/v1/products/search?query=${encodeURIComponent(query)}`);
  return response.data?.[0];
}

// --- PAYG / add-on helpers (metered, one-time, flat-recurring) --------------

async function createSimpleProduct(key) {
  return postForm('/v1/products', { name: `VibeCore ${key}`, description: `VibeCore ${key}`, 'metadata[planKey]': key });
}
const createMeteredProduct = createSimpleProduct;

async function findPriceByShape(productId, key, shape) {
  const query = `product:'${productId}' AND metadata['shape']:'${shape}' AND active:'true'`;
  const response = await getJson(`/v1/prices/search?query=${encodeURIComponent(query)}`);
  return response.data?.[0];
}
const findMeteredPrice = (productId, key) => findPriceByShape(productId, key, 'metered');
const findOneTimePrice = (productId, key) => findPriceByShape(productId, key, 'one_time');
const findFlatRecurringPrice = (productId, key) => findPriceByShape(productId, key, 'flat_recurring');

// Metered: €0.01 per unit (1 credit = 1 EUR cent), summed over the period.
async function createMeteredPrice(productId, key) {
  return postForm('/v1/prices', {
    product: productId,
    currency: 'eur',
    unit_amount: '1',
    'recurring[interval]': 'month',
    'recurring[usage_type]': 'metered',
    'recurring[aggregate_usage]': 'sum',
    'metadata[planKey]': key,
    'metadata[shape]': 'metered',
  });
}

async function createOneTimePrice(productId, key, amountCents) {
  return postForm('/v1/prices', {
    product: productId,
    currency: 'eur',
    unit_amount: String(amountCents),
    'metadata[planKey]': key,
    'metadata[shape]': 'one_time',
  });
}

async function createFlatRecurringPrice(productId, key, amountCents) {
  return postForm('/v1/prices', {
    product: productId,
    currency: 'eur',
    unit_amount: String(amountCents),
    'recurring[interval]': 'month',
    'metadata[planKey]': key,
    'metadata[shape]': 'flat_recurring',
  });
}

async function findPriceByPlanKey(productId, planKey, interval) {
  const query = `product:'${productId}' AND metadata['planKey']:'${planKey}' AND metadata['interval']:'${interval}' AND active:'true'`;
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
  // Isolate the Replit-parity `creditPlanCatalog` block (Starter/Core/Pro/
  // Enterprise, EUR, monthly + annual). The legacy `billingPlans` array is NOT
  // seeded to Stripe any more — the Plan DB table is the credit catalog.
  const start = source.indexOf('export const creditPlanCatalog');

  if (start === -1) {
    return [];
  }

  const block = source.slice(start, source.indexOf('\n];', start));
  const plans = [];

  // Numbers may use `_` separators (e.g. 24_000). Each credit plan object carries
  // stripePriceMonthlyEnv/stripePriceAnnualEnv, which distinguishes it from the
  // legacy billingPlans shape (stripePriceEnv).
  const planRegex =
    /key:\s*'(starter|core|pro|enterprise)',\s*name:\s*'([^']+)',\s*monthlyCents:\s*([\d_]+),\s*annualCents:\s*([\d_]+),[\s\S]*?stripeProductEnv:\s*'([^']+)',\s*stripePriceMonthlyEnv:\s*'([^']+)',\s*stripePriceAnnualEnv:\s*'([^']+)'/g;
  let match;

  while ((match = planRegex.exec(block)) !== null) {
    plans.push({
      key: match[1],
      name: match[2],
      monthlyCents: Number(match[3].replace(/_/g, '')),
      annualCents: Number(match[4].replace(/_/g, '')),
      stripeProductEnv: match[5],
      stripePriceMonthlyEnv: match[6],
      stripePriceAnnualEnv: match[7],
      features: [],
    });
  }

  return plans;
}
