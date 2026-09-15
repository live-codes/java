import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { patchSdkArchive } from './patch-sdk.mjs';

// TeaVM WasmGC compiler artifacts built by our teavm-javac fork (Apache-2.0;
// the bundled javac comes from OpenJDK, GPLv2 + Classpath Exception).
//
// compiler.wasm bundles OpenJDK javac + the TeaVM compiler. Our fork adds
// System.in support (teavmConsole.readStdin), a wider runtime classlib, and a
// WasmGC/JS compiler backend. teavm.org has no CORS headers, so we vendor a
// pinned copy and serve it from the package instead.
const REPO = 'Vsprocessing/teavm-javac';
const COMMIT = 'd1514ab06d3690b0bc227b70fd2a7ff196b3b0a6';
const TEAVM_VERSION = '0.14.1';
const BASE = `https://raw.githubusercontent.com/${REPO}/${COMMIT}/dist/teavm-javac/`;

// sha256 of each artifact at COMMIT — bump together with COMMIT.
const CHECKSUMS = {
  'compiler.wasm': 'ea83c69d8efd0a599cf03ea2075ca2769588467de01346a7129accf3c63c674e',
  'compiler.wasm-runtime.js': '4709a64b0b979090bb14999720576d614f13127932109ea3c9638154c04887cc',
  'compile-classlib-teavm.bin': 'ed29aa32e0aae831423a756b2e321a7f8326f81da747d7a87ec4763a9a24d6d9',
  'runtime-classlib-teavm.bin': 'e952dca904d368daf606f345264b2ce0d4e2173d1e35c96f1617a1df8b917fe5',
};

const files = [
  'compiler.wasm',
  'compiler.wasm-runtime.js',
  'compile-classlib-teavm.bin',
  'runtime-classlib-teavm.bin',
];

const outDir = join(fileURLToPath(new URL('..', import.meta.url)), 'vendor', 'teavm');
await mkdir(outDir, { recursive: true });

let failed = false;
for (const name of files) {
  const res = await fetch(BASE + name);
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  const expected = CHECKSUMS[name];
  if (expected && expected !== sha) {
    console.error(`${name}: checksum mismatch\n  expected ${expected}\n  actual   ${sha}`);
    failed = true;
    continue;
  }
  await writeFile(join(outDir, name), buf);
  console.log(`${name}: ${(buf.length / 1024 / 1024).toFixed(2)} MB${expected ? '' : ` sha256=${sha}`}`);
}

if (failed) process.exit(1);

// The fork's StdlibConverter leaks TeaVM internals into the javac SDK: methods keep their
// internal `@Rename`d names (`getClass0`, so `getClass()` does not resolve) and InnerClasses
// entries keep their pre-rename owners (`Map.Entry` does not resolve). Both are patched into
// the archive here rather than at runtime — see scripts/patch-sdk.mjs for the details.
const sdkPath = join(outDir, 'compile-classlib-teavm.bin');
const patched = patchSdkArchive(gunzipSync(await readFile(sdkPath)));
await writeFile(sdkPath, patched.archive);
console.log(
  `compile-classlib-teavm.bin: patched ${patched.classes} classes ` +
    `(${patched.renames} member renames, ${patched.innerClasses} InnerClasses entries)`
);

console.log(`vendor/teavm ready (teavm-javac ${REPO}@${COMMIT.slice(0, 7)}, TeaVM ${TEAVM_VERSION})`);
