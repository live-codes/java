# Upstream TeaVM findings

Bugs found in `Vsprocessing/teavm-javac@d1514ab` (TeaVM 0.14.1), each with a minimal reproduction.
They are upstream's, not `patches/StdlibConverter.java`'s — except where a patch here fixes one.

Reproduce anything here without a browser:

```bash
node scripts/run-program.mjs <program-id> --jdk --trace   # compile + generate + run, and diff against JDK 25
node scripts/run-program.mjs --file probe/Main.java --jdk --trace
node scripts/generate-check.mjs <program-id>              # compile + generate + validate the module
node scripts/compile-program.mjs <program-id>             # javac only (needs TEAVM_JAVAC_DIST)
ONLY=<program-id> node corpus/run.mjs teavm               # the same, in a browser
```

`run-program.mjs` reports a wasm trap with **named Java frames** (`--trace`), which is what makes these
reportable at all. The compiler itself can now be rebuilt and tested here — see
`patches/Dockerfile` and `FINDINGS.md` §6 (JDK 25 + Binaryen 133, ~9 minutes) — so "it cannot be
built" is no longer a reason to leave one of these unfixed.

---

## 1. `@SuppressWarnings` crashes the compiler — hard crash, no diagnostic

> **Fixed for this package** by `patches/StdlibConverter.java` (bug 6 — see `patches/README.md`).
> This section stays as the upstream report: the fork's own SDK still has the bug.

**Highest impact of the fixed set.** Any program that uses `@SuppressWarnings` — very common in
IDE-generated code and in the `unchecked`/`serial` idioms — kills the compilation outright. The
compiler throws a raw JavaScript `TypeError` instead of reporting a diagnostic, so a browser
harness can only surface it as an unhelpful generic error.

Minimal reproduction:

```java
@SuppressWarnings("unchecked")
public class Main {
  public static void main(String[] args) { System.out.println("x"); }
}
```

```console
$ node scripts/compile-program.mjs …            # any source containing @SuppressWarnings
TypeError: Cannot read properties of null (reading 'ctZ')
    at G5F (compiler.js:7223:72)
    at C$z.fs (compiler.js:2:427)
```

Placement is irrelevant — class, method or local variable all crash. `@Override`, `@Deprecated`,
`@FunctionalInterface` and user-defined annotations (SOURCE or RUNTIME retention, with or without
elements) are all fine. `@SuppressWarnings` is the specific trigger.

**Root cause.** TeaVM's class library ships its own annotation stub:

```java
// teavm-classlib-0.14.1.jar
public interface org.teavm.classlib.java.lang.TSuppressWarnings extends java.lang.annotation.Annotation {
}
```

It has no members, but the converter maps it onto `java.lang.SuppressWarnings`, shadowing the JDK's
real declaration. The generated SDK archive therefore contains:

```console
$ javap -v java/lang/SuppressWarnings.class     # from assets/compile-classlib-teavm.bin
public interface java.lang.SuppressWarnings extends java.lang.annotation.Annotation
  interfaces: 1, fields: 0, methods: 0          <-- no value()
```

whereas the JDK declares `public abstract String[] value();`. javac resolves the annotation, looks
for the `value` element it was given, finds nothing to bind it to, and dereferences null.

**Fix, as implemented here.** Do not let a method-less stub stand in for the JDK's declaration: copy
the platform's element methods — with the `AnnotationDefault` attribute, which a re-declared method
would lose — into the converted annotation, for annotations only. `TDeprecated` is stubbed the same
way and `@Deprecated(since = "9")` did fail the same way, so both are covered by the one change;
`scripts/sdk-check.mjs` now checks them (`@SuppressWarnings` on a class, a method and a local
variable, plus `@Deprecated(since = "9")`).

---

## 2. `try { return x; } finally { return y; }` generates invalid wasm

Compilation and generation both succeed; the module then fails V8's validation:

```console
$ node scripts/generate-check.mjs exceptions-finally
FAIL invalid-wasm exceptions-finally (46158 bytes)
                 WebAssembly.compile(): Compiling function #196:"Main::overrideReturn" failed:
                 expected 1 elements on the stack for fallthru, found 2 @+14273
```

The message is V8's validator, so the emitted module really is malformed: a block reaches a
fall-through edge with two values on the stack where one is expected.

Minimal reproduction — the two returns together are the trigger:

```java
static int overrideReturn() {
  try { return 1; } finally { return 2; }
}
```

| Shape | Result |
|---|---|
| `try { return 1; } finally { return 2; }` | **invalid wasm** |
| `try { return 1; } finally { System.out.println("f"); }` | ok |
| `try { return 1; } finally { }` | ok |
| `try { … } finally { return 2; }` (nothing returned in the try) | ok |
| `try { …; return 1; } catch (…) { return 3; } finally { return 2; }` | ok |
| `int x; try { x = 1; } finally { x = 2; } return x;` | ok |

javac's bytecode for the failing method — the try body stores the value and returns, the handler
returns, and there is a single exception-table entry:

```text
0: iconst_1
1: istore_0
2: iconst_2
3: ireturn
4: astore_1        <- handler, covers 0-2, any
5: iconst_2
6: ireturn
```

The `catch` variants that work have the same returns but more exception-table entries, so the trigger
is this shape rather than "a return in a `finally`" in general.

**Where it lives.** TeaVM core's WasmGC method generator (the exception-table/return lowering), not
the converter and not the class library. It is reachable from here now — `compiler/src/patches/java`
is a shadow source set for core classes, and `:compiler:optimizeWasmGC` runs in the container
(`patches/Dockerfile`) — but no fix has been attempted.

**Impact is narrow**: a `return` inside a `finally` is rare and universally discouraged, and every
other try/finally shape works.

---

## 3. `Interface.super.method()` — was unreadable, now passes

```java
interface A { default String name() { return "A"; } }
interface B extends A { default String name() { return "B"; } }
interface C extends A { default String name() { return "C"; } }
class D implements B, C {
  public String name() { return B.super.name() + "/" + C.super.name(); }
}
```

This used to fail at generate/run with `(could not fetch message)` — the runtime glue's fallback when
it cannot read the message off a thrown Java exception. It now passes, printing `B/C`, in every repeat
run. **The cause of the change is not established**: the SDK archive's bytes changed around the same
time, and TeaVM's generation is not visibly deterministic. Recorded here as unexplained rather than as
a fix.

---

## 4. Missing class-library APIs

> Most of these are **fixed here** now; the table records how. The recipe is in `FINDINGS.md` §5 and
> `patches/README.md`.

| API | Program | State |
|---|---|---|
| `String.lines()` | `var-textblock`, `text-block-more` | **fixed here** — vendored `TString` |
| `Matcher.results()` | `regex-groups` | **fixed here** — vendored `TMatcher` |
| `Character.UnicodeBlock` (and `Character.Subset`) | `char-classes` | **fixed here** — absent entirely upstream; `TCharacter` vendored with both nested types, block data generated from the JDK |
| `Duration.toXxxPart()` | `instant-duration` | **fixed here** — `java.time` is the bundled **ThreeTen backport** (`org.threeten.bp.*`, mapped by `StdlibConverter`), which predates Java 9; vendored `org/threeten/bp/Duration` with the six accessors |
| `%e`/`%E` and `%n` conversions | `stringformat`, `io-writers`, `parse-format`, `string-format-more` | **fixed here** — vendored `TFormatter` |
| `Throwable.suppressed` | `exceptions-suppressed` | **fixed here** — its field initializer never runs (TeaVM constructs through the `@Rename("<init>")` `init(…)` methods); `TThrowable` vendored with lazy accessors |
| `DecimalFormatSymbols.clone()` | `stringformat`, `parse-format`, `string-format-more` | **fixed here** — `Object.clone()` produces a vtable-less object (§5), so the class copies its fields explicitly |
| method reflection | `reflection-members` | **fixed here** — the compiler's `ReflectionSupplier` kept application-class fields but no methods; `patches/CompilerResourceSupplier.java` mirrors the rule |
| `%n` in `PrintWriter.printf` | `io-writers` | fixed, as above |

Correcting an earlier entry: **`java.time` is not absent**. It is the bundled ThreeTen backport, so
`LocalDate`, `LocalDateTime`, `DateTimeFormatter`, `Instant` and `Duration` all work; only ThreeTen's
API level (pre-Java 9) applies. `time-api` passes and matches the JDK.

---

## 5. `Object.clone()` returns an object with no vtable

```java
public class Main {
  static class C implements Cloneable { int x = 7; }

  public static void main(String[] args) {
    C c = new C();
    C d = (C) c.clone();
    System.out.println("field=" + d.x);                 // 7 — the copy's fields are fine
    System.out.println("method=" + d.toString());       // RuntimeError: dereferencing a null pointer
  }
}
```

`clone()` compiles to TeaVM's `cloneLowLevel`, which allocates through the low-level
`Allocator`/`Structure` API rather than the WasmGC `struct.new` path: the copy gets the fields (a field
read or a devirtualised call works, and `getClass()` returns the right class) but **not the vtable
slot a virtual call dispatches through**. `super.clone()` is the broken shape — a plain virtual
`clone()` on a class that does not override it works; array clone (`int[] b = a.clone()`) traps
outright. Measured by instrumenting a vendored `TDecimalFormat`: `symbols` was non-null, yet
`symbols.getClass().getName()` was `null`, and the trap landed on `symbols.getZeroDigit()`.

This is what broke `String.format("%.3f", …)`; it is worked around per class in the class library
(`TDecimalFormatSymbols.clone()`), not fixed.

---

## 6. Integer division by zero traps instead of throwing

```java
public class Main {
  public static void main(String[] args) {
    try { System.out.println(10 / 0); }
    catch (ArithmeticException e) { System.out.println("caught"); }
  }
}
```

On the JDK this prints `caught`; here the module dies with `RuntimeError: divide by zero` — the wasm
operator traps, so the `catch` never runs.

**Where.** `org/teavm/backend/wasm/generate/methods/BaseWasmGenerationVisitor` maps `DIVIDE` straight
to `WasmIntBinaryOperation.DIV_SIGNED` (and `MODULO` to `REM_SIGNED`) with no zero check. Unlike
bounds and class-cast checks there is no existing machinery to reuse: `BoundCheckExpr` assumes the
check already passed, and the backend throws only through `WasmThrow`/`context.getExceptionTag()`. A
fix needs new IR or backend work (plus the `MIN_VALUE / -1` case, which must return `MIN_VALUE`
rather than trap).

---

## 7. Two shape-dependent codegen traps seen with `enum-map-set`

Both look like the generator failing to emit a vtable slot or class metadata for *some* programs —
they move with the program, not with the code, which is what makes them reportable as upstream bugs.

**a. An inherited `TEnum.toString()` traps.** With `EnumMap` involved, a *virtual* call to the
inherited `toString()` traps while the final `name()`/`ordinal()` on the same object work, and
`getClass().getName()` returns `null`:

```java
enum Level { LOW, HIGH }
Object k = m.keySet().iterator().next();     // m is an EnumMap<Level, …>
System.out.println(((Level) k).name());      // LOW
System.out.println(((Level) k).toString());  // RuntimeError: dereferencing a null pointer
```

Giving the enum its own `toString()` makes the same program work, and a near-identical program
(`HashMap<Level, Integer>` printed with `+`) works too. `EnumMap.toString()` then traps inside the
`StringBuilder` it builds text with (`AbstractStringBuilder.insert(int, char)` on a null `buffer`).

**b. A stream lambda over `StackTraceElement[]` that uses `getMethodName()` traps.** The frames are
real and their names are non-null (`map(StackTraceElement::getMethodName).findFirst().get()` returns
the right value), but:

```java
System.out.println(Arrays.stream(frames).anyMatch(f -> f.getMethodName().equals("main")));
// RuntimeError: dereferencing a null pointer, inside the lambda
```

`anyMatch(f -> f.getMethodName() != null)` works; only *using* the returned `String` (`.equals(...)`)
in a lambda traps. The same shape over a user class works. Both programs that need it
(`exceptions-stacktrace`, `exception-propagation`) are otherwise correct.
