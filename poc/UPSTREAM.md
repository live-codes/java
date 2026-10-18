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
reportable at all. `--emit` writes the generated module, and then

```bash
binaryen-version_133/bin/wasm-dis.exe app.wasm -o app.wat
```

prints readable wat **with Java names** — the standalone Binaryen tools read TeaVM's output where the
npm `binaryen` binding rejects it (`wasm-opt` fails on the same rec groups). The compiler itself can be
rebuilt here — `patches/Dockerfile` and `FINDINGS.md` §6, ~5–9 minutes per rebuild — so "it cannot be
built" is not a reason to leave one of these unfixed.

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

> **Fixed for this package** by `patches/DivisionCheckTransformer.java` + `patches/Division.java`
> (`patches/README.md`): a `ClassHolderTransformer` rewrites int/long `DIVIDE`/`MODULO` into calls to a
> class-library helper that checks the divisor.

---

## 7. Class names are emitted per class, so `getName` and `forName` miss dynamic classes

> **Fixed for this package** by `patches/ClassMetadataRequirements.java` (see `patches/README.md`).
> This section stays as the upstream report.

`ClassMetadataRequirements` decides whether a class carries its name in the generated `ClassInfo` from
the **statically known** `Class` values that the dependency analyzer can prove reach `Class.getName()`:

```java
addClassesRequiringName(requirements, getNameMethod.getVariable(0).getClassValueNode().getTypes());
```

A class reached any other way — `Object.getClass()`, `Class.forName`, `getSuperclass`,
`Array.newInstance`, a `Class` held in a field or collection — is not in that set, so its `name` field
is never emitted and `getName()` answers **null**, where the JDK always answers the name:

```java
public class Main {
  enum Level { LOW, HIGH }

  public static void main(String[] args) throws Exception {
    System.out.println(((Object) Level.LOW).getClass().getName());   // null   (JDK: Main$Level)
  }
}
```

Adding any line that mentions `Level.class` statically — `System.out.println(Level.class.getName());`
— makes the first line print `Main$Level`, because that call site *is* a statically known `Class`
value. The same table backs `TClass.forName`'s name→class map, so `Class.forName` cannot resolve a
class whose name was left out at all: `Class.forName("java.lang.String")` works only if something else
in the program already asked for `String`'s name (`reflection`'s last failing line was exactly this).

Both are one fix — if `getName` or `forName` is reached anywhere, every class gets its name.

---

## 8. A vtable entry whose implementation was dropped, so a virtual call traps

> **Partly fixed for this package**: `patches/WasmGCVirtualTableBuilder.java` plus the `Compiler.java`
> change in `patches/README.md`. The `toString` cases pass; see the end of this section for the
> instance that does not.

A virtual call to a method whose implementation nothing else calls out of line traps with
`RuntimeError: dereferencing a null pointer`. Minimal shape (an `EnumMap`, because printing one calls
`toString()` on its keys):

```java
import java.util.EnumMap;

public class Main {
  enum Level { LOW, HIGH }

  public static void main(String[] args) {
    EnumMap<Level, Integer> m = new EnumMap<>(Level.class);
    m.put(Level.LOW, 1);
    m.put(Level.HIGH, 2);
    Object k = m.keySet().iterator().next();
    System.out.println(((Level) k).name());       // LOW
    System.out.println(((Level) k).toString());   // RuntimeError: dereferencing a null pointer
  }
}
```

`java.lang.AbstractStringBuilder::insert(int, Object)` is the frame that traps, and its generated code
says what it does:

```wat
(call_ref $14 (local.get $obj)
  (struct.get $VT<java.lang.Object> $toString
    (ref.cast (ref $VT<java.lang.Object>) (struct.get $java.lang.Object $vt (local.get $obj)))))
```

The function reference comes out of the object's own vt global (`$Main$Level@vt`), and that slot is
**null**. The global is filled in the program initializer by
`WasmGCClassGenerator.fillVirtualTableMethods`, which writes a slot only when the table has an
**implementor** for it — and `WasmGCVirtualTableBuilder` records one only for a method that is
*reachable*, i.e. has a program in the generated class source. `java.lang.Object.toString` and
`java.lang.Enum.toString` both exist in the class library with real bodies, but nothing calls either
out of line — call sites are devirtualised or replaced by `ObjectIntrinsic` — so the dependency
analysis drops them, no implementor is recorded, no `struct.set` is emitted, and the call site reads
a slot that was never written.

`fillVirtualTableMethods` also gates on `virtualTable.getFirstUsed()`, and
`WasmGCVirtualTableBuilder` marks a table "used" only when a call site's **declaring** class is that
class (`groupMethodsFromCallSites` groups by `methodRef.getClassName()`), while
`WasmGCVirtualCallGenerator` reads the slot from the receiver's **static** type. For an inherited
method those are different classes, so the two halves disagree. That is why the failure is
shape-dependent and moves with unrelated edits: a statically typed use of the class elsewhere can mark
the table used, and the same call then works.

**Fixed for the `toString` cases** by reaching those implementations explicitly, so the vtable has
something to point at, and by not requiring `isVirtual` when recording implementors:

```java
// compiler/src/main/java/org/teavm/javac/Compiler.java, in linkWasmExceptionDecoration's started()
agent.linkMethod(OBJECT_TO_STRING_METHOD).use();
agent.linkMethod(ENUM_TO_STRING_METHOD).use();
```

```java
// WasmGCVirtualTableBuilder.fillTable: the isVirtual filter on class implementors is removed
if (!isVirtual.test(method.getReference()) && !method.getReference().equals(CLONE_METHOD)) {
    continue;
}
```

**Not fixed by that:** the same fault for a method this package does not name. `exceptions-stacktrace`
and `exception-propagation` hit it with `java.lang.String.equals`, which is *final* and so is usually
devirtualised — but not in a stream lambda, where the generated code calls it through
`$VT<java.lang.String> $equals` and that slot is absent from the vt that is written:

```java
System.out.println(Arrays.stream(frames).anyMatch(x -> x.getMethodName().equals("main")));
// RuntimeError: dereferencing a null pointer, in the lambda
```

The frame names themselves are fine (a loop printing every `getMethodName()` shows `main`, `runMain`, …,
all non-null), so the trap is the slot, not the data. A general fix has to make the *most derived*
implementation of every vtable entry reachable — not a fixed list of method names — which belongs in
the dependency analysis or in the vtable builder, not in a patch that names two methods.
