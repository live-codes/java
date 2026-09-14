/* Baseline engine — mirrors livecodes src/livecodes/languages/java/lang-java-script.ts */
const browserfsUrl = 'https://cdn.jsdelivr.net/npm/browserfs@1.4.3/dist/browserfs.min.js';
const doppioBaseUrl = 'https://unpkg.com/@seth0x41/doppio@1.0.0/';
const jars = ['doppio.jar', 'rt.jar', 'tools.jar', 'jce.jar', 'charsets.jar', 'currency.data'];

let downloadedBytes = 0;
let initResolve;
const initPromise = new Promise((resolve) => (initResolve = resolve));

const originalWarn = console.warn;
console.warn = function (message) {
  if (message && message.includes('ZipFS')) return;
  originalWarn.apply(console, arguments);
};
const originalLog = console.log;
console.log = function (message) {
  if (message && message.includes('@stu')) return;
  originalLog.apply(console, arguments);
};

importScripts(browserfsUrl);
importScripts(doppioBaseUrl + 'doppio.js');

function createDir(fs, path) {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    if (!fs.existsSync(current)) fs.mkdirSync(current);
  }
}

async function initFS() {
  const t0 = performance.now();
  BrowserFS.install(self);
  const mfs = new BrowserFS.FileSystem.MountableFileSystem();
  BrowserFS.initialize(mfs);
  mfs.mount('/tmp', new BrowserFS.FileSystem.InMemory());
  mfs.mount('/release', new BrowserFS.FileSystem.InMemory());

  const fs = BrowserFS.BFSRequire('fs');
  self.javaFS = { fs };

  createDir(fs, '/release/vendor/java_home/lib');
  createDir(fs, '/release/vendor/natives');

  await Promise.all(
    jars.map(async (jar) => {
      const response = await fetch(`${doppioBaseUrl}java_home/${jar}`);
      if (!response.ok) throw new Error(`Failed to fetch ${jar}: ${response.status}`);
      const buffer = await response.arrayBuffer();
      downloadedBytes += buffer.byteLength;
      fs.writeFileSync(`/release/vendor/java_home/lib/${jar}`, Buffer.from(buffer));
    })
  );
  return performance.now() - t0;
}

const initStart = performance.now();
initFS().then(() => initResolve({ initMs: performance.now() - initStart, downloadedBytes }));

let lastCode = null;
let lastClassName = null;

async function runCode(code, input) {
  let error = null;
  await initPromise;
  const fs = self.javaFS.fs;
  const process = BrowserFS.BFSRequire('process');

  const className = code.match(/public\s+class\s+(\w+)/)?.[1] || 'Main';
  const filePath = `/tmp/${className}.java`;
  const classFilePath = `/tmp/${className}.class`;

  const shouldCompile = lastCode !== code || lastClassName !== className || !fs.existsSync(classFilePath);
  let compileMs = null;
  if (shouldCompile) {
    if (fs.existsSync('/tmp')) fs.readdirSync('/tmp').forEach((f) => fs.unlinkSync(`/tmp/${f}`));
    fs.writeFileSync(filePath, code);

    const classpath =
      '/release/vendor/java_home/lib/doppio.jar:/release/vendor/java_home/lib/rt.jar:/release/vendor/java_home/lib/tools.jar:/release/vendor/java_home/lib/jce.jar:/release/vendor/java_home/lib/charsets.jar';
    let compileOutput = '';
    process.stdout.removeAllListeners('data');
    process.stderr.removeAllListeners('data');
    process.stdout.on('data', (data) => (compileOutput += data.toString()));
    process.stderr.on('data', (data) => (compileOutput += data.toString()));

    const t0 = performance.now();
    const compileExitCode = await new Promise((resolve) => {
      self.Doppio.VM.CLI(
        ['-classpath', classpath, 'com.sun.tools.javac.Main', filePath],
        {
          doppioHomePath: '/release',
          javaHomePath: '/release/vendor/java_home',
          nativeClasspath: ['/release/vendor/natives'],
        },
        resolve
      );
    });
    compileMs = performance.now() - t0;

    if (compileExitCode !== 0) {
      return {
        compileMs,
        exitCode: compileExitCode,
        stdout: '',
        stderr: compileOutput,
        bytes: 0,
        ok: false,
        error: `compilation failed (${compileExitCode}): ${compileOutput.slice(0, 2000)}`,
      };
    }
    lastCode = code;
    lastClassName = className;
  }

  let output = '';
  let stderr = '';
  process.stdout.removeAllListeners('data');
  process.stderr.removeAllListeners('data');
  process.stdout.on('data', (data) => (output += data.toString()));
  process.stderr.on('data', (data) => (stderr += data.toString()));
  if (input) process.stdin.write(input);

  const t1 = performance.now();
  const runExitCode = await new Promise((resolve) => {
    self.Doppio.VM.CLI(
      ['-classpath', '/tmp', className],
      {
        doppioHomePath: '/release',
        javaHomePath: '/release/vendor/java_home',
        nativeClasspath: ['/release/vendor/natives'],
      },
      resolve
    );
  });
  const runMs = performance.now() - t1;

  return { compileMs, runMs, exitCode: runExitCode, stdout: output, stderr, bytes: 0 };
}

self.onmessage = async (e) => {
  const { cmd } = e.data || {};
  if (cmd === 'init') {
    const { initMs, downloadedBytes: bytes } = await initPromise;
    self.postMessage({ type: 'initialized', initMs, bytes });
    return;
  }
  if (cmd === 'run') {
    try {
      const result = await runCode(e.data.source, e.data.input);
      self.postMessage({ type: 'result', ...result });
    } catch (err) {
      self.postMessage({ type: 'result', ok: false, error: String((err && err.message) || err), exitCode: 1 });
    }
  }
};
