// Imported only into the owned recipe web child, never into application builds.
const originalFetch = globalThis.fetch.bind(globalThis);

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);

  if (url.origin !== 'http://127.0.0.1:3001' || url.username || url.password) {
    throw new Error('Recipe SSR fetch outside its local API is disabled');
  }

  // The normal enterprise API client otherwise uses platform fetch redirects.
  return originalFetch(input, { ...init, redirect: 'error' });
};
