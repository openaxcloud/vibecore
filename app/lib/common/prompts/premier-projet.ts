/**
 * LA CONSIGNE DU PREMIER PROJET — ce que l'agent reçoit quand un visiteur décrit
 * son idée sur « Nouveau projet ».
 *
 * Mesuré en production le 2026-09-30 (BUG-QA0930-PREMIER-PROJET-TOUR-COUPE),
 * trois fois, idée « Une page unique avec un compteur et deux boutons plus et
 * moins » : 6 minutes, 22 fichiers — thème, historique, statistiques,
 * raccourcis clavier, error boundary, squelettes, tests, Dockerfile —,
 * `src/App.tsx` et `src/main.tsx` écrits 16e et 17e, et l'aperçu qui ne démarre
 * pas. La consigne précédente exigeait, sans condition, une finition « Fortune
 * 500 », des graphiques, des métriques dérivées, des états de chargement et des
 * error boundaries partout : pour un compteur, un ordre de sur-construire. Et un
 * tour coupé en route laissait une coquille sans point d'entrée.
 *
 * Trois règles, dans cet ordre :
 *  1. la taille de l'application suit l'IDÉE, pas une barre universelle ;
 *  2. la chaîne de démarrage est écrite EN PREMIER — une coupure laisse une
 *     application qui démarre ;
 *  3. l'aperçu démarre juste après l'installation, jamais derrière des tests.
 *
 * Le bloc est enveloppé dans `<vibecore_project_brief>` : c'est NOTRE texte, pas
 * celui de l'utilisateur. Le fil ne l'affiche pas (`stripInternalAgentScaffolding`)
 * et la décision de lancer des sous-agents ne le compte pas — sans quoi ses
 * propres mots (« responsive », « tests », « production ») suffisaient à lancer
 * trois sous-agents pour un compteur.
 */

export const BALISE_CONSIGNE_PREMIER_PROJET = 'vibecore_project_brief';

export interface CategorieDArtefact {
  label: string;
  framework: string;
  generationHint: string;
}

export const REGLES_PREMIER_PROJET: readonly string[] = [
  'SIZE THE APP TO THE IDEA — the requirements below adapt to what the user asked for; they are never applied as a block.',
  'A SIMPLE IDEA (a counter, a timer, a calculator, a to-do list, a single form or page) gets a small, complete app: package.json, index.html, src/main.tsx, src/App.tsx, one stylesheet and at most a few components. Add nothing the user did not ask for: no theme toggle, history, statistics, charts, keyboard shortcuts, error boundaries, loading skeletons, extra forms, tests, Docker or deployment files.',
  'AN AMBITIOUS IDEA (a dashboard, a SaaS, a multi-screen product with data or several workflows) gets the full quality bar: credible information architecture, realistic domain data, charts or tables where the data calls for them, loading / empty / error / success states, recoverable error states around async surfaces, a complete primary workflow with validation, and tests for that workflow.',
  'WRITE THE STARTABLE CHAIN FIRST, in this exact order: package.json (with a `dev` script), index.html, src/main.tsx, src/App.tsx. Together they must already be a complete, working first version of the idea. Only then write any other file. If your answer is cut short, what you already wrote must start.',
  'START THE PREVIEW RIGHT AFTER INSTALLING: `npm install`, then `npm run dev`. Never chain the dev server behind tests, typecheck or build (no `npm test && npm run dev`).',
  'Use React + Vite + TypeScript unless the artifact requires another framework. Keep dependencies to what the idea needs.',
  'Every visible control works with real React state: no placeholder, no dead button.',
  'Semantic HTML, labels and focus states; a layout that works on phone and desktop.',
  'Finish with a start action so the live preview attaches automatically.',
];

/** La consigne complète du premier projet : notre bloc, puis l'idée de l'utilisateur. */
export function consignePremierProjet(idee: string, categorie: CategorieDArtefact): string {
  const bloc = [
    `<${BALISE_CONSIGNE_PREMIER_PROJET}>`,
    `Artifact type: ${categorie.label}`,
    `Preferred framework: ${categorie.framework}`,
    categorie.generationHint,
    '',
    ...REGLES_PREMIER_PROJET.map((regle) => `- ${regle}`),
    `</${BALISE_CONSIGNE_PREMIER_PROJET}>`,
  ].join('\n');

  return `${bloc}\n\n${idee}`;
}
