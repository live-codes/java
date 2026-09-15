# @live-codes/browser-jvm

Client-side JVM toolchain for [LiveCodes](https://livecodes.io): **Java, Kotlin and Scala** running entirely in the browser — no server, per LiveCodes' backendless architecture.

**Status: Phase 1.** The Java engine now runs our [teavm-javac fork](#teavm-javac-fork) (fast AOT WebAssembly, modern Java, **stdin supported**); Kotlin/Scala still run on Doppio-modern. See `poc/`.

## Why

LiveCodes' current Java support runs [DoppioJVM](https://github.com/plasma-umass/doppio) (a JVM interpreted in TypeScript) with a JDK 8 class library: slow, Java 8 only, no Kotlin/Scala. This repo evaluates and packages open-source alternatives (CheerpJ was rejected for licensing: proprietary, commercial use requires a paid license).

## Candidates

| Engine | License | Covers | Notes |
|---|---|---|---|
| [seo-rii/doppio](https://github.com/seo-rii/doppio) (`modern` branch) | MIT | Java (8 javac; modern class-file loading + runtime overlays), Kotlin 2.4.0, Scala 2.13.18 | Same interpreter core as current Doppio → compile/run still slow; lazy jar fetch via BrowserFS XHR FS |
| [teavm-javac fork](https://github.com/Vsprocessing/teavm-javac) (our base for Java) | Apache-2.0 (javac: OpenJDK GPLv2+CE) | Java source → WasmGC AOT (javac built from JDK 25 sources) | Fast execution; JRE is TeaVM's classlib subset; **stdin supported** as a pre-supplied input string |
| [CheerpJ](https://cheerpj.com/) 4 | proprietary | Java 8/11/17 + JVM languages | Rejected (licensing) |

### teavm-javac fork

TeaVM is a bytecode→WebAssembly AOT compiler, so it can only ever run Java (and any JVM language) *if something compiles the source to bytecode first* — it ships no front end, and it cannot compile `kotlinc`/`scalac` themselves. Upstream `konsoletyper/teavm-javac` therefore gives fast Java but **no stdin** (TeaVM's `TConsoleInputStream` throws end-of-file) and no Kotlin/Scala.

We build on [`Vsprocessing/teavm-javac`](https://github.com/Vsprocessing/teavm-javac), which already adds console input, a wider runtime classlib, and a WasmGC/JS compiler backend. We vendor a pinned, checksummed build of it (`scripts/fetch-teavm.mjs`) and will track TeaVM 0.15.0 from our own fork + CI.

## API (`dist/browser-jvm.iife.js`, global `BrowserJvm`)

```js
const runtime = await BrowserJvm.createRuntime({
  engine: 'teavm' | 'doppio',      // teavm = fast Java (AOT wasm, stdin); doppio = Kotlin/Scala (interpreted JVM)
  language: 'java' | 'kotlin' | 'scala',
  // baseUrl:        directory hosting the dist files (defaults to the bundle's own URL)
  // workerUrl:      explicit worker script URL override
  // teavmBaseUrl:   override for compiler.wasm + classlib archives (default: <baseUrl>/teavm/)
  // doppioBaseUrl:  override for the doppio-modern runtime (default: seorii.page deployment)
});
const result = await runtime.run(source, { input?: string, mainClass?: string });
// result: { ok, output, error, stdout, stderr, exitCode, compileMs, generateMs?, runMs? }
runtime.stop();   // doppio only: halts the active JVM (exit 130)
runtime.destroy(); // terminate the worker
```

`input` is delivered to the program's `System.in` on both engines.

Engines are selected per the benchmark gate in `poc/RESULTS.md`: **TeaVM for Java** (including stdin) and **Doppio-modern for Kotlin/Scala**.

## PoC quickstart

```bash
npm run vendor:teavm   # fetch the pinned teavm-javac fork artifacts into vendor/teavm (sha256-checked)
npm run serve          # http://localhost:8931/poc/
```

Open each page, let it finish, use “Copy JSON results”. Results land in `poc/RESULTS.md`.

Benchmark suite (`poc/bench.js`): Java hello / modern-syntax canary (records, var, text blocks, `Stream.toList`) / fib(27) / stdin echo; Kotlin data-class; Scala case-class + LazyList. Metrics: cold init, compile, generate, run, internal compute time, exit code, expected-output pass/fail.

## Artifact provenance

| Artifact | Source | Size |
|---|---|---|
| `vendor/teavm/compiler.wasm` | `Vsprocessing/teavm-javac@d1514ab`, `dist/teavm-javac/` (TeaVM 0.14.1) | 5.2 MB |
| `vendor/teavm/compile-classlib-teavm.bin` | same | 0.21 MB |
| `vendor/teavm/runtime-classlib-teavm.bin` | same | 2.2 MB |
| `vendor/teavm/compiler.wasm-runtime.js` | same | 16 KB |
| Doppio-modern runtime (loaded remotely in PoC) | https://seorii.page/doppio/playground/runtime/ (`doppio.js` 0.65 MB, `browserfs.min.js` 0.23 MB, JDK 8 `rt.jar` 61.7 MB / `tools.jar` 17.4 MB, `kotlin-compiler.jar` 59 MB, `scala-*` 21 MB) | CORS `*` |
| Baseline engine | `https://unpkg.com/@seth0x41/doppio@1.0.0/` + `browserfs@1.4.3` (jsdelivr) | — |

## Build

```bash
npm run build   # vendors the TeaVM artifacts if missing, then esbuild → dist/
npm test        # static smoke: dist files exist, bundles parse, glue + stdin wiring embedded
```

Open `poc/smoke.html` (via `npm run serve`) for the browser-level smoke of the dist bundle.

## Licenses

- TeaVM + teavm-javac (including the `Vsprocessing` fork we build on): Apache-2.0; the included javac comes from OpenJDK (GPLv2 + Classpath Exception).
- Doppio (plasma-umass and seo-rii modern fork): MIT.
- Kotlin compiler/stdlib, Scala compiler/library/reflect: Apache-2.0 (and bundled deps of those distributions).
