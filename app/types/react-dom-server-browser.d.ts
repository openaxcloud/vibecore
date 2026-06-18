/*
 * `@types/react-dom` only ships `server.d.ts` (the umbrella that declares both
 * the Node and web-streams APIs). The web-streams `renderToReadableStream` is
 * only present at runtime in the `react-dom/server.browser` build, so the
 * entry.server imports that subpath directly — but it has no bundled types.
 * Re-export the umbrella server types for the `.browser` subpath.
 */
declare module 'react-dom/server.browser' {
  export * from 'react-dom/server';
}
