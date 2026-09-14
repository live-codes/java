/**
 * TeaVM worker — javac + TeaVM AOT compiler in one wasm module (Apache-2.0).
 * Self-contained classic worker: the runtime glue is bundled at build time
 * (run `npm run vendor:teavm` before building).
 *
 * Protocol:
 *   { cmd: 'init', baseUrl? }            → { type: 'initialized', initMs } | { type: 'init-error', error }
 *   { cmd: 'run', source, mainClass? }   → { type: 'result', ok, compileMs, generateMs, runMs, stdout, stderr, exitCode, diagnostics }
 *
 * baseUrl points at the directory holding compiler.wasm + the two classlib
 * archives (defaults to the worker script's own directory).
 *
 * Known gap: stdin is unsupported (TeaVM classlib cannot compile java.nio for Wasm GC).
 */

import { load } from '../vendor/teavm/compiler.wasm-runtime.js';

const origLog = console.log.bind(console);
const origError = console.error.bind(console);

interface TeaVmCompiler {
  setSdk(data: Int8Array): void;
  setTeaVMClasslib(data: Int8Array): void;
  onDiagnostic(listener: (d: unknown) => void): void;
  clearSourceFiles(): void;
  addSourceFile(path: string, content: string): void;
  compile(): boolean;
  generateWebAssembly(options: { outputName: string; mainClass: string }): boolean;
  getWebAssemblyOutputFile(path: string): Int8Array | null;
}

let compiler: TeaVmCompiler | null = null;
let diagnostics: unknown[] = [];
let capturing = false;
let captured = { stdout: '', stderr: '' };

// TeaVM-generated apps write via teavmConsole → console.log/error (dynamic lookup).
console.log = (...args: unknown[]) => {
  if (capturing) captured.stdout += args.join(' ') + '\n';
  else origLog(...args);
};
console.error = (...args: unknown[]) => {
  if (capturing) captured.stderr += args.join(' ') + '\n';
  else origError(...args);
};

async function init(baseUrl: string) {
  const teavm = await load(baseUrl + 'compiler.wasm');
  compiler = (teavm.exports as { createCompiler(): TeaVmCompiler }).createCompiler();
  const sdk = new Int8Array(await (await fetch(baseUrl + 'compile-classlib-teavm.bin')).arrayBuffer());
  const classlib = new Int8Array(await (await fetch(baseUrl + 'runtime-classlib-teavm.bin')).arrayBuffer());
  compiler.setSdk(sdk);
  compiler.setTeaVMClasslib(classlib);
  compiler.onDiagnostic((d: any) => {
    // TeaVMDiagnostic getters are wasm-backed and can trap on null; read defensively.
    const safe = (fn: () => unknown): string | number | null => {
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

async function run(source: string, mainClass: string) {
  const c = compiler!;
  const t0 = performance.now();
  c.clearSourceFiles();
  c.addSourceFile('Main.java', source);
  diagnostics = [];
  const ok = c.compile();
  const compileMs = performance.now() - t0;
  if (!ok) {
    return { ok: false, compileMs, exitCode: 1, stdout: '', stderr: '', diagnostics: [...diagnostics] };
  }

  // NB: do NOT clearOutputFiles() here — it wipes the class files javac just
  // produced; generateWebAssembly consumes those as its input.
  const t1 = performance.now();
  const genOk = c.generateWebAssembly({ outputName: 'app', mainClass });
  const generateMs = performance.now() - t1;
  if (!genOk) {
    return { ok: false, compileMs, generateMs, exitCode: 1, stdout: '', stderr: '', diagnostics: [...diagnostics] };
  }
  const bytes = c.getWebAssemblyOutputFile('app.wasm');

  const t2 = performance.now();
  capturing = true;
  captured = { stdout: '', stderr: '' };
  try {
    const app = await load(bytes!);
    (app.exports as { main(args: string[]): void }).main([]);
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
  };
}

self.onmessage = async (e: MessageEvent) => {
  const { cmd } = (e.data || {}) as { cmd?: string };
  if (cmd === 'init') {
    const t0 = performance.now();
    try {
      const base =
        (e.data.baseUrl as string) ||
        (() => {
          try {
            return new URL('.', self.location.href).href;
          } catch {
            throw new Error('teavm worker: baseUrl is required when loaded from a blob/data URL');
          }
        })();
      await init(base);
      self.postMessage({ type: 'initialized', initMs: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err as Error)?.message || err) });
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
        error: String((err as Error)?.message || err) + '\n' + String((err as Error)?.stack || ''),
        exitCode: 1,
      });
    }
  }
};
