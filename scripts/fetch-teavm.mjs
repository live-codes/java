import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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
// One source of truth for the pins: patches/manifest.json (see UPGRADING.md).
const MANIFEST = JSON.parse(readFileSync(new URL('../patches/manifest.json', import.meta.url), 'utf8'));
const REPO = MANIFEST.teavm.repo;
const COMMIT = MANIFEST.teavm.commit;
const TEAVM_VERSION = MANIFEST.teavm.teaVMVersion;

// sha256 of each artifact as committed in assets/. They live in patches/manifest.json so this script
// and the inventory cannot disagree; these notes say what each artifact carries:
//
//   compiler.wasm              + CompilerResourceSupplier: methods of application classes survive
//                                reflection (upstream keeps only three compiler-internal constructors)
//   compiler.wasm-runtime.js   byte-identical to upstream; rebuilt only to prove reproducibility
//   ...-deobfuscator.wasm      stock artifact of that commit; see FINDINGS.md §2 for why it is required
//   compile-classlib-teavm.bin + the StdlibConverter patch (six SDK-surface bugs)
//   runtime-classlib-teavm.bin + the ArchiveBuilder patch and the vendored classlib classes (§5)
const ARTIFACTS = MANIFEST.artifacts;

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
