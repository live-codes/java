import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('..', import.meta.url));

// The SDK archive is a gzip-wrapped stream of (u16 nameLen, name, u32 dataLen, data) records.
function sdkEntry(raw, wanted) {
  let off = 0;
  while (off + 6 <= raw.length) {
    const nameLen = raw.readUInt16BE(off);
    off += 2;
    if (off + nameLen + 4 > raw.length) break;
    const name = raw.toString('utf8', off, off + nameLen);
    off += nameLen;
    const dataLen = raw.readUInt32BE(off);
    off += 4;
    if (off + dataLen > raw.length) break;
    if (name === wanted) return raw.subarray(off, off + dataLen);
    off += dataLen;
  }
  return null;
}

const required = [
  'dist/java-wasm.iife.js',
  'dist/worker-java.js',
  'dist/teavm/compiler.wasm',
  'dist/teavm/compiler.wasm-deobfuscator.wasm',
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
  ['stackDeobfuscator', 'enables real Java stack traces (stack deobfuscator)'],
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

// The javac SDK has to come from the patched StdlibConverter: TeaVM's internal names must not
// leak into the API javac reads, or `getClass()` stops resolving. See patches/README.md.
const sdk = gunzipSync(await readFile(root + 'dist/teavm/compile-classlib-teavm.bin'));
const objectClass = sdkEntry(sdk, 'java/lang/Object.class');
if (!objectClass) {
  console.error('compile-classlib-teavm.bin: java/lang/Object.class is missing');
  failed = true;
} else {
  for (const [needle, want, label] of [
    ['getClass0', false, 'java/lang/Object declares getClass, not getClass0'],
    ['getClass', true, 'java/lang/Object declares getClass'],
  ]) {
    const present = objectClass.includes(Buffer.from(needle));
    if (present === want) {
      console.log(`ok  compile-classlib-teavm.bin ${label}`);
    } else {
      console.error(
        `compile-classlib-teavm.bin: java/lang/Object ${present ? 'has' : 'lacks'} ${needle} — ` +
          `expected it to ${want ? 'have' : 'lack'} it (unpatched SDK? see patches/README.md)`
      );
      failed = true;
    }
  }
}
if (sdk.includes(Buffer.from('java/util/Map$Entry.class'))) {
  console.log('ok  compile-classlib-teavm.bin contains java/util/Map$Entry.class');
} else {
  console.error('compile-classlib-teavm.bin: java/util/Map$Entry.class is missing');
  failed = true;
}

process.exit(failed ? 1 : 0);
