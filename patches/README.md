# Upstream fix: `StdlibConverter` (teavm-javac)

> **Upgrading the toolchain?** Read [`UPGRADING.md`](../UPGRADING.md). Every pin and patch is recorded
> in [`manifest.json`](manifest.json) — check it with `node scripts/upgrade.mjs`, and regenerate the
> per-file diffs with `node scripts/upgrade.mjs --diff`. The diffs live in `patches/diffs/` and are
> each proven by applying them back to the upstream source they were taken from.

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

The build must run on **Linux, with JDK 25 and a pinned Binaryen** (`wasm-opt`), for three reasons:
`ArchiveBuilder` used to emit `\` entry separators on Windows; `:compiler:createDist` needs `wasm-opt`;
and `StdlibConverter` reads the *running* JDK's own class files (annotation elements, relaxed
`default` methods), so the JDK version is part of the build's identity. **`patches/Dockerfile` pins all
three**, which is the reproducible way to build here:

```bash
cd /path/to/teavm-javac          # the fork clone, at the pinned commit
docker build -f patches/Dockerfile -t teavm-javac-build .
docker run --rm -v "$PWD":/work -v teavm-gradle:/root/.gradle teavm-javac-build \
    bash ./gradlew :compiler:createDist --console=plain --no-daemon
```

The `teavm-gradle` volume caches Gradle and the dependencies; without it every run re-downloads.
Note that a Windows checkout of `gradlew` has CRLF line endings — strip them (`sed -i 's/\r$//'
gradlew` on the host, or in an entrypoint) before running it inside a Linux container.

Native builds work too, and are what this repo's archives were produced with:

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

## Compiler patch + class-library helper: integer division by zero

**The bug.** `10 / 0` traps in wasm (`RuntimeError: divide by zero`) instead of throwing
`ArithmeticException`, so a surrounding `catch` never runs. `BaseWasmGenerationVisitor` maps
`DIVIDE` straight to `WasmIntBinaryOperation.DIV_SIGNED` (and `MODULO` to `REM_SIGNED`) with no zero
check. Java also requires `MIN_VALUE / -1` to be `MIN_VALUE`, where wasm's `div_s` traps on overflow.
Unlike bounds and null checks, the backend has no instruction or helper to reuse for this.

**The fix, in two pieces.**

1. `Division.java` (here, and in `compiler/src/sharedClasslibEmu/java/org/teavm/classlib/impl/math/`)
   — `div`/`rem` for `int` and `long` that throw `ArithmeticException("/ by zero")`, special-case
   `MIN_VALUE / -1`, and otherwise use plain `/` and `%`. It is listed in `prepareTeaVMClassLib`'s
   include list so the runtime archive carries it.
2. `DivisionCheckTransformer.java` (here, and in `compiler/src/main/java/org/teavm/javac/`) — a
   `ClassHolderTransformer` that rewrites every `BinaryInstruction` with `DIVIDE`/`MODULO` on
   `INT`/`LONG` into a static call to the helper. It skips the helper class itself (otherwise the
   rewrite recurses), and leaves floating-point arithmetic alone. `Compiler.createTeaVM` registers it
   **only for `WasmGCTarget`**: the JavaScript backend already lowers division to its own throwing
   runtime helper.

**Verified.** `exceptions` matches JDK 25, and a 52-case differential probe (every combination of
`{10, -10, 7, MIN_VALUE, 0, MAX_VALUE}` over `{3, -3, 1, -1, 2, MIN_VALUE}`, plus the `long` cases)
matches too — including `MIN_VALUE / -1`, `MIN_VALUE % -1` and the `/ by zero` message.

This is a **compiler** change, so it needs `:compiler:optimizeWasmGC` (the Docker recipe above).

## Compiler patch: `CompilerResourceSupplier` (reflection)

`CompilerResourceSupplier.java` here is a drop-in replacement for
`compiler/src/main/java/org/teavm/javac/CompilerResourceSupplier.java` in the fork. It is already
registered as a `ReflectionSupplier` service
(`compiler/src/main/resources/META-INF/services/org.teavm.classlib.ReflectionSupplier`), so only the
class body changes.

**The bug.** `Class.getDeclaredMethods()` returned an **empty array** for user classes, and
`getDeclaredMethod`/`getMethod` therefore always threw `NoSuchMethodException` — while
`getDeclaredFields()`, `Field.getInt`/`setInt`, `getName`, `getSimpleName` and annotations all worked.
TeaVM's `ReflectionDependencyListener` does not preserve members by itself: it asks each
`ReflectionSupplier` which members of a reflected class are accessible, then links exactly those. The
fork's supplier answered "all fields" for application classes but, for methods, only a default
constructor on three compiler-internal classes (Rhino/RegExp) — so no method metadata was ever
generated.

**The fix.** Mirror the field rule for methods: an application class keeps all of its methods. The
`isApplicationClass` filter already excludes `java.*`, `org.teavm.*`, `org.threeten.*` and friends, so
classlib internals stay out, and the cost stays bounded because the listener only asks about classes
whose `Class` object actually reaches a reflection API.

**Effect, measured.** `reflection-members` now matches JDK 25 byte for byte, including a `private`
method invoked through `setAccessible(true)`.

This changes the **compiler**, so it needs `:compiler:optimizeWasmGC` (the Docker recipe above), not
just the class-library archives. The rebuilt `compiler.wasm` is committed in `assets/` — see
`FINDINGS.md` §6.

## Core patch: `ClassMetadataRequirements` (class names, and `Class.forName`)

`ClassMetadataRequirements.java` here is a drop-in replacement for
`org.teavm.model.analysis.ClassMetadataRequirements` in TeaVM core. It is not part of the fork: it is
placed in `compiler/src/patches/java`, the source set whose classes shadow the core jar on the
compiler's classpath, and it is picked up by the compiler build because that directory is one of the
`compiler` module's source roots (`compiler/build.gradle`).

**The bug.** Whether a class carries its name in the generated `ClassInfo` is decided per class, from
the **statically known** `Class` values that the dependency analyzer can prove flow into
`Class.getName()`:

```java
addClassesRequiringName(requirements, getNameMethod.getVariable(0).getClassValueNode().getTypes());
```

A class the program obtains any other way — `Object.getClass()`, `Class.forName`, `getSuperclass`,
`Array.newInstance`, or a `Class` kept in a field or collection — is not in that set, so its `name`
field is never emitted and `getName()` returns **null** (`ClassInfo.name()` answers "absent"). The
same table is what `TClass.forName` builds its name→class map from, so `Class.forName` cannot resolve
a class whose name is absent either.

Measured on a three-line program:

```java
EnumMap<Level, Integer> m = new EnumMap<>(Level.class);   // Level is a nested enum
Object k = m.keySet().iterator().next();
System.out.println(((Level) k).getClass().getName());     // null   (JDK: Main$Level)
```

Adding a line that mentions `Level.class.getName()` makes the very next run print `Main$Level`, because
that call site *is* a statically known `Class` value. It is the same mechanism behind `reflection`'s
last line: `Class.forName("java.lang.String")` only resolved after something else in the program asked
`String.class.getName()` first.

**The fix.** If `Class.getName`, or either `Class.forName` overload, is reached, then every class gets
its name: `getInfo(...)` answers `name = true` for a type the requirements map does not mention, and
forces it for the ones it does. That is the conservative reading of what those methods mean — any
`Class` object can arrive at `getName`, and `forName` is a by-name lookup over the whole table.

**Effect, measured.** `reflection` now matches JDK 25 byte for byte — including its last line — and
`getClass().getName()` returns `Main$Level` in the probe above. The cost is a name string per class in
every module that uses these methods, which the corpus's binary sizes absorb.

**Not fixed by this:** a virtual call on an object of a class whose vtable was left unfilled still
traps. That is a separate generator fault — `FINDINGS.md` §4b has the disassembly, `poc/UPSTREAM.md`
§8 the report.

This changes the **compiler**, so it needs `:compiler:optimizeWasmGC` (the Docker recipe above).

## File I/O: an in-memory filesystem that actually works

TeaVM 0.14.1 already *has* a full `java.nio.file` implementation and an in-memory filesystem
(`org.teavm.runtime.fs.memory.*`), and the wasmGC backend uses it by default. It just could not be
used: the filesystem starts empty, so the very first thing that almost any file program does —
`Files.createTempFile`, or `Files.createDirectories` on a path like `/tmp` — failed. Three small
pieces fix that, and they are **class-library** changes, so they need only the two archives rebuilt
(~30 s), not a compiler rebuild.

1. **`InMemoryVirtualFileSystem.java`** — the class is TeaVM's, vendored to add one line in the
   constructor: `root.createDirectory("tmp")`. `File.createTempFile` and `Files.createTempFile` start
   from `System.getProperty("java.io.tmpdir")`, which is `/tmp` (`TSystem.getTempDir()`), and without
   it they fail with `Directory does not exist` before the program does anything.
2. **`TReader.java`** — vendored to add `transferTo(Writer)`, the **Java 10** method. TeaVM's class
   library predates it, but its own `TFiles.readString`, `writeString` and `copy` call it, so those
   three failed to *compile* against the generated SDK with
   `Method java.io.BufferedReader.transferTo(Ljava/io/Writer;)J was not found`.
3. **`TFiles.java`** — vendored to make `createDirectories` idempotent. For a path with one component
   (`/tmp`, a relative `"data"`) TeaVM delegates straight to `createDirectory` without swallowing
   `FileAlreadyExistsException`, so `Files.createDirectories(existingDir)` — the usual `mkdir -p`
   idiom — threw where the JDK is a no-op. The multi-component branch already tolerated it.

**Effect, measured.** `file-io` matches, and the corpus is **145/145**. A probe exercising the whole
surface matches the JDK line for line: `createDirectories` (twice, the second time a no-op), `write`,
`writeString`, append, `readString`, `size`, `move` (rename), `copy`, `list`, `delete` +
`DirectoryNotEmptyException`, `FileWriter`/`FileReader`, `File.length`/`getName`/`getParent`,
`FileNotFoundException`. The only differences are platform ones — `/` vs `\` in a printed parent path,
and `new File("/tmp").isAbsolute()` — which is expected: the browser is POSIX and the comparison JDK
used here is Windows.

**What it means in a browser.** The filesystem lives *inside the wasm module*, so it is **per run**:
create, write, rename and read all work, and nothing survives to the next run. That is the honest
answer for a playground. Persisting across runs would mean mirroring it out through the `teavmFile`
host bridge (which the worker already implements an in-memory version of, and which the fork's
`TFileSystemBridge` can drive — it is currently not wired into `TFile`, so the virtual filesystem is
the only one in play).

## Core patch: the vtable builder (a dropped implementation has no slot to point at)

Two pieces: `WasmGCVirtualTableBuilder.java` here, a replacement for TeaVM core's (shadowed through
`compiler/src/patches/java`, and with its one `com.carrotsearch.hppc` map swapped for a `HashMap`
because the compiler module has no hppc on its classpath), and a few lines in the fork's own
`Compiler.java`.

**The bug.** A virtual call to a method whose implementation nothing calls out of line traps with
`RuntimeError: dereferencing a null pointer` — `enum-map-set` did it inside
`AbstractStringBuilder.insert(int, Object)`, which calls `obj.toString()` on an `EnumMap` key:

```wat
(call_ref $14 (local.get $obj)
  (struct.get $VT<java.lang.Object> $toString
    (ref.cast (ref $VT<java.lang.Object>) (struct.get $java.lang.Object $vt (local.get $obj)))))
```

The slot comes out of the object's vt global, and that slot is **null**: the global is created as a
`struct.new_default` and `WasmGCClassGenerator.fillVirtualTableMethods` writes a field only when the
table has an *implementor* for it, which `WasmGCVirtualTableBuilder` records only for a method that is
*reachable*. `java.lang.Object.toString` and `java.lang.Enum.toString` both exist in the class library
with real bodies — `javap` on the SDK archive shows them — but nothing calls either **out of line**:
call sites are devirtualised or replaced by `ObjectIntrinsic`, so the dependency analysis drops them,
no `struct.set` is emitted, and the call site reads a slot that was never written. Worse, the builder
marks a table "used" only when a call site's **declaring** class matches
(`groupMethodsFromCallSites` groups by `methodRef.getClassName()`), while
`WasmGCVirtualCallGenerator` reads the slot from the receiver's **static** type — different classes for
an inherited method.

**The fix, as implemented here.** Every method used at a *virtual* call site has to exist out of line,
because the call may be compiled as a read of a vtable slot. So `Compiler.java` reaches the target of
every virtual call in every reached method — reaching one can reach more, so the set settles — and the
builder records implementors without asking `isVirtual` first:

```java
// compiler/src/main/java/org/teavm/javac/Compiler.java, in createTeaVM's WasmGC branch
teavm.add(new AbstractDependencyListener() {
    @Override
    public void methodReached(DependencyAgent agent, MethodDependency method) {
        var source = agent.getClassSource();
        var ref = method.getReference();
        var owner = source.get(ref.getClassName());
        var reader = owner != null ? owner.getMethod(ref.getDescriptor()) : null;
        var program = reader != null ? reader.getProgram() : null;
        if (program == null) {
            return;
        }
        for (var blockReader : program.getBasicBlocks()) {
            if (!(blockReader instanceof BasicBlock block)) {
                continue;
            }
            for (var instruction : block) {
                if (!(instruction instanceof InvokeInstruction invoke)
                        || invoke.getType() != InvocationType.VIRTUAL) {
                    continue;
                }
                var target = invoke.getMethod();
                var targetOwner = source.get(target.getClassName());
                if (targetOwner != null && targetOwner.getMethod(target.getDescriptor()) != null) {
                    agent.linkMethod(target).use();
                }
            }
        }
    }
});
```

```java
// WasmGCVirtualTableBuilder.fillTable — remove this filter when recording class implementors
if (!isVirtual.test(method.getReference()) && !method.getReference().equals(CLONE_METHOD)) {
    continue;
}
```

because `virtualMethods` is keyed by the method reference *as written at the call site* — which for an
inherited method names the receiver's static type (`Main$Level.toString`), never the class that
declares the implementation. (The same predicate still guards the *interface* path, where the reference
does name the interface being implemented.)

The listener covers call sites, and call sites do not cover everything: `((Level) k).toString()` names
`Main$Level.toString`, a method that does not exist, so the *implementation* (`Enum.toString`) still
needs reaching by hand, which is why `started()` also does

```java
// compiler/src/main/java/org/teavm/javac/Compiler.java, in linkWasmExceptionDecoration's started()
agent.linkMethod(OBJECT_TO_STRING_METHOD).use();
agent.linkMethod(ENUM_TO_STRING_METHOD).use();
```

**Effect, measured.** Three programs were failing on this: `enum-map-set` (the `toString` slot),
`exceptions-stacktrace` and `exception-propagation` (the `String.equals` slot inside a stream lambda).
All three now match JDK 25 byte for byte, and the corpus goes 140/145 → **143/145** with nothing newly
broken. Modules grow — the three are 10–20 KB larger than before, which is the code that *should* have
been linked — since reaching a call site's target also pulls in the body it needs.

**Detail worth keeping.** The builder's `getFirstUsed()` gate and the generator's choice of structure
also disagree for an inherited method (the builder keys on the call site's *declaring* class, the
generator on the receiver's *static* type), which is why this failure is shape-dependent and moves with
unrelated edits.

This changes the **compiler**, so it needs `:compiler:optimizeWasmGC` (the Docker recipe above).

## File I/O, continued: persistence and the platform switch

Two more pieces on top of the in-memory filesystem above. Both are class-library changes plus a little
host code, so they need only the two archives rebuilt (~30 s).

### Persistence across runs

The filesystem lives inside the wasm instance, so a run starts empty. Now the module hands a snapshot to
the host at the end of a run and asks for it back on first use:

* `InMemoryVirtualFileSystem` serialises its tree when the host calls the exported
  `teavm_fs_snapshot()`: a small length-prefixed format, `D`/`F` records, one byte per character.
  It restores from `teavmFile.loadFileSystem()` **lazily, on the first `getFile`**, not in the
  constructor — the filesystem is created from `DefaultFileSystem`'s static initializer, which runs
  before charsets exist, and encoding there traps.
* The bytes are mapped to characters by hand rather than through `StandardCharsets.ISO_8859_1` for the
  same reason: `Charset.encode` is not usable that early (`getBytes` dereferenced null).
* Hosts expose `loadFileSystem`/`saveFileSystem` on `teavmFile`, and must also assign
  `globalThis.teavmFile`: the module imports the object, but the class library's `@JSBody` helpers
  read the global, so without it saving silently did nothing.
* The browser worker keeps it in IndexedDB (`livecodes-java`), not localStorage — this code runs in a Web Worker, where
  localStorage does not exist; persistence is off unless the host asks for it
  (`createRuntime({ persistFiles: true })`), so programs cannot see each other's files by default. The
  node runner uses `TEAVM_FS_FILE=<path>` for the same purpose.
* `VirtualFileImpl` is vendored so its path walk accepts `\` as a separator as well as `/`.

Verified by running the same program three times with `TEAVM_FS_FILE`: the first prints `written`, the
next two print `found: survives`.

### The platform switch — and its limit

`InMemoryVirtualFileSystem.isWindows()` now reads `globalThis.__teavmWindowsPaths`, which the hosts set
before the module starts. **The default is POSIX**, which is what the browser is and what Doppio was; the
corpus depends on it. `createRuntime({ platform: 'windows' })` or `TEAVM_PLATFORM=windows` switches
`java.io.File` to Windows semantics — separators, `getParent()`, and `isAbsolute()` (so `/tmp` is
*not* absolute, as the JDK on Windows says).

It is **partial**: the `java.nio.file` layer builds its own paths and does not go through
`File.fixSlashes`, so directory creation through `Files` still resolves POSIX paths. Use the switch
only when a program depends on `File`'s Windows behaviour, and prefer fixing the program otherwise.

The comparison side is fixed properly: `run-program.mjs --jdk` normalises `\` to `/` on both
outputs, so the separator difference no longer shows up as a difference — only a genuine semantic one
would.

## Core patch: `BaseWasmGenerationVisitor` (a dead sibling return)

`BaseWasmGenerationVisitor.java` here is a replacement for
`org.teavm.backend.wasm.generate.methods.BaseWasmGenerationVisitor` in TeaVM core, shadowed through
`compiler/src/patches/java` like the two above.

**The bug.** `try { return 1; } finally { return 2; }` produced a module V8 rejects:
`expected 1 elements on the stack for fallthru, found 2`. The generated function was

```wat
(func $Main::overrideReturn (result i32)
  (call_ref $16 (global $Main@initializer))
  (i32.const 2)
  (i32.const 2))
```

— the try/finally folded away, correctly (a `return` in a `finally` always wins), but **two returns**
left in the AST. The JS backend, which renders the same tree, makes it obvious:

```js
Main_overrideReturn = () => { Main_$callClinit(); return 2; return 2; }
```

The statement emitters walk a list verbatim, so the second return's value lands on the wasm stack.

**The fix.** Stop at a return or a throw when emitting a statement sequence — in `visitMany` and in
`visit(SequentialStatement)`, which is what a method body actually is:

```java
for (var part : statements) {
    accept(part);
    if (part instanceof ReturnStatement || part instanceof ThrowStatement) {
        break;
    }
}
```

**Deliberately not recursive**, and that is the interesting part. The obvious version — "does this
statement always exit?" through nested blocks and if/else — fixed `exceptions-finally` but immediately
broke `java.nio.charset.CharsetEncoder::encode` (`expected 1 elements on the stack for fallthru, found
0`): the generator still expects to *see* the statements after a block that contains a return, because
its block typing assumes the walk reaches the end of every list. Only a *direct sibling* return can be
dropped safely, and for this shape that is enough.

**Effect, measured.** `exceptions-finally` matches JDK 25 byte for byte and the corpus goes 143/145 →
**144/145** — every program in it now matches the JDK except the deliberately dropped `file-io`.

This changes the **compiler**, so it needs `:compiler:optimizeWasmGC` (the Docker recipe above).

