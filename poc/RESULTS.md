# PoC results — browser JVM engine benchmark

Date: 2026-09-14 · Machine: Windows, headless Chromium (CDP), artifacts served from `localhost:8931`.
Timings are indicative (network-dependent for remote jars; local artifacts for TeaVM).

## Programs

- `java-hello` — hello world (sanity)
- `java-features` — records, `var`, text blocks, `Stream.toList()` (modern-syntax canary)
- `java-bench` — recursive `fib(27)` with in-program timing (`internalMs` = pure execution speed)
- `java-stdin` — echo a stdin line
- `kotlin-hello` — data class + collections
- `scala-hello` — case class + LazyList

## Results

| Metric | baseline `@seth0x41/doppio@1.0.0` (current LiveCodes) | doppio-modern (seo-rii fork) | teavm-javac |
|---|---|---|---|
| Env init (cold) | 45.0 s (eager jar fetch ~85 MB) | 1.4 s (listings only; jars lazy) | **0.2 s** (6.4 MB local; add ~1–3 s from CDN) |
| Java hello compile | 2.3 s | 30.2 s first (incl. lazy rt/tools jar fetch), ~1–2.5 s warm | **42 ms** (+ 437 ms wasm generate) |
| Java hello run | 234 ms | 424 ms | **3–5 ms** |
| `fib(27)` internal | 73 ms | 71 ms | **1 ms (~72× faster)** |
| Modern Java syntax | ✗ JDK 8 javac: `unclosed string literal` | ✗ JDK 8 javac (same) | **✓ records / var / text blocks / Stream.toList** |
| Java stdin | ✓ | ✓ | ✗ `TByteBuffer`/`TCharBuffer` `@JSByRef` unsupported in Wasm GC |
| Total download (Java) | ~85 MB | ~85 MB (lazy) | **6.4 MB** |
| Kotlin | n/a | **✓ compile 325 s (5.4 min, incl. 59 MB kotlin-compiler.jar), run 4.2 s** | n/a (javac rejects source) |
| Scala | n/a | **✓ compile 57.6 s, run 1.2 s** | n/a |
| License | MIT | MIT | Apache-2.0 (+ OpenJDK GPLv2+CE for javac) |

Raw JSON per engine: browser `localStorage['poc-results-<engine>']` (Copy JSON button on each page). Screenshots: `poc-shot-teavm.png`, `poc-shot-baseline.png`.

## Decision gate

1. **Java → TeaVM (`teavm-javac`).** ~72× faster execution, ~50–100× faster compile, modern Java language level, and 13× smaller download. Accepted gap: **no stdin** (TeaVM classlib cannot compile `java.nio` byte buffers for Wasm GC). `livecodes.java.run(input)` keeps working; stdin content is ignored and the limitation is documented in language info/docs.
2. **Kotlin & Scala → Doppio-modern.** The only open-source path that compiles and runs them in-browser. Compile latency is minutes on first run (interpreted JVM + 59 MB compiler jar). Mitigations for LiveCodes: reuse the running JVM (live-reload already does), skip recompilation when source is unchanged (existing worker pattern), rely on HTTP cache for warm runs, and set expectations via the existing "large download / may take a while" UX.
3. **Stretch (follow-up):** run Kotlin/Scala *bytecode* on TeaVM (`addOutputClassFile` → `generateWebAssembly`) so the slow Doppio phase is compile-only and execution gets the ~72× speedup.

## Engineering notes discovered (apply in Phase 1)

- `teavm.org` sends no CORS headers → artifacts must ship inside the npm package (jsDelivr adds `Access-Control-Allow-Origin: *`).
- `TeaVMDiagnostic` getters are wasm-backed and **trap on null** — read all diagnostic properties defensively.
- Do **not** call `clearOutputFiles()` between `compile()` and `generateWebAssembly()` — it wipes the javac output that generation consumes. Same-name sources overwrite cleanly across runs, so a single reused `Compiler` instance is safe for Main-class playgrounds.
- `compiler.wasm-runtime.js` exports `{ load, defaults, wrapImport }`; apps run via `load(bytesInt8Array)` → `exports.main([])`; stdout arrives as per-line `console.log` calls (intercept in worker).
- Doppio-modern CLI signature: `Doppio.VM.CLI(args, opts, onExit, onJvm)` — 4th callback yields a JVM handle (`jvm.halt(130)`) for a Stop button.
- Doppio-modern layout: BrowserFS `XmlHttpRequest` FS from `listings.json` mounted at `/sys` (`doppioHomePath: '/sys'`, `tmpDir: '/tmp'`), `/tmp` + `/work` InMemory; `process.initializeTTYs()` before stdout/stderr capture; `-Xresponsiveness:100000` (compile) / `:10000` (run).
- Compile recipes (validated): javac via `-cp /sys/vendor/java_home/lib/tools.jar com.sun.tools.javac.Main`; Kotlin via `org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-reflect -no-stdlib -classpath kotlin-stdlib.jar` with full kotlinc lib dir on the JVM classpath; Scala via `scala.tools.nsc.Main` with `scala-compiler/-library/-reflect-2.13.18 + java-diff-utils-4.16 + jline-3.29.0-jdk8`.
- Both Doppio engines: JDK 8 `javac` → modern Java *source* cannot compile in-browser; only the fork's runtime can *load* modern class files (its CI fixtures are host-compiled).
