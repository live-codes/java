// Compile + generate + validate corpus programs in Node — no browser.
//
// Triage tool for failures *past* javac: it runs the same three stages the worker runs
// (compile, generateWebAssembly, getWebAssemblyOutputFile) and then validates the emitted module,
// which is where the code generator is caught producing invalid wasm. That failure is otherwise
// invisible outside a browser: the harness only sees WebAssembly.compile()'s message.
//
//   node scripts/generate-check.mjs exceptions-finally
//   node scripts/generate-check.mjs interface-diamond exceptions-finally
//
// Needs a teavm-javac dist; set TEAVM_JAVAC_DIST to point at it (see patches/README.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
// Default to the engine this package ships (dist/teavm/); override to try another compiler build.
const compilerDir = process.env.TEAVM_JAVAC_DIST ?? join(root, 'dist', 'teavm');
if (!process.argv[2]) {
  console.error('Usage: node scripts/generate-check.mjs <corpus-program-id>...');
  process.exit(2);
}

const sdk = new Int8Array(readFileSync(join(root, 'dist', 'teavm', 'compile-classlib-teavm.bin')));
const classlib = new Int8Array(readFileSync(join(root, 'dist', 'teavm', 'runtime-classlib-teavm.bin')));

const corpus = await import(pathToFileURL(join(root, 'corpus', 'programs-all.mjs')).href);
const programs = [];
for (const value of Object.values(corpus)) {
  if (Array.isArray(value)) programs.push(...value.filter((p) => p?.id));
  else if (value?.id) programs.push(value);
}

const runtime = await import(pathToFileURL(join(compilerDir, 'compiler.wasm-runtime.js')).href);
const load = runtime.load ?? runtime.default?.load ?? runtime.default;
// Outside a browser the glue reads the module off the filesystem, so it wants a plain path.
const teavm = await load(join(compilerDir, 'compiler.wasm'));
const compiler = teavm.exports.createCompiler();
compiler.setSdk(sdk);
compiler.setTeaVMClasslib(classlib);
const messages = [];
compiler.onDiagnostic((d) => {
  try {
    messages.push(d?.message ?? String(d));
  } catch {
    messages.push('(unreadable diagnostic)');
  }
});

let failed = 0;
for (const id of process.argv.slice(2)) {
  const program = programs.find((p) => p.id === id);
  if (!program) {
    console.log(`??   ${id} is not in the corpus`);
    failed++;
    continue;
  }
  compiler.clearSourceFiles();
  const start = messages.length;
  compiler.addSourceFile('Main.java', program.source);
  if (!compiler.compile()) {
    console.log(`FAIL javac       ${id}`);
    for (const m of messages.slice(start).slice(0, 3)) console.log(`                 ${m}`);
    failed++;
    continue;
  }
  const generated = compiler.generateWebAssembly({
    outputName: 'app',
    mainClass: 'Main',
    optimizationLevel: 'SIMPLE',
  });
  if (!generated) {
    console.log(`FAIL generate    ${id}`);
    for (const m of messages.slice(start).slice(0, 3)) console.log(`                 ${m}`);
    failed++;
    continue;
  }
  const bytes = compiler.getWebAssemblyOutputFile('app.wasm');
  if (!bytes) {
    console.log(`FAIL no-output   ${id}`);
    failed++;
    continue;
  }
  try {
    await WebAssembly.compile(bytes);
    console.log(`ok               ${id} (${bytes.length} bytes)`);
  } catch (error) {
    console.log(`FAIL invalid-wasm ${id} (${bytes.length} bytes)`);
    console.log(`                 ${error?.message}`);
    failed++;
  }
}

process.exit(failed === 0 ? 0 : 1);
