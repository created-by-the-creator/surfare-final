import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import tailwindConfig from '../frontend/tailwind.config.js';
import { manifest } from './manifest.js';
const directory = fileURLToPath(new URL('.', import.meta.url));
const frontendRequire = createRequire(new URL('../frontend/package.json', import.meta.url));
export default defineConfig({
  root: directory, base: './', publicDir: '../frontend/public',
  resolve: { alias: {
    react: dirname(frontendRequire.resolve('react/package.json')),
    'react-dom': dirname(frontendRequire.resolve('react-dom/package.json')),
    'lucide-react': dirname(frontendRequire.resolve('lucide-react/package.json')),
  } },
  css: { postcss: { plugins: [frontendRequire('tailwindcss')({ ...tailwindConfig,
    content: [fileURLToPath(new URL('../frontend/src/**/*.{js,jsx}', import.meta.url)), `${directory}src/**/*.{js,jsx}`],
  }), frontendRequire('autoprefixer')()] } },
  plugins: [react(), { name: 'extension-manifest', async closeBundle() {
    await writeFile(new URL('./dist/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
  } }],
  build: {
    outDir: 'dist', emptyOutDir: true,
    rollupOptions: {
      input: { sidepanel: fileURLToPath(new URL('./sidepanel.html', import.meta.url)), background: fileURLToPath(new URL('./background.js', import.meta.url)) },
      preserveEntrySignatures: 'strict',
      output: { entryFileNames: chunk => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
});
