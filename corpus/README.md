# Corpus test — java-wasm vs the current LiveCodes engine

Runs the same Java programs through both engines in headless Chrome and reports where they
agree and differ.

```bash
node corpus/run.mjs            # both engines
node corpus/run.mjs teavm      # only @live-codes/java-wasm  (~1.5 min)
node corpus/run.mjs baseline   # only LiveCodes/Doppio       (~13 min)
```

Raw results land in `corpus/results.json`.

- `programs.mjs` — the 35 programs (one `public class Main` each, deterministic output)
- `teavm.html` — harness for this package (`/dist/java-wasm.iife.js`)
- `baseline.html` + `baseline-worker.js` — harness for LiveCodes' current engine: a port of
  `livecodes/src/livecodes/languages/java/lang-java-script.ts` (Doppio + BrowserFS, JDK 8 jars
  from `unpkg.com/@seth0x41/doppio@1.0.0/`, the same compile/run command lines)
- `run.mjs` — serves this repo, drives both harnesses over CDP, diffs the outputs

## Latest run

`java-wasm` 30/35. The five remaining failures, and whether the current engine does better:

| Program | Failure | On Doppio |
|---|---|---|
| `stringformat` | TeaVM runtime bug (`DecimalFormat.forDigit` null pointer) | works |
| `exceptions` | wasm traps on integer divide-by-zero instead of raising `ArithmeticException` | works |
| `reflection` | `NoSuchMethodException` — TeaVM's reflection is a declared subset | works |
| `file-io` | `Directory does not exist` — the browser file bridge has no directory model | works |
| `var-textblock` | `String.lines()` absent from the class library | also fails |

In the other direction, Doppio cannot run `records`, `switch-expression` or `String.repeat`
(JDK 8 javac), and gets interface `super` default dispatch wrong (throws `NullPointerException`
where java-wasm prints the right answer).

Caveat: 35 programs, hand-written. Real code — reflection, generics, NIO, threading — will find
more gaps than this.
