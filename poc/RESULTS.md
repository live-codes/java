# PoC results — Java engine benchmark and the decision behind this package

Date: 2026-09-14/15 · Machine: Windows, headless Chromium 152 (CDP), artifacts served from `localhost:8931`.

Outcome: this package ships **Java on TeaVM only**. The Kotlin and Scala paths that were
originally explored are documented below because they explain the scope.

## Programs (Java engine)

- `java-hello` — hello world (sanity)
- `java-features` — records, `var`, text blocks, `Stream.toList()` (modern-syntax canary)
- `java-bench` — recursive `fib(27)` with in-program timing (`internalMs` = pure execution speed)
- `java-stdin` — echo a stdin line

## Results — engine comparison

| Metric | baseline `@seth0x41/doppio@1.0.0` | doppio-modern (seo-rii fork) | **teavm-javac (our fork, TeaVM 0.14.1)** |
|---|---|---|---|
| Env init (cold) | 45.0 s (eager jar fetch ~85 MB) | 1.4 s (listings only; jars lazy) | **1.3 s** (7.7 MB, served from the package) |
| Java hello compile | 2.3 s | 30.2 s first, ~1–2.5 s warm | **~30–250 ms** (first program includes warm-up) |
| Java hello wasm generate | — | — | 1.3–2.6 s (optimization `SIMPLE`) |
| Java hello run | 234 ms | 424 ms | **2–7 ms** |
| `fib(27)` internal | 73 ms | 71 ms | **5 ms (~15× faster)** |
| Modern Java syntax | ✗ JDK 8 javac | ✗ JDK 8 javac | **✓ records / var / text blocks / Stream.toList** |
| Java stdin | ✓ | ✓ | **✓ pre-supplied input string** (`teavmConsole.readStdin`) |
| Total download (Java) | ~85 MB | ~85 MB (lazy) | **7.7 MB** |
| Licence | MIT | MIT | Apache-2.0 (+ OpenJDK GPLv2+CE for javac) |

## Decision

1. **Java → TeaVM (our `teavm-javac` fork).** Far faster compile and execution than Doppio, modern
   Java language level (javac built from JDK 25 sources), ~11× smaller download, and stdin works.
   This is what the package ships.

2. **Kotlin → dropped.** It only ever ran on Doppio, a JVM interpreted in JavaScript. Two blocking
   bugs were found and fixed:
   - the recipe passed neither `-no-jdk` nor the JDK on the classpath, so kotlinc resolved the JDK by
     walking the emulated filesystem;
   - stdin was written *before* `Doppio.VM.CLI` started, so it was silently dropped and any program
     reading stdin blocked forever.

   Even fixed, a compile took **~7–20 minutes and often never finished**: every run pulls ~163 MB of
   jars (JDK + kotlinc) through an emulated, cross-origin filesystem. Not usable → not shipped.

3. **Scala → its own package.** A real client-side Scala 3 compiler exists (the Wasm-compiled dotty
   compiler plus the Scala.js linker), with no shared tooling with this one. It lives in
   `@live-codes/scala-wasm`.

TeaVM itself cannot help with either: it compiles *bytecode* and ships no front end, and the TeaVM
maintainer has ruled out compiling `scalac` because of the `LazyVals`/`sun.misc.Unsafe` ABI.

## Engineering notes

**TeaVM / this engine**

- `TeaVMDiagnostic` getters are wasm-backed and **trap on null** — read every diagnostic property defensively.
- Do **not** call `clearOutputFiles()` between `compile()` and `generateWebAssembly()` — it wipes the
  javac output that generation consumes. Same-name sources overwrite cleanly across runs, so one
  reused `Compiler` instance is safe for Main-class playgrounds.
- `compiler.wasm-runtime.js` exports `load(bytesOrUrl, options)`. Instantiate a generated app with
  `options.installImports(imports)` and override `imports.teavmConsole`: `readStdin()` (one byte at a
  time, `-1` = EOF), `putcharStdout` / `putcharStderr` (char codes).
- Generated apps use the fork's fiber/event-queue runtime: the entry point is `main(args, onFinish)`
  and completion is signalled by the `onFinish` callback **and** the exported `teavm_stopped()` flag
  (from `org.teavm.runtime.EventQueue`). The old `exports.main([])` + `console.log` capture no longer applies.
- Emit with `optimizationLevel: 'SIMPLE'`. `ADVANCED` produces a module whose completion callback /
  `teavm_stopped` never fires (the program hangs).
- `System.in` is `TConsoleInputStream`; upstream it throws `TEOFException`, so TeaVM/teavm-javac have
  no console input by default. The fix is a classlib override whose `read()` calls an imported
  `teavmConsole.readStdin` — *not* anything to do with nio/`@JSByRef`.
- `teavm.org` sends no CORS headers → artifacts ship inside the package. We vendor a pinned,
  checksummed build of our fork instead (`scripts/fetch-teavm.mjs`).

**Doppio (retained for reference — the engine we stopped using)**

- `Doppio.VM.CLI(args, opts, onExit, onJvm)` — the 4th callback yields the JVM handle; write stdin
  **from that callback**, never before, or the data is lost.
- Layout: BrowserFS `XmlHttpRequest` FS from `listings.json` mounted at `/sys`
  (`doppioHomePath: '/sys'`, `tmpDir: '/tmp'`), `/tmp` + `/work` InMemory;
  `process.initializeTTYs()` before capturing stdout/stderr; `-Xresponsiveness:100000` (compile) /
  `:10000` (run).
- Kotlin compile command that works (mirrors upstream `ci/kotlin_smoke.sh`):
  `org.jetbrains.kotlin.cli.jvm.K2JVMCompiler -no-reflect -no-jdk -no-stdlib -java-parameters
  -classpath <java_home>/lib/doppio.jar:<java_home>/lib/rt.jar:<kotlin>/kotlin-stdlib.jar`
  with `-cp <kotlin>/kotlin-compiler.jar`.
- JDK 8 `javac` (via `tools.jar`): modern Java *source* cannot be compiled in-browser; only the
  fork's runtime can *load* modern class files (its CI fixtures are host-compiled).
