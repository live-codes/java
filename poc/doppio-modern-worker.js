/* Doppio-modern engine — mirrors website/src/playground.mjs of seo-rii/doppio (modern branch) */
var window = self;

const RUNTIME_BASE = 'https://seorii.page/doppio/playground/runtime/';
const SCALA_VERSION = '2.13.18';

let fs = null;
let processModule = null;

importScripts(RUNTIME_BASE + 'browserfs.min.js');
importScripts(RUNTIME_BASE + 'doppio.js');

const initPromise = new Promise((resolve, reject) => {
  BrowserFS.FileSystem.XmlHttpRequest.FromURL(
    RUNTIME_BASE + 'listings.json',
    (error, runtime) => {
      if (error) return reject(error);
      const mountable = new BrowserFS.FileSystem.MountableFileSystem();
      BrowserFS.initialize(mountable);
      mountable.mount('/tmp', new BrowserFS.FileSystem.InMemory());
      mountable.mount('/work', new BrowserFS.FileSystem.InMemory());
      mountable.mount('/sys', runtime);
      fs = BrowserFS.BFSRequire('fs');
      processModule = BrowserFS.BFSRequire('process');
      processModule.initializeTTYs();
      resolve();
    },
    RUNTIME_BASE
  );
});

let activeJvm = null;

const invokeJvm = (args) =>
  new Promise((resolve) => {
    window.Doppio.VM.CLI(
      args,
      { doppioHomePath: '/sys', tmpDir: '/tmp' },
      (exitCode) => {
        activeJvm = null;
        resolve(exitCode);
      },
      (jvm) => {
        activeJvm = jvm;
      }
    );
  });

function kotlinCompilerClasspath() {
  return fs
    .readdirSync('/sys/compilers/kotlin')
    .filter((name) => name.endsWith('.jar'))
    .sort()
    .map((name) => `/sys/compilers/kotlin/${name}`)
    .join(':');
}

const JAVA = {
  filename: 'Main.java',
  mainClass: 'Main',
  compileArgs(outputDir) {
    return [
      '-Xresponsiveness:100000',
      '-cp',
      '/sys/vendor/java_home/lib/tools.jar',
      'com.sun.tools.javac.Main',
      '-d',
      outputDir,
      '/work/Main.java',
    ];
  },
  runtimeClasspath(outputDir) {
    return outputDir;
  },
};

const KOTLIN = {
  filename: 'Main.kt',
  mainClass: 'MainKt',
  compileArgs(outputDir) {
    return [
      '-Xresponsiveness:100000',
      '-cp',
      kotlinCompilerClasspath(),
      'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
      '-no-reflect',
      '-no-stdlib',
      '-classpath',
      '/sys/compilers/kotlin/kotlin-stdlib.jar',
      '-d',
      outputDir,
      '/work/Main.kt',
    ];
  },
  runtimeClasspath(outputDir) {
    return `${outputDir}:/sys/compilers/kotlin/kotlin-stdlib.jar`;
  },
};

const SCALA = {
  filename: 'Main.scala',
  mainClass: 'Main',
  compileArgs(outputDir) {
    const compilerClasspath = [
      `/sys/compilers/scala/scala-compiler-${SCALA_VERSION}.jar`,
      `/sys/compilers/scala/scala-library-${SCALA_VERSION}.jar`,
      `/sys/compilers/scala/scala-reflect-${SCALA_VERSION}.jar`,
      '/sys/compilers/scala/java-diff-utils-4.16.jar',
      '/sys/compilers/scala/jline-3.29.0-jdk8.jar',
    ].join(':');
    return [
      '-Xresponsiveness:100000',
      '-cp',
      compilerClasspath,
      'scala.tools.nsc.Main',
      '-classpath',
      [`/sys/compilers/scala/scala-library-${SCALA_VERSION}.jar`, `/sys/compilers/scala/scala-reflect-${SCALA_VERSION}.jar`].join(':'),
      '-d',
      outputDir,
      '/work/Main.scala',
    ];
  },
  runtimeClasspath(outputDir) {
    return [
      outputDir,
      `/sys/compilers/scala/scala-library-${SCALA_VERSION}.jar`,
      `/sys/compilers/scala/scala-reflect-${SCALA_VERSION}.jar`,
    ].join(':');
  },
};

const ENGINES = { java: JAVA, kotlin: KOTLIN, scala: SCALA };
const OUTPUT_CLASSES = { java: 'Main.class', kotlin: 'MainKt.class', scala: 'Main.class' };

async function runProgram(language, source, input) {
  await initPromise;
  const config = ENGINES[language];
  const outputDir = `/work/out-${Date.now()}`;
  fs.mkdirSync(outputDir);
  fs.writeFileSync(`/work/${config.filename}`, source, 'utf8');

  let compileOutput = '';
  processModule.stdout.removeAllListeners('data');
  processModule.stderr.removeAllListeners('data');
  processModule.stdout.on('data', (data) => (compileOutput += data.toString()));
  processModule.stderr.on('data', (data) => (compileOutput += data.toString()));

  const t0 = performance.now();
  const compileExit = await invokeJvm(config.compileArgs(outputDir));
  const compileMs = performance.now() - t0;

  if (compileExit !== 0 || !fs.existsSync(`${outputDir}/${OUTPUT_CLASSES[language]}`)) {
    return {
      compileMs,
      exitCode: compileExit,
      stdout: '',
      stderr: compileOutput.slice(0, 4000),
      ok: false,
      error: `compiler exited with status ${compileExit}`,
    };
  }

  let output = '';
  let stderr = '';
  processModule.stdout.removeAllListeners('data');
  processModule.stderr.removeAllListeners('data');
  processModule.stdout.on('data', (data) => (output += data.toString()));
  processModule.stderr.on('data', (data) => (stderr += data.toString()));
  if (input) processModule.stdin.write(input);

  const t1 = performance.now();
  const runExit = await invokeJvm(['-Xresponsiveness:10000', '-cp', config.runtimeClasspath(outputDir), config.mainClass]);
  const runMs = performance.now() - t1;

  return { compileMs, runMs, exitCode: runExit, stdout: output, stderr };
}

self.onmessage = async (e) => {
  const { cmd } = e.data || {};
  if (cmd === 'init') {
    const t0 = performance.now();
    try {
      await initPromise;
      self.postMessage({ type: 'initialized', initMs: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err && err.message) || err) });
    }
    return;
  }
  if (cmd === 'run') {
    try {
      const result = await runProgram(e.data.language, e.data.source, e.data.input);
      self.postMessage({ type: 'result', ...result });
    } catch (err) {
      self.postMessage({ type: 'result', ok: false, error: String((err && err.message) || err), exitCode: 1 });
    }
  }
};
