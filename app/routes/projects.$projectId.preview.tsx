import { redirect, type LoaderFunctionArgs } from 'react-router';

/*
 * `/projects/:projectId/preview` — dernière brochure de la même famille.
 *
 * Elle rendait `createProjectPreviewSurfacePage(params.projectId)` : une page
 * MARKETING intitulée « Project Preview », décrivant « Preview route for project
 * {projectId}, focused on visual QA, runtime readiness and shareable review ».
 * Pour n'importe quelle chaîne, publiquement, en HTTP 200 — et sans rien
 * prévisualiser du tout.
 *
 * L'aperçu existe pour de vrai : c'est un panneau de l'éditeur
 * (`panel-registry.ts`), atteint par `?panel=preview`. La route mène donc
 * désormais là où l'aperçu se trouve, au lieu d'en décrire un imaginaire.
 * L'existence du projet et l'authentification sont décidées par la vraie page.
 *
 * Le fichier reste pour que le motif `/projects/:id/preview` de
 * `ecode-route-coverage.spec.ts` et de `ecodeCompatibilityRoutePatterns` garde
 * un module de route.
 */
export function loader({ params }: LoaderFunctionArgs) {
  return redirect(`/projects/${encodeURIComponent(params.projectId ?? '')}/ide?panel=preview`, 301);
}

export default function ProjectPreviewCompatRoute() {
  // Unreachable: the loader always redirects.
  return null;
}
