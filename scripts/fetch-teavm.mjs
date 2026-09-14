import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// TeaVM playground artifacts, hosted by the teavm-javac project (Apache-2.0).
// teavm.org does not send CORS headers, so the PoC serves a local copy.
const base = 'https://teavm.org/playground/';
const files = [
  'compiler.wasm',
  'compiler.wasm-runtime.js',
  'compile-classlib-teavm.bin',
  'runtime-classlib-teavm.bin',
];

const outDir = join(fileURLToPath(new URL('..', import.meta.url)), 'vendor', 'teavm');
await mkdir(outDir, { recursive: true });

for (const name of files) {
  const res = await fetch(base + name);
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(outDir, name), buf);
  console.log(`${name}: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
}
