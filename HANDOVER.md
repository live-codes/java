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
| Pass | **135 / 145** |
| Compile | **143 / 145** |
| Regressions (work on Doppio, fail here) | **9** |
| Fails on both engines | **1** (`instant-duration`) |

Failing programs (10): `exceptions`, `exceptions-finally`, `exceptions-stacktrace`,
`exception-propagation`, `reflection`, `reflection-members`, `char-classes`, `instant-duration`,
`enum-map-set`, `file-io`.

Where each cluster lives is in `FINDINGS.md` §4. The short version:

- **9 regressions, and they are the only thing that matters for the swap decision.**
- 4 of the 10 are or need **code generation** fixes (§4b) and cannot be done here without Binaryen:
  `exceptions`, `exceptions-finally`, and the two `StackTraceElement` stream-lambda programs.
- `char-classes` is the only **compile-level** gap left, and the largest piece of work available here.
- `file-io` is deliberate (no filesystem model in a browser) — do not "fix" it.

Git: `D:\DevWork\live-codes\java` is **clean** at the tip of `main` (two commits this session:
`e1a9c29` the float cluster, then the exceptions/stack-trace commit).

---

## 3. The artifacts

```
browser worker (src/worker-java.ts)
  ├── compiler.wasm                   5.2 MB   OpenJDK javac + TeaVM compiler + WasmGC backend
  ├── compiler.wasm-deobfuscator.wasm  40 KB   maps wasm addresses → Java frames for getStackTrace()
  ├── compile-classlib-teavm.bin      209 KB   javac's platform classpath ("the SDK")
  └── runtime-classlib-teavm.bin      2.2 MB   TeaVM's class library, T-prefixed
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
| the exceptions commit | `TThrowable.suppressed` is never initialised → vendor it with lazy accessors; and enable the **stack deobfuscator** in the worker, vendoring `compiler.wasm-deobfuscator.wasm`, so `getStackTrace()` returns real frames |
| `e1a9c29` | **The float cluster.** Found that `DecimalFormatSymbols.clone()` returns a vtable-less object under this WasmGC backend, vendored `TDecimalFormatSymbols` with an explicit copy, and vendored `TFormatter` with the missing `%e`/`%E` and `%n` conversions. Added `scripts/run-program.mjs` |

Net: **130/145 → 135/145**, **14 → 9 regressions**, nothing newly broken. Closed `stringformat`,
`parse-format`, `string-format-more`, `io-writers`, `exceptions-suppressed`.

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
| Binaryen (`wasm-opt`) | **not installed** — so `compiler.wasm` cannot be rebuilt here |
| Chrome | needed for `corpus/run.mjs` (CDP) |

**The fork clone is modified and must stay that way** — these are the sources of the vendored
archives:

- `compiler/src/main/java/org/teavm/javac/StdlibConverter.java` — copy of `patches/StdlibConverter.java`
- `compiler/src/main/java/org/teavm/javac/ArchiveBuilder.java` — copy of `patches/ArchiveBuilder.java`
- `compiler/build.gradle` — the include list in `prepareTeaVMClassLib` (one line per vendored class)
- `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/...` — the vendored classes:
  `java/lang/TString` (`lines()`), `java/util/regex/TMatcher` (`results()`),
  `java/text/TDecimalFormatSymbols` (explicit `clone()`), `java/util/TFormatter` (`%e`/`%E`, `%n`),
  `java/lang/TThrowable` (lazy `suppressed`). Each change is marked `Fork addition:`

(`git status` in the clone also shows leftover scratch: `b1.txt`…`b5.txt`, `sdk-*.bin`, etc. Ignore.)

### Building the two archives (routine, no Binaryen, ~30 s warm / ~2.5 min cold)

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

### The verification ladder — use the cheapest rung that answers the question

```bash
npm test                                       # artefacts/parse smoke, ~1 s
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"
node scripts/sdk-check.mjs                     # 7 SDK-surface snippets, ~1 s, no browser
node scripts/compile-program.mjs --all         # all 145 programs, COMPILE only, ~1 min
node scripts/generate-check.mjs <corpus-id>…   # compile + generate + validate the module
node scripts/run-program.mjs <id> --jdk --trace  # compile + generate + RUN, diff against JDK 25, named stack
node scripts/run-program.mjs --file probe.java --jdk --input "hi"
set "ONLY=<id>,<id>" & node corpus/run.mjs teavm # run in a browser, ~1–2 min
node corpus/run.mjs teavm                      # full corpus, ~2–3 min
```

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

## 6. THE NEXT TASK — `char-classes` (the last compile-level gap)

`char-classes` fails to compile: `Character.UnicodeBlock` does not exist in TeaVM's class library at
all — `TCharacter` has no nested `UnicodeBlock` type. `compile-program.mjs --all` reports **143/145**;
this is one of the two, and `instant-duration` (`java.time`) is the other.

Use the §5 recipe, but note this one is **authoring, not carrying across**:

1. Vendor `TCharacter` from the **published** sources jar
   (`https://repo1.maven.org/maven2/org/teavm/teavm-classlib/0.14.1/teavm-classlib-0.14.1-sources.jar`
   — not the GitHub tag; see §7 trap 3) into
   `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/java/lang/TCharacter.java`.
2. Author the nested `UnicodeBlock` type: `Character.UnicodeBlock` needs the named blocks (and
   `of(int)` / `of(char)`), which the JDK derives from Unicode data. TeaVM's classlib already carries
   `org/teavm/classlib/impl/unicode/UnicodeSupport` and `UnicodeData.txt` in the runtime archive
   (FINDINGS §2), so check what `UnicodeSupport` already exposes before writing a table by hand.
3. Add `org/teavm/classlib/java/lang/TCharacter*.class` to `prepareTeaVMClassLib`'s include list.
4. Rebuild both archives, `npm run build`, then verify compile + generate + **output against the JDK**.

Scale it honestly: read the corpus program first (`corpus/programs-extra.mjs`, `id: 'char-classes'`) and
implement only the blocks and methods it needs, rather than all of `UnicodeBlock`. `TCharacter` is a
large class to vendor — that is the real cost here, and it is worth checking whether a *narrower* file
(a vendored `TCharacter` that only adds the nested type) is acceptable at the cost of a future re-sync.

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

---

## 8. The class-library recipe (proven five times now)

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
`TDecimalFormatSymbols.clone()`, `TFormatter`'s `%e`/`%E`/`%n`, `TThrowable`'s suppressed accessors.

**Cost to be honest with the user about:** each vendored class is a copy of a core classlib class, and
a TeaVM bump means re-syncing it against the new sources jar. `TCharacter` (for `char-classes`) is the
largest one yet.

---

## 9. Scratchpad — what survived, and how to rebuild the rest

Current session: what `$COMMANDCODE_SCRATCHPAD` points at. An older session **survived** and is worth
mining: `C:\Users\hatem\AppData\Local\Temp\commandcode\D--DevWork-live-codes-java\065b5498-…\scratchpad`
holds `sources.jar` (teavm-classlib 0.14.1 sources), `archive-diff.mjs`, `normalize-archive.mjs`,
`dump-class.mjs`, `trial.mjs`, `verify-programs.mjs`.

Two small tools written this session are worth keeping (they are disposable, but 20 lines each):

- **archive-dump.mjs** — lists entries of a `.bin` (gzip of `(u16 nameLen, name, u32 dataLen, data)`).
- **extract-entry.mjs** — pulls one entry out, e.g. the CLDR zip, or a class for `javap`.

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

1. **`char-classes`** (§6) — the last compile-level gap, and the biggest available win here.
2. **`enum-map-set`** — reduced this session, not fixed. `HashMap.toString()` works; `EnumMap.toString()`
   and `EnumSet`/`keySet().toString()` (i.e. `TAbstractMap.toString`/`TAbstractCollection.toString`)
   trap inside the `StringBuilder.append → insert` they use, in `AbstractStringBuilder.insert(int,
   char)` on a null `buffer`. Appending an enum from user code is fine, so it is the classlib-code
   context or another mis-compiled method copy (the trap names TeaVM's copies: `insert_0`, `insert_4`,
   `append(204)`). Reduce further with `run-program.mjs --trace`; `FINDINGS.md` §9 has the detail.
3. **`instant-duration`** — nothing to vendor at all; this is a **scoping decision** (how much of
   `java.time` to promise) before it is a technical task.
4. **`reflection`, `reflection-members`** — decide whether to widen TeaVM's reflection or document the
   subset.
5. **Codegen** (`exceptions`, `exceptions-finally`, the two `StackTraceElement` stream-lambda programs)
   — needs Binaryen and a `compiler.wasm` rebuild, or an upstream fix. Not doable in this environment.
6. **LiveCodes wiring and publishing** — only when the user says the engine is ready (§1). The wiring
   design is captured below: a shim worker that `importScripts` our `worker-java.js` (which installs
   its **own** `onmessage`, so the shim must not), translating our `{cmd:'init'|'run'}` protocol to
   LiveCodes' `{code,input}` → `{input,output,error,exitCode}`, with `baseUrl` pointing at `dist/teavm/`.

---

## 12. First actions for the new session

```bash
cd /d D:\DevWork\live-codes\java
git log --oneline -3 && git status --short          # expect clean at the tip of main
npm test                                            # expect all ok
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"
node scripts/sdk-check.mjs                          # expect 7/7
node scripts/compile-program.mjs --all              # expect 143/145 compiled
node scripts/run-program.mjs stringformat --jdk     # expect MATCH (a 1 s end-to-end sanity check)
```

Then start on §6 — `Character.UnicodeBlock` — and remember §7 before typing any shell one-liner.
