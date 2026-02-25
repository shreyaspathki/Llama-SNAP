import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'src/manifest.json',
          dest: '.',
        },
        {
          src: 'src/assets/*',
          dest: 'assets',
        },
        {
            src: 'src/ui/i18n/*.json',
            dest: 'ui/i18n'
        }
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
        options: resolve(__dirname, 'options.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.js'),
        'content/content-script': resolve(__dirname, 'src/content/content-script.js'),
      },
      output: {
        entryFileNames: (chunk) => {
          // Keep background and content scripts at their expected paths
          if (chunk.name.startsWith('background/') || chunk.name.startsWith('content/')) {
            return `${chunk.name}.js`;
          }
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: 'assets/[name]-[hash].[ext]',
        chunkFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
});
