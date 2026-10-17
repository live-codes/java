# Upstream fix: `StdlibConverter` (teavm-javac)

`StdlibConverter.java` here is a drop-in replacement for
`compiler/src/main/java/org/teavm/javac/StdlibConverter.java` in
[`Vsprocessing/teavm-javac`](https://github.com/Vsprocessing/teavm-javac) (same file in
`konsoletyper/teavm-javac`).

`StdlibConverter` turns TeaVM's class library (`org.teavm.classlib.java.*`, `T`-prefixed types) into
the `java.*` shape javac consumes. It renames classes, descriptors and signatures — but it ignores
metadata that also determines the API surface, so the SDK it writes is not the API that exists at
runtime.

## The bugs

**1. `@org.teavm.interop.Rename` is not applied.** TeaVM declares some members under an internal name
and renames them when it builds the runtime — `TObject.getClass0()` is `@Rename("getClass")`,
`TThrowable.getMessage0()` is `@Rename("getMessage")`, likewise `clone`, `notify`, `notifyAll`,
`wait`, `getCause`, `getStackTrace`, `getSuppressed`, `annotationType`. The SDK therefore contains
`java/lang/Object.class` with a method named **`getClass0`**, so user code calling `getClass()` fails
to compile — as do `Throwable.getMessage()` and friends.

**2. `InnerClasses` entries are not renamed.** The attribute still points at the pre-rename owners
(`org/teavm/classlib/java/util/TMap$Entry`), so javac cannot associate the nested type with its outer
class and `Map.Entry` does not resolve — even though `java/util/Map$Entry.class` *is* in the archive.

**3. Members are emitted twice.** `java/lang/StringBuilder.class` in the stock archive contains two
`append(java.lang.Object)` methods returning `StringBuilder` (and two copies of every bridge). javac
reports `reference to append is ambiguous / both method append(java.lang.Object) in
java.lang.StringBuilder and method append(java.lang.Object) in java.lang.StringBuilder match`, so
`sb.append(someObject)` — appending any non-`String` value — fails to compile.

**4. Some JDK `default` methods come out abstract.** Where TeaVM declares an interface by hand, a
member the JDK implements as a `default` method is emitted `ACC_ABSTRACT`, and javac then demands
that every implementer supply it: `implements CharSequence` fails with *"does not override abstract
method isEmpty()"*, and the same for `Iterator.remove()`. Scanning every interface in the archive
against the JDK found 11 affected interfaces, including `java.util.Iterator` (`remove`),
`java.lang.CharSequence` (`isEmpty`), `java.util.stream.Stream` (`takeWhile`, `dropWhile`),
`java.util.regex.MatchResult` (`namedGroups`), `java.time.temporal.TemporalUnit` (`isSupportedBy`)
and `java.util.SequencedMap`/`SequencedSet` (the `sequenced*`/`reversed` accessors). `Comparator`,
`List`, `Map`, `Set`, `Collection`, `Iterable`, `Function` and `Predicate` are unaffected.

**5. `java.lang.annotation.Annotation` is emitted extending itself.** TeaVM's `TAnnotation` already
extends the JDK interface it renames to, and the converter deduplicates that for a superclass but not
for interfaces, so the archive contains
`public interface java.lang.annotation.Annotation extends java.lang.annotation.Annotation`. Every
`@interface` in user code then fails with *"cyclic inheritance involving
java.lang.annotation.Annotation"*.

**6. The class library's annotation stubs have no elements.** TeaVM declares its own annotations as
markers — `TSuppressWarnings` declares no `value()` — and the converter emits that as
`java.lang.SuppressWarnings`, so the SDK's annotation has no elements either. javac resolves
`@SuppressWarnings("unchecked")` against the SDK, finds no element to bind the value to, and dies
with a raw `TypeError` inside the compiler instead of reporting anything: *any* program that uses
`@SuppressWarnings` — on a class, a method or a local variable — fails with no diagnostic at all.
`@Deprecated(since = "…")` is affected the same way, since the JDK's `@Deprecated` has elements too.

Measured on the corpus in `corpus/`: bugs 1–2 fail 4 of 35 ordinary programs, bugs 3–5 another 5,
and bug 6 crashes the compiler on 1 more.

## The fix

- **Apply `@Rename`** to fields and methods (`renameMember`), with the guards that matter: never
  rename `<init>`/`<clinit>` (`TObject`'s constructor is `@Rename("fakeInit")` — renaming it would
  delete the constructor and break `super()`), skip a rename that would duplicate a member the class
  already answers to, and keep a `@Rename("<init>")` factory a method rather than a constructor.
- Because those guards need the whole member list before anything is emitted, conversion is two-pass:
  `MemberScanner` collects declared `name+descriptor` pairs and `@Rename` targets, then
  `StdlibConverter` emits with them.
- **Rename `InnerClasses`**, `EnclosingMethod`, `NestHost` and `NestMember` class references.
- **Emit each member once** (`emitted`): a repeated `name+descriptor` in the input is dropped instead
  of written twice.
- **Drop `ACC_ABSTRACT` where the JDK has a body** (`relaxAbstract`): for an interface, look the
  method up on the platform the compiler runs on and clear the flag when the JDK's is not abstract.
  That is the platform's own answer rather than a hand-kept list, so it covers every interface at
  once.
- **Drop a superinterface that renames to the class itself** (`removeSelfType`), the same rule the
  code already applied to a superclass.
- **Give an annotation the platform's elements** (`copyPlatformElements`): the stubs are markers, so
  the SDK's annotations are missing theirs. The element methods are copied from the platform's own
  class file rather than re-declared, so everything they carry comes with them — `@Deprecated`'s
  `since()` and `forRemoval()` are useless without their `AnnotationDefault` values. Only annotations
  are filled in: their elements are compile-time metadata that no runtime call can reach, whereas
  adding the platform's methods to an ordinary `T`-stub would turn today's compile-time
  "cannot find symbol" into a runtime failure.

Nothing else changes: the same classes are included/excluded, members keep their access filtering,
and the archive format is untouched.

## Applying and building

```bash
git clone https://github.com/Vsprocessing/teavm-javac
cp StdlibConverter.java teavm-javac/compiler/src/main/java/org/teavm/javac/StdlibConverter.java
cd teavm-javac
JAVA_HOME=/path/to/jdk-25 ./gradlew :compiler:generateClassLib
```

`generateClassLib` writes `compiler/build/classlib/compile-classlib-teavm.bin` — the javac SDK. Only
that archive changes, so a full distribution build (`:compiler:createDist`, which also needs Binaryen
`wasm-opt`) is not required to pick it up.

To vendor it, copy the archive to `assets/compile-classlib-teavm.bin` and update `SDK_SHA256` in
`scripts/fetch-teavm.mjs`.

## Checking it

`scripts/sdk-check.mjs` compiles one snippet per bug above with the fork's compiler running in plain
Node — no browser, about a second for the set. Point it at a teavm-javac dist and it uses the
vendored archive:

```bash
TEAVM_JAVAC_DIST=/path/to/teavm-javac/dist/teavm-javac node scripts/sdk-check.mjs
```

Seven checks: `@Rename` (`getClass`/`getMessage`/`clone`), `Map.Entry`, `@interface` declarations,
`implements CharSequence`, `implements Iterator`, `StringBuilder.append(Object)`, and annotations
with elements (`@SuppressWarnings` on a class, a method and a local variable, plus
`@Deprecated(since = "9")` — the last one is what caught the missing `AnnotationDefault` values). It
caught the duplicated members, the abstract-default problem, the self-extending `Annotation` and the
element-less annotations before any of them reached the browser.
