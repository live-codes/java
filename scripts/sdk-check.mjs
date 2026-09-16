// Checks the javac SDK surface without a browser.
//
// The SDK archive is what javac reads, so a mistake in it (a member whose `@Rename` was not applied,
// an `InnerClasses` entry pointing at a pre-rename owner, a duplicated method, a `default` method
// emitted as abstract) shows up as a compile error in ordinary Java. Rebuilding the archive and
// re-running the corpus in a browser makes that slow to iterate on, so this runs the fork's compiler
// in plain Node against the vendored archive and compiles one snippet per known failure mode.
//
//   node scripts/sdk-check.mjs
//   node scripts/sdk-check.mjs --compiler "D:/path/to/dist/teavm-javac"
//
// Needs a teavm-javac checkout with `:compiler:createDist` built, and a browser-less copy of its
// compiler. Set TEAVM_JAVAC_DIST to point at it instead of passing --compiler.

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));

const argOf = (flag) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? null : process.argv[index + 1];
};

const compilerDir = argOf('--compiler') ?? process.env.TEAVM_JAVAC_DIST;
if (!compilerDir) {
  console.error('Set TEAVM_JAVAC_DIST or pass --compiler <dir> (the teavm-javac dist folder).');
  process.exit(2);
}

const classlibPath = join(root, 'dist', 'teavm', 'compile-classlib-teavm.bin');
const classlib = readFileSync(classlibPath);

// The loader fetches its classlibs by URL; Node has no fetch for file://.
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input?.url ?? String(input));
  if (url.startsWith('file:')) return Promise.resolve(new Response(readFileSync(fileURLToPath(url))));
  return realFetch(input, init);
};

const { createCompiler } = await import(pathToFileURL(join(compilerDir, 'teavm-javac.js')).href);

const snippets = [
  {
    name: 'Object.getClass / Throwable.getMessage / clone',
    source: `public class Main {
  public static void main(String[] args) {
    try {
      throw new IllegalStateException("boom");
    } catch (RuntimeException e) {
      System.out.println(e.getClass().getName() + ": " + e.getMessage());
    }
  }
}`,
  },
  {
    name: 'Map.Entry and nested JDK types',
    source: `import java.util.HashMap;
import java.util.Map;

public class Main {
  public static void main(String[] args) {
    Map<String, Integer> m = new HashMap<>();
    m.put("a", 1);
    for (Map.Entry<String, Integer> e : m.entrySet()) {
      System.out.println(e.getKey() + "=" + e.getValue());
    }
  }
}`,
  },
  {
    name: 'annotation declaration (Annotation must not extend itself)',
    source: `import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;

public class Main {
  @Retention(RetentionPolicy.RUNTIME)
  @interface Tag { String value(); }

  @Tag("x")
  static int run() { return 1; }

  public static void main(String[] args) {
    System.out.println(run());
  }
}`,
  },
  {
    name: 'implements CharSequence (default isEmpty)',
    source: `public class Main {
  static class Filler implements CharSequence {
    private final char c;
    private final int len;
    Filler(char c, int len) { this.c = c; this.len = len; }
    public int length() { return len; }
    public char charAt(int i) { return c; }
    public CharSequence subSequence(int s, int e) { return new Filler(c, e - s); }
  }
  public static void main(String[] args) {
    System.out.println(new Filler('*', 3).length());
  }
}`,
  },
  {
    name: 'implements Iterator (default remove)',
    source: `import java.util.Iterator;

public class Main {
  static class Counter implements Iterator<Integer> {
    private int n = 0;
    public boolean hasNext() { return n < 3; }
    public Integer next() { return n++; }
  }
  public static void main(String[] args) {
    Iterator<Integer> it = new Counter();
    while (it.hasNext()) System.out.println(it.next());
  }
}`,
  },
  {
    name: 'StringBuilder.append(Object) (no duplicate members)',
    source: `import java.util.ArrayList;
import java.util.List;

public class Main {
  public static void main(String[] args) {
    List<Object> items = new ArrayList<>();
    items.add("a");
    items.add(1);
    StringBuilder sb = new StringBuilder();
    for (Object item : items) sb.append(item).append(' ');
    System.out.println(sb.toString().trim());
  }
}`,
  },
];

let failures = 0;

// The compiler runtime is a module singleton -- one instance, reused per snippet.
const compiler = await createCompiler();
await compiler.setClasslib({ javac: classlib });
const messages = [];
compiler.onDiagnostic((d) => messages.push(d.message ?? String(d)));

for (const snippet of snippets) {
  compiler.clearSources();
  const start = messages.length;
  compiler.addSource('Main.java', snippet.source);
  const ok = await compiler.compile();
  const errors = messages.slice(start).filter((m) => !/Wasm-GC compiler backend/.test(m));

  if (ok) {
    console.log(`  ok   ${snippet.name}`);
  } else {
    failures++;
    console.log(`  FAIL ${snippet.name}`);
    for (const error of errors) console.log(`         ${error}`);
  }
}

console.log(`\n${snippets.length - failures}/${snippets.length} SDK surface checks passed`);
process.exit(failures === 0 ? 0 : 1);
