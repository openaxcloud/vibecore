import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

/** Interim scaffold while the real application lands (replaced in this branch before merge). */
export const qbrGeneratorFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    JSON.stringify({ name: 'qbr-generator-demo', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' }, devDependencies: { vite: '8.1.4' } }, null, 2) + '\n',
  ),
  file(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>qbr-generator</title></head><body><main data-gallery-app-id="qbr-generator"><h1 onClick="">qbr-generator</h1></main></body></html>\n',
  ),
]);
