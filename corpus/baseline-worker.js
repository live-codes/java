// Faithful port of LiveCodes' current Java worker (src/livecodes/languages/java/lang-java-script.ts):
// Doppio + BrowserFS, JDK 8 jars fetched from the same unpkg URLs LiveCodes uses.
// Used here only as the comparison baseline for the corpus test.

var window = self;

const BROWSERFS_URL = 'https://unpkg.com/browserfs@1.4.3/dist/browserfs.min.js';
const DOPPIO_BASE_URL = 'https://unpkg.com/@seth0x41/doppio@1.0.0/';
const doppioJvmUrl = DOPPIO_BASE_URL + 'doppio.js';
const doppioJvmJarsUrl = DOPPIO_BASE_URL + 'java_home/';

// overriding annoying ZipFS warnings
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

importScripts(BROWSERFS_URL);
importScripts(doppioJvmUrl);

function createDir(fs, path) {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += `/${part}`;
    if (!fs.existsSync(current)) fs.mkdirSync(current);
  }
}

async function initFS() {
  BrowserFS.install(self);
  const mfs = new BrowserFS.FileSystem.MountableFileSystem();
  BrowserFS.initialize(mfs);
  mfs.mount('/tmp', new BrowserFS.FileSystem.InMemory());
  mfs.mount('/release', new BrowserFS.FileSystem.InMemory());

  const fs = BrowserFS.BFSRequire('fs');
  self.javaFS = { fs };

  createDir(fs, '/release/vendor/java_home/lib');
  createDir(fs, '/release/vendor/natives');

  const jarBaseUrl = doppioJvmJarsUrl;
  const jars = ['doppio.jar', 'rt.jar', 'tools.jar', 'jce.jar', 'charsets.jar', 'currency.data'];
  await Promise.all(
    jars.map(async (jar) => {
      try {
        const response = await fetch(`${jarBaseUrl}${jar}`);
        if (!response.ok) throw new Error(`Failed to fetch ${jar}: ${response.status}`);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(`/release/vendor/java_home/lib/${jar}`, Buffer.from(buffer));
      } catch (e) {
        console.error(`error loading ${jar}: ${e.message}`);
      }
    })
  );
}

const initialize = initFS();
initialize.then(() => {
  postMessage({ initialized: true });
});

// Run Java code
let lastCode = null;
let lastClassName = null;

const runCode = async (code, input) => {
  let output = null;
  let error = null;
  let exitCode = 0;
  const timings = {};

  try {
    await initialize;

    const fs = self.javaFS.fs;
    const process = BrowserFS.BFSRequire('process');

    const className = code.match(/public\s+class\s+(\w+)/)?.[1] || 'Main';
    const filePath = `/tmp/${className}.java`;
    const classFilePath = `/tmp/${className}.class`;

    const shouldCompile = lastCode !== code || lastClassName !== className || !fs.existsSync(classFilePath);

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

      const tCompile = performance.now();
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
      timings.compileMs = performance.now() - tCompile;

      if (compileExitCode !== 0) {
        throw new Error(`Compilation failed with exit code ${compileExitCode}. Output: ${compileOutput}`);
      }
      if (!fs.existsSync(classFilePath)) {
        throw new Error(`class file ${classFilePath} not found after compilation`);
      }

      lastCode = code;
      lastClassName = className;
    } else {
      timings.compileMs = 0;
    }

    output = '';
    process.stdout.removeAllListeners('data');
    process.stderr.removeAllListeners('data');
    process.stdout.on('data', (data) => (output += data.toString()));
    process.stderr.on('data', (data) => (output += data.toString()));
    if (input) process.stdin.write(input);

    const tRun = performance.now();
    const runExitCode = await new Promise((resolve) => {
      self.Doppio.VM.CLI(['-classpath', '/tmp', className], {
        doppioHomePath: '/release',
        javaHomePath: '/release/vendor/java_home',
        nativeClasspath: ['/release/vendor/natives'],
      }, resolve);
    });
    timings.runMs = performance.now() - tRun;

    return { input, output, error, exitCode: runExitCode, timings };
  } catch (err) {
    error = err.message ?? err;
    exitCode = err.code ?? 1;
    return { input, output, error, exitCode, timings };
  }
};

addEventListener('message', async (e) => {
  const { id, code, input } = e.data;
  const result = code.trim() ? await runCode(code, input) : {};
  postMessage({ id, ...result });
});

postMessage({ loaded: true });
