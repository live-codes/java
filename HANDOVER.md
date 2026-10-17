# HANDOVER

Everything a new session needs to continue this work without re-deriving it. Written at the end of
the session that took the engine from a proof of concept to a measured, mostly-working Java engine,
with the regression count as the remaining blocker.

**Read `FINDINGS.md` first** — it is the technical record (architecture, every known failure grouped
by where the fault lives, the class-library recipe, the upgrade procedure, a symptom-to-tool
diagnostics table). This file is the **operational** handover: what state things are in, what to do
next, and the traps that cost time here.

---

## 1. The mission

Replace LiveCodes' Java engine. Today's engine is Doppio (`@seth0x41/doppio@1.0.0` + `browserfs@1.4.3`,
an interpreted JDK 8 JVM): slow, frozen at Java 8, and a dead end for Kotlin/Scala.

The replacement is `@live-codes/java-wasm`: **javac + the TeaVM compiler compiled to WebAssembly**,
built from the fork `Vsprocessing/teavm-javac@d1514ab` (TeaVM 0.14.1).

User's stated success bar: **minimise regressions** — specifically, "works on Doppio, fails here"
should reach zero (or become an explicitly documented, accepted subset). The bar for a straight swap
has **not** been met yet: **14 regressions** remain.

**Do not touch `D:\DevWork\live-codes\livecodes`.** The user said so explicitly: *"Do not write to
LiveCodes till I tell you. This project is not yet ready."* A previous attempt at the wiring was
written and then reverted at their instruction; that repo is currently clean. The engine is not ready
because of the 14 regressions, not because the wiring is hard.

Kotlin: **dropped**, permanently as far as this work is concerned (the only working route was
Doppio-modern, 7–20 min cold, 163 MB of jars cross-origin). Scala: lives in a **separate** package
(`@live-codes/scala-wasm`, JSPI-only, no stdin); a Doppio fallback belongs in LiveCodes' language
config, never inside that package. Do not resurrect either without being asked.

---

## 2. Current status

Measured on `corpus/` (145 programs), last full run:

| | |
|---|---|
| Pass | **130 / 145** |
| Compile | **143 / 145** |
| Regressions (work on Doppio, fail here) | **14** |
| Fails on both engines | **1** (`instant-duration`) |

Failing programs (15): `stringformat`, `parse-format`, `string-format-more`, `exceptions`,
`exceptions-finally`, `exceptions-suppressed`, `exceptions-stacktrace`, `exception-propagation`,
`reflection`, `reflection-members`, `char-classes`, `instant-duration`, `io-writers`, `enum-map-set`,
`file-io`.

Where each cluster lives is in `FINDINGS.md` §4. The short version:

- **14 regressions, and they are the only thing that matters for the swap decision.**
- 3 of them (`stringformat`, `parse-format`, `string-format-more`) are one bug — the largest single
  win available. See §6.
- `file-io` is deliberate (no filesystem model in a browser) — do not "fix" it.

Git: `D:\DevWork\live-codes\java` is **clean at `43aa47d`**. Twelve commits this session, listed in §4.

---

## 3. The three artifacts

```
browser worker (src/worker-java.ts)
  ├── compiler.wasm              5.2 MB   OpenJDK javac + TeaVM compiler + WasmGC backend
  ├── compile-classlib-teavm.bin  208 KB  javac's platform classpath ("the SDK")
  └── runtime-classlib-teavm.bin  2.2 MB  TeaVM's class library, T-prefixed
```

- **`compile-classlib-teavm.bin`** — the *converted* class library: `StdlibConverter` renames
  `org.teavm.classlib.java.**.T*` into `java.**`. javac only ever sees this one.
- **`runtime-classlib-teavm.bin`** — the *unconverted* class library (T-names), which TeaVM generates
  from. Also carries the fork's replacements/additions for specific classes.

**The rule that matters: a class-library change must land on both sides.** SDK-only compiles and then
fails at runtime, which is worse than a compile error. Both archives are built by the fork and
vendored in `assets/` with pinned checksums in `scripts/fetch-teavm.mjs`.

Worker protocol (do not break it; the LiveCodes wiring depends on this shape):

```
{ cmd: 'init', baseUrl? }                  → { type: 'initialized', initMs } | { type: 'init-error', error }
{ cmd: 'run', source, mainClass?, input? } → { type: 'result', ok, compileMs, generateMs, runMs,
                                               stdout, stderr, exitCode, diagnostics }
```

`src/index.ts` exposes `createRuntime` → `run(source, {input, mainClass})` with
`on('progress')`/`onProgress` (`init` → `compile` → `generate` → `run`). Global name: `JavaWasm`.

---

## 4. What this session did (12 commits, newest first)

| Commit | What |
|---|---|
| `43aa47d` | Traced the float failure to a **native CLDR lookup**, not the formatter (see §6) |
| `a26dc2c` | Bisected `stringformat` to **one conversion**: the precision float |
| `6388d5a` | **Worker keeps partial output when a program traps** + `ok=false`/`exitCode=1` |
| `ece3deb` | FINDINGS: partial stdout didn't survive a failure (the thing `6388d5a` fixed) |
| `fe4268a` | Scoped the `DecimalFormat` cluster; **retracted a wrong attribution** (`forDigit`) |
| `94e485a` | Confirmed numbers on a full run: 130/145, 14 regressions |
| `da70a46` | **`Matcher.results()`** added to the class library |
| `dad3147` | FINDINGS: scoped the remaining class-library gaps |
| `3d79bf7` | **Added `FINDINGS.md`** |
| `b8c0c23` | Docs to the verified numbers |
| `f43ef3f` | **`ArchiveBuilder` separator fix + `String.lines()`** |
| `51c43a4` | **Annotation stubs fixed** (`@SuppressWarnings` crashed the compiler) + triage tools |

Four real fixes: one compiler crash affecting any program using `@SuppressWarnings`, one silently
broken local build, and two missing class-library APIs. Two retractions (see §7).

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
- `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/java/lang/TString.java` — vendored, `lines()` added
- `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/java/util/regex/TMatcher.java` — vendored, `results()` added
- `compiler/build.gradle` — two include lines in `prepareTeaVMClassLib`: `TString.class`, `TMatcher*.class`

(`git status` in the clone also shows leftover scratch: `b1.txt`…`b5.txt`, `sdk-*.bin`, etc. Ignore.)

### Building the two archives (routine, no Binaryen, ~2–2.5 min)

```bash
cd /d D:\DevWork\teavm-javac-build
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-25.0.4.101-hotspot"
call gradlew.bat :compiler:generateClassLib :compiler:buildTeaVMClassLib --console=plain
```

Then **vendor both** and update the checksums (this is the step that is easy to forget):

```bash
copy /y "D:\DevWork\teavm-javac-build\compiler\build\classlib\compile-classlib-teavm.bin" assets\compile-classlib-teavm.bin
copy /y "D:\DevWork\teavm-javac-build\compiler\build\classlib\runtime-classlib-teavm.bin"  assets\runtime-classlib-teavm.bin
copy /y assets\*.bin vendor\teavm\      # and dist\teavm\ if testing without a full build
node -e "const fs=require('fs'),c=require('crypto');for(const f of ['assets/compile-classlib-teavm.bin','assets/runtime-classlib-teavm.bin']){const b=fs.readFileSync(f);console.log(f,b.length,c.createHash('sha256').update(b).digest('hex'))}"
# paste both hashes into SDK_SHA256 / RUNTIME_SHA256 in scripts/fetch-teavm.mjs
```

Current pins: SDK `52dd00fbcf71cc789a10c0c0a81ca7ee0f876fd2b5114c5ccc33109155e1eb9c`,
runtime `191eb2ce732c9b8942f31574210caee939583cf497ca332248815b06f3cc07d7`.

`npm run build` runs `fetch-teavm.mjs` first: it downloads `compiler.wasm` +
`compiler.wasm-runtime.js` from the pinned commit and copies both classlib archives **from
`assets/`**, checksum-verifying all four. Nothing rewrites a third-party binary at vendoring time.

### The verification ladder — use the cheapest rung that answers the question

```bash
npm test                                                  # artefacts/parse smoke, ~1 s
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"
node scripts/sdk-check.mjs                                # 7 SDK-surface snippets, ~1 s, no browser
node scripts/compile-program.mjs --all                    # all 145 programs, COMPILE only, ~1 min
node scripts/generate-check.mjs <corpus-id>…              # compile + generate + validate the module
set "ONLY=<id>,<id>" & node corpus/run.mjs teavm          # run in a browser, ~1–2 min
node corpus/run.mjs teavm                                 # full corpus, ~2–9 min (load-dependent)
node corpus/run.mjs                                       # both engines (~25 min), writes corpus/results.json
```

- `compile-program.mjs` separates an **SDK-surface** problem from a TeaVM one.
- `generate-check.mjs` catches the **code generator** emitting invalid wasm.
- Neither runs the program. Only the corpus run does.
- **A fix is not "done" until a full corpus run shows the pass count up and the regression count not
  up, and the numbers in `FINDINGS.md` §1 + `corpus/README.md` are updated.**

To check *output* rather than "it ran", diff against JDK 25 running the same source — the corpus only
reports success, so a wrong-but-plausible implementation passes it. That is how `lines()` and
`results()` were verified.

---

## 6. THE NEXT TASK — the float cluster (3 regressions, 1 bug)

This is the highest-value piece of work available. Follow the chain; do not restart from
`TDecimalFormat`.

### The evidence chain so far

1. `stringformat` fails with `dereferencing a null pointer`, and now reports partial output:
   `stdout="42|   42|42   |00042\n"` — so **statement 1 completes** and it dies on statement 2:
   `String.format("%.3f|%e|%s|%b", 3.14159, 1234.5, "x", true)`.
2. A probe (precision float, marker line, scientific) **trapped with empty stdout** → it dies at the
   first conversion: **the precision float**, not the scientific one. (Caveat recorded in FINDINGS:
   empty stdout alone doesn't separate "traps on that call" from "traps before `main`"; print a line
   ahead of the conversion to close it. The inference holds because `stringformat`, structurally
   identical, reaches statement 2 — so init works.)
3. `TFormatter`'s float branch is the **only** code that constructs a `TDecimalFormat`, and it starts:

   ```java
   TDecimalFormat format = new TDecimalFormat();                    // TFormatter.java line 277
   format.setDecimalFormatSymbols(new DecimalFormatSymbols(locale));
   ```

4. `TDecimalFormat()`'s no-arg constructor resolves a pattern through
   `CLDRHelper.resolveNumberFormat(language, country)`, which delegates to
   `resolveFormatSymbols(getNumberFormatMap(), language, country)` — and

   ```java
   private static native ResourceMap<StringResource> getNumberFormatMap();
   ```

### What to check next

**Whether the runtime archive actually links those natives.** A classlib native gets its body from
TeaVM's classlib build, not from the source. If the body is missing, the map is null → pattern null →
`applyPattern(null)` traps → nothing prints. That is the observed shape exactly, and it explains why
two passes over `TDecimalFormat` found nothing wrong with it.

Concretely:

- TeaVM implements these along with `repackCldr` / the `org/teavm/classlib/impl/unicode/` data path —
  note `compiler/build.gradle` has a **special path remap for `org/teavm/classlib/impl/unicode/`** and
  a `repackCldr` task that **`buildTeaVMClassLib` may not depend on**. That is the same species of bug
  as the `ArchiveBuilder` separator issue: the fork's *build* quietly dropping something.
- Compare the locally built `runtime-classlib-teavm.bin` against the fork's CI artifact (the download
  URL is in `fetch-teavm.mjs`) with an entry-list diff — an earlier diff of the same kind found the
  separator bug in one shot. A diff script existed in the scratchpad (§9), easy to rewrite: gunzip,
  walk `(u16 nameLen, name, u32 dataLen, data)` records, compare name sets.
- If the natives are linked and the map is fine, then the null is one step further in
  (`resolveFormatSymbols`, `applyPattern`, or `TDecimalFormat.format`) — and by then you have a
  one-conversion repro to aim at instead of the whole class.

**This is a classlib fix, so use the recipe in §8 and rebuild both archives.**

Note `stringformat`, `parse-format` and `string-format-more` are all three regressions — closing this
closes three, more than both class-library additions managed together.

---

## 7. Traps that cost real time here

Read this list before starting; each entry cost at least one wasted cycle.

1. **`%` in a `cmd` one-liner breaks it.** `git commit -m "...%e..."` → `'%e' is not recognized`.
   Avoid `%` in shell-quoted text, or use `-F <file>`.
2. **`%VAR%` expands before `set` runs on the same line.** `set "S=x" && node %S%\a.mjs` passes a
   literal `%S%`. Use literal paths in one-liners. (Hit three times.)
3. **Version-matched sources jar, not the GitHub tag.** Use
   `https://repo1.maven.org/maven2/org/teavm/teavm-classlib/0.14.1/teavm-classlib-0.14.1-sources.jar`.
   The `0.14.1` Git tag's `TString` imports `org.teavm.interop.Intrinsified`, which exists in **no**
   0.14.1 jar — a whole build cycle lost to that.
4. **Both archives or nothing** (§3). SDK-only is worse than no fix.
5. **`ADVANCED` optimization hangs** (`main`'s callback and `teavm_stopped()` never fire). `SIMPLE`
   only. Documented in code and `poc/RESULTS.md`.
6. **`ArchiveBuilder` emits `\` separators on Windows** → TeaVM reads an archive with no classes in it
   → every program traps in `generateWebAssembly` with `dereferencing a null pointer`, `hello`
   included. Fixed in `patches/ArchiveBuilder.java`; do not undo it. **If every program ever breaks at
   once, suspect this class of problem: diff the archive's entry names against the CI artifact.**
7. **A TeaVM trap gives no Java stack** — only a wasm function index. Bisect the program instead. The
   worker now returns partial stdout (§4, `6388d5a`) which makes that practical; keep that behaviour.
8. **Two attributions in the docs were wrong and are now retracted** (`DecimalFormat.forDigit`; the
   recursive-bound reading of the `@SuppressWarnings` crash). Both came from reading code and
   reasoning. Prefer a probe run over a code read — this whole cluster's history is the argument.
9. **`NODE_ENV=production` silently skips devDependencies** during `npm install` — CI will hit it.
10. **The corpus harness sometimes stops early** (once at 69/145) or loses its background log. If a
    run's program count is not 145, it did not complete: re-run, don't reason about it.

---

## 8. The class-library recipe (proven twice)

For a *missing API* (not a bug — bugs need reducing first, §6):

1. Take the class's source from the **published sources jar** (trap 3) and add the method.
2. Put it in `compiler/src/sharedClasslibEmu/java/...` — `generateClassLib` compiles that source set
   into the SDK automatically.
3. Add the class to the include list in `prepareTeaVMClassLib` (`compiler/build.gradle`) so the runtime
   archive carries it too — pattern style `TMatcher*.class` covers nested classes.
4. Rebuild both archives (§5), vendor them, update both checksums, then verify compile + **generate** +
   **output against the JDK**.

Worked examples in the tree: `TString.lines()`, `TMatcher.results()`. Both real methods are ~10 lines
and are marked with a `Fork addition:` comment for future re-syncs.

**Cost to be honest with the user about:** each vendored class is a copy of a core classlib class, and
a TeaVM bump means re-syncing it against the new sources jar. `TCharacter` (for `UnicodeBlock`) is
large.

---

## 9. Scratchpad — likely gone, here's how to rebuild it

Session scratchpad (session-scoped, **may have been cleaned**):

`C:\Users\hatem\AppData\Local\Temp\commandcode\D--DevWork-live-codes-java\<session-id>\scratchpad\`

It held: `sources.jar` + extracted `TString.java`, `TMatcher.java`, `TDecimalFormat.java`,
`TFormatter.java`, `CLDRHelper.java`; `orig-runtime.bin` (the fork's CI runtime archive, for diffs);
and small scripts (`trial.mjs` compile-snippets, `gen-check.mjs`, `normalize-archive.mjs`,
`archive-diff.mjs`, `verify-programs.mjs` run-and-diff-against-the-JDK, `dump-class.mjs`).

Recreate the useful ones in a few minutes:

- **sources jar**: `curl -sL -o sources.jar https://repo1.maven.org/maven2/org/teavm/teavm-classlib/0.14.1/teavm-classlib-0.14.1-sources.jar`
  then `jar xf sources.jar <path>`.
- **a snippet runner**: compile + generate + instantiate + call `main([], onFinish)` + poll
  `teavm_stopped()`, with `teavmConsole`/`teavmFile` imports — the logic is in `src/worker-java.ts`,
  and `scripts/generate-check.mjs` shows the Node setup (import the loader from
  `compiler.wasm-runtime.js`, pass a **filesystem path** to it in Node, not a URL).
- **a runner that also diffs against the JDK** is the single most useful tool to rebuild: it turns
  "does it work" into "does it match", and the corpus harness cannot do that.

Consider promoting the runner into `scripts/` — the corpus can then be supplemented without a browser.

---

## 10. Where the docs live

| File | Role |
|---|---|
| `FINDINGS.md` | **The technical record.** Architecture, gaps by cause, patches, build/upgrade, diagnostics playbook. Keep it updated — the user asked for this explicitly. |
| `poc/UPSTREAM.md` | Upstream TeaVM findings with minimal repros (one of four is now fixed here). |
| `patches/README.md` | The three fork patches: what each fixes, how to reproduce, how to check. |
| `corpus/README.md` | The corpus, its numbers, and every failing program with its cause. |
| `poc/RESULTS.md` | Engine-choice decision record (keeps the Doppio findings). |
| `README.md` | Package-level orientation. |

---

## 11. Remaining work, ranked

1. **The float cluster** (§6) — 3 regressions, one bug, lead already traced. Do this first.
2. **Other runtime clusters** — the rest of the 14. `Throwable.getStackTrace`/`addSuppressed`
   (`exceptions-stacktrace`, `exceptions-suppressed`, `exception-propagation`), `EnumSet`/`EnumMap`
   (`enum-map-set`), `PrintWriter.printf("%n")` (`io-writers`). Each is a *bug*, so reduce first — now
   cheap, since failures carry their output.
3. **`Character.UnicodeBlock`** (`char-classes`) — the last compile-level gap; needs authoring as well
   as vendoring.
4. **`java.time`** (`instant-duration`) — nothing to vendor at all; this is a **scoping decision**
   (how much of the package to promise) before it is a technical task.
5. **Code-generation faults** (`exceptions-finally`, divide-by-zero) — need a change to the wasm
   backend plus **Binaryen** to rebuild `compiler.wasm`. Not doable in this environment as it stands.
6. **LiveCodes wiring and publishing** — only when the user says the engine is ready (§1). Note
   `vendors.ts` already wires sibling engines as `@live-codes/<lang>-wasm` via `getUrl(...)`, which is
   the convention to follow. The wiring design is captured in the session history if needed: a shim
   worker that `importScripts` our `worker-java.js` (which installs its **own** `onmessage`, so the
   shim must not), translating our `{cmd:'init'|'run'}` protocol to LiveCodes'
   `{code,input}` → `{input,output,error,exitCode}`, with `baseUrl` pointing at `dist/teavm/`.

---

## 12. First actions for the new session

```bash
cd /d D:\DevWork\live-codes\java
git log --oneline -5 && git status --short          # expect clean at 43aa47d
npm test                                            # expect all ok
set "TEAVM_JAVAC_DIST=D:\DevWork\teavm-javac-build\dist\teavm-javac"
node scripts/sdk-check.mjs                          # expect 7/7
node scripts/compile-program.mjs --all              # expect 143/145 compiled
```

Then start on §6 — the CLDR native lead — and remember §7 before typing any shell one-liner.
