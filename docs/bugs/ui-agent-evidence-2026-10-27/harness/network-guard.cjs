// Load BEFORE importing the application server. No external fetch is allowed.
const original = globalThis.fetch;
const allowed = process.env.SYNTHETIC_API_ORIGIN || 'http://127.0.0.1:8199';
globalThis.fetch = (input, init) => {
  const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (u.origin !== allowed) return Promise.reject(new Error('Synthetic harness blocked server fetch ' + u.origin));
  return original(input, init);
};
