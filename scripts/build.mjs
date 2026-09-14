import { build } from 'esbuild';
import { cp, mkdir, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const vendorTeavm = root + 'vendor/teavm/';
try {
  await access(vendorTeavm + 'compiler.wasm');
} catch {
  throw new Error('vendor/teavm missing — run `npm run vendor:teavm` first');
}

await mkdir(root + 'dist', { recursive: true });

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2018',
  minify: true,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: [root + 'src/index.ts'],
  globalName: 'BrowserJvm',
  outfile: root + 'dist/browser-jvm.iife.js',
});

await build({
  ...common,
  entryPoints: [root + 'src/worker-teavm.ts'],
  outfile: root + 'dist/worker-teavm.js',
});

await build({
  ...common,
  entryPoints: [root + 'src/worker-doppio.ts'],
  outfile: root + 'dist/worker-doppio.js',
});

await cp(vendorTeavm, root + 'dist/teavm/', { recursive: true });

console.log('build complete → dist/');
