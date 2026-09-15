/**
 * @live-codes/java-wasm — client-side Java for LiveCodes.
 *
 * Java source → class files → WebAssembly, entirely in the browser: a fork of
 * teavm-javac bundles OpenJDK's javac and the TeaVM AOT compiler into one Wasm
 * module, and generated programs run as WebAssembly. No server.
 *
 * Usage (IIFE global `JavaWasm`):
 *   const runtime = await JavaWasm.createRuntime();
 *   const result = await runtime.run('public class Main { public static void main(String[] a) { … } }', {
 *     input: 'hello\n',           // optional stdin
 *   });
 *   // result: { ok, output, error, exitCode, stdout, stderr, compileMs, generateMs, runMs }
 *   runtime.destroy();
 */

export interface JavaRunResult {
  ok: boolean;
  output: string;
  error: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  /** javac: source → class files */
  compileMs?: number;
  /** TeaVM: class files → WebAssembly */
  generateMs?: number;
  /** execution of the generated module */
  runMs?: number;
}

/** Coarse progress from the engine (toolchain load, compile, generate, run). */
export interface JavaProgress {
  stage: string;
  detail: string;
}

export interface JavaRuntime {
  run(source: string, options?: { input?: string; mainClass?: string }): Promise<JavaRunResult>;
  /** Subscribe to progress events. Returns an unsubscribe function. */
  on(event: 'progress', listener: (progress: JavaProgress) => void): () => void;
  destroy(): void;
}

export interface CreateJavaRuntimeOptions {
  /** Directory hosting this package's dist files (worker script + `teavm/`). Defaults to the bundle's own URL. */
  baseUrl?: string;
  /** Explicit worker script URL; overrides `<baseUrl>/worker-java.js`. */
  workerUrl?: string;
  /** Override the TeaVM assets base (compiler.wasm + classlib archives directory). Defaults to `<baseUrl>/teavm/`. */
  teavmBaseUrl?: string;
  /** Called with coarse engine progress. */
  onProgress?: (progress: JavaProgress) => void;
}

// Captured while the <script> tag is still evaluating (currentScript is null later).
const bundleDir: string | undefined = (() => {
  const src = (document.currentScript as HTMLScriptElement | null)?.src;
  return src ? new URL('.', src).href : undefined;
})();

const resolveBase = (base?: string): string => new URL(base ?? bundleDir ?? '', document.baseURI).href;

async function createWorker(url: string): Promise<Worker> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch worker script ${url}: ${res.status}`);
  const blob = new Blob([await res.text()], { type: 'text/javascript' });
  return new Worker(URL.createObjectURL(blob));
}

export async function createRuntime(options: CreateJavaRuntimeOptions = {}): Promise<JavaRuntime> {
  const base = resolveBase(options.baseUrl);
  if (!base) throw new Error('baseUrl is required when the bundle is not loaded via a <script src> tag');

  const worker = await createWorker(options.workerUrl ? resolveBase(options.workerUrl) : new URL('worker-java.js', base).href);

  let pending: ((result: JavaRunResult) => void) | null = null;
  let initResolve: ((value: { initMs: number }) => void) | null = null;
  let initReject: ((reason: Error) => void) | null = null;

  const progressListeners = new Set<(progress: JavaProgress) => void>();
  const emitProgress = (progress: JavaProgress) => {
    options.onProgress?.(progress);
    for (const listener of progressListeners) listener(progress);
  };

  worker.onmessage = (e: MessageEvent) => {
    const data = e.data as Record<string, unknown>;
    if (data.type === 'progress') {
      emitProgress({ stage: String(data.stage ?? ''), detail: String(data.detail ?? '') });
      return;
    }
    if (data.type === 'initialized') {
      initResolve?.({ initMs: data.initMs as number });
      return;
    }
    if (data.type === 'init-error') {
      initReject?.(new Error(String(data.error)));
      return;
    }
    if (data.type === 'result') {
      const r = data as Record<string, unknown>;
      const stdout = String(r.stdout ?? '');
      const stderr = String(r.stderr ?? '');
      pending?.({
        ok: Boolean(r.ok),
        stdout,
        stderr,
        output: stdout,
        error: stderr,
        exitCode: Number(r.exitCode ?? 1),
        compileMs: r.compileMs as number | undefined,
        generateMs: r.generateMs as number | undefined,
        runMs: r.runMs as number | undefined,
      });
      pending = null;
    }
  };

  const initialized = new Promise<{ initMs: number }>((resolve, reject) => {
    initResolve = resolve;
    initReject = reject;
  });

  // dist/teavm/ sits next to the worker script; an explicit override wins.
  worker.postMessage({
    cmd: 'init',
    baseUrl: options.teavmBaseUrl ? resolveBase(options.teavmBaseUrl) : new URL('teavm/', base).href,
  });
  await initialized;

  return {
    run(source, runOptions = {}) {
      return new Promise<JavaRunResult>((resolve) => {
        pending = resolve;
        worker.postMessage({
          cmd: 'run',
          source,
          input: runOptions.input ?? '',
          mainClass: runOptions.mainClass,
        });
      });
    },
    on(event, listener) {
      if (event === 'progress') {
        progressListeners.add(listener);
        return () => progressListeners.delete(listener);
      }
      return () => {};
    },
    destroy() {
      worker.terminate();
    },
  };
}

const globalExport = { createRuntime } as const;
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).JavaWasm = globalExport;
}
