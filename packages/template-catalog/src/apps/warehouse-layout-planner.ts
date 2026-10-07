import type { GalleryDemoAppFile } from '../types.js';

const file = (path: string, content: string): GalleryDemoAppFile => Object.freeze({ path, content });

/** Interim scaffold while the real application lands (replaced in this branch before merge). */
export const warehouseLayoutPlannerFiles: readonly GalleryDemoAppFile[] = Object.freeze([
  file(
    'package.json',
    JSON.stringify({ name: 'warehouse-layout-planner-demo', private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite --host 0.0.0.0', build: 'vite build' }, devDependencies: { vite: '8.1.4' } }, null, 2) + '\n',
  ),
  file(
    'index.html',
    '<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>warehouse-layout-planner</title></head><body><main data-gallery-app-id="warehouse-layout-planner"><h1 onClick="">warehouse-layout-planner</h1></main></body></html>\n',
  ),
]);
