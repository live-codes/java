import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The five TeaVM WasmGC artifacts this package ships, all copied out of `assets/` and
// checksum-verified. Nothing is downloaded: a clone is ready to work offline, and the build is
// reproducible from `patches/` (see FINDINGS.md §6 and patches/README.md).
//
// Provenance: everything derives from Vsprocessing/teavm-javac at the pinned commit below, built on
// Linux with JDK 25 and Binaryen 133 (patches/Dockerfile). The upstream dist for that commit is
// https://raw.githubusercontent.com/Vsprocessing/teavm-javac/<commit>/dist/teavm-javac/ — useful for
// diffing, not for vendoring, because three of the five artifacts carry our changes:
//
//   compiler.wasm              + CompilerResourceSupplier: methods of application classes survive
//                                reflection (upstream keeps only 3 compiler-internal constructors)
//   compiler.wasm-runtime.js   byte-identical to upstream; rebuilt only to prove reproducibility
//   ...-deobfuscator.wasm      stock artifact of that commit
//   compile-classlib-teavm.bin + StdlibConverter patch (see below)
//   runtime-classlib-teavm.bin + ArchiveBuilder patch and the vendored classlib classes (§5)
//
// TeaVM is Apache-2.0; the bundled javac comes from OpenJDK, GPLv2 + Classpath Exception.
const REPO = 'Vsprocessing/teavm-javac';
const COMMIT = 'd1514ab06d3690b0bc227b70fd2a7ff196b3b0a6';
const TEAVM_VERSION = '0.14.1';

// sha256 of each artifact as committed in assets/.
const ARTIFACTS = {
  'compiler.wasm': 'bad2b9856e263d185d09bb377daa85f25a09598da8b2854111e3db5358dc3dc8',
  'compiler.wasm-runtime.js': '4709a64b0b979090bb14999720576d614f13127932109ea3c9638154c04887cc',
  // Generic stack-trace deobfuscator. It reads the debug info a generated module carries *embedded*
  // (the fork always emits it — `WasmDebugInfoLocation.EMBEDDED` in Compiler.java), so the same 40 KB
  // module serves every app. Without it `Throwable.getStackTrace()` returns TeaVM's stand-in frames
  // (`Throwable$FakeClass.fakeMethod`); with it enabled but no module to load, the frames come back
  // with null names and crash user code that reads them.
  'compiler.wasm-deobfuscator.wasm': 'aaa8c0b6fec394dbbf8a5f900a66824e554c7157cc9e8a402f37a4a7df144c73',
  // The javac SDK: StdlibConverter fixes six bugs that otherwise leak TeaVM internals into the API
  // javac reads (`@Rename`d members, InnerClasses, duplicated members, abstract `default`s,
  // self-extending `Annotation`, element-less annotations). patches/StdlibConverter.java.
  'compile-classlib-teavm.bin': '2148f03d1ff554c8114d434cb826d4c4abad9d898df82f9115daa6ac1be16dba',
  // The runtime class library, which additionally carries the vendored classlib classes
  // (`String.lines()`, `Matcher.results()`, …) and the ArchiveBuilder separator fix.
  'runtime-classlib-teavm.bin': 'd5d92ff8235d943f5fd1f83d4f5951ccecdf6677f74d48f50640815c3adae4b3',
};

const assetsDir = join(fileURLToPath(new URL('..', import.meta.url)), 'assets');
const outDir = join(fileURLToPath(new URL('..', import.meta.url)), 'vendor', 'teavm');
await mkdir(outDir, { recursive: true });

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

let failed = false;

for (const [name, expected] of Object.entries(ARTIFACTS)) {
  const buf = await readFile(join(assetsDir, name));
  const sha = sha256(buf);
  if (sha !== expected) {
    console.error(`${name}: checksum mismatch\n  expected ${expected}\n  actual   ${sha}`);
    failed = true;
    continue;
  }
  await copyFile(join(assetsDir, name), join(outDir, name));
  console.log(`${name}: ${(buf.length / 1024).toFixed(0)} KB (from assets/)`);
}

if (failed) process.exit(1);

console.log(`vendor/teavm ready (teavm-javac ${REPO}@${COMMIT.slice(0, 7)}, TeaVM ${TEAVM_VERSION})`);
