# Upgrading the toolchain

Everything this package pins is in [`patches/manifest.json`](patches/manifest.json) — one file, so the
inventory and the build script cannot drift apart. Check it any time with:

```bash
node scripts/upgrade.mjs            # pins, artifact checksums, every patch and whether it is applied
node scripts/upgrade.mjs --diff     # regenerate patches/diffs/*.patch and prove each one applies
```

`--diff` fetches each patch's upstream source (or reads `patches/upstream/` for core classes, which have
no fetchable source), writes a unified diff into `patches/diffs/`, and then **applies that diff to the
upstream and checks the result equals our file**. A diff that cannot be proven that way is reported as a
failure rather than written.

## What is pinned

| Thing | Value | Where |
|---|---|---|
| Fork | `Vsprocessing/teavm-javac@d1514ab…` (TeaVM 0.14.1) | `patches/manifest.json` |
| Build JDK | 25 (`StdlibConverter` reads the *running* JDK's class files, so the version is part of the build's identity) | `patches/Dockerfile` |
| Binaryen | 133 (`wasm-opt --enable-gc`) | `patches/Dockerfile` |
| Artifacts | 5 files, SHA-256 each | `patches/manifest.json` → verified by `scripts/fetch-teavm.mjs` on every build |

There are three kinds of change on top of upstream, and they upgrade differently:

| Kind | Count | How it is carried |
|---|---|---|
| `fork-file` — the fork's own sources, patched | 3 | whole file in `patches/`, plus a diff against the fork commit |
| `core-shadow` — a TeaVM core class the fork does not own | 5 | whole file in `patches/`, plus a diff against `patches/upstream/` |
| `classlib-vendor` — a TeaVM class-library class with our additions | 8 | whole file in `patches/`, plus a diff against TeaVM 0.14.1 |
| `new-source` / `new-classlib` — classes that do not exist upstream | 2 | whole file only |
| `third-party` — the bundled ThreeTen `Duration` | 1 | whole file only |

`patches/manifest.json` also lists **`forkEdits`** — changes inside a file the fork owns that we do not
replace (`Compiler.java`: registering the transformer and the two dependency listeners). Those are
applied by hand and quoted in `patches/README.md`.

## The actual workflow

### A. Artifacts only — no source change

Rare, but this is the "we found a new upstream build of the same commit" case:

```bash
# replace the file(s) in assets/
node scripts/upgrade.mjs            # checksums will fail until you update the manifest
# update the checksum(s) in patches/manifest.json
npm run build && npm test
```

### B. JDK or Binaryen bump

These are build inputs, not sources:

1. Change the version in `patches/Dockerfile`.
2. Rebuild the compiler archive (see §C below). **Expect the artifacts to change** — `StdlibConverter`
   reads the running JDK, so a JDK bump changes the SDK archive's bytes even if nothing else moved.
3. Re-vendor and re-run the acceptance gate.

### C. TeaVM / fork version bump — the real one

```bash
# 0. pick the new commit and record it
#    (patches/manifest.json → teavm.commit, and .teaVMVersion if the fork moved TeaVM)

# 1. the fork clone: fetch and check out the new commit
cd <fork clone>            # e.g. D:\DevWork\teavm-javac-build
git fetch && git checkout <new-commit>

# 2. re-apply the patches, in this order:
#    a. fork files: replace them with patches/*.java, then reconcile against what the new commit changed
#       (patches/diffs/<File>.java.patch is exactly what we changed, so `git apply -3` in the clone is
#        the starting point, not a blind copy)
#    b. core shadows: `compiler/src/patches/java/...` — same idea, diff against patches/upstream/
#    c. classlib vendors: `compiler/src/sharedClasslibEmu/...` + the include list in
#       `compiler/build.gradle`; each one is optional (see "dropping a patch" below)
#    d. fork-owned edits: Compiler.java (patches/README.md quotes both hunks)
#    e. include list: any new file must be added to prepareTeaVMClassLib

# 3. rebuild everything, inside the container
docker build -f patches/Dockerfile -t teavm-javac-build .
docker run -d --name teavm-build -v teavm-gradle:/root/.gradle teavm-javac-build tail -f /dev/null
tar -czf ../src.tgz --exclude=./compiler/build --exclude=./javac/build \
    --exclude=./protocol/build --exclude=./.gradle --exclude=./dist .
docker cp ../src.tgz teavm-build:/tmp/src.tgz
docker exec -d teavm-build bash -c "tar -xzf /tmp/src.tgz -C /work && cd /work && bash ./gradlew \
    :compiler:generateClassLib :compiler:buildTeaVMClassLib :compiler:optimizeWasmGC \
    --console=plain --no-daemon > /tmp/build.log 2>&1; echo done > /tmp/done"

# 4. vendor the five artifacts (see "Vendoring" below)
# 5. run the acceptance gate
```

### Vendoring

```bash
docker cp teavm-build:/work/compiler/build/generated/teavm/wasm-gc-optimized/compiler.wasm assets/
docker cp teavm-build:/work/compiler/build/generated/teavm/wasm-gc-optimized/compiler.wasm-deobfuscator.wasm assets/
docker cp teavm-build:/work/compiler/build/generated/teavm/wasm-gc/compiler.wasm-runtime.js assets/
docker cp teavm-build:/work/compiler/build/classlib/compile-classlib-teavm.bin assets/
docker cp teavm-build:/work/compiler/build/classlib/runtime-classlib-teavm.bin assets/
# put the new sha256 values in patches/manifest.json, then:
npm run build && npm test
```

**Copy to `assets/` before running `npm run build`.** The build copies `assets/` over `dist/`; a stale
`assets/` silently replaces good binaries with old ones — that happened once (commit `d871a87`) and the
symptom was a freshly built feature that "did nothing".

### The acceptance gate

A version bump is **not** done until all four pass:

```bash
node scripts/upgrade.mjs                      # inventory consistent (checksums + markers)
set TEAVM_JAVAC_DIST=<fork>/dist/teavm-javac
set JAVA_HOME=<JDK 25>
node scripts/sdk-check.mjs                    # 7/7
node scripts/compile-program.mjs --all        # 145/145 compiled
node scripts/run-program.mjs stringformat --jdk   # MATCH (engine sanity)
node scripts/run-program.mjs exceptions --jdk     # MATCH
node scripts/run-program.mjs enum-map-set --jdk   # MATCH
node scripts/run-program.mjs exceptions-finally --jdk  # MATCH
node scripts/run-program.mjs file-io --jdk        # MATCH except the Windows path separator
node corpus/run.mjs teavm                     # 145/145, and diff the output against the committed baseline
```

The corpus is the real oracle: `corpus/results.json` is tracked, so `git diff corpus/results.json`
after a run shows exactly which programs changed behaviour. A version bump that keeps 145/145 and a
clean `results.json` diff is a safe upgrade; anything else needs triage before it ships.

## Dropping a patch

Most of what we vendored is a gap that a newer TeaVM may close. `--diff` prints `DROP?` when the
upstream source already contains the marker we look for, and every classlib entry has a `dropWhen`
field saying what would make it unnecessary. To drop one:

1. Delete the file from `compiler/src/sharedClasslibEmu/...` and from the `prepareTeaVMClassLib` include
   list in the fork, and from `patches/` + the manifest here.
2. Rebuild. If the program that motivated it still passes, the gap really is closed.

Never drop a **core shadow** without checking that the upstream fixed it: those are fixes to TeaVM
itself (vtable implementors, class-name metadata, the statement emitter, the virtual filesystem), and
upstream 0.14.1 does not have them. The two `new-*` entries have no upstream counterpart at all.

## What usually breaks

- **Core internals move between versions.** `BaseWasmGenerationVisitor` does *not* exist in TeaVM
  0.14.1's Git tag — the fork's core has it, upstream calls it `WasmGCInstructionGenerationVisitor` — so
  a "just fetch the upstream source" diff is impossible for core classes. That is why the pristine
  bases live in `patches/upstream/`, taken from the core jar the fork actually builds against. On an
  upgrade, replace those from the new core jar (`javap`/extract) before trusting the diff.
- **A patch's assumption can rot.** The concrete checks live in `patches/README.md` under each patch;
  the ones with a `dropWhen` are the first to look at.
- **The classlib diffs are against the 0.14.1 Git tag, not the jar.** The exact base the class
  library jar was built from is `teavm-classlib-0.14.1-sources.jar`; the tag differs in at least
  `TString` (it imports `org.teavm.interop.Intrinsified`, which exists in no 0.14.1 jar). The tag is close
  enough to see *your* changes in a diff — which is what `--diff` is for — but never copy a file from the
  tag into the build.
- **Artifacts must be rebuilt, not carried over.** The compiler *embeds* `DivisionCheckTransformer`,
  `CompilerResourceSupplier` and the two dependency listeners, so a class-library-only rebuild leaves
  them out. `patches/README.md` says for each patch whether it needs `:compiler:optimizeWasmGC` or only
  the two archives (which is ~30 s instead of ~5 min).
- **`compiler.wasm` is never byte-identical after a rebuild** (`wasm-opt` differs); the runtime glue is.
  Always run the corpus before committing a rebuilt compiler.

## Tools that make this cheaper

| Tool | What it is for |
|---|---|
| `node scripts/upgrade.mjs` | inventory + checksum + marker check; `--diff` regenerates and proves the diffs |
| `scripts/run-program.mjs` | run one program against the JDK, with `--trace` (named Java frames) and `--emit` (the module) |
| `scripts/generate-check.mjs` | generate + validate a program's module without running it |
| `wasm-dis` from Binaryen 133 | disassemble a generated module with Java names — the npm `binaryen` binding rejects TeaVM's output |
| `corpus/run.mjs` | the oracle: 145 programs, both engines, `results.json` diffable |
| `TEAVM_OPT_LEVEL` | compare Simple vs Advanced codegen when a failure looks like an optimizer bug |
