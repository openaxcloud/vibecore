import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root,
  esbuild: { jsx: 'automatic' },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '~': path.join(process.cwd(), 'app'),
      react: path.join(process.cwd(), 'node_modules/react'),
      'react-dom': path.join(process.cwd(), 'node_modules/react-dom'),
    },
  },
  server: { host: '127.0.0.1', port: 20399, strictPort: true, fs: { allow: [root, process.cwd()] } },
});
