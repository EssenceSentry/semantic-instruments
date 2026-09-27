import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};
export default defineConfig({
  plugins: [react(), {
    name: 'compressed-matrix-files',
    configureServer(server) {
      // These are gzip-encoded data files, not HTTP-compressed responses. Vite's
      // static middleware otherwise adds Content-Encoding and the browser removes
      // the gzip wrapper before the loader can verify its recorded checksum.
      server.middlewares.use(async (req, res, next) => {
        let pathname: string;
        try { pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
        catch { return next(); }
        if (!pathname.endsWith('.f32.gz')) return next();
        const root = resolve(server.config.publicDir, 'data');
        const file = resolve(server.config.publicDir, '.' + pathname);
        if (!file.startsWith(root + sep)) return next();
        try {
          const info = await stat(file);
          if (!info.isFile()) return next();
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', info.size);
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          if (req.method === 'HEAD') return res.end();
          createReadStream(file).on('error', () => res.destroy()).pipe(res);
        } catch { next(); }
      });
    },
  }],
  server: { headers },
  preview: { headers },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          visualization: ['three'],
          mathTypesetting: ['katex'],
          interface: ['react', 'react-dom'],
          parquet: ['hyparquet', 'hyparquet-compressors'],
        },
      },
    },
  },
});
