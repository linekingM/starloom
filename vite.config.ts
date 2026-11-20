import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLE_FILE === '1';

function stripExternalLinksForSingleFile(): Plugin {
  return {
    name: 'strip-external-links-singlefile',
    transformIndexHtml(html) {
      return html
        .replace(/<link[^>]+rel="manifest"[^>]*>\s*/g, '')
        .replace(
          /<link[^>]+rel="icon"[^>]*>/g,
          '<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 48%22><polygon points=%2224,4 42,24 24,44 6,24%22 fill=%22%23d9b15f%22/></svg>" />'
        );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: isSingleFile ? [stripExternalLinksForSingleFile(), viteSingleFile()] : [],
  build: {
    target: 'es2022',
    assetsInlineLimit: isSingleFile ? 100000000 : 4096,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
