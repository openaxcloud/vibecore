/*
 * Known marketing pages have dedicated route modules (for example
 * `marketing.teams.tsx`). This dynamic route is therefore the marketing
 * namespace catch-all and must behave like the localized site-wide 404,
 * rather than serving the retired English static shell with HTTP 200.
 */
export { default, ErrorBoundary, loader, meta } from './$';
