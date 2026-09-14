# @live-codes/browser-jvm

Client-side JVM toolchain for [LiveCodes](https://livecodes.io): **Java, Kotlin and Scala** running entirely in the browser — no server, per LiveCodes' backendless architecture.

**Status: Phase 0 (PoC + engine benchmark).** See `poc/`.

## Why

LiveCodes' current Java support runs [DoppioJVM](https://github.com/plasma-umass/doppio) (a JVM interpreted in TypeScript) with a JDK 8 class library: slow, Java 8 only, no Kotlin/Scala. This repo evaluates and packages open-source alternatives (CheerpJ was rejected for licensing: proprietary, commercial use requires a paid license).

## Candidates

| Engine | License | Covers | Notes |
|---|---|---|---|
| [seo-rii/doppio](https://github.com/seo-rii/doppio) (`modern` branch) | MIT | Java (8 javac; modern class-file loading + runtime overlays), Kotlin 2.4.0, Scala 2.13.18 | Same interpreter core as current Doppio → compile/run still slow; lazy jar fetch via BrowserFS XHR FS |
| [teavm-javac](https://github.com/konsoletyper/teavm-javac) | Apache-2.0 (javac: OpenJDK GPLv2+CE) | Java source → wasm AOT (bytecode up to JDK 21) | Fast execution; JRE is TeaVM's classlib subset; **no stdin** |
| [CheerpJ](https://cheerpj.com/) 4 | proprietary | Java 8/11/17 + JVM languages | Rejected (licensing) |

## API (`dist/browser-jvm.iife.js`, global `BrowserJvm`)

```js
const runtime = await BrowserJvm.createRuntime({
  engine: 'teavm' | 'doppio',      // teavm = fast Java (AOT wasm); doppio = Kotlin/Scala (interpreted JVM)
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

Engines are selected per the benchmark gate in `poc/RESULTS.md`: **TeaVM for Java**, **Doppio-modern for Kotlin/Scala** (and as a full-stdin Java fallback — TeaVM has no stdin support).

## PoC quickstart

```bash
npm run vendor:teavm   # download TeaVM artifacts into vendor/teavm (teavm.org has no CORS)
npm run serve          # http://localhost:8931/poc/
```

Open each page, let it finish, use “Copy JSON results”. Results land in `poc/RESULTS.md`.

Benchmark suite (`poc/bench.js`): Java hello / modern-syntax canary (records, var, text blocks, `Stream.toList`) / fib(27) / stdin echo; Kotlin data-class; Scala case-class + LazyList. Metrics: cold init, compile, generate, run, internal compute time, exit code, expected-output pass/fail.

## Artifact provenance

| Artifact | Source | Size |
|---|---|---|
| `vendor/teavm/compiler.wasm` | https://teavm.org/playground/compiler.wasm | 3.9 MB |
| `vendor/teavm/compile-classlib-teavm.bin` | https://teavm.org/playground/compile-classlib-teavm.bin | 0.2 MB |
| `vendor/teavm/runtime-classlib-teavm.bin` | https://teavm.org/playground/runtime-classlib-teavm.bin | 2.3 MB |
| `vendor/teavm/compiler.wasm-runtime.js` | https://teavm.org/playground/compiler.wasm-runtime.js | 11 KB |
| Doppio-modern runtime (loaded remotely in PoC) | https://seorii.page/doppio/playground/runtime/ (`doppio.js` 0.65 MB, `browserfs.min.js` 0.23 MB, JDK 8 `rt.jar` 61.7 MB / `tools.jar` 17.4 MB, `kotlin-compiler.jar` 59 MB, `scala-*` 21 MB) | CORS `*` |
| Baseline engine | `https://unpkg.com/@seth0x41/doppio@1.0.0/` + `browserfs@1.4.3` (jsdelivr) | — |

## Build

```bash
npm run build   # fetches TeaVM artifacts if missing, then esbuild → dist/
npm test        # static smoke: dist files exist, bundles parse, glue embedded
```

Open `poc/smoke.html` (via `npm run serve`) for the browser-level smoke of the dist bundle.

## Licenses

- TeaVM + teavm-javac: Apache-2.0; included javac comes from OpenJDK (GPLv2 + Classpath Exception).
- Doppio (plasma-umass and seo-rii modern fork): MIT.
- Kotlin compiler/stdlib, Scala compiler/library/reflect: Apache-2.0 (and bundled deps of those distributions).
