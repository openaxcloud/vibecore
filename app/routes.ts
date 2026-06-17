import { type RouteConfig } from '@react-router/dev/routes';
import { flatRoutes } from '@react-router/fs-routes';

/*
 * Preserve the existing Remix flat-file routing convention (301 files in
 * app/routes/). Co-located component / route specs (`Foo.spec.ts`,
 * `Foo.spec.tsx`) live next to the modules they test, including inside
 * app/routes/. React Router's default route discovery would import them as
 * SSR route modules and explode the moment the file imports `vitest`, so
 * exclude every spec file from the route manifest — this is the RR7
 * equivalent of the former Remix `ignoredRouteFiles`.
 */
export default flatRoutes({
  ignoredRouteFiles: ['**/*.spec.ts', '**/*.spec.tsx'],
}) satisfies RouteConfig;
