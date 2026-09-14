/**
 * Doppio-modern worker — seo-rii/doppio `modern` branch (MIT): Java (JDK 8 javac),
 * Kotlin 2.4 (K2JVMCompiler) and Scala 2.13.18 (scalac) compiled and run on a
 * JVM interpreted in TypeScript.
 *
 * Protocol:
 *   { cmd: 'init', baseUrl? }  → { type: 'initialized', initMs } | { type: 'init-error', error }
 *   { cmd: 'run', language: 'java'|'kotlin'|'scala', source, input?, mainClass? }
 *                              → { type: 'result', ok, compileMs, runMs, stdout, stderr, exitCode }
 *   { cmd: 'stop' }            → halts the active JVM (exit code 130)
 *
 * baseUrl points at the doppio-modern runtime directory holding
 * browserfs.min.js, doppio.js and listings.json (default: seorii.page deployment).
 */

declare const BrowserFS: any;
declare const Doppio: any;

const DEFAULT_BASE_URL = 'https://seorii.page/doppio/playground/runtime/';
const SCALA_VERSION = '2.13.18';

interface DoppioWorkerInit {
  baseUrl?: string;
}

let baseUrl = DEFAULT_BASE_URL;
let fs: any = null;
let processModule: any = null;
let activeJvm: any = null;

let readyPromise: Promise<void>;

function startEnv(): Promise<void> {
  return new Promise((resolve, reject) => {
    importScripts(baseUrl + 'browserfs.min.js');
    importScripts(baseUrl + 'doppio.js');
    BrowserFS.FileSystem.XmlHttpRequest.FromURL(
      baseUrl + 'listings.json',
      (error: Error | null, runtime: unknown) => {
        if (error) return reject(error);
        try {
          const mountable = new BrowserFS.FileSystem.MountableFileSystem();
          BrowserFS.initialize(mountable);
          mountable.mount('/tmp', new BrowserFS.FileSystem.InMemory());
          mountable.mount('/work', new BrowserFS.FileSystem.InMemory());
          mountable.mount('/sys', runtime);
          fs = BrowserFS.BFSRequire('fs');
          processModule = BrowserFS.BFSRequire('process');
          processModule.initializeTTYs();
          resolve();
        } catch (err) {
          reject(err as Error);
        }
      },
      baseUrl
    );
  });
}

function invokeJvm(args: string[]): Promise<number> {
  return new Promise((resolve) => {
    self['Doppio'].VM.CLI(
      args,
      { doppioHomePath: '/sys', tmpDir: '/tmp' },
      (exitCode: number) => {
        activeJvm = null;
        resolve(exitCode);
      },
      (jvm: unknown) => {
        activeJvm = jvm;
      }
    );
  });
}

function kotlinCompilerClasspath(): string {
  return fs
    .readdirSync('/sys/compilers/kotlin')
    .filter((name: string) => name.endsWith('.jar'))
    .sort()
    .map((name: string) => `/sys/compilers/kotlin/${name}`)
    .join(':');
}

interface LanguageRecipe {
  filename: string;
  mainClass: string;
  outputClass: string;
  compileArgs(outputDir: string): string[];
  runtimeClasspath(outputDir: string): string;
}

const RECIPES: Record<string, LanguageRecipe> = {
  java: {
    filename: 'Main.java',
    mainClass: 'Main',
    outputClass: 'Main.class',
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
  },
  kotlin: {
    filename: 'Main.kt',
    mainClass: 'MainKt',
    outputClass: 'MainKt.class',
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
  },
  scala: {
    filename: 'Main.scala',
    mainClass: 'Main',
    outputClass: 'Main.class',
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
        [
          `/sys/compilers/scala/scala-library-${SCALA_VERSION}.jar`,
          `/sys/compilers/scala/scala-reflect-${SCALA_VERSION}.jar`,
        ].join(':'),
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
  },
};

async function runProgram(language: string, source: string, input: string, mainClassOverride?: string) {
  await readyPromise;
  const recipe = RECIPES[language];
  if (!recipe) throw new Error(`unsupported language: ${language}`);

  const outputDir = `/work/out-${Date.now()}`;
  fs.mkdirSync(outputDir);
  fs.writeFileSync(`/work/${recipe.filename}`, source, 'utf8');

  let compileOutput = '';
  processModule.stdout.removeAllListeners('data');
  processModule.stderr.removeAllListeners('data');
  processModule.stdout.on('data', (data: unknown) => (compileOutput += String(data)));
  processModule.stderr.on('data', (data: unknown) => (compileOutput += String(data)));

  const t0 = performance.now();
  const compileExit = await invokeJvm(recipe.compileArgs(outputDir));
  const compileMs = performance.now() - t0;

  if (compileExit !== 0 || !fs.existsSync(`${outputDir}/${recipe.outputClass}`)) {
    return {
      ok: false,
      compileMs,
      exitCode: compileExit,
      stdout: '',
      stderr: compileOutput.slice(0, 4000),
      error: `compiler exited with status ${compileExit}`,
    };
  }

  let output = '';
  let stderr = '';
  processModule.stdout.removeAllListeners('data');
  processModule.stderr.removeAllListeners('data');
  processModule.stdout.on('data', (data: unknown) => (output += String(data)));
  processModule.stderr.on('data', (data: unknown) => (stderr += String(data)));
  if (input) processModule.stdin.write(input);

  const t1 = performance.now();
  const runExit = await invokeJvm([
    '-Xresponsiveness:10000',
    '-cp',
    recipe.runtimeClasspath(outputDir),
    mainClassOverride || recipe.mainClass,
  ]);
  const runMs = performance.now() - t1;

  return { ok: true, compileMs, runMs, exitCode: runExit, stdout: output, stderr };
}

self.onmessage = async (e: MessageEvent) => {
  const { cmd } = (e.data || {}) as { cmd?: string };
  if (cmd === 'init') {
    baseUrl = ((e.data as DoppioWorkerInit).baseUrl || DEFAULT_BASE_URL).replace(/\/?$/, '/');
    const t0 = performance.now();
    try {
      readyPromise = startEnv();
      await readyPromise;
      self.postMessage({ type: 'initialized', initMs: performance.now() - t0 });
    } catch (err) {
      self.postMessage({ type: 'init-error', error: String((err as Error)?.message || err) });
    }
    return;
  }
  if (cmd === 'stop') {
    if (activeJvm) activeJvm.halt(130);
    return;
  }
  if (cmd === 'run') {
    try {
      const result = await runProgram(e.data.language, e.data.source, e.data.input || '', e.data.mainClass);
      self.postMessage({ type: 'result', ...result });
    } catch (err) {
      self.postMessage({ type: 'result', ok: false, error: String((err as Error)?.message || err), exitCode: 1 });
    }
  }
};
