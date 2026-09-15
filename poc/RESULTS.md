# PoC results — browser JVM engine benchmark

Date: 2026-09-14 · Machine: Windows, headless Chromium 152 (CDP), artifacts served from `localhost:8931`.
Timings are indicative (network-dependent for remote jars; local artifacts for TeaVM).
The teavm-javac column was re-measured against our fork (`Vsprocessing/teavm-javac@d1514ab`, TeaVM 0.14.1); the other engines are from the original run.

## Programs

- `java-hello` — hello world (sanity)
- `java-features` — records, `var`, text blocks, `Stream.toList()` (modern-syntax canary)
- `java-bench` — recursive `fib(27)` with in-program timing (`internalMs` = pure execution speed)
- `java-stdin` — echo a stdin line
- `kotlin-hello` — data class + collections
- `scala-hello` — case class + LazyList

## Results

| Metric | baseline `@seth0x41/doppio@1.0.0` (current LiveCodes) | doppio-modern (seo-rii fork) | teavm-javac (our fork, TeaVM 0.14.1) |
|---|---|---|---|
| Env init (cold) | 45.0 s (eager jar fetch ~85 MB) | 1.4 s (listings only; jars lazy) | **1.3 s** (7.7 MB, served from the package) |
| Java hello compile | 2.3 s | 30.2 s first (incl. lazy rt/tools jar fetch), ~1–2.5 s warm | **~30–250 ms** (first program includes warm-up) |
| Java hello wasm generate | — | — | 1.3–2.6 s (optimization `SIMPLE`) |
| Java hello run | 234 ms | 424 ms | **2–7 ms** |
| `fib(27)` internal | 73 ms | 71 ms | **5 ms (~15× faster)** |
| Modern Java syntax | ✗ JDK 8 javac: `unclosed string literal` | ✗ JDK 8 javac (same) | **✓ records / var / text blocks / Stream.toList** |
| Java stdin | ✓ | ✓ | **✓ `System.in` via a pre-supplied input string** (`teavmConsole.readStdin` import) |
| Total download (Java) | ~85 MB | ~85 MB (lazy) | **7.7 MB** |
| Kotlin | n/a | **✓ compile 325 s (5.4 min, incl. 59 MB kotlin-compiler.jar), run 4.2 s** | n/a (javac rejects source) |
| Scala | n/a | **✓ compile 57.6 s, run 1.2 s** | n/a (javac rejects source) |
| License | MIT | MIT | Apache-2.0 (+ OpenJDK GPLv2+CE for javac) |

Raw JSON per engine: browser `localStorage['poc-results-<engine>']` (Copy JSON button on each page). Screenshots: `poc-shot-teavm.png`, `poc-shot-baseline.png`.

## Decision gate

1. **Java → TeaVM (our `teavm-javac` fork).** Much faster execution and compile than Doppio-modern, modern Java language level (javac built from JDK 25 sources), and ~11× smaller download. **stdin works:** the fork replaces TeaVM's `TConsoleInputStream` — which upstream stubs to throw `TEOFException`, and which is *still* a stub at TeaVM 0.15.0 — and feeds a pre-supplied input string through the `teavmConsole.readStdin` import, exactly the shape `livecodes.java.run(input)` needs.
2. **Kotlin & Scala → Doppio-modern.** The only open-source path that compiles and runs them in-browser. Compile latency is minutes on first run (interpreted JVM + 59 MB compiler jar). Mitigations for LiveCodes: reuse the running JVM (live-reload already does), skip recompilation when source is unchanged (existing worker pattern), rely on HTTP cache for warm runs, and set expectations via the existing "large download / may take a while" UX.
3. **Stretch (follow-up):** run Kotlin/Scala *bytecode* on TeaVM. The fork's `addClassFile`/`addClassArchive` + `emitWasm` already accept existing class files, so the slow Doppio phase becomes compile-only and execution gets the AOT speedup. (TeaVM itself cannot compile Kotlin/Scala *source*: it ships no front end, and the maintainer has ruled out compiling `scalac` because of the `LazyVals`/`sun.misc.Unsafe` ABI.)

## Engineering notes discovered (apply in Phase 1)

- `teavm.org` sends no CORS headers → artifacts must ship inside the npm package (jsDelivr adds `Access-Control-Allow-Origin: *`). We now vendor a pinned build of our fork instead (checksums in `scripts/fetch-teavm.mjs`).
- `TeaVMDiagnostic` getters are wasm-backed and **trap on null** — read all diagnostic properties defensively.
- Do **not** call `clearOutputFiles()` between `compile()` and `generateWebAssembly()` — it wipes the javac output that generation consumes. Same-name sources overwrite cleanly across runs, so a single reused `Compiler` instance is safe for Main-class playgrounds.
- `compiler.wasm-runtime.js` exports `load(bytesOrUrl, options)`. Instantiate a generated app with `options.installImports(imports)` and override `imports.teavmConsole`: `readStdin()` (one byte at a time, `-1` = EOF), `putcharStdout`/`putcharStderr` (char codes).
- Generated apps use the fork's fiber/event-queue runtime: the entry point is `main(args, onFinish)` and completion is signalled by the `onFinish` callback and the exported `teavm_stopped()` flag (from `org.teavm.runtime.EventQueue`) — the old `exports.main([])` + `console.log` capture no longer applies.
- Emit with `optimizationLevel: 'SIMPLE'`. `ADVANCED` produces a module whose completion callback / `teavm_stopped` never fires (the program hangs), so SIMPLE is required until the fork supports the others.
- `System.in` is `TConsoleInputStream`; upstream it throws `TEOFException`, so TeaVM/teavm-javac have no console input by default. The fix is a classlib override whose `read()` calls an imported `teavmConsole.readStdin` — *not* anything to do with nio/`@JSByRef`.
- Doppio-modern CLI signature: `Doppio.VM.CLI(args, opts, onExit, onJvm)` — 4th callback yields a JVM handle (`jvm.halt(130)`) for a Stop button.
- Doppio-modern layout: BrowserFS `XmlHttpRequest` FS from `listings.json` mounted at `/sys` (`doppioHomePath: '/sys'`, `tmpDir: '/tmp'`), `/tmp` + `/work` InMemory; `process.initializeTTYs()` before stdout/stderr capture; `-Xresponsiveness:100000` (compile) / `:10000` (run).
- Compile recipes (validated): javac via `-cp /sys/vendor/java_home/lib/tools.jar com.sun.tools.javac.Main`; Kotlin via `org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-reflect -no-stdlib -classpath kotlin-stdlib.jar` with full kotlinc lib dir on the JVM classpath; Scala via `scala.tools.nsc.Main` with `scala-compiler/-library/-reflect-2.13.18 + java-diff-utils-4.16 + jline-3.29.0-jdk8`.
- Both Doppio engines: JDK 8 `javac` → modern Java *source* cannot compile in-browser; only the fork's runtime can *load* modern class files (its CI fixtures are host-compiled).
