# @live-codes/java-wasm

Client-side **Java** for [LiveCodes](https://livecodes.io): compile and run Java entirely in the
browser, no server.

A fork of [teavm-javac](https://github.com/Vsprocessing/teavm-javac) bundles OpenJDK's `javac` and
the [TeaVM](https://teavm.org) AOT compiler into a single WebAssembly module. Source goes in, the
in-browser `javac` produces class files, TeaVM turns those into WasmGC, and the program runs — all
inside a Web Worker.

```js
const runtime = await JavaWasm.createRuntime(); // baseUrl defaults to the bundle's own URL
const result = await runtime.run(
  `public class Main {
     public static void main(String[] args) {
       System.out.println("Hello from Java");
     }
   }`,
  { input: 'hello\n' } // optional stdin, readable as System.in
);
// result: { ok, output, error, exitCode, stdout, stderr, compileMs, generateMs, runMs }
runtime.destroy();
```

## Measured (headless Chrome, localhost)

| | |
|---|---|
| engine init (7.7 MB toolchain) | ~1.3 s |
| `javac` compile | ~30–250 ms (first program includes warm-up) |
| TeaVM wasm generation | ~1.3–2.6 s |
| program run | 2–7 ms |
| `fib(27)` compute (in-program timer) | ~5 ms |
| source language level | Java 25 (javac built from OpenJDK 25 sources) |
| runtime class library | TeaVM's subset, API level 21 (`os.name` = `TeaVM`) |

`input` is delivered to `System.in` as a pre-supplied string — no SharedArrayBuffer, so **no
COOP/COEP headers are required**.

## Scope: Java only

Two sibling engines were evaluated and are deliberately not part of this package:

- **Kotlin** ran on [Doppio](https://github.com/seo-rii/doppio), a JVM interpreted in JavaScript.
  Even after fixing its two blocking bugs (the `kotlinc` recipe, then stdin delivery), a compile
  took ~7–20 minutes and frequently never finished, because every run pulls ~163 MB of jars through
  an emulated filesystem. Not shippable — not included.
- **Scala** has a real client-side compiler (the Wasm-compiled Scala 3 compiler + Scala.js linker)
  and lives in its own package, [`@live-codes/scala-wasm`](https://github.com/live-codes/scala-wasm).

The `poc/` directory keeps the original engine benchmark that led to this design, including the
Doppio measurements.

## Why this engine

TeaVM is a bytecode→WebAssembly AOT compiler, so it can only run Java if something compiles the
source first. Upstream `konsoletyper/teavm-javac` gives fast Java but **no stdin** (TeaVM's
`TConsoleInputStream` throws end-of-file, still true at TeaVM 0.15.0). We build on
[`Vsprocessing/teavm-javac`](https://github.com/Vsprocessing/teavm-javac), which adds console input,
a wider runtime class library and a WasmGC/JS compiler backend. Its artifacts are vendored, pinned
and checksummed by `scripts/fetch-teavm.mjs`.

## API (`dist/java-wasm.iife.js`, global `JavaWasm`)

```js
JavaWasm.createRuntime({
  baseUrl,       // directory hosting the dist files (defaults to the bundle's own URL)
  workerUrl,     // explicit worker script URL override
  teavmBaseUrl,  // TeaVM assets base (compiler.wasm + classlib archives; default <baseUrl>/teavm/)
  onProgress,    // ({ stage, detail }) => void
});
```

Returns `{ run(source, { input, mainClass }), on('progress', fn), destroy() }`.

Progress stages are `init` → `compile` → `generate` → `run`.

## Build

```bash
npm install
npm run vendor:teavm   # fetch the pinned teavm-javac fork artifacts (sha256-checked)
npm run build          # esbuild → dist/java-wasm.iife.js + dist/worker-java.js + dist/teavm/
npm test               # static smoke: assets present, bundles parse, glue + stdin wiring present
npm run serve          # http://localhost:8931/playground.html
```

`playground.html` is a minimal editor + stdin + output page; `poc/smoke.html` exercises the built
bundle directly.

## Artifact provenance

| Artifact | Source | Size |
|---|---|---|
| `dist/teavm/compiler.wasm` | `Vsprocessing/teavm-javac@d1514ab`, `dist/teavm-javac/` (TeaVM 0.14.1) | 5.2 MB |
| `dist/teavm/compile-classlib-teavm.bin` | same | 0.21 MB |
| `dist/teavm/runtime-classlib-teavm.bin` | same | 2.2 MB |
| `dist/teavm/compiler.wasm-runtime.js` | same | 16 KB |

## Licences

- TeaVM + teavm-javac (including the `Vsprocessing` fork this builds on): Apache-2.0.
- The included `javac` comes from OpenJDK: GPLv2 + Classpath Exception.
