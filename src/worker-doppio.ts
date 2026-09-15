/**
 * Doppio-modern worker — seo-rii/doppio `modern` branch (MIT): Java (JDK 8 javac),
 * Kotlin 2.4 (K2JVMCompiler) and Scala 2.13.18 (scalac) compiled and run on a
 * JVM interpreted in TypeScript.
 *
 * Protocol:
 *   { cmd: 'init', baseUrl? }  → { type: 'progress', stage, detail } while loading
 *                              → { type: 'initialized', initMs } | { type: 'init-error', error }
 *   { cmd: 'run', language: 'java'|'kotlin'|'scala', source, input?, mainClass? }
 *                              → { type: 'progress', stage, detail } while working
 *                              → { type: 'result', ok, compileMs, runMs, stdout, stderr, exitCode, compileLog }
 *   { cmd: 'stop' }            → halts the active JVM (exit code 130)
 *
 * baseUrl points at the doppio-modern runtime directory holding
 * browserfs.min.js, doppio.js and listings.json (default: seorii.page deployment).
 */

declare const BrowserFS: any;
declare const Doppio: any;

const DEFAULT_BASE_URL = 'https://seorii.page/doppio/playground/runtime/';
const SCALA_VERSION = '2.13.18';

// Jars inside the mounted runtime root.
const JAVA_HOME_LIB = '/sys/vendor/java_home/lib';
const KOTLIN_DIR = '/sys/compilers/kotlin';
const SCALA_DIR = '/sys/compilers/scala';

interface DoppioWorkerInit {
  baseUrl?: string;
}

let baseUrl = DEFAULT_BASE_URL;
let fs: any = null;
let processModule: any = null;
let activeJvm: any = null;

let readyPromise: Promise<void>;

/** Long-running interpreted-JVM work gives no other feedback, so report stages. */
const progress = (stage: string, detail = '') => {
  self.postMessage({ type: 'progress', stage, detail });
};

function startEnv(): Promise<void> {
  return new Promise((resolve, reject) => {
    progress('runtime', 'loading doppio + browserfs');
    importScripts(baseUrl + 'browserfs.min.js');
    importScripts(baseUrl + 'doppio.js');
    progress('runtime', 'reading runtime listings');
    BrowserFS.FileSystem.XmlHttpRequest.FromURL(
      baseUrl + 'listings.json',
      (error: Error | null, runtime: unknown) => {
        if (error) return reject(error);
        try {
          progress('runtime', 'mounting /sys, /tmp, /work');
          const mountable = new BrowserFS.FileSystem.MountableFileSystem();
          BrowserFS.initialize(mountable);
          mountable.mount('/tmp', new BrowserFS.FileSystem.InMemory());
          mountable.mount('/work', new BrowserFS.FileSystem.InMemory());
          mountable.mount('/sys', runtime);
          fs = BrowserFS.BFSRequire('fs');
          processModule = BrowserFS.BFSRequire('process');
          processModule.initializeTTYs();
          progress('runtime', 'ready');
          resolve();
        } catch (err) {
          reject(err as Error);
        }
      },
      baseUrl
    );
  });
}

/**
 * Input for the *next* JVM start. It has to be written once the JVM has attached to the
 * TTY — writing before `VM.CLI` drops it, which leaves `readLine()` blocked forever.
 */
let pendingStdin: string | null = null;

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
        if (pendingStdin !== null) {
          const data = pendingStdin;
          pendingStdin = null;
          processModule.stdin.write(data);
        }
      }
    );
  });
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
        `${JAVA_HOME_LIB}/tools.jar`,
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
      // Mirrors the upstream compiler smoke (`ci/kotlin_smoke.sh`): an explicit
      // bootstrap classpath plus `-no-jdk`.
      //
      // Without `-no-jdk` kotlinc resolves the JDK from `java.home` and walks it through
      // the emulated filesystem, which never returns in the browser. With it, the JDK
      // classes come from rt.jar on the classpath instead — exactly what upstream does.
      return [
        '-Xresponsiveness:100000',
        '-cp',
        // Minimal compiler classpath (upstream's default mode): the fat compiler jar
        // alone. Putting all 54 jars here made the emulated filesystem fetch ~200 MB of
        // jars before compiling anything.
        `${KOTLIN_DIR}/kotlin-compiler.jar`,
        'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler',
        '-no-reflect',
        '-no-jdk',
        '-no-stdlib',
        '-classpath',
        [`${JAVA_HOME_LIB}/doppio.jar`, `${JAVA_HOME_LIB}/rt.jar`, `${KOTLIN_DIR}/kotlin-stdlib.jar`].join(':'),
        '-java-parameters',
        '-d',
        outputDir,
        '/work/Main.kt',
      ];
    },
    runtimeClasspath(outputDir) {
      return `${outputDir}:${KOTLIN_DIR}/kotlin-stdlib.jar`;
    },
  },
  scala: {
    filename: 'Main.scala',
    mainClass: 'Main',
    outputClass: 'Main.class',
    compileArgs(outputDir) {
      const compilerClasspath = [
        `${SCALA_DIR}/scala-compiler-${SCALA_VERSION}.jar`,
        `${SCALA_DIR}/scala-library-${SCALA_VERSION}.jar`,
        `${SCALA_DIR}/scala-reflect-${SCALA_VERSION}.jar`,
        `${SCALA_DIR}/java-diff-utils-4.16.jar`,
        `${SCALA_DIR}/jline-3.29.0-jdk8.jar`,
      ].join(':');
      return [
        '-Xresponsiveness:100000',
        '-cp',
        compilerClasspath,
        'scala.tools.nsc.Main',
        '-classpath',
        [
          `${SCALA_DIR}/scala-library-${SCALA_VERSION}.jar`,
          `${SCALA_DIR}/scala-reflect-${SCALA_VERSION}.jar`,
        ].join(':'),
        '-d',
        outputDir,
        '/work/Main.scala',
      ];
    },
    runtimeClasspath(outputDir) {
      return [
        outputDir,
        `${SCALA_DIR}/scala-library-${SCALA_VERSION}.jar`,
        `${SCALA_DIR}/scala-reflect-${SCALA_VERSION}.jar`,
      ].join(':');
    },
  },
};

/** Captures everything the emulated JVM writes and forwards it as progress. */
function captureOutput(onChunk: (text: string, stream: 'stdout' | 'stderr') => void) {
  processModule.stdout.removeAllListeners('data');
  processModule.stderr.removeAllListeners('data');
  processModule.stdout.on('data', (data: unknown) => onChunk(String(data), 'stdout'));
  processModule.stderr.on('data', (data: unknown) => onChunk(String(data), 'stderr'));
}

async function runProgram(language: string, source: string, input: string, mainClassOverride?: string) {
  await readyPromise;
  const recipe = RECIPES[language];
  if (!recipe) throw new Error(`unsupported language: ${language}`);

  const outputDir = `/work/out-${Date.now()}`;
  fs.mkdirSync(outputDir);
  fs.writeFileSync(`/work/${recipe.filename}`, source, 'utf8');

  let compileLog = '';
  progress('compile', `compiling ${recipe.filename} — first run loads the compiler jars`);
  captureOutput((text) => {
    compileLog += text;
    progress('compiler', text.trimEnd().slice(0, 400));
  });

  const t0 = performance.now();
  const compileExit = await invokeJvm(recipe.compileArgs(outputDir));
  const compileMs = performance.now() - t0;
  progress('compile', `finished in ${Math.round(compileMs)} ms (exit ${compileExit})`);

  if (compileExit !== 0 || !fs.existsSync(`${outputDir}/${recipe.outputClass}`)) {
    return {
      ok: false,
      compileMs,
      exitCode: compileExit,
      stdout: '',
      stderr: compileLog.slice(0, 4000),
      compileLog: compileLog.slice(0, 4000),
      error: `compiler exited with status ${compileExit}`,
    };
  }

  let output = '';
  let stderr = '';
  progress('run', `running ${mainClassOverride || recipe.mainClass}`);
  captureOutput((text, stream) => {
    if (stream === 'stdout') {
      output += text;
      progress('stdout', text.trimEnd().slice(0, 400));
    } else {
      stderr += text;
      progress('stderr', text.trimEnd().slice(0, 400));
    }
  });
  // A line-oriented read blocks until it sees a terminator.
  pendingStdin = input ? (input.endsWith('\n') ? input : input + '\n') : null;

  const t1 = performance.now();
  const runExit = await invokeJvm([
    '-Xresponsiveness:10000',
    '-cp',
    recipe.runtimeClasspath(outputDir),
    mainClassOverride || recipe.mainClass,
  ]);
  const runMs = performance.now() - t1;
  progress('run', `finished in ${Math.round(runMs)} ms (exit ${runExit})`);

  return { ok: true, compileMs, runMs, exitCode: runExit, stdout: output, stderr, compileLog };
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
