# FINDINGS

Everything learned building `@live-codes/java-wasm`: a Java-in-the-browser engine made from
[`Vsprocessing/teavm-javac`](https://github.com/Vsprocessing/teavm-javac) (TeaVM 0.14.1 + a bundled
OpenJDK javac, compiled to WebAssembly), as a replacement for LiveCodes' current Java engine
(Doppio + BrowserFS, an interpreted JVM stuck at Java 8).

This file is the single technical record: what works, what does not and why, how to build it, and how
to upgrade it later. **Keep it current** — every fix and every measurement below is a claim someone
will otherwise have to re-derive.

Related documents, each with a narrower job:

| Document | Covers |
|---|---|
| `patches/README.md` | The three fork patches, their bugs, and how to reproduce the classlib archives |
| `poc/UPSTREAM.md` | Upstream TeaVM bugs, with minimal reproductions |
| `corpus/README.md` | The engine-comparison corpus and its current numbers |
| `poc/RESULTS.md` | Decision record for the engine choice (keeps the Doppio findings) |

---

## 1. Status

Measured on `corpus/` (145 programs, run in Chrome):

| | |
|---|---|
| Pass | **130 / 145** |
| Compile | **143 / 145** |
| "Works on Doppio, fails here" (regressions) | **14** |
| "Fails on both engines" | **1** (`instant-duration`) |

Measured on a full run, and the two class-library additions below (`String.lines()`,
`Matcher.results()`) are separately confirmed by diffing the affected programs' output against JDK 25
— `regex-groups`, `var-textblock` and `text-block-more` all pass.

The headline is the regression count, not the pass count: 14 of the 145 work today on the current
engine and do not work here. That is the number that decides whether this can replace Doppio, and it
is why this is not yet a straight swap.

**On Doppio it is not close in the other direction.** Doppio cannot run `records`,
`switch-expression`, `String.repeat`, or text blocks at all (JDK 8 javac), and mis-dispatches
interface `super` default methods. Steady-state generation here is ~1–5 s per program versus tens of
seconds for Doppio's interpreted JVM.

---

## 2. How it works

```
browser worker (src/worker-java.ts)
  │
  ├── compiler.wasm            5.2 MB   OpenJDK javac + TeaVM compiler + WasmGC backend
  ├── compile-classlib-teavm.bin 207 KB  javac's platform classpath ("the SDK")
  └── runtime-classlib-teavm.bin 2.2 MB  TeaVM's class library (T-prefixed classes)
```

Three stages, all inside one wasm module:

1. **compile** — the bundled javac compiles user sources against `compile-classlib-teavm.bin`.
2. **generate** — TeaVM AOT-compiles the resulting class files plus the runtime class library into a
   WebAssembly module. This is the slow stage (51–392 s summed over the corpus, load-dependent;
   1–5 s for a typical single-file program).
3. **run** — the module is instantiated and `main` is called.

The two archives look similar and are not interchangeable:

- **`compile-classlib-teavm.bin`** is the *converted* class library: `StdlibConverter` renames
  TeaVM's `org.teavm.classlib.java.**.T*` classes into `java.**`. javac only ever sees this one.
- **`runtime-classlib-teavm.bin`** is the *unconverted* class library, T-names intact, and is what
  TeaVM generates from. It also carries the fork's replacements for a handful of classes
  (`TFileInputStream`, `TConsoleInputStream`, `TScanner`, …).

A gap therefore has to be closed on **both** sides: a declaration in the SDK for javac to resolve,
and an implementation in the runtime archive. Half a fix is worse than none — it converts a clean
compile-time error into a runtime failure.

### Worker protocol

```
{ cmd: 'init', baseUrl? }                  → { type: 'initialized', initMs } | { type: 'init-error', error }
{ cmd: 'run', source, mainClass?, input? } → { type: 'result', ok, compileMs, generateMs, runMs,
                                               stdout, stderr, exitCode, diagnostics }
```

`baseUrl` points at the directory holding `compiler.wasm` and the two archives; it defaults to the
worker's own directory. Public API (`src/index.ts`): `createRuntime` → `run(source, {input,
mainClass})`, with `on('progress')` / `onProgress` reporting `init` → `compile` → `generate` → `run`.
The global is `JavaWasm`. This shape matches what LiveCodes' language module expects, so wiring is a
matter of `vendors.ts` + `lang-java-script.ts`, keeping `livecodes.java.{input,output,error,exitCode,
run,loaded}` unchanged.

### Runtime imports the worker must provide

- **`teavmConsole`** — `readStdin` / `putcharStdout` / `putcharStderr`. This is the fork's stdin
  support: upstream `System.in` is `TConsoleInputStream`, which throws `TEOFException`. The fork
  overrides it to call an imported `readStdin`. stdin is supplied up front and read a byte at a time.
- **`teavmFile`** — programs touching `java.io`/`java.nio` import this module, and *without it*
  `WebAssembly.instantiate` fails for the **whole module** — an innocuous `new File(...)` used to
  break programs that merely mentioned it. The worker installs a bridge: an in-memory file layer,
  reads falling back to `fetch`, writes recorded, async opens completed through
  `teavm_file_open_complete`. There is no directory model, so path-based NIO fails with a clean
  `Directory does not exist` rather than a broken module.

### Settings that matter

- **`optimizationLevel: 'SIMPLE'`.** `ADVANCED` produces a module whose completion callback and
  `teavm_stopped()` flag never fire: the program hangs. Documented in the code and in
  `poc/RESULTS.md`.
- **Two exit conditions.** Programs compile to an async entry point (`main(args, onFinish)` backed by
  `org.teavm.runtime.TeaVMJavacMain`/`EventQueue`), so the worker waits on the callback *and*
  `teavm_stopped()`. A `RUN_TIMEOUT_MS` cap prevents a runaway program from wedging the worker.
- **Error plumbing.** A worker `error` must be propagated into `error`/`stderr`; otherwise thrown
  failures surface as blank output and every unsupported-API failure looks like a silent hang.

---

## 3. What works

- **Language level**: whatever the bundled javac accepts — records, text blocks, switch expressions,
  sealed types, pattern matching, lambdas, streams, generics, varargs, annotations.
- **stdin** (the fork's addition — upstream cannot read `System.in` at all).
- **Progress reporting** per stage, and accurate `compileMs` / `generateMs` / `runMs`.
- **Diagnostics** with file/line from javac, surfaced through `onDiagnostic`.
- **Generational detail**: `String.lines()` and the rest of the classlib surface we have patched.
- **Speed**: seconds per program, against tens of seconds to minutes for Doppio.

---

## 4. What does not work, and why

Grouped by where the fault lives, because that determines whether it is fixable here.

### 4a. javac/SDK surface — a bug in the fork's converter, fixable here

All six are fixed in `patches/StdlibConverter.java`; see `patches/README.md`. Symptoms were
`cannot find symbol`, `cyclic inheritance`, `ambiguous method`, `does not override abstract method`,
and — for the last one — a raw `TypeError` with no diagnostic at all.

| Bug | Symptom |
|---|---|
| `@org.teavm.interop.Rename` not applied | `getClass()`, `getMessage()`, `clone()`, `notify()` do not resolve — the SDK contains `getClass0` |
| `InnerClasses` not renamed | `Map.Entry` does not resolve though `Map$Entry.class` exists |
| Members emitted twice | `sb.append(anyObject)` is ambiguous |
| JDK `default` methods emitted abstract | `implements CharSequence` / `Iterator` demand extra methods |
| `Annotation` emitted extending itself | every `@interface` fails with cyclic inheritance |
| Annotations emitted with no elements | **any** use of `@SuppressWarnings` crashed the compiler |

### 4b. Code generation — TeaVM core, not fixable here

- **`try { return x; } finally { return y; }` emits invalid wasm**: `expected 1 elements on the stack
  for fallthru, found 2`. Generation succeeds; V8 rejects the module. Narrow: every other try/finally
  shape works, and a `return` in a `finally` is rare and discouraged.
- **`ArithmeticException` on integer division by zero** is not raised — the wasm `i32.div_s` traps
  instead, so `catch (ArithmeticException)` never runs and the program dies.

Fixing either means changing the wasm backend and rebuilding `compiler.wasm`, which needs Binaryen's
`wasm-opt` (`:compiler:createDist`). Not installed here. See §7.

### 4c. Runtime class library — fixable here, one class at a time

| Missing / broken | Programs |
|---|---|
| ~~`Matcher.results()`~~ — **fixed here** | `regex-groups` now passes. `TMatcher` vendored (§5); the body continues from the matcher's current position like the JDK does |
| `Character.UnicodeBlock` | `char-classes` |
| `java.time` entirely (`TInstant`/`TDuration` absent) | `instant-duration` |
| `DecimalFormat` null pointer under `%e` / `%,d` | `stringformat`, `parse-format`, `string-format-more` |
| `Throwable.addSuppressed` / `getStackTrace` elements null | `exceptions-suppressed`, `exceptions-stacktrace`, `exception-propagation` |
| `EnumSet`/`EnumMap` null pointer in `AbstractStringBuilder.insert` | `enum-map-set` |
| `PrintWriter.printf("%n")` — `Unknown format conversion: n` | `io-writers` |
| Reflection: subset only | `reflection`, `reflection-members` |

`String.lines()` was in this list and is **fixed** — see §5 and `patches/README.md` for the recipe.

### 4d. Deliberate omissions

- **File I/O** has no directory model: NIO paths fail cleanly. A browser playground has nowhere to
  put them; a deliberate drop, not a bug.
- **Kotlin** is not supported. Doppio-modern was the only working route and was unusably slow
  (7–20 min cold, 163 MB of jars fetched cross-origin). Dropped.
- **ADVANCED optimization** (see §2).

---

## 5. What we patch

Three files, all drop-in replacements in the fork, plus one classlib addition. `patches/README.md`
has the details and reproduction steps; the short version:

1. **`StdlibConverter.java`** — applies `@Rename`, renames `InnerClasses`/`EnclosingMethod`/nest
   attributes, emits each member once, relaxes `ACC_ABSTRACT` where the platform's method is not
   abstract, drops a superinterface that renames to the class itself, and fills an annotation in from
   the platform's own class file (elements and their `AnnotationDefault` values).
2. **`ArchiveBuilder.java`** — normalises archive entry names to `/`. It named entries from
   `Path.toString()`, so on Windows they came out as `org\teavm\classlib\...` and TeaVM could not find
   a single class: **every locally built archive was unusable**, failing inside `generateWebAssembly`
   with `dereferencing a null pointer`, `hello` included. On Linux the separator is already `/`, so
   the change is a no-op — which is why the fork's CI artifacts were never affected and only local
   builds broke. This was the blocker for all classlib work.
3. **`TString.java`** (in `compiler/src/sharedClasslibEmu/java`) — adds `String.lines()`.

### The class-library recipe

Adding an API takes four steps, no Binaryen, ~2.5 minutes:

1. Take the class's source from the published **`teavm-classlib-<version>-sources.jar`** and add the
   method. Do **not** use the GitHub tag of the same version: the `0.14.1` tag's `TString` imports
   `org.teavm.interop.Intrinsified`, which exists in no 0.14.1 jar. This cost a build cycle.
2. Put it in `compiler/src/sharedClasslibEmu/java/...`. `generateClassLib` compiles this source set
   into the SDK automatically.
3. Add the class to the include list in `prepareTeaVMClassLib` (`compiler/build.gradle`) so the
   runtime archive carries it too.
4. Rebuild both archives and re-vendor them (§6).

`TScanner`, `TField`, `TFileInputStream` and friends are already vendored this way, so the mechanism
is the fork's own — but note the cost: these are copies of core classes, and a TeaVM bump means
re-syncing each one against the new sources jar.

---

## 6. Building

### Requirements

- **JDK 25** (`C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot` here).
- The fork clone, pinned at `Vsprocessing/teavm-javac@d1514ab` (TeaVM 0.14.1). Gradle dependencies come
  from Maven Central; the clone at `D:\DevWork\teavm-javac-build` has them cached.
- **Binaryen (`wasm-opt`) is only needed to rebuild `compiler.wasm`** — not for the classlib archives.
- Node 20+ for the package scripts, and Chrome for the corpus (CDP).

### The archives (routine work)

```bash
cp patches/StdlibConverter.java teavm-javac/compiler/src/main/java/org/teavm/javac/
cp patches/ArchiveBuilder.java  teavm-javac/compiler/src/main/java/org/teavm/javac/
cd teavm-javac
JAVA_HOME=/path/to/jdk-25 ./gradlew :compiler:generateClassLib :compiler:buildTeaVMClassLib
```

Then vendor both:

```bash
cp compiler/build/classlib/compile-classlib-teavm.bin assets/
cp compiler/build/classlib/runtime-classlib-teavm.bin  assets/
# update SDK_SHA256 / RUNTIME_SHA256 in scripts/fetch-teavm.mjs
```

`npm run vendor:teavm` downloads the two `compiler.wasm*` artifacts from the pinned commit and copies
the two classlib archives from `assets/`, checksum-verifying all four. `npm run build` then writes
`dist/`. Nothing rewrites a third-party binary at vendoring time: the archives are build outputs,
reproducible from the pinned commit plus the patches.

### Verifying a change, cheapest first

```bash
npm test                                    # artefact/compile smoke, seconds
TEAVM_JAVAC_DIST=… node scripts/sdk-check.mjs            # 7 SDK-surface snippets, ~1 s, no browser
TEAVM_JAVAC_DIST=… node scripts/compile-program.mjs --all # all 145 programs, compile only, ~1 min
TEAVM_JAVAC_DIST=… node scripts/generate-check.mjs <id>…  # compile + generate + validate the module
ONLY=<id>,<id> node corpus/run.mjs teavm                  # run in a browser, ~1–2 min
node corpus/run.mjs teavm                                 # full corpus, ~2–9 min depending on load
```

`compile-program.mjs` and `generate-check.mjs` are the tools that make this tractable: the first
separates an SDK-surface problem from a TeaVM one, the second catches the code generator emitting
invalid wasm — both without a browser, which is how the `try/finally` bug was minimised and how a
regression shows up in seconds rather than after a corpus run.

To check a program's *output* rather than just that it ran, compare against the JDK running the same
source. The corpus harness only reports success, so a wrong-but-plausible implementation passes it
(`lines()` was verified this way).

**A corpus run is the gate.** Nothing here is "fixed" until a full run says the pass count went up and
the regression count did not, and the numbers in §1 are updated.

---

## 7. Upgrading TeaVM later

1. Bump `COMMIT`/`TEAVM_VERSION` in `scripts/fetch-teavm.mjs` and all four checksums.
2. Re-apply the three patches by hand — check each still applies and still matters:
   - `StdlibConverter`: re-check `@Rename` handling, `InnerClasses`, duplicate members, abstract
     `default`s, self-extending `Annotation`, and annotation elements. All six were found by
     measurement; a new TeaVM may fix some upstream.
   - `ArchiveBuilder`: check whether the separator is normalised upstream. If it is, delete the patch.
   - `TString` (and any later vendored class): **diff against the new sources jar** and re-apply the
     added method, rather than copying the old file forward.
3. Rebuild both archives, re-vendor, update checksums.
4. Run `sdk-check.mjs` (it encodes every SDK bug we have fixed, so it is the regression net), then
   `compile-program.mjs --all`, then the full corpus.
5. **If the compiler itself must be rebuilt** (`compiler.wasm`, i.e. any change to codegen or to
   TeVM internals): install Binaryen and run `:compiler:createDist`. This was never possible in this
   environment, so that path is untested here — expect to re-verify the two workarounds in §2
   (`SIMPLE` optimization, stdin wiring) after such a build.

### Traps that will bite again

- **Version-matched sources**: published `-sources.jar`, not the GitHub tag.
- **`@Rename` semantics**: TeaVM declares a member under an internal name and renames it when
  building the runtime. The SDK must show the Java-visible name; do not copy the target blindly
  (`<init>`/`<clinit>` must keep their names, and a rename that collides must be skipped).
- **Annotation `AnnotationDefault`**: an annotation element re-declared from reflection loses its
  default value, and javac then rejects `@Deprecated(since = "9")`.
- **Both archives**: an SDK-only change compiles and then fails at runtime.
- **Absolute paths / `set` in `cmd`**: `%VAR%` expands before `set` runs on the same line. Cost
  several wasted calls here; use literal paths in one-liners.
- **`NODE_ENV=production`** silently skips devDependencies during `npm install` — CI will hit it.

---

## 8. Diagnostics playbook

| Symptom | Where the fault is | First tool |
|---|---|---|
| `cannot find symbol` / `cyclic inheritance` / `ambiguous` | SDK surface (converter) | `compile-program.mjs` |
| Compiler throws a raw JS `TypeError`, no diagnostic | javac-in-wasm or SDK, crashing rather than reporting | `compile-program.mjs` |
| `WebAssembly.compile(): … failed: expected N elements on the stack` | code generation | `generate-check.mjs` |
| `RuntimeError: dereferencing a null pointer` during generation, **every** program | the runtime archive is malformed — check entry separators (§5.2) | `generate-check.mjs`; diff the archive against the CI artifact |
| `RuntimeError`/`ArrayIndexOutOfBounds` at run time | runtime class library | `corpus/run.mjs teavm` |
| `(could not fetch message)` | the runtime raised and `compiler.wasm-runtime.js` could not read the message off the exception — the program threw where it should not have | `corpus/run.mjs` |
| Blank output, no error | error plumbing (§2) | `worker-java.ts` |
| Hang | `ADVANCED` optimization, or a runtime loop with no `teavm_stopped()` | try `SIMPLE` |

---

## 9. Open work

**The 14 regressions block a straight swap** (§1). Most of §4c is reachable with the §5 recipe; the
code-generation faults in §4b are not, without Binaryen and a codegen patch.

### Next class-library gaps, scoped

Each needs the §5 recipe — vendor the class, add the API, list it for the runtime archive, rebuild
both archives (~2.5 min), re-vendor, then verify compile + generate + **output against the JDK**.

| Gap | What to vendor | Notes |
|---|---|---|
| `Character.UnicodeBlock` | `TCharacter` — large | the nested type is absent entirely, so it has to be authored, not just carried across. Unblocks `char-classes`. |
| `java.time` | nothing — all new | `TInstant`/`TDuration` do not exist at all, so this is authoring a `java.time` subset rather than vendoring one. Decide how much of the package to promise before starting. Unblocks `instant-duration`. |

The remaining runtime faults in §4c (`DecimalFormat`, `Throwable.getStackTrace`,
`EnumSet`/`EnumMap`, `printf("%n")`) are bugs rather than absences, and they are harder than the
additions for one reason: **a TeaVM trap reports a wasm function index, not a Java stack frame**, so
there is nothing to read off the failure. `DecimalFormat` is the largest cluster — three programs
(`stringformat`, `parse-format`, `string-format-more`), all regressions, so closing it does more for
the swap decision than either classlib addition did. The way in is to **bisect the program**: cut it
down until the trap stops, then read the classlib path that construct exercises.

Already ruled out for `DecimalFormat`: `TDecimalFormat.forDigit` (line 1157) is the digit renderer
behind the `%e`/`%f` paths and is the obvious suspect, but its only dereference is
`symbols.getZeroDigit()`, and every constructor sets `symbols` — the no-arg one delegates to the
pattern one, which passes `new TDecimalFormatSymbols()`. So the null is further in than construction,
despite `forDigit` appearing in the classlib's own `%e` call sites.

**The corpus can bisect for you now.** Failures used to record `stdout=""` whatever the program had
printed, so every failing program looked as though it died on its first statement. The worker now
catches a trap around the `main()` call and the wait loop and returns the partial `stdout` with the
error, which bisected `stringformat` in a single run: it prints `42|   42|42   |00042` and *then*
traps. So statement 1 is fine, and the fault is in statement 2 —
`String.format("%.3f|%e|%s|%b", 3.14159, 1234.5, "x", true)`. `%s` and `%b` are exercised elsewhere in
the corpus and `%,d` (statement 4) is never reached, so this is a float conversion: `%.3f` or `%e`.
Split that statement before reading any classlib code — and note the earlier `%,d` attribution was a
guess that this has now excluded.

### Beyond the class library

- **LiveCodes wiring**: not started. `vendors.ts` + `lang-java-script.ts`, keeping the
  `livecodes.java.*` contract. Until then this is a package, not an engine a user can select.
- **Publishing**: `@live-codes/java-wasm` is version `0.0.1` and unpublished. Decide the SDK-patch
  strategy before publishing (§5: we ship build outputs, not a rewritten third-party binary).
- **Scala** lives in a separate package (`@live-codes/scala-wasm`, JSPI-only, no stdin); a Doppio
  fallback belongs in LiveCodes' language config, not inside that package.
