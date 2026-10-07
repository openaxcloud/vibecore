import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

/** Interim scaffold while the real application lands (replaced in this branch before merge). */
export const incidentPostmortemExplainerFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    JSON.stringify({ name: 'incident-postmortem-explainer-demo', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' }, devDependencies: { vite: '8.1.4' } }, null, 2) + '\n',
  ),
  file(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>incident-postmortem-explainer</title></head><body><main data-gallery-app-id="incident-postmortem-explainer"><h1 onClick="">incident-postmortem-explainer</h1></main></body></html>\n',
  ),
]);
