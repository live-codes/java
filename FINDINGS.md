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
| Pass | **139 / 145** |
| Compile | **145 / 145** |
| "Works on Doppio, fails here" (regressions) | **6** |
| "Fails on both engines" | **0** |

Measured on a full run. Every program compiles, and **every remaining failure is a regression** —
there is no "broken on both engines" left to hide behind.

Every class-library addition below (`String.lines()`, `Matcher.results()`, the `%e`/`%E` and `%n` format
conversions, the `DecimalFormatSymbols` clone, the `suppressed` field, `Character.UnicodeBlock`,
`Duration.toXxxPart()`, the division helper) and both compiler patches (`CompilerResourceSupplier`,
`DivisionCheckTransformer`) are separately confirmed by running the affected programs and diffing the
output against JDK 25 — `regex-groups`, `var-textblock`, `text-block-more`, `stringformat`,
`parse-format`, `string-format-more`, `io-writers`, `exceptions-suppressed`, `char-classes`,
`instant-duration`, `reflection-members` and `exceptions` all pass.

The headline is the regression count, not the pass count: 6 of the 145 work today on the current
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

**`java.time` is a special case worth knowing about.** It is not TeaVM T-classes: it is the bundled
**ThreeTen backport**, `org.threeten.bp.**`, and `StdlibConverter` maps that package to `java/time/`
for the SDK (`StdlibConverter` line ~417). So `java.time` is real at runtime — `LocalDate`,
`DateTimeFormatter`, `Duration`, `Instant` all work — but it is ThreeTen's API level, which predates
the Java 9 additions (`Duration.toXxxPart()`, …). Fixing a gap there means vendoring the threeten
class, and the archive and SDK both pick the patched copy up (§5).

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
- **The stack deobfuscator** — not an import, a loader option the worker passes when it instantiates
  the program. `Throwable.getStackTrace()` is implemented by calling out to the runtime's
  `takeStackTrace`, which maps the JS stack's addresses to Java frames through a deobfuscator; with no
  deobfuscator it returns TeaVM's stand-in frames (`Throwable$FakeClass.fakeMethod`). Every generated
  module carries its debug info **embedded** (the fork sets `WasmDebugInfoLocation.EMBEDDED` in
  `Compiler.java`), and one generic 40 KB `compiler.wasm-deobfuscator.wasm` reads it, so the worker
  enables it for the program too — see §5. Without that, `getStackTrace()` reports fake frames; with it
  enabled but no deobfuscator module to load, frames come back with **null** names and crash user code
  that reads them.

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

### 4b. Code generation — TeaVM core, worked around or unfixed

Two of these are worked around in the class library/compiler, because the check can be expressed in
Java; the rest need the wasm backend itself.

- **`try { return x; } finally { return y; }` emits invalid wasm**: `expected 1 elements on the stack
  for fallthru, found 2`. Generation succeeds; V8 rejects the module. Narrow: every other try/finally
  shape works, and a `return` in a `finally` is rare and discouraged.
- **`ArithmeticException` on integer division by zero** is not raised — the wasm `i32.div_s` traps
  instead, so `catch (ArithmeticException)` never runs. `MIN_VALUE / -1` traps too, where Java returns
  `MIN_VALUE`. **Worked around here**: `DivisionCheckTransformer` rewrites int/long
  `DIVIDE`/`MODULO` into calls to `org.teavm.classlib.impl.math.Division`, which checks the divisor and
  special-cases the overflow (registered for `WasmGCTarget` only — the JS backend already throws).
  Verified with a 52-case differential probe against the JDK. See `patches/README.md`.
- **`Object.clone()` returns an object with no vtable**, so the *first virtual call* on the copy traps
  with `dereferencing a null pointer`. `clone()` compiles to TeaVM's `cloneLowLevel`, which allocates
  through the low-level `Allocator`/`Structure` API rather than the WasmGC `struct.new` path; the copy
  gets the fields (a field read or a devirtualised call on it still works, and `getClass()` returns the
  right class) but not the vtable slot a virtual call dispatches through. Measured, not read off the
  code: an instrumented `TDecimalFormat` printed a `symbols` that was non-null yet whose
  `getClass().getName()` was `null`, and the trap landed in `DecimalFormat.forDigit` on
  `symbols.getZeroDigit()`. **`super.clone()` is the broken shape** — a plain virtual `clone()` call on
  an object whose class does not override it works. Array clone traps outright
  (`int[] b = a.clone()`). This is one bug behind four regressions (§4c below), and it is worth
  suspecting for any other "elements are null" report (`Throwable.getStackTrace()` also clones).
- **A stream lambda over `StackTraceElement[]` that calls `getMethodName()` and *uses* the result
  traps** with `dereferencing a null pointer`, even though the frame and its name are both non-null.
  Measured on generated code rather than inferred: `anyMatch(x -> x.getMethodName().equals("main"))`
  traps, while `anyMatch(x -> x.getMethodName() != null)`, a plain non-lambda
  `f.getMethodName().equals("main")`, and `map(StackTraceElement::getMethodName).findFirst().get()`
  all return the right value in the same module. Now that `getStackTrace()` returns real frames
  (§2/§5), this is the *only* thing left failing `exceptions-stacktrace` and `exception-propagation` —
  their stack-trace data is correct.

Touching the backend itself means rebuilding `compiler.wasm` — which now **works**, reproducibly, in
~9 minutes (§6). `clone()` is worked around per class in the class library and division is worked
around by the transformer (§5); the three that remain (finally-return, and the two shape-dependent
vtable/metadata traps) have no Java-level expression, so they are backend work.

### 4c. Runtime class library — fixable here, one class at a time

| Missing / broken | Programs |
|---|---|
| ~~`Matcher.results()`~~ — **fixed here** | `regex-groups` now passes. `TMatcher` vendored (§5); the body continues from the matcher's current position like the JDK does |
| ~~`DecimalFormatSymbols.clone()`~~ — **fixed here** | `stringformat`, `parse-format`, `string-format-more`. The null was never in `DecimalFormat`: it clones its symbols, and `Object.clone()` returns a vtable-less object under WasmGC (§4b). `TDecimalFormatSymbols` vendored with an explicit field copy |
| ~~`%e`/`%E` conversions~~ — **added here** | the second half of `stringformat`; `TFormatter` produced `Unknown format conversion: e` |
| ~~`%n` conversion~~ — **added here** | `stringformat`, `io-writers`; `Unknown format conversion: n` |
| ~~`Character.UnicodeBlock`~~ — **added here** | `char-classes`; neither `UnicodeBlock` nor `Character.Subset` exists in TeaVM 0.14.1. `TCharacter` vendored and the nested types appended; the block table is generated from the JDK (§5) |
| ~~`java.time` missing its Java 9+ additions~~ — **fixed here** | `instant-duration`. `java.time` is *not* absent: it is implemented by the bundled **ThreeTen backport** (`org.threeten.bp.*`, in the runtime archive) and `StdlibConverter` maps `org/threeten/bp/` → `java/time/` for the SDK. ThreeTen predates Java 9, so `Duration.toXxxPart()` was missing from the API entirely; `org/threeten/bp/Duration` vendored with the six accessors |
| ~~`Throwable.suppressed` null~~ — **fixed here** | `exceptions-suppressed`. The field initializer never runs (TeaVM constructs through the `@Rename("<init>")` `init(…)` methods, not the real constructor), so `addSuppressed`/`getSuppressed` dereferenced null. `TThrowable` vendored with lazy accessors |
| ~~`getStackTrace()` fake/incomplete frames~~ — **fixed here** | `exceptions-stacktrace`, `exception-propagation` get *real* frames now (class and method names), because the worker enables the stack deobfuscator and ships `compiler.wasm-deobfuscator.wasm`. Both programs still fail on the codegen fault in §4b, which is now the only thing left |
| `EnumSet`/`EnumMap` null pointer in `AbstractStringBuilder.insert` | `enum-map-set` |
| ~~Reflection methods~~ — **fixed here** | `reflection-members`. Class/field reflection already worked, but `getDeclaredMethods()` returned empty, so `getMethod`/`getDeclaredMethod` always threw. `ReflectionDependencyListener` preserves only the members a `ReflectionSupplier` lists, and the fork's supplier listed all *fields* for application classes but no *methods*; the compiler patch mirrors the field rule (§5, `patches/README.md`) |
| `Class.forName` for a class whose class object was never touched | `reflection`'s last line. `TClass.forName` builds its name map from generated `ClassInfo`, which only contains classes already materialized — `String.class.getName()` earlier in the same program makes it resolve. A wasmGC metadata limitation, not the supplier |

`String.lines()` was in this list and is **fixed** — see §5 and `patches/README.md` for the recipe.
Everything marked *fixed here* is either a one-shot vendored class or (for real stack traces) a loader
option in the worker; none of them needed the compiler rebuilt.

### 4d. Deliberate omissions

- **File I/O** has no directory model: NIO paths fail cleanly. A browser playground has nowhere to
  put them; a deliberate drop, not a bug.
- **Kotlin** is not supported. Doppio-modern was the only working route and was unusably slow
  (7–20 min cold, 163 MB of jars fetched cross-origin). Dropped.
- **ADVANCED optimization** (see §2).

---

## 5. What we patch

Five files, all drop-in replacements in the fork, plus a set of vendored class-library classes.
`patches/README.md` has the details and reproduction steps; the short version:

1. **`StdlibConverter.java`** — applies `@Rename`, renames `InnerClasses`/`EnclosingMethod`/nest
   attributes, emits each member once, relaxes `ACC_ABSTRACT` where the platform's method is not
   abstract, drops a superinterface that renames to the class itself, and fills an annotation in from
   the platform's own class file (elements and their `AnnotationDefault` values).
2. **`ArchiveBuilder.java`** — normalises archive entry names to `/`. It named entries from
   `Path.toString()`, so on Windows they came out as `org\teavm\classlib\...` and TeaVM could not find
   a single class: **every locally built archive was unusable**, failing inside `generateWebAssembly`
   with `dereferencing a null pointer`, `hello` included. On Linux the separator is already `/`, so the
   change is a no-op — which is why the fork's CI artifacts were never affected and only local
   builds broke. This was the blocker for all classlib work.
3. **`CompilerResourceSupplier.java`** — the `ReflectionSupplier` the fork registers for the compiler.
   TeaVM's `ReflectionDependencyListener` preserves only the members a supplier lists; this one listed
   every **field** of an application class but no **methods**, so `getDeclaredMethods()` was empty and
   `getMethod`/`getDeclaredMethod` always threw. The patch mirrors the field rule for methods. This is
   a **compiler** change — `:compiler:optimizeWasmGC`, not the archives.
4. **`DivisionCheckTransformer.java`** (a new file, not a replacement) — a `ClassHolderTransformer`
   that rewrites int/long `DIVIDE`/`MODULO` into calls to `org.teavm.classlib.impl.math.Division`, so a
   zero divisor throws `ArithmeticException` instead of trapping in wasm. Registered in
   `Compiler.createTeaVM` for `WasmGCTarget` only. Also a compiler change.
5. **Vendored class-library classes**, in `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/...`
   and each listed by name in `prepareTeaVMClassLib`'s include list:

   | Class | Change |
   |---|---|
   | `java/lang/TString` | `lines()` added |
   | `java/util/regex/TMatcher` | `results()` added |
   | `java/text/TDecimalFormatSymbols` | `clone()` copies its fields explicitly instead of `super.clone()`, which is broken under WasmGC (§4b) |
   | `java/util/TFormatter` | `%e`/`%E` conversions added (exponent pattern + an explicit exponent sign), and `%n` added |
   | `java/lang/TThrowable` | `getSuppressed`/`addSuppressed` tolerate the null `suppressed` field TeaVM's construction path leaves behind |
   | `java/lang/TCharacter` | `Character.Subset` and `Character.UnicodeBlock` appended — neither exists upstream. The 339 block constants and their ranges are **generated from the JDK** by `scripts/gen-unicode-blocks.java`, so `of()` agrees with the JDK exactly (including code points in no block, and the surrogate ranges) |
   | `org/threeten/bp/Duration` | the six Java 9 `toXxxPart()` accessors added — this is the package `java.time` is converted from, so they were missing from the Java API entirely (§2) |
   | `org/teavm/classlib/impl/math/Division` | **new** class (not upstream) — `div`/`rem` for int/long that throw on a zero divisor and special-case `MIN_VALUE / -1`; the target of `DivisionCheckTransformer` (item 4) |

   `TCharacter` is the one vendored class with substantial *new API* rather than a fix, and its data is
   the JDK's, not hand-typed: run `java scripts/gen-unicode-blocks.java` and paste the output between
   the `generated` markers (the script's header explains it). Two semantics were measured against the
   JDK rather than assumed — `Subset.equals`/`hashCode` are **identity**-based, so `hashCode` is not
   `name.hashCode()`.

6. **The stack deobfuscator**, which is not a patch but a loader option the worker now passes when it
   instantiates a program, plus the `compiler.wasm-deobfuscator.wasm` artifact that makes it work
   (`scripts/fetch-teavm.mjs` vendors it; `scripts/build.mjs` copies it next to `compiler.wasm`). See
   §2: this is what turns `getStackTrace()` from TeaVM's stand-in frames into real ones.

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

`npm run vendor:teavm` copies all five artifacts from `assets/` into `vendor/teavm/`, checksum-verifying
each — **nothing is downloaded**, so a clone builds and runs offline. `npm run build` then writes
`dist/`. `assets/` is the source of truth: the two archives are outputs of the fork build, and
`compiler.wasm` is too now that it carries `patches/CompilerResourceSupplier.java` (§5). Provenance for
every file — the pinned fork commit, the patches that apply, and the upstream URL for diffing — is in
`scripts/fetch-teavm.mjs`'s header.

### Rebuilding the compiler (`compiler.wasm`) — proven, and reproducible

This used to be "never possible in this environment". It works now: `patches/Dockerfile` pins JDK 25
and Binaryen 133, and the whole build runs in a container. Measured on one machine with a cold Gradle
cache: **8m53s** for `:compiler:optimizeWasmGC`, most of it `generateWasmGC` plus `wasm-opt -O4`.

```bash
cd /path/to/teavm-javac
docker build -f patches/Dockerfile -t teavm-javac-build .
docker run --rm -v "$PWD":/work -v teavm-gradle:/root/.gradle teavm-javac-build \
    bash ./gradlew :compiler:optimizeWasmGC --console=plain --no-daemon
```

The three artifacts this package vendors come from:

| File | Where |
|---|---|
| `compiler.wasm` | `compiler/build/generated/teavm/wasm-gc-optimized/compiler.wasm` |
| `compiler.wasm-deobfuscator.wasm` | the same directory |
| `compiler.wasm-runtime.js` | `compiler/build/generated/teavm/wasm-gc/compiler.wasm-runtime.js` (patched by `patchWasmGCRuntime`) |

`:compiler:createDist` is **not** required — it additionally runs `generateJavaScript` and the npm
wrapper (which needs Node). The three files above are the whole vendored surface.

Two things were measured rather than assumed:

- **The runtime glue is bit-for-bit reproducible.** The rebuilt `compiler.wasm-runtime.js` hashes to
  exactly the pinned `4709a64b…`, although the build environment differs.
- **The rebuilt compiler is functionally equivalent.** Its `compiler.wasm` differs byte-wise
  (`4700c30b…`, 5.46 MB, versus the pinned `ea83c69d…` — a different `wasm-opt` version), but a full
  corpus run with it gives **the same 137/145 and the same 8 failures**. The pinned artifact is kept:
  do not swap it without re-running the corpus.

**Build inside the container, not on a Windows bind mount.** Gradle's input hashing over Docker
Desktop's 9p/virtiofs mount is pathologically slow — `du` over the clone takes minutes — so copy the
*source* in (~38 MB) and build there; the extracted JDK (696 MB) is fetched by the build itself.

### Verifying a change, cheapest first

```bash
npm test                                    # artefact/compile smoke, seconds
TEAVM_JAVAC_DIST=… node scripts/sdk-check.mjs            # 7 SDK-surface snippets, ~1 s, no browser
TEAVM_JAVAC_DIST=… node scripts/compile-program.mjs --all # all 145 programs, compile only, ~1 min
TEAVM_JAVAC_DIST=… node scripts/generate-check.mjs <id>…  # compile + generate + validate the module
TEAVM_JAVAC_DIST=… node scripts/run-program.mjs <id> --jdk # compile + generate + RUN, and diff against JDK 25
ONLY=<id>,<id> node corpus/run.mjs teavm                  # run in a browser, ~1–2 min
node corpus/run.mjs teavm                                 # full corpus, ~2–9 min depending on load
```

`compile-program.mjs` and `generate-check.mjs` are the tools that make this tractable: the first
separates an SDK-surface problem from a TeaVM one, the second catches the code generator emitting
invalid wasm — both without a browser, which is how the `try/finally` bug was minimised and how a
regression shows up in seconds rather than after a corpus run. `run-program.mjs` goes one stage
further and actually runs the program, printing its stdout and (with `--jdk`) the local JDK's stdout
for the same source: it turns "does it run" into "does it match", and a wasm trap into a **named Java
stack**, which is what located the `clone()` bug in one probe after several rounds of reading code had
failed. A TeaVM trap with `--trace` reports the wasm functions by name — `DecimalFormat.forDigit` — so
add a print to the class you suspect only when the stack is not enough.

To check a program's *output* rather than just that it ran, compare against the JDK running the same
source. The corpus harness only reports success, so a wrong-but-plausible implementation passes it
(`lines()` was verified this way).

**A corpus run is the gate.** Nothing here is "fixed" until a full run says the pass count went up and
the regression count did not, and the numbers in §1 are updated.

---

## 7. Upgrading TeaVM later

1. Bump `COMMIT`/`TEAVM_VERSION` in `scripts/fetch-teavm.mjs` and all five checksums.
2. Re-apply the three patches by hand — check each still applies and still matters:
   - `StdlibConverter`: re-check `@Rename` handling, `InnerClasses`, duplicate members, abstract
     `default`s, self-extending `Annotation`, and annotation elements. All six were found by
     measurement; a new TeaVM may fix some upstream.
   - `ArchiveBuilder`: check whether the separator is normalised upstream. If it is, delete the patch.
   - `TString` (and any later vendored class): **diff against the new sources jar** and re-apply the
     added method, rather than copying the old file forward. `TCharacter` is the awkward one: take the
     new upstream file, then re-append the nested `Subset`/`UnicodeBlock` types, re-running
     `scripts/gen-unicode-blocks.java` so the block table matches the new JDK build (the JDK's table is
     the authority, not TeaVM's). `org/threeten/bp/Duration` is the simple case: diff it and re-add the
     six `toXxxPart()` accessors — or **delete the vendored copy entirely** if the new ThreeTen carries
     them, which is the preferred ending for any of these.
3. Rebuild both archives, re-vendor, update checksums.
4. Run `sdk-check.mjs` (it encodes every SDK bug we have fixed, so it is the regression net), then
   `compile-program.mjs --all`, then the full corpus.
5. **If the compiler itself must be rebuilt** (`compiler.wasm`, i.e. any change to codegen or to
   TeVM internals): use the container recipe in §6 — it is proven, ~9 minutes, and it pins JDK 25 and
   Binaryen. Re-verify the two workarounds in §2 (`SIMPLE` optimization, stdin wiring) on the new
   build, then run the full corpus before swapping the artifact (the rebuilt module differs byte-wise
   from the pinned one, so "it compiles" is not enough).

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
| `RuntimeError`/`ArrayIndexOutOfBounds` at run time | runtime class library | `corpus/run.mjs teavm`, or `run-program.mjs <id> --trace` without a browser |
| `dereferencing a null pointer` at run time **on an object that is not null** — a freshly cloned one — with the trap in a getter | `Object.clone()` under WasmGC: the copy has no vtable (§4b) | `run-program.mjs <id> --trace`; then copy the fields explicitly in the class that clones |
| `(could not fetch message)` | the runtime raised and `compiler.wasm-runtime.js` could not read the message off the exception — the program threw where it should not have | `corpus/run.mjs` |
| Blank output, no error | error plumbing (§2) | `worker-java.ts` |
| Hang | `ADVANCED` optimization, or a runtime loop with no `teavm_stopped()` | try `SIMPLE` |

---

## 9. Open work

**The 6 regressions block a straight swap** (§1). Most of §4c is reachable with the §5 recipe; the
code-generation faults in §4b are not, without a wasm-backend change.

### The float cluster — resolved, and what it taught

`stringformat`, `parse-format` and `string-format-more` are fixed. The written-up lead (a CLDR native
`getNumberFormatMap` not being linked, §9 of the previous revision) was **wrong**, as were the two
attributions before it — `DecimalFormat.forDigit` and the grouped-integer conversion. What settled it
was measurement at three levels:

1. `run-program.mjs --trace` — the trap arrived with **named Java frames** (`DecimalFormat.forDigit`
   calling `symbols.getZeroDigit()`). A TeaVM trap is *not* limited to a wasm function index; the name
   section is intact under `SIMPLE`, so this is always available and is the cheapest first move.
   Bisecting the program (partial stdout) narrowed it to `DecimalFormat.format(long)`; the stack named
   the exact call.
2. An **instrumented classlib** (`dbg` prints in a vendored `TDecimalFormat`) showed `symbols` was
   **non-null** but its `getClass().getName()` was `null` — so the field was fine and the *object* was
   broken. That killed every "the field is never assigned" reading in one build.
3. The same shape reproduced in four lines of user code: a clone whose fields read back correctly and
   whose first *virtual* call traps.

Root cause and fix: §4b and §5. The lesson the cluster keeps teaching: **cut it to a probe and run
it** — three attributions made by reading code were all wrong, and the probe that worked was the
cheapest.

### The exceptions cluster — 1 fixed, 2 blocked on codegen

`exceptions-suppressed` is fixed (a null field, §4c). The other two needed two things, and got the
first: `getStackTrace()` now returns **real** frames, because the worker enables the stack
deobfuscator (§2/§5). That is not a cosmetic change — before it, every frame was
`Throwable$FakeClass.fakeMethod`, and a half-built deobfuscator gave frames whose names were null.
`exceptions` is **fixed** — the divide-by-zero trap is now a Java-level check routed by
`DivisionCheckTransformer` (§4b/§5). `exceptions-finally` remains: the `finally { return }` wasm, which
is backend work.

The stream-lambda trap above is also worth re-checking with a *fresh* build rather than patching
around: it is shape-dependent, so a different `wasm-opt` or inliner settings may change it.

### Next steps, ranked

| Item | What it takes |
|---|---|
| `EnumSet`/`EnumMap` (`enum-map-set`) | reduced to a **codegen** fault, not fixable in the class library. The trap is `AbstractStringBuilder.insert(int, char)` on a null `buffer`, reached from the `StringBuilder` that `AbstractMap.toString`/`AbstractCollection.toString` build — TeaVM's method *copies* (`insert_0`, `insert_4`, `append(204)`). It is shape-dependent, which is the tell: a near-identical program (`HashMap<Level,Integer>` printed with `+`, and an `EnumMap` printed in isolation) produces correct output, and giving the enum its **own** `toString()` makes the exact corpus shape work. Without that override, a *virtual* call to the inherited `TEnum.toString()` traps while the final `name()`/`ordinal()` on the same object work, and `getClass().getName()` on it returns null. Same family as the `Object.clone()` bug in §4b: a vtable slot / class metadata that the generator did not emit correctly for that program. **Needs Binaryen and a codegen fix** |
| `reflection` | **only its last line is left**: `Class.forName("java.lang.String")`. `TClass.forName` builds its name map from the generated `ClassInfo` table, which contains only classes whose class object was already materialized — calling `String.class.getName()` earlier in the same program makes it resolve. Everything else in the program (class and method reflection, including `invoke`) now matches the JDK. Fixing it means emitting name info for more classes in `WasmGCReflectionGenerator` (a compiler change), or documenting "forName sees initialized classes only" |
| `exceptions-finally`, and the two `StackTraceElement` programs | codegen: needs a wasm-backend change (the compiler rebuild itself is proven, §6), or an upstream TeaVM fix |

The two remaining runtime faults are bugs rather than absences, so they need reducing before they can
be fixed: bisect the program until the trap stops, take the stack from `run-program.mjs --trace`, then
read only the class that frame names.

### Closed this session (for the record)

The float cluster (`stringformat`, `parse-format`, `string-format-more` — one `Object.clone()` bug,
§4b/§5), `io-writers` (`%n`), `exceptions-suppressed` (`Throwable.suppressed`), `char-classes`
(`Character.UnicodeBlock`, generated from the JDK), `instant-duration` (`Duration.toXxxPart()`, which
also took the compile count to **145/145**), `reflection-members` (the `CompilerResourceSupplier`
patch), and `exceptions` (`DivisionCheckTransformer` + the `Division` helper). Each was verified by
diffing the program's output against JDK 25, not just by the corpus going green.

### Beyond the class library

- **LiveCodes wiring**: not started. `vendors.ts` + `lang-java-script.ts`, keeping the
  `livecodes.java.*` contract. Until then this is a package, not an engine a user can select.
- **Publishing**: `@live-codes/java-wasm` is version `0.0.1` and unpublished. Decide the SDK-patch
  strategy before publishing (§5: we ship build outputs, not a rewritten third-party binary).
- **Scala** lives in a separate package (`@live-codes/scala-wasm`, JSPI-only, no stdin); a Doppio
  fallback belongs in LiveCodes' language config, not inside that package.
