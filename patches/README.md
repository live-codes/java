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

## Second patch: `ArchiveBuilder` (and the first class-library addition)

`ArchiveBuilder.java` here is a drop-in replacement for
`compiler/src/main/java/org/teavm/javac/ArchiveBuilder.java`. It names each archive entry from
`Path.toString()`, which on Windows yields `org\teavm\classlib\...` — while TeaVM looks entries up
with `/`. An archive built locally therefore contains no class TeaVM can find, and *every* program
fails inside `generateWebAssembly` with `dereferencing a null pointer`, `hello` included. The names
are normalised where they are written (`append`), so a build produces the same archive on any
platform; on Linux, where the separator already is `/`, the change is a no-op, which is why the
fork's CI artifacts were always correct and only local builds were broken.

That was the blocker for class-library work: the runtime class library has to be built locally to
add anything to it. The mechanism is the fork's own — a class in `compiler/src/sharedClasslibEmu/java`
is compiled into the SDK by `generateClassLib`, and listed by name in `prepareTeaVMClassLib`'s include
list for the runtime archive. `TScanner` and friends are vendored exactly this way.

**`String.lines()`** is the first gap closed with it. TeaVM 0.14.1 does not implement `lines()`, so the
SDK did not declare it either and `var-textblock`/`text-block-more` failed at compile time. `TString`
is vendored into that source set with `lines()` splitting on `\n`, `\r` and `\r\n` and producing no
trailing empty line, and `org/teavm/classlib/java/lang/TString.class` is in the runtime include list.
Both programs now compile, generate and run with output byte-for-byte identical to JDK 25.

Take the source from the published `teavm-classlib-<version>-sources.jar`, not the GitHub tag of the
same version — the tag's `TString` imports `org.teavm.interop.Intrinsified`, which exists in no
0.14.1 jar.

Both classlib archives therefore have to be vendored: `assets/compile-classlib-teavm.bin` and
`assets/runtime-classlib-teavm.bin`, each checksum-pinned in `scripts/fetch-teavm.mjs`.

## The class-library additions

Each lives in `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/...`, which `generateClassLib`
compiles into the SDK, and is listed by name in `prepareTeaVMClassLib`'s include list
(`compiler/build.gradle`) so the runtime archive carries it too. The header comment of each addition
says `Fork addition:`, against the day a TeaVM bump means re-syncing it against a new sources jar.

| Class | Change |
|---|---|
| `java/lang/TString` | `lines()` added — splits on `\n`, `\r` and `\r\n`, no trailing empty line |
| `java/util/regex/TMatcher` | `results()` added — continues from the matcher's current position, like the JDK |
| `java/text/TDecimalFormatSymbols` | `clone()` copies its own fields explicitly instead of `super.clone()` |
| `java/util/TFormatter` | `%e`/`%E` and `%n` conversions added |
| `java/lang/TThrowable` | `getSuppressed`/`addSuppressed` tolerate a null `suppressed` field |
| `java/lang/TCharacter` | `Character.Subset` and `Character.UnicodeBlock` added — neither type exists upstream |
| `org/threeten/bp/Duration` | the six Java 9 `toXxxPart()` accessors added |

`TCharacter` is the largest of these, and the only one where a substantial part is **new API** rather
than a fix. `Character.UnicodeBlock` is entirely absent from TeaVM 0.14.1, so any program touching it
failed to compile (`cannot find symbol: variable UnicodeBlock`). The nested `Subset` and `UnicodeBlock`
types are appended to the upstream file, and the block table is **generated from the running JDK**:

```bash
java scripts/gen-unicode-blocks.java > blocks.txt   # 339 blocks, 338 ranges
```

`of()` binary-searches those ranges, so it agrees with the JDK exactly — including the code points in
no block (null) and the surrogate ranges (`of(0xD800)` is `HIGH_SURROGATES`; the JDK's legacy
`SURROGATES_AREA` constant exists but `of()` never returns it). `forName`, the 339 constants, and
`Subset.toString()` are covered too. Two details are easy to get wrong and were measured against the
JDK rather than assumed: `Subset.equals`/`hashCode` are **identity**-based (two distinct `Subset`s with
the same name are not equal), and `hashCode` is therefore an identity hash, not `name.hashCode()`.

To regenerate: paste the new `blocks.txt` between the `generated` markers in the vendored
`TCharacter.java`, or re-run the compose step (`scripts/gen-unicode-blocks.java`'s header explains the
markers). Re-syncing `TCharacter` against a new TeaVM sources jar means the same: take the new
upstream file, then re-append the nested types.

`org/threeten/bp/Duration` is worth a note because the package name is surprising: **`java.time` in this
engine is the bundled ThreeTen backport**, and `StdlibConverter` maps `org/threeten/bp/` to `java/time/`
when it builds the SDK (line ~417 of the converter). ThreeTen predates Java 9, so the `Duration`
accessor family added in Java 9 (`toDaysPart`, `toHoursPart`, `toMinutesPart`, `toSecondsPart`,
`toMillisPart`, `toNanosPart`) was missing from `java.time.Duration` entirely. The vendored copy adds
all six with the JDK's semantics — including negative durations, where `toSecondsPart()` of `-90s` is
`-30` — and both the SDK and the runtime archive pick it up.

`TThrowable`'s `suppressed` field is declared `= new TThrowable[0]`, but the initializer never runs:
TeaVM renames the real constructor to `fakeInit` and constructs through the `@Rename("<init>")`
`init(…)` methods, so nothing executes the initializer. Both `getSuppressed0()` and `addSuppressed()`
dereferenced the field and trapped — `exceptions-suppressed` (try-with-resources with two failing
`close()`s) hit `addSuppressed` on the very first resource. The accessors now create the array lazily,
which is also how the JDK behaves.

`TDecimalFormatSymbols.clone()` is a workaround, not a missing API: `Object.clone()` returns an object
with no vtable under the WasmGC backend, so the first virtual call on the copy traps with
`dereferencing a null pointer`. Every `DecimalFormat` clones its symbols on construction, which is what
broke `String.format("%.3f", …)` in `DecimalFormat.forDigit` — see `FINDINGS.md` §4b for the
measurements. A plain virtual `clone()` on a class that does not override it works, so the trigger is
`super.clone()`; the same bug is worth suspecting wherever a report says cloned *elements* are null.

`TFormatter`'s `%e`/`%E` are built from a `TDecimalFormat` exponent pattern (`0.000000E00`) plus an
explicit exponent sign — TeaVM's `TDecimalFormat` prints no sign for a non-negative exponent, and the
JDK always does. Verified against JDK 25 for `%e`, `%.2e`, `%.0e`, `%E`, `%+e`, `%12.3e`, negative,
sub-normal and zero arguments (`stringformat`, `parse-format`, `string-format-more`). `%n` uses
`System.lineSeparator()`, which is `"\n"` here — `io-writers` prints `chars=11` where a *Windows* JDK
prints 13, because the JDK there emits `\r\n`; the browser target wants `\n`.
