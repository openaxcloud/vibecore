import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  /*
   * Vite copies `public/**` into outDir on build by default. Both this config
   * and its sibling emit into `build/electron`, so BOTH were copying the whole
   * public tree there at the same time — on Windows the second writer hit
   * `EBUSY: resource busy or locked, copyfile ... build\electron\gallery-apps\...`
   * because the file was still open (POSIX just lets the race pass silently).
   *
   * Nothing under build/electron consumes those assets: the renderer build
   * (react-router, vite-electron.config.js) already ships them in build/client,
   * which is what electron-builder packages. So the copy is pure duplication —
   * disabling it removes the race AND a large redundant payload.
   */
  publicDir: false,
  build: {
    lib: {
      entry: resolve('electron/main/index.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vite',
        'electron',
        ...[
          'electron-log',

          // electron-log uses fs internally
          'fs',
          'util',
        ],

        // Add all Node.js built-in modules as external
        'node:fs',
        'node:path',
        'node:url',
        'node:util',
        'node:stream',
        'node:events',
        'electron-store',
        '@react-router/node',
        'react-router',

        // "mime", // NOTE: don't enable. not working if it's external.
        'electron-updater',
      ],
      output: {
        dir: 'build/electron',
        entryFileNames: 'main/[name].mjs',
        format: 'esm',
      },
    },
    minify: false,
    emptyOutDir: false,
  },
});
