import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

/** Interim scaffold while the real application lands (replaced in this branch before merge). */
export const fieldServiceInspectorFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    JSON.stringify({ name: 'field-service-inspector-demo', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' }, devDependencies: { vite: '8.1.4' } }, null, 2) + '\n',
  ),
  file(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>field-service-inspector</title></head><body><main data-gallery-app-id="field-service-inspector"><h1 onClick="">field-service-inspector</h1></main></body></html>\n',
  ),
]);
