/* TeaVM engine — teavm-javac fork: javac + TeaVM AOT in one WebAssembly module (Apache-2.0).
 * The fork's runtime classlib implements System.in via the `teavmConsole` imports,
 * so stdin is a pre-supplied string fed to the program one byte at a time. */
import { load } from '/vendor/teavm/compiler.wasm-runtime.js';

const BASE = '/vendor/teavm/';
const RUN_TIMEOUT_MS = 30_000;

let compiler = null;
let diagnostics = [];

async function init() {
  const teavm = await load(BASE + 'compiler.wasm');
  compiler = teavm.exports.createCompiler();
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

function formatDiagnostics() {
  return diagnostics
    .filter((d) => d.severity === 'error')
    .map((d) => `${d.fileName ? `${d.fileName}${d.lineNumber ? `:${d.lineNumber}` : ''}: ` : ''}${d.message ?? ''}`)
    .join('\n');
}

async function executeProgram(wasm, input) {
  const stdin = new TextEncoder().encode(input ?? '');
  let stdinIndex = 0;
  let stdout = '';
  let stderr = '';

  const app = await load(wasm, {
    installImports(imports) {
      const consoleImports = (imports.teavmConsole ??= {});
      consoleImports.readStdin = () => (stdinIndex < stdin.length ? stdin[stdinIndex++] : -1);
      consoleImports.putcharStdout = (code) => {
        stdout += String.fromCharCode(code & 0xffff);
      };
      consoleImports.putcharStderr = (code) => {
        stderr += String.fromCharCode(code & 0xffff);
      };
    },
  });

  const isStopped = () => {
    const fn = app.instance.exports['teavm_stopped'];
    return typeof fn === 'function' ? Boolean(fn()) : false;
  };

  const t0 = performance.now();
  let finished = false;
  app.exports.main([], () => {
    finished = true;
  });
  while (!finished && !isStopped()) {
    if (performance.now() - t0 > RUN_TIMEOUT_MS) throw new Error(`program did not finish within ${RUN_TIMEOUT_MS} ms`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { stdout, stderr, runMs: performance.now() - t0 };
}

async function run(source, mainClass, input) {
  const t0 = performance.now();
  compiler.clearSourceFiles();
  compiler.addSourceFile('Main.java', source);
  diagnostics = [];
  const ok = compiler.compile();
  const compileMs = performance.now() - t0;
  if (!ok) return { ok: false, compileMs, exitCode: 1, stdout: '', stderr: formatDiagnostics(), diagnostics: [...diagnostics] };

  // NB: do NOT call clearOutputFiles() here — it wipes the class files javac
  // just produced; generateWebAssembly consumes those as its input.
  const t1 = performance.now();
  // SIMPLE is the level the fork's fiber-based runtime supports; ADVANCED
  // generates a module whose completion callback/teavm_stopped never fires.
  const genOk = compiler.generateWebAssembly({ outputName: 'app', mainClass, optimizationLevel: 'SIMPLE' });
  const generateMs = performance.now() - t1;
  if (!genOk) {
    return { ok: false, compileMs, generateMs, exitCode: 1, stdout: '', stderr: formatDiagnostics(), diagnostics: [...diagnostics] };
  }

  const bytes = compiler.getWebAssemblyOutputFile('app.wasm');
  const { stdout, stderr, runMs } = await executeProgram(bytes, input);
  return { ok: true, compileMs, generateMs, runMs, exitCode: 0, stdout, stderr, diagnostics: [...diagnostics] };
}

self.onmessage = async (e) => {
  const { cmd } = e.data || {};
  if (cmd === 'init') {
    const t0 = performance.now();
    try {
      await init();
      self.postMessage({ type: 'initialized', initMs: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (cmd === 'run') {
    try {
      const result = await run(e.data.source, e.data.mainClass || 'Main', e.data.input || '');
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
