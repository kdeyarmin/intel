import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Self-contained vitest config (kept separate from vite.config.js so the build
// config is untouched). Provides the '@' alias and the React plugin so component
// tests can import app components. Most tests run in the default 'node'
// environment; component tests opt into jsdom via a `// @vitest-environment jsdom`
// docblock at the top of the file.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    setupFiles: ['./tests/setup.js'],
  },
});
