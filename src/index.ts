/**
 * @live-codes/browser-jvm — client-side JVM toolchain for LiveCodes.
 *
 * Engines:
 *  - `teavm`  (default for Java): teavm-javac — in-browser javac + TeaVM AOT → WebAssembly.
 *  - `doppio` (Kotlin/Scala, Java fallback): seo-rii/doppio `modern` — JVM interpreted in TS.
 *
 * Usage (IIFE global `BrowserJvm`):
 *   const runtime = await BrowserJvm.createRuntime({ engine: 'teavm' });
 *   const result = await runtime.run('public class Main { ... }');
 *   // result: { output, error, exitCode, stdout, stderr, compileMs, runMs }
 */

export interface JvmRunResult {
  ok: boolean;
  output: string;
  error: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  compileMs?: number;
  generateMs?: number;
  runMs?: number;
}

/** Coarse progress from the engine — the interpreted JVM can take minutes. */
export interface JvmProgress {
  stage: string;
  detail: string;
}

export interface JvmRuntime {
  engine: 'teavm' | 'doppio';
  language: 'java' | 'kotlin' | 'scala';
  run(source: string, options?: { input?: string; mainClass?: string }): Promise<JvmRunResult>;
  /** Subscribe to progress events. Returns an unsubscribe function. */
  on(event: 'progress', listener: (progress: JvmProgress) => void): () => void;
  stop(): void;
  destroy(): void;
}

export interface CreateRuntimeOptions {
  engine: 'teavm' | 'doppio';
  /** Language the runtime will execute (affects doppio compile recipe / main-class defaults). */
  language?: 'java' | 'kotlin' | 'scala';
  /** Directory hosting this package's dist files (worker scripts). Defaults to the bundle's own URL. */
  baseUrl?: string;
  /** Explicit worker script URL; overrides `<baseUrl>/worker-<engine>.js`. */
  workerUrl?: string;
  /** Override the doppio-modern runtime base (browserfs/doppio/listings.json directory). */
  doppioBaseUrl?: string;
  /** Override the TeaVM assets base (compiler.wasm + classlib archives directory). */
  teavmBaseUrl?: string;
  /** Called with coarse engine progress (useful for the multi-minute Doppio compiles). */
  onProgress?: (progress: JvmProgress) => void;
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

export async function createRuntime(options: CreateRuntimeOptions): Promise<JvmRuntime> {
  const engine = options.engine;
  const language = options.language ?? 'java';
  const base = resolveBase(options.baseUrl);
  if (!base) throw new Error('baseUrl is required when the bundle is not loaded via a <script src> tag');
  const workerUrl = new URL(`worker-${engine}.js`, base).href;

  const worker = await createWorker(workerUrl);

  let pending: ((result: JvmRunResult) => void) | null = null;
  let initResolve: ((value: { initMs: number }) => void) | null = null;
  let initReject: ((reason: Error) => void) | null = null;

  const progressListeners = new Set<(progress: JvmProgress) => void>();
  const emitProgress = (progress: JvmProgress) => {
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

  const initMessage: Record<string, unknown> = { cmd: 'init' };
  if (engine === 'teavm') {
    // dist/teavm/ sits next to the worker script; explicit override wins.
    initMessage.baseUrl = options.teavmBaseUrl ? resolveBase(options.teavmBaseUrl) : new URL('teavm/', base).href;
  }
  if (engine === 'doppio' && options.doppioBaseUrl) initMessage.baseUrl = resolveBase(options.doppioBaseUrl);
  worker.postMessage(initMessage);
  await initialized;

  return {
    engine,
    language,
    run(source, runOptions = {}) {
      return new Promise<JvmRunResult>((resolve) => {
        pending = resolve;
        worker.postMessage({
          cmd: 'run',
          language,
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
    stop() {
      if (engine === 'doppio') worker.postMessage({ cmd: 'stop' });
    },
    destroy() {
      worker.terminate();
    },
  };
}

const globalExport = { createRuntime } as const;
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).BrowserJvm = globalExport;
}
