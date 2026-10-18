# Reproducible build environment for the teavm-javac fork.
#
# Why a container: the artifacts must be built on Linux with JDK 25 and a pinned Binaryen.
#   * `ArchiveBuilder` used to emit `\` entry separators on Windows (fixed in
#     patches/ArchiveBuilder.java); a Linux build sidesteps the whole class of problem.
#   * `:compiler:createDist` needs `wasm-opt` (`--enable-gc`), which is not on this machine.
#   * `StdlibConverter` reads the *running* JDK's own class files to fill in annotation elements and
#     relaxed `default` methods, so the JDK version is part of the build's identity -- JDK 25 here.
#
# Usage (from the fork clone):
#   docker build -f patches/Dockerfile -t teavm-javac-build .
#   docker run --rm -v "$PWD":/work -v teavm-gradle:/root/.gradle teavm-javac-build \
#       bash ./gradlew :compiler:optimizeWasmGC --console=plain --no-daemon
#
# Measured: 8m53s on a cold Gradle cache. The three artifacts this package vendors are
# compiler/build/generated/teavm/wasm-gc-optimized/{compiler.wasm,compiler.wasm-deobfuscator.wasm}
# and compiler/build/generated/teavm/wasm-gc/compiler.wasm-runtime.js (see FINDINGS.md §6).
#
# Build *inside* the container, not on a Windows bind mount: Docker Desktop's 9p/virtiofs mount makes
# Gradle's input hashing crawl (a `du` over the clone takes minutes), so copy the ~38 MB source in.
#
# No Node in the image on purpose: `:compiler:optimizeWasmGC` does not need it. `:compiler:createDist`
# additionally builds the npm wrapper (`src/main/js`), so that task would need `nodejs npm` installed.
#
# The Gradle cache volume is what makes repeat builds fast; without it every run re-downloads.
FROM eclipse-temurin:25-jdk

ARG BINARYEN_VERSION=133

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates tar \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL -o /tmp/binaryen.tar.gz \
      "https://github.com/WebAssembly/binaryen/releases/download/version_${BINARYEN_VERSION}/binaryen-version_${BINARYEN_VERSION}-x86_64-linux.tar.gz" \
 && tar -xzf /tmp/binaryen.tar.gz -C /opt \
 && rm /tmp/binaryen.tar.gz \
 && /opt/binaryen-version_${BINARYEN_VERSION}/bin/wasm-opt --version

ENV WASM_OPT=/opt/binaryen-version_133/bin/wasm-opt
ENV JAVA_HOME=/opt/java/openjdk
ENV GRADLE_OPTS=-Dorg.gradle.daemon=false

WORKDIR /work
