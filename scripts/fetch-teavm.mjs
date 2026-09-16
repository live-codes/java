import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

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

// sha256 of each remote artifact at COMMIT — bump together with COMMIT.
const CHECKSUMS = {
  'compiler.wasm': 'ea83c69d8efd0a599cf03ea2075ca2769588467de01346a7129accf3c63c674e',
  'compiler.wasm-runtime.js': '4709a64b0b979090bb14999720576d614f13127932109ea3c9638154c04887cc',
  'runtime-classlib-teavm.bin': 'e952dca904d368daf606f345264b2ce0d4e2173d1e35c96f1617a1df8b917fe5',
};

// The javac SDK archive is NOT taken from the fork's dist: its StdlibConverter leaks
// TeaVM internals into the archive (methods keep their internal `@Rename`d names, so
// `getClass()` does not resolve; InnerClasses entries keep their pre-rename owners, so
// `Map.Entry` does not resolve; some members are emitted twice, so `sb.append(obj)` is
// ambiguous; some JDK `default` methods come out abstract, so `implements CharSequence` fails;
// and `java.lang.annotation.Annotation` is emitted extending itself, so annotations do not
// compile). assets/ holds an archive built from the same commit with
// patches/StdlibConverter.java applied — see patches/README.md to reproduce it.
const SDK = 'compile-classlib-teavm.bin';
const SDK_SHA256 = 'b9fe6db1ff8da715fa807869f54a93106da7e2045fc9f4e961a1a8c17eeccbb9';

const assetsDir = join(fileURLToPath(new URL('..', import.meta.url)), 'assets');
const outDir = join(fileURLToPath(new URL('..', import.meta.url)), 'vendor', 'teavm');
await mkdir(outDir, { recursive: true });

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let failed = false;

for (const name of Object.keys(CHECKSUMS)) {
  const res = await fetch(BASE + name);
  if (!res.ok) {
    console.error(`${name}: HTTP ${res.status}`);
    failed = true;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const sha = sha256(buf);
  if (CHECKSUMS[name] !== sha) {
    console.error(`${name}: checksum mismatch\n  expected ${CHECKSUMS[name]}\n  actual   ${sha}`);
    failed = true;
    continue;
  }
  await writeFile(join(outDir, name), buf);
  console.log(`${name}: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
}

const sdkBuf = await readFile(join(assetsDir, SDK));
const sdkSha = sha256(sdkBuf);
if (sdkSha !== SDK_SHA256) {
  console.error(`${SDK}: checksum mismatch\n  expected ${SDK_SHA256}\n  actual   ${sdkSha}`);
  failed = true;
} else {
  await copyFile(join(assetsDir, SDK), join(outDir, SDK));
  console.log(`${SDK}: ${(sdkBuf.length / 1024).toFixed(0)} KB (from assets/, patched SDK)`);
}

if (failed) process.exit(1);

console.log(`vendor/teavm ready (teavm-javac ${REPO}@${COMMIT.slice(0, 7)}, TeaVM ${TEAVM_VERSION})`);
