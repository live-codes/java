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
  // Generic stack-trace deobfuscator. It reads the debug info a generated module carries *embedded*
  // (the fork always emits it — `WasmDebugInfoLocation.EMBEDDED` in Compiler.java), so the same 40 KB
  // module serves every app. Without it `Throwable.getStackTrace()` returns TeaVM's stand-in frames
  // (`Throwable$FakeClass.fakeMethod`); with it enabled but no module to load, the frames come back
  // with null names and crash user code that reads them.
  'compiler.wasm-deobfuscator.wasm': '93ea5fb6b84e32946bfe682178f1fa28972c3486f543a16bd0dbc3e4fba8160d',
};

// The javac SDK archive is NOT taken from the fork's dist: its StdlibConverter leaks
// TeaVM internals into the archive (methods keep their internal `@Rename`d names, so
// `getClass()` does not resolve; InnerClasses entries keep their pre-rename owners, so
// `Map.Entry` does not resolve; some members are emitted twice, so `sb.append(obj)` is
// ambiguous; some JDK `default` methods come out abstract, so `implements CharSequence` fails;
// and `java.lang.annotation.Annotation` is emitted extending itself, so annotations do not
// compile). assets/ holds an archive built from the same commit with
// patches/StdlibConverter.java applied — see patches/README.md to reproduce them.
const SDK = 'compile-classlib-teavm.bin';
const SDK_SHA256 = 'e3a88fd20c229017ac3e98694cce31df85efd2561782a66e8f58ee4891708d29';
// The runtime class library is rebuilt rather than downloaded too, because it carries the added
// classlib API (`String.lines()`, `Matcher.results()`). patches/ArchiveBuilder.java had to be fixed
// first: it named entries with the OS separator, so a build on Windows produced an archive TeaVM
// could not read a single class out of, and every program failed to generate.
const RUNTIME = 'runtime-classlib-teavm.bin';
const RUNTIME_SHA256 = '4aba09507dcf2f7ff6452334c4d7a3b82e9adec30550ba09926c057b082f7b9e';

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

for (const [name, expected] of [[SDK, SDK_SHA256], [RUNTIME, RUNTIME_SHA256]]) {
  const buf = await readFile(join(assetsDir, name));
  const sha = sha256(buf);
  if (sha !== expected) {
    console.error(`${name}: checksum mismatch\n  expected ${expected}\n  actual   ${sha}`);
    failed = true;
    continue;
  }
  await copyFile(join(assetsDir, name), join(outDir, name));
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB (from assets/, built with the fork's patches)`);
}

if (failed) process.exit(1);

console.log(`vendor/teavm ready (teavm-javac ${REPO}@${COMMIT.slice(0, 7)}, TeaVM ${TEAVM_VERSION})`);
