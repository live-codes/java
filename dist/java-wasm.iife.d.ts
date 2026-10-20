/**
 * Public surface of `@live-codes/java-wasm` (the IIFE global `JavaWasm`).
 * Mirrors `src/index.ts`; kept by hand because the build bundles with esbuild, which emits no types.
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
  /** Keep the program's in-memory file system between runs (IndexedDB, shared per origin). Default: false. */
  persistFiles?: boolean;
  /** Path semantics the module models: 'posix' (default) or 'windows'. */
  platform?: 'posix' | 'windows';
}

export function createRuntime(options?: CreateJavaRuntimeOptions): Promise<JavaRuntime>;

declare global {
  interface Window {
    JavaWasm: { createRuntime: typeof createRuntime };
  }
  // eslint-disable-next-line no-var
  var JavaWasm: { createRuntime: typeof createRuntime };
}
