/* TeaVM engine — teavm-javac: javac + TeaVM compiler in one WebAssembly module (Apache-2.0). */
import { load } from '/vendor/teavm/compiler.wasm-runtime.js';

const BASE = '/vendor/teavm/';

const origLog = console.log.bind(console);
const origError = console.error.bind(console);

let compiler = null;
let diagnostics = [];
let capturing = false;
let captured = { stdout: '', stderr: '' };

// TeaVM-generated apps write via teavmConsole → console.log/error (dynamic lookup).
console.log = (...args) => {
  if (capturing) captured.stdout += args.join(' ') + '\n';
  else origLog(...args);
};
console.error = (...args) => {
  if (capturing) captured.stderr += args.join(' ') + '\n';
  else origError(...args);
};

async function init() {
  const teavm = await load(BASE + 'compiler.wasm');
  const lib = teavm.exports;
  compiler = lib.createCompiler();
  const sdk = new Int8Array(await (await fetch(BASE + 'compile-classlib-teavm.bin')).arrayBuffer());
  const classlib = new Int8Array(await (await fetch(BASE + 'runtime-classlib-teavm.bin')).arrayBuffer());
  compiler.setSdk(sdk);
  compiler.setTeaVMClasslib(classlib);
  compiler.onDiagnostic((d) => {
    // TeaVMDiagnostic's wasm-backed getters can trap on null; read defensively.
    const safe = (fn) => {
      try {
        const v = fn();
        return typeof v === 'string' || typeof v === 'number' ? v : v == null ? null : String(v);
      } catch {
        return null;
      }
    };
    diagnostics.push({
      type: safe(() => d.type),
      severity: safe(() => d.severity),
      fileName: safe(() => d.fileName),
      lineNumber: safe(() => d.lineNumber),
      message: safe(() => d.message),
    });
  });
}

async function run(source, mainClass) {
  const t0 = performance.now();
  compiler.clearSourceFiles();
  compiler.addSourceFile('Main.java', source);
  diagnostics = [];
  const ok = compiler.compile();
  const compileMs = performance.now() - t0;
  if (!ok) {
    return { ok: false, compileMs, exitCode: 1, stdout: '', stderr: '', diagnostics: [...diagnostics] };
  }

  // NB: do NOT call clearOutputFiles() here — it wipes the class files javac
  // just produced; generateWebAssembly consumes those as its input.
  const t1 = performance.now();
  const genOk = compiler.generateWebAssembly({ outputName: 'app', mainClass });
  const generateMs = performance.now() - t1;
  if (!genOk) {
    return {
      ok: false,
      compileMs,
      generateMs,
      exitCode: 1,
      stdout: '',
      stderr: '',
      diagnostics: [...diagnostics],
    };
  }
  const bytes = compiler.getWebAssemblyOutputFile('app.wasm');

  const t2 = performance.now();
  capturing = true;
  captured = { stdout: '', stderr: '' };
  try {
    const app = await load(bytes);
    app.exports.main([]);
  } finally {
    capturing = false;
  }
  const runMs = performance.now() - t2;

  return {
    ok: true,
    compileMs,
    generateMs,
    runMs,
    exitCode: 0,
    stdout: captured.stdout,
    stderr: captured.stderr,
    diagnostics: [...diagnostics],
    bytes,
  };
}

self.onmessage = async (e) => {
  const { cmd } = e.data || {};
  if (cmd === 'init') {
    const t0 = performance.now();
    try {
      await init();
      const sdkBytes = 199668 + 2377497 + 4126432; // pinned artifact sizes
      self.postMessage({ type: 'initialized', initMs: performance.now() - t0, bytes: sdkBytes });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (cmd === 'run') {
    try {
      const result = await run(e.data.source, e.data.mainClass || 'Main');
      self.postMessage({ type: 'result', ...result });
    } catch (err) {
      self.postMessage({
        type: 'result',
        ok: false,
        error: String((err && err.message) || err) + '\n' + String((err && err.stack) || ''),
        exitCode: 1,
      });
    }
  }
};
