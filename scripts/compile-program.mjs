// Compiles corpus programs with the fork's javac in Node — no browser, no corpus run.
//
// Triage tool: it separates "fails to compile" (an SDK-surface problem, see sdk-check.mjs) from
// "compiles, then fails in the runtime or code generator" (TeaVM), and prints the diagnostics a
// browser harness only shows as a one-line summary.
//
//   node scripts/compile-program.mjs interface-diamond recursive-generics
//   node scripts/compile-program.mjs --all                 # every program, failures only
//
// Needs a teavm-javac dist with a browser-less compiler; set TEAVM_JAVAC_DIST to point at it.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const compilerDir = process.env.TEAVM_JAVAC_DIST;
if (!compilerDir) {
  console.error('Set TEAVM_JAVAC_DIST to the teavm-javac dist folder (see patches/README.md).');
  process.exit(2);
}

const classlib = readFileSync(join(root, 'dist', 'teavm', 'compile-classlib-teavm.bin'));

// The loader fetches its classlibs by URL; Node has no fetch for file://.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return Promise.resolve(new Response(readFileSync(fileURLToPath(url))));
  return realFetch(input, init);
};

const corpus = await import(pathToFileURL(join(root, 'corpus', 'programs-all.mjs')).href);
const programs = [];
for (const value of Object.values(corpus)) {
  if (Array.isArray(value)) programs.push(...value.filter((p) => p?.id));
  else if (value?.id) programs.push(value);
}

const args = process.argv.slice(2);
const wanted = args[0] === '--all'
  ? programs
  : args.map((id) => {
      const program = programs.find((p) => p.id === id);
      if (!program) console.error(`no such program: ${id}`);
      return program;
    }).filter(Boolean);

const { createCompiler } = await import(pathToFileURL(join(compilerDir, 'teavm-javac.js')).href);
const compiler = await createCompiler();
await compiler.setClasslib({ javac: classlib });
const messages = [];
compiler.onDiagnostic((d) => messages.push(d.message ?? String(d)));

let failed = 0;
for (const program of wanted) {
  compiler.clearSources();
  const start = messages.length;
  let ok = false;
  try {
    compiler.addSource('Main.java', program.source);
    ok = await compiler.compile();
  } catch (error) {
    console.log(`\n===== ${program.id}: COMPILER CRASH =====`);
    console.log(error?.stack ?? String(error));
    failed++;
    continue;
  }
  if (ok) {
    if (args[0] !== '--all') console.log(`ok   ${program.id}`);
    continue;
  }
  failed++;
  console.log(`\n===== ${program.id}: COMPILE FAILS =====`);
  for (const message of messages.slice(start)) console.log(message);
}

console.log(`\n${wanted.length - failed}/${wanted.length} compiled`);
process.exit(failed === 0 ? 0 : 1);
