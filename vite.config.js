import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

let commitCount = '0';
try {
  commitCount = process.env.COMMIT_COUNT || execSync('git rev-list --count HEAD').toString().trim();
} catch {}

export default defineConfig({
  plugins: [react()],
  define: { __COMMIT_COUNT__: JSON.stringify(commitCount) },
});
