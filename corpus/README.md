# Corpus test — java-wasm vs the current LiveCodes engine

Runs the same Java programs through both engines in headless Chrome and reports where they
agree and differ.

```bash
node corpus/run.mjs                        # both engines (~25 min; the baseline is slow)
node corpus/run.mjs teavm                  # only @live-codes/java-wasm  (~2 min)
node corpus/run.mjs baseline               # only LiveCodes/Doppio       (~4 min for ~30 programs)
set ONLY=map,records&& node corpus/run.mjs # just those programs (writes corpus/results-only.json)
```

Raw results land in `corpus/results.json` (`results-only.json` for a filtered run).

- `programs.mjs` — the original 35 programs (one `public class Main` each, deterministic output)
- `programs-extra.mjs` — 110 more: collections, streams, generics, regex, dates, reflection,
  exceptions, concurrency, modern syntax
- `programs-all.mjs` — the 145-program set both harnesses actually run (plus the `?only=` filter)
- `teavm.html` — harness for this package (`/dist/java-wasm.iife.js`)
- `baseline.html` + `baseline-worker.js` — harness for LiveCodes' current engine: a port of
  `livecodes/src/livecodes/languages/java/lang-java-script.ts` (Doppio + BrowserFS, JDK 8 jars
  from `unpkg.com/@seth0x41/doppio@1.0.0/`, the same compile/run command lines)
- `run.mjs` — serves this repo, drives both harnesses over CDP, diffs the outputs
- `../scripts/compile-program.mjs` — compiles any program (or `--all`) with the fork's javac in Node,
  no browser: the fast way to tell an SDK problem from a TeaVM one
- `../scripts/generate-check.mjs` — the same, and then generates and validates the module: how a
  code-generation bug (`exceptions-finally`) is reproduced without a browser
- `../scripts/run-program.mjs` — the same again, and then **runs** the program in Node and prints its
  stdout, with `--jdk` to run the same source on the local JDK and diff the two. Turns "does it run"
  into "does it match", without a browser

Programs must print deterministic output — sort maps and sets before printing, or the two engines
differ for reasons that have nothing to do with correctness.

## Result: 139/145 pass, and all **6 remaining failures are regressions**

java-wasm runs 139 of 145. That hides the number that matters for a switch: **all 6 failures work
today on the current engine** — there is no "broken on both engines" left. On this corpus that is a
4.1% regression rate.

Recent closures. `stringformat`, `parse-format` and `string-format-more` were one bug: every
`DecimalFormat` clones its `DecimalFormatSymbols`, and `Object.clone()` produces an object with no
vtable under this WasmGC backend, so the first virtual call on the copy trapped (see `FINDINGS.md`
§4b); `io-writers` was a missing `%n`, `exceptions-suppressed` a `Throwable` field that is never
initialised, `char-classes` needed `Character.UnicodeBlock` (absent from TeaVM entirely),
`instant-duration` needed `Duration.toXxxPart()` (which also took compilation to **145/145**),
`reflection-members` needed the compiler's `ReflectionSupplier` to keep application-class *methods*,
and `exceptions` needed integer division by zero to throw instead of trapping in wasm (a compiler
`ClassHolderTransformer` plus a class-library helper). `getStackTrace()` returns real frames now
instead of TeaVM's `Throwable$FakeClass.fakeMethod` stand-in, which the two remaining exception
programs need but do not yet pass — they still hit a code-generation fault (`FINDINGS.md` §4b).

Eight of the bugs the corpus found were in the fork rather than in TeaVM itself, and are fixed by
the patches in `patches/` (see `patches/README.md`): `list-deque-queue`
and `stringbuilder-vs-buffer` (a duplicated `StringBuilder.append(Object)`), `iterable-custom` and
`charsequence-impl` (`default` methods emitted abstract), `annotation-basic`
(`java.lang.annotation.Annotation` emitted extending itself), `recursive-generics` (`@SuppressWarnings`
crashed the compiler — the trigger was the annotation, not the recursive bound; see `poc/UPSTREAM.md`),
and `var-textblock`/`text-block-more`/`regex-groups` (`String.lines()` and `Matcher.results()`, neither
of which the class library implemented).

Timings for the whole set: init 0.3–2 s, javac 1–13 s, **wasm generation 51–392 s**, run 0.1–1.3 s.
The spread is run-to-run variance on one machine (load-dependent), not a spread across programs;
generation dominates either way.

### Regressions — work on Doppio, fail on java-wasm (16 found, 6 remain)

| # | Programs | Failure | Cause |
|---|---|---|---|
| 1 | ~~`stringformat`, `parse-format`, `string-format-more`~~ — fixed | — | every `DecimalFormat` clones its `DecimalFormatSymbols`; `Object.clone()` gives the copy no vtable under this WasmGC backend, so the first virtual call on it trapped. Worked around in the class library (§4b/§5 of `FINDINGS.md`) |
| 2 | ~~`reflection-members`~~ — fixed; `reflection` reduced | `NoSuchMethodException` from `getDeclaredMethod`/`getMethod` | class and field reflection always worked; **method** metadata was empty because TeaVM preserves only the members a `ReflectionSupplier` lists and the fork's listed all fields but no methods. Fixed by `patches/CompilerResourceSupplier.java`. `reflection` is now down to its last line, `Class.forName`, which only resolves classes whose class object was already touched (`FINDINGS.md` §9) |
| 3 | ~~`exceptions`~~ — fixed | — | integer division by zero trapped in wasm instead of throwing `ArithmeticException`. `DivisionCheckTransformer` rewrites int/long `DIVIDE`/`MODULO` to a class-library helper that checks the divisor (and `MIN_VALUE / -1`); verified with a 52-case differential probe |
| 4 | `exceptions-finally` | `expected 1 elements on the stack for fallthru` | `try { return } finally { return }` compiles to invalid wasm |
| 5 | ~~`exceptions-suppressed`~~ — fixed | — | `Throwable.suppressed` is never initialised (TeaVM constructs through the `@Rename("<init>")` `init(…)` methods), so `addSuppressed` dereferenced null. `TThrowable` vendored with lazy accessors |
| 6 | `exceptions-stacktrace`, `exception-propagation` | null pointer in a lambda over `StackTraceElement[]` | frames are **real** now (the worker enables the stack deobfuscator), but a stream lambda that calls `getMethodName()` and uses the result trips a code-generation fault — see `FINDINGS.md` §4b |
| 7 | ~~`char-classes`~~ — fixed | — | `Character.UnicodeBlock` (and `Character.Subset`) are absent from TeaVM's class library. `TCharacter` vendored, the nested types appended, and the block table generated from the JDK |
| 8 | ~~`io-writers`~~ — fixed | — | `PrintWriter.printf("%n")` was `Unknown format conversion: n`; `%n` added to the class library's `TFormatter` |
| 9 | ~~`recursive-generics`~~ — fixed | — | had crashed the compiler: the class library's `TSuppressWarnings` is a method-less stub shadowing the JDK's declaration, so javac had no `value` element to bind and threw a raw JS `TypeError`. Fixed by bug 6 of the SDK patch (`patches/README.md`); see `poc/UPSTREAM.md` |
| 10 | `enum-map-set` | null pointer in `AbstractStringBuilder.insert` | codegen, and shape-dependent: a near-identical program prints correctly, and giving the enum its own `toString()` makes the corpus shape work. An inherited-`toString` vtable slot / class metadata is not emitted correctly for this program. Needs Binaryen (`FINDINGS.md` §9) |
| 11 | ~~`interface-diamond`~~ — fixed | — | passes now (and in five repeat runs), printing `B/C`. The link to the SDK change is *not* established — the archive's bytes changed and TeaVM's generation is not visibly deterministic — so this is unexplained rather than a known fix |
| 12 | `file-io` | `Directory does not exist` | no filesystem model (deliberately dropped) |

Every failure above was triaged at compile time, without a browser: `scripts/compile-program.mjs --all`
compiles all 145 programs with the fork's javac in Node and reports **145 compile, 0 do not**. So every
remaining failure is past javac — runtime behaviour (null pointers, mis-dispatched methods, the
divide-by-zero trap), code generation (`exceptions-finally` emits invalid wasm), a deliberately dropped
feature (`file-io`), or a class-library subset — and none is an SDK-surface bug of the kind
`patches/StdlibConverter.java` fixes. Minimal reproductions, root causes and the code to change for
each of these are written up in `poc/UPSTREAM.md`.

### Fails on both engines (0)

None any more. `instant-duration` was the last: it needed `Duration.toXxxPart()`, and `java.time` here
is the bundled **ThreeTen backport** (`org.threeten.bp.*`, mapped to `java/time/` by the converter),
which predates Java 9 — so the whole accessor family was missing from the API and the SDK. The threeten
class is vendored with the six accessors (`FINDINGS.md` §5).

`streams-collectors` was once another entry in this section and was **a bug in this corpus, not in
either engine**: the untyped `println(stream.collect(Collectors.toMap(k, v, merge, TreeMap::new)))` has
no target type for `M` to be inferred from, and JDK 25's own javac rejects it with the same message
java-wasm gave. The line now assigns to a `Map<Integer, String>` first, and the program passes.

## Where java-wasm wins

Doppio is stuck on JDK 8 javac, so it cannot run `records`, `switch-expression`, `String.repeat`,
text blocks, `var`, `List.of`, `Map.entry`, `Optional.ifPresentOrElse` or sealed/pattern
`switch` — 30+ programs in this corpus. It also dispatches interface `super` default methods
wrong: `interfaces` throws `NullPointerException` where java-wasm prints the right answer.

## Caveat

145 hand-written programs still only sample the API, and they were written to probe gaps, so 4.1%
is not a prediction of the real-world rate. It is measured rather than inferred — and the
remaining regressions cluster in exception handling and reflection, which ordinary
beginner-to-intermediate Java does use.
