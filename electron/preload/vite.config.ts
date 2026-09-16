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
      entry: resolve('electron/preload/index.ts'),
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron'],
      output: {
        dir: 'build/electron',

        /*
         * preload must be cjs format.
         * if mjs, it will be error:
         *   - Unable to load preload script.
         *   - SyntaxError: Cannot use import statement outside a module.
         */
        entryFileNames: 'preload/[name].cjs',
        format: 'cjs',
      },
    },
    minify: false,
    emptyOutDir: false,
  },
  esbuild: {
    platform: 'node',
  },
});
