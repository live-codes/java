import { build } from 'esbuild';
import { access, cp, mkdir } from 'node:fs/promises';
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
  // The TeaVM runtime glue lazily imports Node builtins under Node only; keep
  // them external so the browser bundle builds (the branch never runs here).
  external: ['node:*'],
};

await build({
  ...common,
  entryPoints: [root + 'src/index.ts'],
  globalName: 'JavaWasm',
  outfile: root + 'dist/java-wasm.iife.js',
});

await build({
  ...common,
  entryPoints: [root + 'src/worker-java.ts'],
  outfile: root + 'dist/worker-java.js',
});

await cp(vendorTeavm, root + 'dist/teavm/', { recursive: true });

// Hand written, because esbuild emits no declarations; kept in src/ so it is reviewable.
await cp(root + 'src/java-wasm.d.ts', root + 'dist/java-wasm.iife.d.ts');

console.log('build complete → dist/');
