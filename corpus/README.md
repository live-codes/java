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

Programs must print deterministic output — sort maps and sets before printing, or the two engines
differ for reasons that have nothing to do with correctness.

## Result: 127/145 pass, but **14 of the 145 are regressions**

java-wasm runs 127 of 145. That headline hides the number that matters for a switch: **14 of those
18 failures work today on the current engine.** On this corpus that is a 9.7% regression rate.

Six of the regressions the corpus originally found were bugs in the generated javac SDK rather than
in TeaVM, and are fixed by `patches/StdlibConverter.java` (see `patches/README.md`): `list-deque-queue`
and `stringbuilder-vs-buffer` (a duplicated `StringBuilder.append(Object)`), `iterable-custom` and
`charsequence-impl` (`default` methods emitted abstract), `annotation-basic`
(`java.lang.annotation.Annotation` emitted extending itself), and `recursive-generics` (`@SuppressWarnings`
crashed the compiler — the trigger was the annotation, not the recursive bound; see `poc/UPSTREAM.md`).

Timings for the whole set: init 0.3–2 s, javac 1–13 s, **wasm generation 51–392 s**, run 0.1–1.3 s.
The spread is run-to-run variance on one machine (load-dependent), not a spread across programs;
generation dominates either way.

### Regressions — work on Doppio, fail on java-wasm (16 found, 14 remain)

| # | Programs | Failure | Cause |
|---|---|---|---|
| 1 | `stringformat`, `parse-format`, `string-format-more` | null pointer in `DecimalFormat.forDigit` | TeaVM runtime bug |
| 2 | `reflection`, `reflection-members` | `NoSuchMethodException` | TeaVM reflection is a declared subset |
| 3 | `exceptions` | wasm traps on integer divide-by-zero | no `ArithmeticException` |
| 4 | `exceptions-finally` | `expected 1 elements on the stack for fallthru` | `try { return } finally { return }` compiles to invalid wasm |
| 5 | `exceptions-suppressed` | null pointer in `Throwable.addSuppressed` | not implemented |
| 6 | `exceptions-stacktrace`, `exception-propagation` | null pointer on `getStackTrace()` elements | not implemented |
| 7 | `char-classes` | `cannot find symbol: UnicodeBlock` | class library gap |
| 8 | `io-writers` | `Unknown format conversion: n` | `PrintWriter.printf("%n")` unsupported |
| 9 | ~~`recursive-generics`~~ — fixed | — | had crashed the compiler: the class library's `TSuppressWarnings` is a method-less stub shadowing the JDK's declaration, so javac had no `value` element to bind and threw a raw JS `TypeError`. Fixed by bug 6 of the SDK patch (`patches/README.md`); see `poc/UPSTREAM.md` |
| 10 | `enum-map-set` | null pointer in `AbstractStringBuilder.insert` | `EnumSet`/`EnumMap` path |
| 11 | ~~`interface-diamond`~~ — fixed | — | passes now (and in five repeat runs), printing `B/C`. The link to the SDK change is *not* established — the archive's bytes changed and TeaVM's generation is not visibly deterministic — so this is unexplained rather than a known fix |
| 12 | `file-io` | `Directory does not exist` | no filesystem model (deliberately dropped) |

Every failure above was triaged at compile time, without a browser: `scripts/compile-program.mjs --all`
compiles all 145 programs with the fork's javac in Node and reports **140 compile, 5 do not** — all
five are `cannot find symbol` for missing class-library APIs. So every remaining failure is
TeaVM-side — runtime behaviour (null pointers, unimplemented methods, the divide-by-zero trap), code
generation (`exceptions-finally` emits invalid wasm), or the class library — and none is an
SDK-surface bug of the kind `patches/StdlibConverter.java` fixes. Minimal reproductions, root causes
and the code to change for each of these are written up in `poc/UPSTREAM.md`.

### Fails on both engines (4)

| Program | Why java-wasm fails | Why Doppio fails |
|---|---|---|
| `var-textblock`, `text-block-more` | `String.lines()` absent from the class library | JDK 8 javac: `unclosed string literal` |
| `instant-duration` | `Duration.toSecondsPart()` absent | JDK 8 has no such method |
| `regex-groups` | `Matcher.results()` absent | JDK 8 has no such method |

These are missing APIs in TeaVM's class library, not converter omissions — checked by extracting the
converter's input jar (`teavm-classlib-0.14.1.jar`) and confirming `TString` has no `lines()`,
`TMatcher` no `results()`, and that `TCharacter$UnicodeBlock` and `java.time` are not in it at all.
The converter only renames what is there; it cannot invent an implementation.

`streams-collectors` was a fifth entry here and was **a bug in this corpus, not in either engine**:
the untyped `println(stream.collect(Collectors.toMap(k, v, merge, TreeMap::new)))` has no target type
for `M` to be inferred from, and JDK 25's own javac rejects it with the same message java-wasm gave.
The line now assigns to a `Map<Integer, String>` first, and the program passes.

## Where java-wasm wins

Doppio is stuck on JDK 8 javac, so it cannot run `records`, `switch-expression`, `String.repeat`,
text blocks, `var`, `List.of`, `Map.entry`, `Optional.ifPresentOrElse` or sealed/pattern
`switch` — 30+ programs in this corpus. It also dispatches interface `super` default methods
wrong: `interfaces` throws `NullPointerException` where java-wasm prints the right answer.

## Caveat

145 hand-written programs still only sample the API, and they were written to probe gaps, so 11.0%
is not a prediction of the real-world rate. It is measured rather than inferred — and the
regressions cluster in exception handling, string formatting and reflection, which ordinary
beginner-to-intermediate Java does use.
