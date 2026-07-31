import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // tsconfig sets jsx: 'preserve' for Next's own compiler, which leaves esbuild
  // unwilling to transform .tsx here. Overriding it is enough to run component
  // tests without pulling in a React plugin that wants a different Vite major
  // than the one Vitest ships with.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    // Node by default; the component suites opt into jsdom with a
    // `@vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
