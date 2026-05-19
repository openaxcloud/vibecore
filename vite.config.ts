import { cloudflareDevProxyVitePlugin as remixCloudflareDevProxy, vitePlugin as remixVitePlugin } from '@remix-run/dev';
import * as dotenv from 'dotenv';
import UnoCSS from 'unocss/vite';
import { defineConfig, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';

// Load environment variables from multiple files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

export default defineConfig((config) => {
  const devHost = process.env.VITE_DEV_HOST;
  const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);
  const strictDevPort = process.env.VITE_STRICT_PORT === 'true';
  const nodeEnv = config.mode === 'production' ? 'production' : 'development';

  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? nodeEnv),
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: strictDevPort,
    },
    build: {
      target: 'esnext',
      chunkSizeWarningLimit: 2400,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'EMPTY_BUNDLE' || warning.message.includes('Generated an empty chunk')) {
            return;
          }

          warn(warning);
        },
        output: {
          format: 'esm',
          manualChunks(id) {
            if (!id.includes('/node_modules/')) {
              return undefined;
            }

            if (id.includes('/monaco-editor/')) {
              if (id.includes('/esm/vs/language/typescript/') || id.includes('/esm/vs/basic-languages/typescript/')) {
                return 'vendor-monaco-typescript';
              }

              if (id.includes('/esm/vs/language/css/') || id.includes('/esm/vs/basic-languages/css/')) {
                return 'vendor-monaco-css';
              }

              if (id.includes('/esm/vs/language/html/') || id.includes('/esm/vs/basic-languages/html/')) {
                return 'vendor-monaco-html';
              }

              if (id.includes('/esm/vs/language/json/') || id.includes('/esm/vs/basic-languages/json/')) {
                return 'vendor-monaco-json';
              }

              return 'vendor-monaco-core';
            }

            if (id.includes('/@codemirror/') || id.includes('/@lezer/')) {
              /*
               * Splitting CodeMirror core from its language packs produced a
               * circular chunk (lang-* re-imports core helpers that re-import
               * lang-*), which triggered "Cannot access 'dt' before
               * initialization" at runtime and left the page on a blank
               * shell. Keep CodeMirror + Lezer in a single chunk so module
               * initialization is deterministic.
               */
              return 'vendor-codemirror';
            }

            if (id.includes('/@xterm/')) {
              return 'vendor-terminal';
            }

            if (id.includes('/html2canvas/')) {
              return 'vendor-export-canvas';
            }

            if (id.includes('/jspdf/')) {
              return 'vendor-export-pdf';
            }

            if (id.includes('/jszip/')) {
              return 'vendor-export-zip';
            }

            if (id.includes('/@radix-ui/')) {
              return 'vendor-radix';
            }

            if (id.includes('/lucide-react/')) {
              return 'vendor-icons';
            }

            /*
             * React and react-dom share __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
             * across module boundaries, so splitting them into separate chunks
             * leaves react-dom in its TDZ ("Cannot read properties of undefined
             * (reading '__SECRET_INTERNALS_...')") whenever the bundler picks the
             * react-dom entrypoint first. Keep both in one chunk so the runtime
             * sees React initialized before react-dom imports it.
             */
            if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }

            if (id.includes('/@remix-run/')) {
              return 'vendor-remix';
            }

            return undefined;
          },
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom/client'],
      esbuildOptions: {
        define: {
          global: 'globalThis',
        },
      },
    },
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        buffer: 'vite-plugin-node-polyfills/polyfills/buffer',
      },
    },
    plugins: [
      nodePolyfills({
        include: ['buffer', 'process', 'util', 'stream'],
        globals: {
          Buffer: true,
          process: true,
          global: true,
        },
        protocolImports: true,
        exclude: ['child_process', 'fs', 'path'],
      }),
      suppressUnoCssLabeledVariantWarning(),
      {
        name: 'buffer-polyfill',
        transform(code, id) {
          if (id.includes('env.mjs')) {
            return {
              code: `import { Buffer } from 'buffer';\n${code}`,
              map: null,
            };
          }

          return null;
        },
      },
      config.mode !== 'test' && remixCloudflareDevProxy(),

      /*
       * The Remix Vite plugin injects a HMR preamble that errors out under
       * jsdom-environment vitest specs (no Remix runtime in scope). Keep it
       * out of `mode === 'test'` so component specs can render React; the
       * production / dev build still installs it the normal way.
       */
      config.mode !== 'test' &&
        remixVitePlugin({
          /*
           * Co-located component / route specs (`Foo.spec.ts`,
           * `Foo.spec.tsx`) live next to the modules they test, including
           * inside `app/routes/`. Remix's default route discovery would
           * import them as SSR route modules and explode the moment the
           * file imports `vitest`. Exclude every spec file from the route
           * manifest so the dev server only ever loads real routes.
           */
          ignoredRouteFiles: ['**/*.spec.ts', '**/*.spec.tsx'],
          future: {
            v3_fetcherPersist: true,
            v3_relativeSplatPath: true,
            v3_throwAbortReason: true,
            v3_lazyRouteDiscovery: true,
            v3_singleFetch: true,
          },
        }),
      UnoCSS(),
      tsconfigPaths(),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
    ],
    envPrefix: [
      'VITE_',
      'OPENAI_LIKE_API_BASE_URL',
      'OPENAI_LIKE_API_MODELS',
      'OLLAMA_API_BASE_URL',
      'LMSTUDIO_API_BASE_URL',
      'TOGETHER_API_BASE_URL',
      'RUNTIME_MODE',
      'RUNTIME_API_BASE_URL',
    ],
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
    test: {
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.claude/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/tests/preview/**', // Exclude preview tests that require Playwright
        '**/tests/e2e/**',

        // service workspaces have their own vitest configs (node env, fastify, etc.)
        'services/preview-proxy/**',
      ],
    },
  };
});

function chrome129IssuePlugin() {
  return {
    name: 'chrome129IssuePlugin',
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const raw = req.headers['user-agent']?.match(/Chrom(e|ium)\/([0-9]+)\./);

        if (raw) {
          const version = parseInt(raw[2], 10);

          if (version === 129) {
            res.setHeader('content-type', 'text/html');
            res.end(
              '<body><h1>Please use Chrome Canary for testing.</h1><p>Chrome 129 has an issue with JavaScript modules & Vite local development, see <a href="https://github.com/stackblitz/bolt.new/issues/86#issuecomment-2395519258">for more information.</a></p><p><b>Note:</b> This only impacts <u>local development</u>. `pnpm run build` and `pnpm run start` will work fine in this browser.</p></body>',
            );

            return;
          }
        }

        next();
      });
    },
  };
}

function suppressUnoCssLabeledVariantWarning() {
  return {
    name: 'suppress-unocss-labeled-variant-warning',
    configResolved() {
      const originalWarn = console.warn;

      console.warn = (...args: unknown[]) => {
        const message = args.map((arg) => String(arg)).join(' ');

        if (message.includes('[unocss] The labeled variant is experimental')) {
          return;
        }

        originalWarn(...args);
      };
    },
  };
}
