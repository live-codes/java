/**
 * Java worker — javac + TeaVM AOT compiler in one wasm module (Apache-2.0).
 * Artifacts come from our teavm-javac fork: WasmGC compiler backend plus a
 * runtime classlib that implements System.in through the `teavmConsole` imports.
 * Self-contained classic worker: the TeaVM runtime glue is bundled at build time
 * (run `npm run vendor:teavm` before building).
 *
 * Protocol:
 *   { cmd: 'init', baseUrl? }                   → { type: 'initialized', initMs } | { type: 'init-error', error }
 *   { cmd: 'run', source, mainClass?, input? }  → { type: 'result', ok, compileMs, generateMs, runMs, stdout, stderr, exitCode, diagnostics }
 *
 * baseUrl points at the directory holding compiler.wasm + the two classlib
 * archives (defaults to the worker script's own directory).
 */

import { load } from '../vendor/teavm/compiler.wasm-runtime.js';

interface TeaVmCompiler {
  setSdk(data: Int8Array): void;
  setTeaVMClasslib(data: Int8Array): void;
  onDiagnostic(listener: (d: unknown) => void): { destroy(): void };
  clearSourceFiles(): void;
  addSourceFile(path: string, content: string): void;
  compile(): boolean;
  detectMainClasses(): string[];
  generateWebAssembly(options: {
    outputName: string;
    mainClass: string;
    optimizationLevel?: string;
    fastGlobalAnalysis?: boolean;
  }): boolean;
  getWebAssemblyOutputFile(path: string): Int8Array | null;
}

interface TeaVmModule {
  exports: Record<string, unknown>;
  instance: { exports: Record<string, unknown> };
  module: WebAssembly.Module;
}

interface TeaVmConsoleImports {
  readStdin?: () => number;
  putcharStdout?: (code: number) => void;
  putcharStderr?: (code: number) => void;
}

interface LoadOptions {
  installImports?(imports: Record<string, unknown> & { teavmConsole?: TeaVmConsoleImports }): void;
}

type TeaVmLoader = (input: Int8Array | string, options?: LoadOptions) => Promise<TeaVmModule>;

const loadModule = load as unknown as TeaVmLoader;

// Wall-clock cap for a single program run, so a runaway/blocked program cannot
// wedge the worker (the runtime has no scheduler we can preempt from here).
const RUN_TIMEOUT_MS = 30_000;

let compiler: TeaVmCompiler | null = null;
let diagnostics: unknown[] = [];

async function init(baseUrl: string) {
  const teavm = await loadModule(baseUrl + 'compiler.wasm');
  compiler = (teavm.exports as unknown as { createCompiler(): TeaVmCompiler }).createCompiler();
  const sdk = new Int8Array(await (await fetch(baseUrl + 'compile-classlib-teavm.bin')).arrayBuffer());
  const classlib = new Int8Array(await (await fetch(baseUrl + 'runtime-classlib-teavm.bin')).arrayBuffer());
  compiler.setSdk(sdk);
  compiler.setTeaVMClasslib(classlib);
  compiler.onDiagnostic((d: unknown) => {
    // TeaVMDiagnostic getters are wasm-backed and can trap on null; read defensively.
    const diag = d as Record<string, unknown>;
    const safe = (key: string): string | number | null => {
      try {
        const v = diag[key];
        return typeof v === 'string' || typeof v === 'number' ? v : v == null ? null : String(v);
      } catch {
        return null;
      }
    };
    diagnostics.push({
      type: safe('type'),
      severity: safe('severity'),
      fileName: safe('fileName'),
      lineNumber: safe('lineNumber'),
      message: safe('message'),
    });
  });
}

/**
 * File API bridge (`teavmFile`).
 *
 * Programs that touch java.io / java.nio import `teavmFile`. Without those imports
 * `WebAssembly.instantiate()` fails outright — the whole module, not just the file call —
 * so an innocuous `new File(...)` used to break every program that mentioned it. The
 * protocol mirrors the fork's own JS wrapper: results are `Int8Array`s framed as
 * `[status, ...bytes]` (0 = ok, 1 = error message), and ids handed back to wasm index a
 * byte store for the async variants.
 *
 * There is no real filesystem, so reads consult an in-memory layer first and fall back to
 * `fetch` (files served next to the page); writes land in that in-memory layer, which makes
 * write-then-read-back work.
 */
const FILE_OPERATION_BYTES = new Map<number, Int8Array>();
const MEMORY_FILES = new Map<string, Uint8Array>();
let fileOperationNextId = 0;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesOf(value: unknown): Uint8Array {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (value instanceof Int8Array) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(0);
}

const decodeBytes = (value: unknown): string => textDecoder.decode(bytesOf(value));

function fileOkResult(bytes?: Uint8Array | null): Int8Array {
  const payload = bytes ?? new Uint8Array(0);
  const out = new Int8Array(payload.length + 1);
  out[0] = 0;
  out.set(payload, 1);
  return out;
}

function fileErrorResult(error: unknown): Int8Array {
  const message = textEncoder.encode(String((error as { message?: string })?.message ?? error));
  const out = new Int8Array(message.length + 1);
  out[0] = 1;
  out.set(message, 1);
  return out;
}

function storeOperationBytes(value: Int8Array): number {
  const id = ++fileOperationNextId;
  FILE_OPERATION_BYTES.set(id, value);
  return id;
}

const getOperationBytes = (id: number): Int8Array =>
  FILE_OPERATION_BYTES.get(id | 0) ?? fileErrorResult(new Error('file operation result was released'));

const statusOk = (): Int8Array => fileOkResult(new Uint8Array(0));

/** The wasm export used to hand an async open result back to the running program. */
function completeFileOpen(requestId: number, resultId: number): void {
  const program = (globalThis as Record<string, unknown>).__teavmActiveProgram as
    | { exports?: Record<string, unknown>; instance?: { exports?: Record<string, unknown> }; wasmProgram?: unknown }
    | null;
  const target = (program?.wasmProgram ?? program) as
    | { exports?: Record<string, unknown>; instance?: { exports?: Record<string, unknown> } }
    | null;
  const complete = target?.exports?.['teavm_file_open_complete'] ?? target?.instance?.exports?.['teavm_file_open_complete'];
  if (typeof complete === 'function') (complete as (a: number, b: number) => void)(requestId | 0, resultId | 0);
}

function installFileImports(imports: Record<string, unknown>): void {
  const api: Record<string, unknown> = {};

  api.setActiveProgram = (program: unknown) => {
    (globalThis as Record<string, unknown>).__teavmActiveProgram = program;
  };
  api.errorResult = (error: unknown) => fileErrorResult(error);
  api.storeOperationBytes = (value: unknown) => storeOperationBytes(bytesOf(value) as Int8Array);
  api.operationBytes = (value: unknown) =>
    typeof value === 'number' ? getOperationBytes(value) : bytesOf(value);
  api.operationByteLength = (id: number) => getOperationBytes(id).length | 0;
  api.operationByteAt = (id: number, index: number) => getOperationBytes(id)[index | 0] | 0;
  api.releaseOperationBytes = (id: number) => {
    FILE_OPERATION_BYTES.delete(id | 0);
  };

  const openSync = (pathBytes: unknown, modeBytes: unknown) => {
    const path = decodeBytes(pathBytes);
    const mode = decodeBytes(modeBytes) || 'read';
    const existing = MEMORY_FILES.get(path);
    if (existing) return fileOkResult(existing);
    if (mode === 'write' || mode === 'append') return fileOkResult(new Uint8Array(0));
    return fileErrorResult(new Error(`File not found: ${path}`));
  };
  api.open = openSync;

  api.openAsyncStart = (requestId: number, pathBytes: unknown, modeBytes: unknown) => {
    const path = decodeBytes(pathBytes);
    const mode = decodeBytes(modeBytes) || 'read';
    const existing = MEMORY_FILES.get(path);
    if (existing || mode === 'write' || mode === 'append') {
      completeFileOpen(requestId, storeOperationBytes(fileOkResult(existing ?? new Uint8Array(0))));
      return;
    }
    fetch(path).then(
      (response) =>
        response.ok
          ? response.arrayBuffer()
          : Promise.reject(new Error(`File not found: ${path}`)),
      () => Promise.reject(new Error(`File not found: ${path}`))
    ).then(
      (buffer) => completeFileOpen(requestId, storeOperationBytes(fileOkResult(new Uint8Array(buffer)))),
      (error) => completeFileOpen(requestId, storeOperationBytes(fileErrorResult(error)))
    );
  };

  api.write = (pathBytes: unknown, data: unknown) => {
    MEMORY_FILES.set(decodeBytes(pathBytes), bytesOf(data));
    return statusOk();
  };
  api.writeSync = (pathBytes: unknown, data: unknown) => {
    MEMORY_FILES.set(decodeBytes(pathBytes), bytesOf(data));
    return storeOperationBytes(statusOk());
  };
  api.close = (pathBytes: unknown, _modeBytes: unknown, data: unknown) => {
    if (data != null) MEMORY_FILES.set(decodeBytes(pathBytes), bytesOf(data));
    return statusOk();
  };
  api.closeSync = (pathBytes: unknown, _modeBytes: unknown, data: unknown) => {
    if (data != null) MEMORY_FILES.set(decodeBytes(pathBytes), bytesOf(data));
    return storeOperationBytes(statusOk());
  };

  // Assets are not supported here; fail the callback rather than the module.
  const assetNotSupported = (requestId: number) => {
    completeFileOpen(requestId, storeOperationBytes(fileErrorResult(new Error('assets are not supported'))));
  };
  api.loadImageAsyncStart = (requestId: number) => assetNotSupported(requestId);
  api.loadFontAsyncStart = (requestId: number) => assetNotSupported(requestId);

  imports.teavmFile = api;
}

/**
 * Loads a generated app wasm and runs it to completion.
 *
 * Programs compile to an async entry point (`main(args, onFinish)` backed by
 * org.teavm.runtime.TeaVMJavacMain / EventQueue), with `teavm_stopped()` as the
 * completion flag — so we wait on the callback *and* the flag. stdin is a
 * pre-supplied string read one byte at a time through `teavmConsole.readStdin`.
 */
async function executeProgram(wasm: Int8Array, input: string) {
  const stdin = new TextEncoder().encode(input ?? '');
  let stdinIndex = 0;
  let stdout = '';
  let stderr = '';

  const app = await loadModule(wasm, {
    installImports(imports) {
      const consoleImports = (imports.teavmConsole ??= {});
      consoleImports.readStdin = () => (stdinIndex < stdin.length ? stdin[stdinIndex++] : -1);
      consoleImports.putcharStdout = (code) => {
        stdout += String.fromCharCode(code & 0xffff);
      };
      consoleImports.putcharStderr = (code) => {
        stderr += String.fromCharCode(code & 0xffff);
      };
      // Programs that touch java.io/java.nio import `teavmFile`; without it, instantiation
      // fails for the whole module.
      installFileImports(imports);
    },
  });

  const exports = app.exports as { main?: (args: string[], onFinish: () => void) => unknown };
  if (typeof exports.main !== 'function') {
    throw new Error('generated program did not export main()');
  }

  const isStopped = () => {
    const fn = app.instance.exports['teavm_stopped'];
    return typeof fn === 'function' ? Boolean((fn as () => boolean)()) : false;
  };

  const t0 = performance.now();
  let finished = false;
  exports.main([], () => {
    finished = true;
  });
  while (!finished && !isStopped()) {
    if (performance.now() - t0 > RUN_TIMEOUT_MS) {
      throw new Error(`program did not finish within ${RUN_TIMEOUT_MS} ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  return { stdout, stderr, runMs: performance.now() - t0 };
}

/** Renders compiler diagnostics as text so failures are visible through `stderr`. */
function formatDiagnostics(): string {
  return diagnostics
    .filter((d) => (d as { severity?: string }).severity === 'error')
    .map((d) => {
      const { fileName, lineNumber, message } = d as { fileName?: string; lineNumber?: number; message?: string };
      const where = fileName ? `${fileName}${lineNumber ? `:${lineNumber}` : ''}: ` : '';
      return `${where}${message ?? ''}`;
    })
    .join('\n');
}

async function run(source: string, mainClass: string, input: string) {
  const c = compiler!;
  const t0 = performance.now();
  c.clearSourceFiles();
  c.addSourceFile('Main.java', source);
  diagnostics = [];
  const ok = c.compile();
  const compileMs = performance.now() - t0;
  if (!ok) {
    return { ok: false, compileMs, exitCode: 1, stdout: '', stderr: formatDiagnostics(), diagnostics: [...diagnostics] };
  }

  // NB: do NOT call clearOutputFiles() here — it wipes the class files javac
  // just produced; generateWebAssembly consumes those as its input.
  const t1 = performance.now();
  // SIMPLE is the level the fork's fiber-based runtime supports; ADVANCED emits
  // a module whose completion callback / teavm_stopped flag never fires.
  const genOk = c.generateWebAssembly({ outputName: 'app', mainClass, optimizationLevel: 'SIMPLE' });
  const generateMs = performance.now() - t1;
  if (!genOk) {
    return {
      ok: false,
      compileMs,
      generateMs,
      exitCode: 1,
      stdout: '',
      stderr: formatDiagnostics(),
      diagnostics: [...diagnostics],
    };
  }

  const bytes = c.getWebAssemblyOutputFile('app.wasm');
  if (!bytes) {
    return {
      ok: false,
      compileMs,
      generateMs,
      exitCode: 1,
      stdout: '',
      stderr: formatDiagnostics() || 'compiler produced no WebAssembly output',
      diagnostics: [...diagnostics],
    };
  }

  const { stdout, stderr, runMs } = await executeProgram(bytes, input);

  return {
    ok: true,
    compileMs,
    generateMs,
    runMs,
    exitCode: 0,
    stdout,
    stderr,
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
            throw new Error('java worker: baseUrl is required when loaded from a blob/data URL');
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
      const result = await run(e.data.source, e.data.mainClass || 'Main', e.data.input || '');
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
