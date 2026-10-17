// Compile + generate + RUN a corpus program (or a local .java file) in Node — no browser.
//
// The corpus harness only reports success/failure and needs Chrome; this runs the same three
// stages the worker runs and prints the program's stdout/stderr, which is what makes a runtime
// failure bisectable. With --jdk it also runs the same source on the local JDK and diffs the two,
// turning "does it run" into "does it match".
//
//   node scripts/run-program.mjs stringformat
//   node scripts/run-program.mjs --file probe/Main.java --input "hi"
//   node scripts/run-program.mjs stringformat --jdk
//
// Needs a teavm-javac dist (TEAVM_JAVAC_DIST) and a JDK on JAVA_HOME (only for --jdk).

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const compilerDir = process.env.TEAVM_JAVAC_DIST;
if (!compilerDir) {
  console.error('Set TEAVM_JAVAC_DIST to the teavm-javac dist folder (see patches/README.md).');
  process.exit(2);
}

const args = process.argv.slice(2);
const flags = { file: null, input: '', jdk: false, keep: false, trace: false };
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--file') flags.file = args[++i];
  else if (a === '--input') flags.input = args[++i];
  else if (a === '--jdk') flags.jdk = true;
  else if (a === '--keep') flags.keep = true;
  else if (a === '--trace') flags.trace = true;
  else if (a === '--emit') flags.emit = args[++i];
  else positional.push(a);
}

let id = null;
let source;
if (flags.file) {
  source = readFileSync(flags.file, 'utf8');
} else if (positional.length === 1) {
  id = positional[0];
  const corpus = await import(pathToFileURL(join(root, 'corpus', 'programs-all.mjs')).href);
  const programs = [];
  for (const value of Object.values(corpus)) {
    if (Array.isArray(value)) programs.push(...value.filter((p) => p?.id));
    else if (value?.id) programs.push(value);
  }
  const program = programs.find((p) => p.id === id);
  if (!program) {
    console.error(`no such corpus program: ${id}`);
    process.exit(2);
  }
  source = program.source;
} else {
  console.error('Usage: node scripts/run-program.mjs <corpus-id> | --file Main.java  [--input TEXT] [--jdk]');
  process.exit(2);
}

const sdk = new Int8Array(readFileSync(join(root, 'dist', 'teavm', 'compile-classlib-teavm.bin')));
const classlib = new Int8Array(readFileSync(join(root, 'dist', 'teavm', 'runtime-classlib-teavm.bin')));

const runtime = await import(pathToFileURL(join(compilerDir, 'compiler.wasm-runtime.js')).href);
const load = runtime.load ?? runtime.default?.load ?? runtime.default;
const teavm = await load(join(compilerDir, 'compiler.wasm'));
const compiler = teavm.exports.createCompiler();
compiler.setSdk(sdk);
compiler.setTeaVMClasslib(classlib);
const messages = [];
compiler.onDiagnostic((d) => {
  try {
    messages.push(`${d?.severity ?? '?'}: ${d?.message ?? String(d)}`);
  } catch {
    messages.push('(unreadable diagnostic)');
  }
});

const label = id ?? flags.file;
compiler.clearSourceFiles();
compiler.addSourceFile('Main.java', source);
if (!compiler.compile()) {
  console.error(`FAIL javac       ${label}`);
  for (const m of messages) console.error(`                 ${m}`);
  process.exit(1);
}

const generated = compiler.generateWebAssembly({
  outputName: 'app',
  mainClass: 'Main',
  optimizationLevel: 'SIMPLE',
});
if (!generated) {
  console.error(`FAIL generate    ${label}`);
  for (const m of messages) console.error(`                 ${m}`);
  process.exit(1);
}
const bytes = compiler.getWebAssemblyOutputFile('app.wasm');
if (!bytes) {
  console.error(`FAIL no-output   ${label}`);
  process.exit(1);
}

const workDir = mkdtempSync(join(tmpdir(), 'java-wasm-run-'));
const wasmPath = join(workDir, 'app.wasm');
writeFileSync(wasmPath, bytes);
if (flags.emit) writeFileSync(flags.emit, bytes);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Minimal `teavmFile` bridge: enough for instantiation, no real filesystem. */
function installFileImports(imports) {
  const empty = () => framed(new Uint8Array(0));
  const framed = (payload) => {
    const out = new Int8Array(payload.length + 1);
    out.set(payload, 1);
    return out;
  };
  const notSupported = (requestId) => globalThis.__teavmFileComplete?.(requestId, 0);
  imports.teavmFile = {
    setActiveProgram() {},
    errorResult: (error) => {
      const text = encoder.encode(String(error?.message ?? error));
      const out = new Int8Array(text.length + 1);
      out[0] = 1;
      out.set(text, 1);
      return out;
    },
    storeOperationBytes: () => 0,
    operationBytes: (value) => (typeof value === 'number' ? empty() : value),
    operationByteLength: () => 0,
    operationByteAt: () => 0,
    releaseOperationBytes() {},
    open: empty,
    openAsyncStart: notSupported,
    write: empty,
    writeSync: () => 0,
    close: empty,
    closeSync: () => 0,
    loadImageAsyncStart: notSupported,
    loadFontAsyncStart: notSupported,
  };
}

const stdin = encoder.encode(flags.input ?? '');
let stdinIndex = 0;
let stdout = '';
let stderr = '';
const app = await load(wasmPath, {
  installImports(imports) {
    const consoleImports = (imports.teavmConsole ??= {});
    consoleImports.readStdin = () => (stdinIndex < stdin.length ? stdin[stdinIndex++] : -1);
    consoleImports.putcharStdout = (code) => {
      stdout += String.fromCharCode(code & 0xffff);
    };
    consoleImports.putcharStderr = (code) => {
      stderr += String.fromCharCode(code & 0xffff);
    };
    globalThis.__teavmFileComplete = (requestId, resultId) => {
      const target = app?.instance?.exports ?? app?.exports;
      const complete = target?.['teavm_file_open_complete'];
      if (typeof complete === 'function') complete(requestId | 0, resultId | 0);
    };
    installFileImports(imports);
  },
});

const exportsMain = app.exports?.main;
if (typeof exportsMain !== 'function') {
  console.error(`FAIL no-main     ${label}: generated module did not export main()`);
  process.exit(1);
}
const isStopped = () => {
  const fn = app.instance?.exports?.['teavm_stopped'];
  return typeof fn === 'function' ? Boolean(fn()) : false;
};

let finished = false;
let trap = null;
const t0 = performance.now();
try {
  exportsMain([], () => {
    finished = true;
  });
  while (!finished && !isStopped()) {
    if (performance.now() - t0 > 30_000) throw new Error('program did not finish within 30000 ms');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
} catch (error) {
  trap = flags.trace ? String(error?.stack ?? error) : String(error?.message ?? error);
}
const runMs = performance.now() - t0;

let jdkOut = null;
if (flags.jdk) {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome) {
    console.error('--jdk needs JAVA_HOME set to a JDK 25 install');
    process.exit(2);
  }
  const srcDir = join(workDir, 'src');
  writeFileSync2(srcDir);
  try {
    execFileSync(join(javaHome, 'bin', 'javac'), ['-d', srcDir, join(srcDir, 'Main.java')], { stdio: 'pipe' });
    jdkOut = execFileSync(join(javaHome, 'bin', 'java'), ['-cp', srcDir, 'Main'], {
      input: flags.input ?? '',
      encoding: 'utf8',
    });
  } catch (error) {
    jdkOut = `(JDK run failed: ${error?.message ?? error})`;
  }
}

function writeFileSync2(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'Main.java'), source);
}

const status = trap ? 'TRAP' : 'ok';
console.log(`${status} ${label} (${bytes.length} bytes, run ${runMs.toFixed(0)} ms)`);
console.log(`--- stdout ---\n${stdout}`);
if (stderr) console.log(`--- stderr ---\n${stderr}`);
if (trap) console.log(`--- error ---\n${trap}`);
if (jdkOut != null) {
  console.log(`--- jdk ---\n${jdkOut}`);
  const normalise = (text) => text.replace(/\r\n/g, '\n');
  console.log(normalise(stdout) === normalise(jdkOut) ? 'MATCH' : 'DIFFERS');
}

if (!flags.keep) rmSync(workDir, { recursive: true, force: true });
