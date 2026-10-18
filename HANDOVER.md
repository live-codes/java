# HANDOVER

Everything a new session needs to continue this work without re-deriving it. Written after the session
that closed the float cluster and halved the regression count. **Read `FINDINGS.md` first** — it is the
technical record (architecture, every known failure grouped by where the fault lives, the class-library
recipe, the upgrade procedure, a symptom-to-tool diagnostics table). This file is the **operational**
handover: what state things are in, what to do next, and the traps that cost time here.

---

## 1. The mission

Replace LiveCodes' Java engine. Today's engine is Doppio (`@seth0x41/doppio@1.0.0` + `browserfs@1.4.3`,
an interpreted JDK 8 JVM): slow, frozen at Java 8, and a dead end for Kotlin/Scala.

The replacement is `@live-codes/java-wasm`: **javac + the TeaVM compiler compiled to WebAssembly**,
built from the fork `Vsprocessing/teavm-javac@d1514ab` (TeaVM 0.14.1).

User's stated success bar: **minimise regressions** — specifically, "works on Doppio, fails here"
should reach zero (or become an explicitly documented, accepted subset). The bar for a straight swap
has **not** been met yet: **9 regressions** remain (was 14).

**Do not touch `D:\DevWork\live-codes\livecodes`.** The user said so explicitly: *"Do not write to
LiveCodes till I tell you. This project is not yet ready."* A previous attempt at the wiring was
written and then reverted at their instruction; that repo is currently clean. The engine is not ready
because of the 9 regressions, not because the wiring is hard.

Kotlin: **dropped**, permanently as far as this work is concerned. Scala: lives in a **separate**
package (`@live-codes/scala-wasm`, JSPI-only, no stdin); a Doppio fallback belongs in LiveCodes'
language config, never inside that package. Do not resurrect either without being asked.

---

## 2. Current status

Measured on `corpus/` (145 programs), last full run:

| | |
|---|---|
| Pass | **140 / 145** |
| Compile | **145 / 145** |
| Regressions (work on Doppio, fail here) | **5** |
| Fails on both engines | **0** |

Failing programs (5): `exceptions-finally`, `exceptions-stacktrace`, `exception-propagation`,
`enum-map-set`, `file-io`.

Where each cluster lives is in `FINDINGS.md` §4. The short version:

- **All 5 remaining failures are regressions**, and the corpus compiles **145/145**.
- **No class-library work is left.** Every remaining failure is **code generation** (4:
  `exceptions-finally`, the two `StackTraceElement` stream-lambda programs and `enum-map-set` — the
  last three are *one* fault, an unfilled vtable, §6) or **deliberate** (1: `file-io`).
- Those are backend work, which needs a `compiler.wasm` rebuild. **The rebuild is proven** (§6A), so
  the loop is: patch, ~5–9 min, corpus. Two faults that *looked* like backend work were fixed in Java
  instead (§4b: `clone()` in the class library, division by a `ClassHolderTransformer`, and class-name
  metadata by a core patch) — try that shape first, it keeps working.

Git: `D:\DevWork\live-codes\java` is **clean** at the tip of `main` (eleven commits this session: the
float cluster, exceptions/stack-trace, `char-classes`, the committed artifacts, `instant-duration`, the
Docker build recipe, the reflection compiler patch, the UPSTREAM refresh, the division fix, and the
class-name metadata fix).

---

## 3. The artifacts

```
browser worker (src/worker-java.ts)
  ├── compiler.wasm                   5.2 MB   OpenJDK javac + TeaVM compiler + WasmGC backend
  ├── compiler.wasm-deobfuscator.wasm  40 KB   maps wasm addresses → Java frames for getStackTrace()
  ├── compile-classlib-teavm.bin      214 KB   javac's platform classpath ("the SDK")
  └── runtime-classlib-teavm.bin      2.3 MB   TeaVM's class library, T-prefixed
```

- **`compile-classlib-teavm.bin`** — the *converted* class library: `StdlibConverter` renames
  `org.teavm.classlib.java.**.T*` into `java.**`. javac only ever sees this one.
- **`runtime-classlib-teavm.bin`** — the *unconverted* class library (T-names), which TeaVM generates
  from. Also carries the fork's replacements/additions for specific classes.
- **`compiler.wasm-deobfuscator.wasm`** — new this session. A generated module carries its debug info
  *embedded*, and this stock module reads it, so `Throwable.getStackTrace()` reports real class and
  method names. The worker passes it as a loader option (FINDINGS §2); without it `getStackTrace()`
  returns TeaVM's `Throwable$FakeClass.fakeMethod` stand-in.

**The rule that matters: a class-library change must land on both sides.** SDK-only compiles and then
fails at runtime, which is worse than a compile error. Both archives are built by the fork and vendored
in `assets/` with pinned checksums in `scripts/fetch-teavm.mjs`.

Worker protocol (do not break it; the LiveCodes wiring depends on this shape):

```
{ cmd: 'init', baseUrl? }                  → { type: 'initialized', initMs } | { type: 'init-error', error }
{ cmd: 'run', source, mainClass?, input? } → { type: 'result', ok, compileMs, generateMs, runMs,
                                               stdout, stderr, exitCode, diagnostics }
```

---

## 4. What this session did

| Commit | What |
|---|---|
| the metadata commit | **Class names, and `Class.forName`.** Whether a class carries its name in the generated `ClassInfo` was decided per class from the statically known `Class` values reaching `Class.getName()`, so `getClass().getName()` returned `null` and `Class.forName` could only resolve a class some other line had already asked the name of. `patches/ClassMetadataRequirements.java` — a **TeaVM core** class shadowed through `compiler/src/patches/java` — makes `getName`/`forName` mean *every* class gets its name. `reflection` now matches JDK 25 byte for byte |
| the division commit | **Integer division by zero.** The WasmGC backend emits `div_s`/`rem_s` with no check, so `10 / 0` trapped instead of throwing `ArithmeticException`. `DivisionCheckTransformer` (a `ClassHolderTransformer` registered for `WasmGCTarget`) rewrites int/long `DIVIDE`/`MODULO` into calls to a new class-library `Division` helper that checks the divisor and special-cases `MIN_VALUE / -1`. `exceptions` now matches JDK 25; verified with a 52-case differential probe |
| the reflection commit | **Method reflection.** `getDeclaredMethods()` was empty for user classes because TeaVM's `ReflectionDependencyListener` preserves only what a `ReflectionSupplier` lists, and the fork's `CompilerResourceSupplier` listed every field of an application class but no methods. `patches/CompilerResourceSupplier.java` mirrors the field rule; `reflection-members` now matches JDK 25. The rebuilt `compiler.wasm` is what ships in `assets/`, so this is also the first artifact built here rather than downloaded |
| the Docker commit | `patches/Dockerfile` pins JDK 25 + Binaryen 133 and rebuilds the compiler in ~9 min; proven reproducible (the runtime glue is bit-for-bit identical) |
| the `instant-duration` commit | **`Duration.toXxxPart()`.** `java.time` here is the bundled **ThreeTen backport** (`org.threeten.bp.*`, mapped to `java/time/` by `StdlibConverter`), which predates Java 9, so the accessor family was missing from the API and the SDK. Vendored `org/threeten/bp/Duration` with the six accessors. Compile is now **145/145** |
| the artifacts commit | `dist/` and `vendor/` are no longer gitignored: the compiler, its runtime glue, the deobfuscator and both class-library archives are **in the repo**, so a clone works without a build or a download |
| the `char-classes` commit | **`Character.UnicodeBlock`.** Neither it nor `Character.Subset` exists in TeaVM 0.14.1, so vendored `TCharacter` and appended the nested types. The 339 block constants and ranges come from the JDK, generated by `scripts/gen-unicode-blocks.java` |
| the exceptions commit | `TThrowable.suppressed` is never initialised → vendor it with lazy accessors; and enable the **stack deobfuscator** in the worker, vendoring `compiler.wasm-deobfuscator.wasm`, so `getStackTrace()` returns real frames |
| `e1a9c29` | **The float cluster.** Found that `DecimalFormatSymbols.clone()` returns a vtable-less object under this WasmGC backend, vendored `TDecimalFormatSymbols` with an explicit copy, and vendored `TFormatter` with the missing `%e`/`%E` and `%n` conversions. Added `scripts/run-program.mjs` |

Net: **130/145 → 140/145**, **14 → 5 regressions**, **compile 143/145 → 145/145**, nothing newly broken.
Closed `stringformat`, `parse-format`, `string-format-more`, `io-writers`, `exceptions-suppressed`,
`char-classes`, `instant-duration`, `reflection-members`, `exceptions`, `reflection`.

The single most valuable thing added is `scripts/run-program.mjs` — see §6. It gives named Java stack
traces for a wasm trap, which is what actually cracked both clusters after several wrong attributions
made by reading code. `FINDINGS.md` §9 records that history so it is not repeated.

---

## 5. Environment and how to build

### Facts

| | |
|---|---|
| Repo | `D:\DevWork\live-codes\java` — `@live-codes/java-wasm@0.0.1`, `files: ["dist"]` |
| Fork clone | `D:\DevWork\teavm-javac-build` (at `d1514ab`, **modified** — see below) |
| Compiler dist for local tools | `D:\DevWork\teavm-javac-build\dist\teavm-javac` |
| JDK 25 | `C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot` (`JAVA_HOME` is **not** set in shells) |
| Node | 24 (`node:zlib`/`node:fs` used by the scripts; WasmGC works in Node) |
| Binaryen (`wasm-opt`) | **installed** now: 133 at `D:\DevWork\tools\binaryen-version_133`; the reproducible path is the container below |
| Docker | yes (28.2.2, linux/x64). Image `teavm-javac-build` (built from `patches/Dockerfile`) = JDK 25 + Binaryen 133; a named volume `teavm-gradle` caches Gradle and the dependencies |
| Chrome | needed for `corpus/run.mjs` (CDP) |

**The fork clone is modified and must stay that way** — these are the sources of the vendored
archives:

- `compiler/src/main/java/org/teavm/javac/StdlibConverter.java` — copy of `patches/StdlibConverter.java`
- `compiler/src/main/java/org/teavm/javac/ArchiveBuilder.java` — copy of `patches/ArchiveBuilder.java`
- `compiler/src/main/java/org/teavm/javac/CompilerResourceSupplier.java` — copy of
  `patches/CompilerResourceSupplier.java` (the `ReflectionSupplier`; keeps application-class methods)
- `compiler/src/main/java/org/teavm/javac/DivisionCheckTransformer.java` — copy of
  `patches/DivisionCheckTransformer.java` (rewrites int/long division to the helper below)
- `compiler/src/patches/java/org/teavm/model/analysis/ClassMetadataRequirements.java` — copy of
  `patches/ClassMetadataRequirements.java`. This one is **TeaVM core, not a fork file**: a source in
  `src/patches/java` shadows the core jar on the compiler's classpath (the same trick as the five
  patches already there), so a core fix needs no fork patch point
- `compiler/build.gradle` — the include list in `prepareTeaVMClassLib` (one line per vendored class)
- `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/...` — the vendored classes:
  `java/lang/TString` (`lines()`), `java/util/regex/TMatcher` (`results()`),
  `java/text/TDecimalFormatSymbols` (explicit `clone()`), `java/util/TFormatter` (`%e`/`%E`, `%n`),
  `java/lang/TThrowable` (lazy `suppressed`), `java/lang/TCharacter` (`Character.Subset` and
  `Character.UnicodeBlock` appended; its block data is generated — see below),
  `org/threeten/bp/Duration` (the Java 9 `toXxxPart()` accessors — note this is the package
  `java.time` is converted from, so it fixes `java.time.Duration`), and
  `org/teavm/classlib/impl/math/Division` (a **new** class: division/remainder that throw on a zero
  divisor — the target of `DivisionCheckTransformer`). Each change is marked `Fork addition:`

(`git status` in the clone also shows leftover scratch: `b1.txt`…`b5.txt`, `sdk-*.bin`, etc. Ignore.)

### Regenerating `Character.UnicodeBlock`'s data

The block names and ranges are the JDK's, not hand-typed:

```bash
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot"
java scripts\gen-unicode-blocks.java > blocks.txt      # 339 blocks, 338 ranges
```

Paste the output between the `generated` markers in the fork's
`compiler/src/sharedClasslibEmu/java/org/teavm/classlib/java/lang/TCharacter.java` (the script's header
explains the markers). The JDK is the authority for this data — and the semantics of `Subset.equals`/
`hashCode` were measured against it too, not assumed: they are identity-based, so `hashCode` is *not*
`name.hashCode()`. `FINDINGS.md` §7 covers re-syncing on a TeaVM bump.

### Building the two archives (routine, no Binaryen, ~30 s warm / ~2.5 min cold)

**The artifacts are committed, so a fresh clone needs no build at all.** `vendor/teavm/` holds the
three compiler artifacts and the two archives; `dist/` holds the two esbuild bundles and `dist/teavm/`,
which is what `scripts/run-program.mjs` and the corpus read. `node scripts/build.mjs` regenerates
`dist/` from `vendor/teavm/` in well under a second; `npm run build` additionally re-copies all five
artifacts from `assets/` and checksum-verifies them. **Nothing is downloaded** — the whole build works
offline, and `assets/` is the source of truth (including `compiler.wasm`, which carries
`patches/CompilerResourceSupplier.java`).

**Whenever the class-library archives are rebuilt**, run `npm run build` and **commit `assets/`,
`vendor/teavm/` and `dist/teavm/` together** — they are tracked now, and letting them drift means the
repo runs on a stale archive.

```bash
cd /d D:\DevWork\teavm-javac-build
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot"
call gradlew.bat :compiler:generateClassLib :compiler:buildTeaVMClassLib --console=plain
```

Then **vendor both** and update the checksums (this is the step that is easy to forget):

```bash
copy /y "D:\DevWork\teavm-javac-build\compiler\build\classlib\compile-classlib-teavm.bin" assets\compile-classlib-teavm.bin
copy /y "D:\DevWork\teavm-javac-build\compiler\build\classlib\runtime-classlib-teavm.bin"  assets\runtime-classlib-teavm.bin
node -e "const fs=require('fs'),c=require('crypto');for(const f of ['assets/compile-classlib-teavm.bin','assets/runtime-classlib-teavm.bin']){const b=fs.readFileSync(f);console.log(f,b.length,c.createHash('sha256').update(b).digest('hex'))}"
# paste both hashes into SDK_SHA256 / RUNTIME_SHA256 in scripts/fetch-teavm.mjs
npm run build      # re-vendors dist/teavm/ from vendor/teavm/ and rebuilds worker-java.js
```

**`npm run build` is required after vendoring**: `scripts/run-program.mjs` and the corpus harness read
`dist/teavm/*.bin`, not `assets/`.

Current pins (all five in `scripts/fetch-teavm.mjs`): SDK
`5d217a2f283e60ef0930d612166c605cec44afa67fecc15be8e6d300c1269aee`, runtime
`fcff0859ca4af0f5622ae901fa3a1d796c37efdbf4dbe872ebfea221700829b6` (plus the three compiler artifacts
from the pinned commit).

### Building the compiler (`compiler.wasm`) — container, ~9 min, proven

Only needed if you change codegen or TeVM internals (`FINDINGS.md` §6 has the detail and the artifact
paths). `patches/Dockerfile` pins JDK 25 + Binaryen 133:

```bash
cd /path/to/teavm-javac
docker build -f patches/Dockerfile -t teavm-javac-build .
docker run --rm -v "$PWD":/work -v teavm-gradle:/root/.gradle teavm-javac-build \
    bash ./gradlew :compiler:optimizeWasmGC --console=plain --no-daemon
```

Measured: 8m53s cold. It reproduces `compiler.wasm-runtime.js` **bit-for-bit**, and the rebuilt
`compiler.wasm` gives the same corpus result (137/145) — but it is **not byte-identical** to the pinned
one (different `wasm-opt`), so run the corpus before swapping it. Two practical notes: build **inside**
the container (a Windows bind mount makes Gradle's hashing pathologically slow — copy the ~38 MB source
in), and `gradlew` from a Windows checkout has CRLF line endings, so strip them first.

### The verification ladder — use the cheapest rung that answers the question

```bash
npm test                                       # artefacts/parse smoke, ~1 s
node scripts/run-program.mjs <id> --jdk --trace  # compile + generate + RUN, diff against JDK 25, named stack
node scripts/run-program.mjs --file probe.java --jdk --input "hi"
node scripts/generate-check.mjs <corpus-id>…   # compile + generate + validate the module
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"   # javac-side tools only
node scripts/sdk-check.mjs                     # 7 SDK-surface snippets, ~1 s, no browser
node scripts/compile-program.mjs --all         # all 145 programs, COMPILE only, ~1 min
set "ONLY=<id>,<id>" & node corpus/run.mjs teavm # run in a browser, ~1–2 min
node corpus/run.mjs teavm                      # full corpus, ~2–3 min
```

Note which compiler each rung uses: `run-program.mjs` and `generate-check.mjs` default to
`dist/teavm/` — **the engine this package ships** — and only need `TEAVM_JAVAC_DIST` when you want to
try a different build. `compile-program.mjs` and `sdk-check.mjs` drive javac through `teavm-javac.js`,
so they do need the fork dist.

- **`run-program.mjs` is the tool to reach for first.** It runs the program in Node and prints its
  stdout; `--jdk` runs the same source on the local JDK and diffs the two (line-ending-normalised);
  `--trace` turns a wasm trap into a **named Java stack** (`DecimalFormat.forDigit`), which needs no
  browser and no instrumentation.
- `compile-program.mjs` separates an **SDK-surface** problem from a TeaVM one.
- `generate-check.mjs` catches the **code generator** emitting invalid wasm.
- **A fix is not "done" until a full corpus run shows the pass count up and the regression count not
  up, and the numbers in `FINDINGS.md` §1 + `corpus/README.md` are updated.**

To check *output* rather than "it ran", diff against JDK 25 running the same source (`run-program.mjs
--jdk`). The corpus only reports success, so a wrong-but-plausible implementation passes it.

---

## 6. THE NEXT TASK — a fork in the road, both branches need the user

**There is no class-library work left and no reducible runtime bug.** All 8 remaining failures are
codegen (5), compiler-side (2), or deliberate (1). So the next move is a decision, and it is the user's
to make. Do not start a long task without asking which branch.

### A. Fix the codegen (needs a compiler rebuild — which is now proven to work)

**The compiler rebuild is no longer a blocker — and it is how the shipped compiler is produced.**
`patches/Dockerfile` pins JDK 25 + Binaryen 133 and builds `compiler.wasm` in ~9 minutes (measured:
8m53s cold, 8m13s with the Gradle cache warm). It reproduces `compiler.wasm-runtime.js`
**bit-for-bit**, and the `assets/compiler.wasm` we ship *is* such a build — it carries
`patches/CompilerResourceSupplier.java` and gives 138/145 (`FINDINGS.md` §6). So each iteration is:
patch, rebuild (~8–9 min), run `corpus/run.mjs teavm` (~2–8 min). A rebuilt module differs byte-wise
from the upstream one (different `wasm-opt`), so always run the corpus before committing it.

The faults, each with a measured diagnosis:

| Program(s) | Fault |
|---|---|
| `exceptions-finally` | `try { return x; } finally { return y; }` emits invalid wasm (`expected 1 elements on the stack for fallthru`) |
| `enum-map-set`, `exceptions-stacktrace`, `exception-propagation` | **one fault.** The object's vtable was left all-null while the call site reads the slot from the receiver's *static* type: `WasmGCVirtualTableBuilder` marks a table "used" only when a call site's **declaring** class matches (`groupMethodsFromCallSites` groups by `methodRef.getClassName()`), so a class that only *inherits* the method called on it — an enum relying on `Enum.toString`, a frame's `String` — is skipped, and `fillVirtualTableMethods` returns early without writing anything. Disassembled, not guessed: `FINDINGS.md` §4b, report in `poc/UPSTREAM.md` §8 |

`Object.clone()` (`FINDINGS.md` §4b) is worth fixing first: it is the reason
`TDecimalFormatSymbols.clone()` is vendored, and a real fix would let that class be deleted — the
preferred ending for every vendored class (§7 of `FINDINGS.md`).

### B. Wire LiveCodes (only when the user says the engine is ready)

The exchange rate is explicit: 5 documented regressions, **all** of them codegen or deliberately
dropped (`file-io`), and every one already written up with a cause. Whether that is acceptable is the
user's call — the original bar was "zero, or an explicitly documented accepted subset", and this is
close to the second. Do not touch `D:\DevWork\live-codes\livecodes` before that call (§1).

Wiring design, for when it happens: a shim worker that `importScripts` our `worker-java.js` (which
installs its **own** `onmessage`, so the shim must not), translating our `{cmd:'init'|'run'}` protocol
to LiveCodes' `{code,input}` → `{input,output,error,exitCode}`, with `baseUrl` pointing at
`dist/teavm/`.

### What is *not* worth doing

- Chasing the remaining codegen faults in the class library — two classlib-shaped hypotheses were
  tested for `enum-map-set` and the failure moves with the program, not with the code. The fault is
  located now (`FINDINGS.md` §4b/§9); it belongs to the generator.
- Adding more of `java.time` speculatively — it is ThreeTen, and it works; add a method only when a
  program needs it.

---

## 7. Traps that cost real time here

Read this list before starting; each entry cost at least one wasted cycle.

1. **`%` in a `cmd` one-liner breaks it.** `git commit -m "...%e..."` → `'%e' is not recognized`.
   Write the message to a file and use `git commit -F <file>`.
2. **`%VAR%` expands before `set` runs on the same line.** `set "S=x" && node %S%\a.mjs` passes a
   literal `%S%`. Use literal paths in one-liners. (Hit again this session.)
3. **Version-matched sources jar, not the GitHub tag.** Use the `-sources.jar` URL above. The `0.14.1`
   Git tag's `TString` imports `org.teavm.interop.Intrinsified`, which exists in **no** 0.14.1 jar.
4. **Both archives or nothing** (§3). SDK-only is worse than no fix.
5. **`ADVANCED` optimization hangs** (`main`'s callback and `teavm_stopped()` never fire). `SIMPLE`
   only. Documented in code and `poc/RESULTS.md`.
6. **`ArchiveBuilder` emits `\` separators on Windows** → TeaVM reads an archive with no classes in it
   → every program traps in `generateWebAssembly` with `dereferencing a null pointer`, `hello`
   included. Fixed in `patches/ArchiveBuilder.java`; do not undo it. **If every program ever breaks at
   once, suspect this class of problem: diff the archive's entry names against the CI artifact.**
7. **A TeaVM trap *does* carry a named Java stack** — the previous handover said the opposite. Use
   `node scripts/run-program.mjs <id> --trace`. The name section survives `SIMPLE`. Keep the worker's
   partial-stdout behaviour too (§4 of `worker-java.ts`).
8. **Attributions made by reading code were wrong three times in a row** in the float cluster
   (grouped integer, then the scientific conversion, then a CLDR native). Probe and run; do not reason
   from the source. `FINDINGS.md` §9 has the record.
9. **`Object.clone()` produces a vtable-less object under this WasmGC backend** (§4b). Any later
   "cloned X has null fields" report should be tested against this first.
10. **Binaryen cannot read TeaVM's output here.** `binaryen.readBinary` fails with *"invalid type:
    distinct rec groups would be identical after binary writing"*, and the JS binding has no way to
    enable GC before parsing. Do not sink time into it. `node --print-wasm-code` works but produces a
    ~400 MB dump with **no** function names attached — also not worth it.
11. **The old scratchpad survives.** Session `065b5498-d3c8-4638-814e-81a3ce5c9e78` still holds
    `sources.jar` (the extracted TeaVM sources), `archive-diff.mjs`, `normalize-archive.mjs` and
    `dump-class.mjs`. See §9.
12. **`read_file` is confined to the workspace**: the old scratchpad can only be read through shell
    commands, so copy what you need into the current session's scratchpad (`$COMMANDCODE_SCRATCHPAD`).
13. **`NODE_ENV=production` silently skips devDependencies** during `npm install` — CI will hit it.
14. **The corpus harness sometimes stops early** or loses its background log. If a run's program count
    is not 145, it did not complete: re-run, don't reason about it.
15. **Where a JDK-derived table is involved, the JDK is the authority, not TeaVM and not your
    assumption.** `Character.UnicodeBlock`'s ranges came from `Character.UnicodeBlock.of` over the
    whole code-point space, and two *semantics* had to be measured too — `Subset.equals`/`hashCode` are
    identity-based (not name-based, which is the obvious guess). Cheap to check, expensive to get wrong.
16. **Do not diff identity hash values.** `Object.hashCode()`/`Subset.hashCode()` are unspecified, so a
    `--jdk` run will legitimately differ on a line that prints one. Compare the booleans and names, not
    the number. Also: `java SomeFile.java` runs a single-file probe on the JDK without a build, which
    is how the block generator was written; keep its output ASCII, because the console charset mangles
    em dashes and the output is pasted into source.
17. **`java.time` is not TeaVM's — it is the bundled ThreeTen backport**, `org.threeten.bp.*`, mapped to
    `java/time/` by `StdlibConverter`. So a missing `java.time` method is fixed in *threeten*, and the
    archive plus the SDK both pick the vendored copy up. ThreeTen predates Java 9, so its API is
    narrower than the JDK's; that is the whole reason `instant-duration` was failing.
18. **The artifacts are tracked now.** After rebuilding the class-library archives, `npm run build` and
    commit `assets/`, `vendor/teavm/` and `dist/teavm/` together, or the repo runs on a stale archive.
    `node scripts/build.mjs` refreshes `dist/` from `vendor/teavm/` offline; `npm run build` also
    re-downloads the pinned compiler artifacts.
19. **Do not build in a Windows bind mount from Docker.** Docker Desktop's 9p/virtiofs mount is
    pathologically slow for many-file operations — `du -sh` over the fork clone takes *minutes*, and
    Gradle's up-to-date hashing crawls. Copy the ~38 MB source into the container and build there
    (`FINDINGS.md` §6); the Gradle cache volume keeps repeat builds fast, and the extracted JDK (696 MB)
    is fetched by the build.
20. **A Windows checkout's `gradlew` has CRLF**, so `bash ./gradlew` fails inside a Linux container with
    `set: invalid option`-style noise. Strip it (`sed -i 's/\r$//'`) or run `bash <(tr -d '\r' < gradlew)`
    — but the latter loses `APP_HOME`, so strip it in place.

---

## 8. The class-library recipe (proven six times now)

For a *missing API*:

1. Take the class's source from the published **sources jar** (trap 3) and add the method.
2. Put it in `compiler/src/sharedClasslibEmu/java/...` — `generateClassLib` compiles that source set
   into the SDK automatically.
3. Add the class to the include list in `prepareTeaVMClassLib` (`compiler/build.gradle`) so the runtime
   archive carries it too — `TMatcher*.class` style wildcards cover nested classes.
4. Rebuild both archives (§5), vendor them, update both checksums, `npm run build`, then verify
   compile + **generate** + **output against the JDK**.

For a *bug* in a classlib class (the `clone()` and `suppressed` fixes this session), the same recipe
with a minimal edit; mark it `Fork addition:` with a comment saying what is broken and why.

Worked examples in the tree: `TString.lines()`, `TMatcher.results()`,
`TDecimalFormatSymbols.clone()`, `TFormatter`'s `%e`/`%E`/`%n`, `TThrowable`'s suppressed accessors,
and `TCharacter.UnicodeBlock` (the one with generated data).

**Cost to be honest with the user about:** each vendored class is a copy of a core classlib class, and
a TeaVM bump means re-syncing it against the new sources jar. `TCharacter` is the largest one yet
(~1500 lines, of which the last ~600 are generated block data).

---

## 9. Scratchpad — what survived, and how to rebuild the rest

Current session: what `$COMMANDCODE_SCRATCHPAD` points at. An older session **survived** and is worth
mining: `C:\Users\hatem\AppData\Local\Temp\commandcode\D--DevWork-live-codes-java\065b5498-…\scratchpad`
holds `sources.jar` (teavm-classlib 0.14.1 sources), `archive-diff.mjs`, `normalize-archive.mjs`,
`dump-class.mjs`, `trial.mjs`, `verify-programs.mjs`.

Two small tools written this session are worth keeping (they are disposable, but 20 lines each):

- **archive-dump.mjs** — lists entries of a `.bin` (gzip of `(u16 nameLen, name, u32 dataLen, data)`).
- **extract-entry.mjs** — pulls one entry out, e.g. the CLDR zip, or a class for `javap`.

The one helper here that is **committed** rather than disposable is `scripts/gen-unicode-blocks.java`
(it generates the `UnicodeBlock` data from the JDK) — see §5. Everything else in this section can be
rewritten in minutes.

`FINDINGS.md` §8 is the symptom-to-tool table; start there.

---

## 10. Where the docs live

| File | Role |
|---|---|
| `FINDINGS.md` | **The technical record.** Architecture, gaps by cause, patches, build/upgrade, diagnostics playbook. Keep it updated — the user asked for this explicitly. |
| `poc/UPSTREAM.md` | Upstream TeaVM findings with minimal repros. |
| `patches/README.md` | The fork patches **and every class-library addition**, with what each fixes. |
| `corpus/README.md` | The corpus, its numbers, and every failing program with its cause. |
| `poc/RESULTS.md` | Engine-choice decision record (keeps the Doppio findings). |
| `README.md` | Package-level orientation. |

---

## 11. Remaining work, ranked

1. **Decide the branch in §6** — fix the remaining codegen (needs a compiler rebuild, now proven) or
   wire LiveCodes. There is nothing else actionable: no class library is missing an API.
2. **Codegen** — 4 regressions, and really **two** faults: `exceptions-finally` (invalid wasm), and the
   unfilled vtable behind `enum-map-set` + both `StackTraceElement` programs. Measured diagnoses in
   `FINDINGS.md` §4b and the table in §6 above; the vtable one has a disassembly and names the two
   generator classes. Before reaching for the backend, note the three that were fixed in Java after
   looking like backend work: `clone()` (a per-class field copy), division (a `ClassHolderTransformer`
   plus a class-library helper) and class names (a core patch through `compiler/src/patches/java`).
   `Object.clone()` is still worth fixing at the source: it is the only reason
   `TDecimalFormatSymbols.clone()` is vendored.
3. **`file-io`** — deliberate; there is no filesystem model in a browser. Do not "fix" it.
4. **Publishing** `@live-codes/java-wasm` (version `0.0.1`, unpublished) — decide the SDK-patch
   strategy first: we ship build outputs plus vendored classlib classes, not a rewritten third-party
   binary (FINDINGS §5). All five artifacts are in the repo now, and `assets/` is the source of truth,
   so the published package is reproducible from a clone with no network.

---

## 12. First actions for the new session

```bash
cd /d D:\DevWork\live-codes\java
git log --oneline -6 && git status --short          # expect clean at the tip of main
npm test                                            # expect all ok (works with no build: dist/ is committed)
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"
node scripts/sdk-check.mjs                          # expect 7/7
node scripts/compile-program.mjs --all              # expect 145/145 compiled
node scripts/run-program.mjs stringformat --jdk     # expect MATCH (a 1 s end-to-end sanity check)
node scripts/run-program.mjs exceptions --jdk       # expect MATCH (division semantics)
node scripts/run-program.mjs reflection-members --jdk # expect MATCH (method reflection)
node scripts/run-program.mjs reflection --jdk        # expect MATCH (class names + Class.forName)
```

For the codegen faults, `--emit` + `wasm-dis` is the loop that worked:
`node scripts/run-program.mjs enum-map-set --trace --emit D:\DevWork\tools\x.wasm` then
`D:\DevWork\tools\binaryen-version_133\bin\wasm-dis.exe D:\DevWork\tools\x.wasm -o x.wat` — the
standalone Binaryen tools read TeaVM's output where the npm `binaryen` binding does not.

Then read §6: the next move is a decision (codegen rebuild vs LiveCodes wiring), not a task you can
just start. Remember §7 before typing any shell one-liner.
