import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'dist/java-wasm.iife.js',
  'dist/worker-java.js',
  'dist/teavm/compiler.wasm',
  'dist/teavm/compile-classlib-teavm.bin',
  'dist/teavm/runtime-classlib-teavm.bin',
];

let failed = false;
for (const file of required) {
  try {
    const info = await stat(root + file);
    console.log(`ok  ${file} (${(info.size / 1024).toFixed(1)} KB)`);
  } catch {
    console.error(`MISSING ${file} — run \`npm run build\``);
    failed = true;
  }
}

// Parse-check each bundle (syntax validity).
for (const file of ['dist/java-wasm.iife.js', 'dist/worker-java.js']) {
  try {
    const src = await readFile(root + file, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function(src);
    console.log(`ok  parse ${file}`);
  } catch (err) {
    console.error(`PARSE FAIL ${file}: ${err.message}`);
    failed = true;
  }
}

// The worker must embed the runtime glue and the stdin/completion wiring.
const worker = await readFile(root + 'dist/worker-java.js', 'utf8');
for (const [needle, label] of [
  ['putcharStdout', 'embeds the TeaVM runtime glue'],
  ['readStdin', 'wires stdin (teavmConsole.readStdin)'],
  ['teavm_stopped', 'waits on the teavm_stopped completion flag'],
]) {
  if (!worker.includes(needle)) {
    console.error(`worker-java.js is missing ${needle} — expected it to ${label}`);
    failed = true;
  } else {
    console.log(`ok  worker-java.js ${label}`);
  }
}

// The entry bundle must expose the documented global and the worker path.
const entry = await readFile(root + 'dist/java-wasm.iife.js', 'utf8');
for (const [needle, label] of [
  ['JavaWasm', 'exposes the JavaWasm global'],
  ['worker-java.js', 'loads worker-java.js'],
]) {
  if (!entry.includes(needle)) {
    console.error(`java-wasm.iife.js is missing ${needle} — expected it to ${label}`);
    failed = true;
  } else {
    console.log(`ok  java-wasm.iife.js ${label}`);
  }
}

process.exit(failed ? 1 : 0);
