import { execSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// The build is stamped with the version, commit and NZ build date so players can see which one they have.
function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// The game is served from https://<user>.github.io/FormaGovt/ on GitHub Pages.
export default defineConfig({
  base: '/FormaGovt/',
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_BUILD__: JSON.stringify(`${commit()} · ${new Date().toLocaleDateString('en-CA', { timeZone: 'Pacific/Auckland' })}`),
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
