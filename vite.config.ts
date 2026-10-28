import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The game is served from https://<user>.github.io/FormaGovt/ on GitHub Pages.
export default defineConfig({
  base: '/FormaGovt/',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
});
