# Upstream TeaVM findings

Bugs found in `Vsprocessing/teavm-javac@d1514ab` (TeaVM 0.14.1) while building the corpus in
`corpus/`. Each was reproduced against **both** the fork's own `compile-classlib-teavm.bin` and the
archive in `assets/`, so none of them is caused by `patches/StdlibConverter.java`.

Reproduce anything here with:

```bash
node scripts/compile-program.mjs <program-id>   # TEAVM_JAVAC_DIST must point at a teavm-javac dist
ONLY=<program-id> node corpus/run.mjs teavm     # when the failure is past javac, e.g. code generation
```

---

## 1. `@SuppressWarnings` crashes the compiler — hard crash, no diagnostic

> **Fixed for this package** by `patches/StdlibConverter.java` (bug 6 — see `patches/README.md`).
> This section stays as the upstream report: the fork's own SDK still has the bug.

**Highest impact of the four.** Any program that uses `@SuppressWarnings` — very common in
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

**Impact is narrow**, unlike finding 1: a `return` inside a `finally` is rare and universally
discouraged, and every other try/finally shape works.

**Where it lives, and why it is not fixed here.** This is TeaVM core, not the converter: the fork's
`compiler/src/patches/java` holds six override classes (`TNormalizer`, `TURLClassLoader`, `VMBridge`,
`RuntimeRenderer`, `EntryPointTransformation`, `AstUtil`) and none touches return or exception
lowering, and core is consumed as a jar so its sources are not in the build tree at all. A fix means
either patching upstream TeaVM or shadowing the responsible backend class in that `patches` source
set. Verifying it means rebuilding `compiler.wasm` (`:compiler:createDist`), which needs Binaryen's
`wasm-opt` — not installed here (`wasm-opt` is not on `PATH`, nothing matching binaryen is in the
Gradle cache), so a change could not be built or tested in this environment. `generateClassLib`
sidesteps that because it only writes the javac SDK archive.

---

## 3. `Interface.super.method()` raises an unreadable exception

```java
interface A { default String name() { return "A"; } }
interface B extends A { default String name() { return "B"; } }
interface C extends A { default String name() { return "C"; } }
class D implements B, C {
  public String name() { return B.super.name() + "/" + C.super.name(); }
}
```

Compiles fine; fails at generate/run with

```console
(could not fetch message)
```

which is `compiler.wasm-runtime.js`'s fallback when it cannot read the message off the thrown Java
exception — so the runtime raises and no diagnostic survives. Reproduce:
`ONLY=interface-diamond node corpus/run.mjs teavm`.

---

## 4. Missing class-library APIs

All compile-time `cannot find symbol`, all verified as genuinely absent from the converter's *input*
(`teavm-classlib-0.14.1.jar`) — not converter omissions:

| API | Program |
|---|---|
| `String.lines()` | `var-textblock`, `text-block-more` |
| `Matcher.results()` | `regex-groups` |
| `Duration.toSecondsPart()` | `instant-duration` |
| `Character.UnicodeBlock` | `char-classes` |
| `java.time` generally | `TInstant`/`TDuration` are not in the class library at all |

Separately, these compile but fail at runtime inside the class library: `Throwable.addSuppressed`
and `getStackTrace` elements (null pointer), `DecimalFormat` under `%e` / `%,d` (null pointer),
integer division by zero not raising `ArithmeticException` (wasm trap), `EnumSet`/`EnumMap`
(null pointer in `AbstractStringBuilder.insert`), `PrintWriter.printf("%n")` (`Unknown format
conversion: n`), and `String.format` of `%,d` (null pointer).
