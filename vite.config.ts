import { reactRouter } from '@react-router/dev/vite';
import * as dotenv from 'dotenv';
import UnoCSS from 'unocss/vite';
import { defineConfig, normalizePath, type ViteDevServer } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import tsconfigPaths from 'vite-tsconfig-paths';
import { manualChunks } from './build-config/manual-chunks';

// Load environment variables from multiple files
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });
dotenv.config();

const IDE_OPTIMIZE_DEPS = [
  '@ai-sdk/amazon-bedrock',
  '@ai-sdk/anthropic',
  '@ai-sdk/cerebras',
  '@ai-sdk/cohere',
  '@ai-sdk/deepseek',
  '@ai-sdk/fireworks',
  '@ai-sdk/google',
  '@ai-sdk/mistral',
  '@ai-sdk/openai',
  '@babel/parser',
  '@codemirror/autocomplete',
  '@codemirror/commands',
  '@codemirror/lang-javascript',
  '@codemirror/lang-json',
  '@codemirror/lang-markdown',
  '@codemirror/language',
  '@codemirror/search',
  '@codemirror/state',
  '@codemirror/view',
  '@nanostores/react',
  '@noble/hashes/hmac',
  '@noble/hashes/sha256',
  '@octokit/rest',
  '@openrouter/ai-sdk-provider',
  '@radix-ui/react-checkbox',
  '@radix-ui/react-context-menu',
  '@radix-ui/react-dialog',
  '@radix-ui/react-dropdown-menu',
  '@radix-ui/react-label',
  '@radix-ui/react-popover',
  '@radix-ui/react-tooltip',
  '@webcontainer/api',
  'ai',
  'chart.js',
  'chalk',
  'class-variance-authority',
  'date-fns',
  'diff',
  'file-saver',
  'framer-motion',
  'ignore',
  'i18next',
  'isomorphic-git',
  'isomorphic-git/http/web',
  'js-cookie',
  'jszip',
  'lucide-react',
  'mermaid',
  'monaco-editor/esm/vs/editor/editor.api',
  'nanostores',
  'ollama-ai-provider',
  'path-browserify',
  'prettier',
  'react',
  'react-chartjs-2',
  'react-dnd',
  'react-dnd-html5-backend',
  'react-dom',
  'react-dom/client',
  'react-i18next',
  'react-markdown',
  'react-qrcode-logo',
  'react-resizable-panels',
  'react-toastify',
  'react-window',
  'react/jsx-dev-runtime',
  'react/jsx-runtime',
  'react-router',
  'rehype-katex',
  'rehype-raw',
  'rehype-sanitize',
  'remark-gfm',
  'remark-math',
  'remix-utils/client-only',
  'shiki',
  'unist-util-visit',
  'vite-plugin-node-polyfills/shims/buffer',
  'vite-plugin-node-polyfills/shims/global',
  'vite-plugin-node-polyfills/shims/process',
  'zustand',
];

export default defineConfig((config) => {
  const devHost = process.env.VITE_DEV_HOST;
  const devPort = Number(process.env.VITE_DEV_PORT ?? 5173);
  const strictDevPort = process.env.VITE_STRICT_PORT === 'true';
  const nodeEnv = config.mode === 'production' ? 'production' : 'development';
  const optimizeCssModulesEnabled = process.env.VITE_OPTIMIZE_CSS_MODULES === 'true';

  return {
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? nodeEnv),
    },
    server: {
      host: devHost,
      port: devPort,
      strictPort: strictDevPort,
      watch: {
        ignored: [
          '**/.claude/**',
          '**/.playwright-mcp/**',
          '**/.serve-test-dist',
          '**/.serve-test-dist/**',
          '**/.vibecore',
          '**/.vibecore/**',
          '**/.vibecore-project-storage',
          '**/.vibecore-project-storage/**',
          '**/.vibecore-static-deployments',
          '**/.vibecore-static-deployments/**',
          '**/test-results/**',
          '**/tmp/**',
          '**/build/**',
          '**/dist/**',
        ],
      },
    },
    build: {
      target: 'esnext',
      reportCompressedSize: false,
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

          /*
           * Rollup's default splitting produced ~96 chunks for the root route's
           * ~210-module graph — a median chunk of 8 KB, 68 of them under 20 KB.
           * The browser therefore opened ~100 connections before it could
           * hydrate ANY page, and the measured cost was dominated by that
           * contention, not by bytes: the slowest resources on the marketing
           * home weighed 1-11 KB yet took ~9.5 s each. Merging the small ones
           * trades a handful of chunks for far fewer round-trips. See BUG-PERF-LOAD.
           */
          experimentalMinChunkSize: 50_000,
          manualChunks,
        },
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      include: IDE_OPTIMIZE_DEPS,
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
      katexModernFontsPlugin(),
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
      suppressGeneratedWorkspaceWatchEvents(),
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
      /*
       * The React Router Vite plugin injects an HMR preamble that errors out
       * under jsdom-environment vitest specs (no router runtime in scope).
       * Keep it out of `mode === 'test'` so component specs can render React;
       * the production / dev build still installs it the normal way.
       *
       * All the former Remix v3 future flags (fetcherPersist, relativeSplatPath,
       * throwAbortReason, lazyRouteDiscovery, singleFetch) are now defaults in
       * React Router 7. Route discovery / flat-route config + the SSR flag live
       * in react-router.config.ts and app/routes.ts (spec files are excluded
       * from the route manifest there).
       */
      config.mode !== 'test' && reactRouter(),
      UnoCSS(),
      tsconfigPaths({ projects: ['./tsconfig.json'] }),
      chrome129IssuePlugin(),
      config.mode === 'production' && optimizeCssModulesEnabled && optimizeCssModules({ apply: 'build' }),
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
          api: 'modern',
        },
      },
    },
    test: {
      testTimeout: 120_000,
      hookTimeout: 120_000,
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.claude/**',
        '**/cypress/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
        '**/tests/preview/**', // Exclude preview tests that require Playwright
        '**/tests/e2e/**',

        // Every service under services/* has its OWN vitest config (node env,
        // fastify, env that disables real network probes, real-Postgres wiring)
        // and is run separately in CI's "Integration tests" step. Running any of
        // them in this flat root pass executes them WITHOUT that config, so their
        // start-time/health probes make real fetches to per-workspace cluster DNS
        // that can't resolve and block for their full ~45s timeouts — across the
        // suites that turned `pnpm run test` into a ~16-min run that tripped
        // vitest's "Timeout calling onTaskUpdate" and made CI (and deploys) flaky.
        // Excluding all of services/** keeps coverage (the filtered step runs each
        // with its real config) while making this pass fast and deterministic.
        'services/**',
      ],
    },
  };
});

const GENERATED_WORKSPACE_WATCH_EVENTS = new Set(['add', 'addDir', 'change', 'unlink', 'unlinkDir']);

function suppressGeneratedWorkspaceWatchEvents() {
  return {
    name: 'vibecore:suppress-generated-workspace-watch-events',
    configureServer(server: ViteDevServer) {
      const ignoredRoots = [
        'services/api/.vibecore',
        'services/api/.vibecore-project-storage',
        'services/api/.vibecore-static-deployments',
      ].map((relativePath) => normalizePath(`${server.config.root}/${relativePath}`).replace(/\/?$/, '/'));

      const isIgnoredWorkspacePath = (filePath: unknown) => {
        if (typeof filePath !== 'string') {
          return false;
        }

        const absolutePath = normalizePath(filePath.startsWith('/') ? filePath : `${server.config.root}/${filePath}`);

        return ignoredRoots.some((root) => absolutePath === root.slice(0, -1) || absolutePath.startsWith(root));
      };

      const originalEmit = server.watcher.emit.bind(server.watcher);

      server.watcher.emit = ((eventName: string | symbol, ...args: unknown[]) => {
        if (
          typeof eventName === 'string' &&
          GENERATED_WORKSPACE_WATCH_EVENTS.has(eventName) &&
          isIgnoredWorkspacePath(args[0])
        ) {
          return false;
        }

        return originalEmit(eventName, ...args);
      }) as typeof server.watcher.emit;
    },
  };
}

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

function katexModernFontsPlugin() {
  return {
    name: 'katex-modern-fonts',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (!id.includes('/katex/dist/katex.min.css')) {
        return null;
      }

      return {
        code: code.replace(/,url\(fonts\/[^)]+\.(?:woff|ttf)\) format\("(?:woff|truetype)"\)/g, ''),
        map: null,
      };
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
