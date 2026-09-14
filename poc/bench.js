/* Shared PoC benchmark harness — plain script, exposes window.Bench */
(function () {
  'use strict';

  const PROGRAMS = {
    java: [
      {
        id: 'java-hello',
        label: 'Java · hello world',
        kind: 'sanity',
        filename: 'Main.java',
        mainClass: 'Main',
        expect: 'Hello from Java',
        source: `public class Main {
  public static void main(String[] args) {
    System.out.println("Hello from Java");
  }
}
`,
      },
      {
        id: 'java-features',
        label: 'Java · modern syntax (records, var, text blocks, Stream.toList)',
        kind: 'feature',
        filename: 'Main.java',
        mainClass: 'Main',
        expect: 'Point[x=10, y=20]',
        source: `import java.util.stream.Stream;

public class Main {
  record Point(int x, int y) {}
  public static void main(String[] args) {
    var points = Stream.of(new Point(1, 2), new Point(3, 4))
        .map(p -> new Point(p.x() * 10, p.y() * 10))
        .toList();
    String text = """
        modern java ok""";
    System.out.println(points + " | " + text);
  }
}
`,
      },
      {
        id: 'java-bench',
        label: 'Java · fib(27) compute benchmark',
        kind: 'bench',
        filename: 'Main.java',
        mainClass: 'Main',
        expect: 'fib(27)=196418',
        source: `public class Main {
  static long fib(int n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }
  public static void main(String[] args) {
    long t0 = System.nanoTime();
    long r = fib(27);
    long internalMs = (System.nanoTime() - t0) / 1000000;
    System.out.println("fib(27)=" + r + " internalMs=" + internalMs);
  }
}
`,
      },
      {
        id: 'java-stdin',
        label: 'Java · stdin echo',
        kind: 'stdin',
        filename: 'Main.java',
        mainClass: 'Main',
        input: 'livecodes\n',
        expect: 'echo: livecodes',
        source: `import java.io.BufferedReader;
import java.io.InputStreamReader;

public class Main {
  public static void main(String[] args) throws Exception {
    BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
    String line = br.readLine();
    System.out.println("echo: " + line);
  }
}
`,
      },
    ],
    kotlin: [
      {
        id: 'kotlin-hello',
        label: 'Kotlin · data class + collections',
        kind: 'sanity',
        filename: 'Main.kt',
        mainClass: 'MainKt',
        expect: 'Kotlin 2011 squares=[1, 4, 9, 16, 25]',
        source: `data class Language(val name: String, val year: Int)

fun main() {
  val langs = listOf(Language("Kotlin", 2011), Language("LiveCodes", 2020))
  val squares = (1..5).map { it * it }
  println("\${langs[0].name} \${langs[0].year} squares=\$squares")
}
`,
      },
    ],
    scala: [
      {
        id: 'scala-hello',
        label: 'Scala · case class + LazyList',
        kind: 'sanity',
        filename: 'Main.scala',
        mainClass: 'Main',
        expect: 'Scala 2003 doubled=List(2, 4, 6, 8, 10)',
        source: `case class Lang(name: String, year: Int)

object Main {
  def main(args: Array[String]): Unit = {
    val langs = List(Lang("Scala", 2003), Lang("LiveCodes", 2020))
    val doubled = LazyList.from(1).map(_ * 2).take(5).toList
    println(s"\${langs.head.name} \${langs.head.year} doubled=\$doubled")
  }
}
`,
      },
    ],
  };

  const fmtMs = (ms) => (ms == null ? '—' : ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms');
  const fmtBytes = (b) => (b == null || b <= 0 ? 'n/a' : b > 1024 * 1024 ? (b / 1024 / 1024).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');

  function header(container, meta) {
    const el = document.createElement('header');
    el.innerHTML = `<h1>${meta.title}</h1><p>${meta.notes || ''}</p>
      <p class="meta">engine: <code>${meta.engine}</code> · worker: <code>${meta.worker || '-'}</code>
      · <button id="copy-json">Copy JSON results</button> <span id="copy-note"></span></p>`;
    container.appendChild(el);
    el.querySelector('#copy-json').addEventListener('click', () => {
      const key = 'poc-results-' + meta.engine;
      navigator.clipboard.writeText(localStorage.getItem(key) || '{}').then(() => {
        el.querySelector('#copy-note').textContent = 'copied';
        setTimeout(() => (el.querySelector('#copy-note').textContent = ''), 1200);
      });
    });
  }

  function table(container, columns) {
    const t = document.createElement('table');
    t.innerHTML = '<thead><tr>' + columns.map((c) => `<th>${c}</th>`).join('') + '</tr></thead><tbody></tbody>';
    container.appendChild(t);
    const body = t.querySelector('tbody');
    return {
      add(row) {
        const tr = document.createElement('tr');
        if (row.status === 'fail') tr.className = 'fail';
        if (row.status === 'ok') tr.className = 'ok';
        tr.innerHTML = columns
          .map((c) => `<td>${row[c] != null ? row[c] : '—'}</td>`)
          .join('');
        body.appendChild(tr);
      },
      setStatus(text) {
        let s = document.querySelector('#suite-status');
        if (!s) {
          s = document.createElement('p');
          s.id = 'suite-status';
          container.appendChild(s);
        }
        s.textContent = text;
      },
    };
  }

  async function runSuite(meta, engine) {
    const container = document.querySelector('#app');
    header(container, meta);
    const cols = ['program', 'compile', 'generate', 'run', 'internal', 'exit', 'downloaded', 'result'];
    const t = table(container, cols);
    const results = { engine: meta.engine, initMs: null, programs: [] };

    t.setStatus('initializing engine…');
    let handle;
    try {
      const initStart = performance.now();
      handle = await engine.init((msg) => t.setStatus(msg));
      results.initMs = performance.now() - initStart;
      t.setStatus(`engine ready in ${fmtMs(results.initMs)} — running ${meta.programs.length} programs…`);
    } catch (e) {
      t.setStatus('engine init FAILED: ' + (e && e.message ? e.message : e));
      results.error = String((e && e.message) || e);
      persist(meta.engine, results);
      return;
    }
    results.downloadedBytes = handle.downloadedBytes ?? null;

    for (const program of meta.programs) {
      const row = { program: program.label, compile: null, generate: null, run: null, internal: null, exit: null, downloaded: null, result: 'fail' };
      try {
        const r = await engine.run(handle, program);
        row.compile = fmtMs(r.compileMs);
        row.generate = fmtMs(r.generateMs);
        row.run = fmtMs(r.runMs);
        row.internal = fmtMs(r.internalMs);
        row.exit = r.exitCode;
        row.downloaded = fmtBytes(r.bytes);
        const output = (r.stdout || '') + (r.stderr ? '\n[stderr] ' + r.stderr : '');
        const passed =
          r.exitCode === 0 && (!program.expect || (r.stdout || '').includes(program.expect));
        row.result = passed ? 'ok' : 'fail';
        row.program += `<pre>${escapeHtml(output || '(no output)')}</pre>`;
        results.programs.push({
          id: program.id,
          compileMs: r.compileMs,
          generateMs: r.generateMs,
          runMs: r.runMs,
          internalMs: r.internalMs,
          exitCode: r.exitCode,
          bytes: r.bytes,
          passed,
          stdout: r.stdout,
          stderr: r.stderr,
        });
      } catch (e) {
        row.result = 'fail';
        row.program += `<pre class="err">${escapeHtml(String((e && e.message) || e))}</pre>`;
        results.programs.push({ id: program.id, passed: false, error: String((e && e.message) || e) });
      }
      t.add(row);
      persist(meta.engine, results);
    }
    t.setStatus(`done — init ${fmtMs(results.initMs)}`);
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function persist(engine, results) {
    try {
      localStorage.setItem('poc-results-' + engine, JSON.stringify(results));
    } catch (e) {
      /* ignore */
    }
  }

  window.Bench = { PROGRAMS, fmtMs, fmtBytes, header, table, runSuite, persist, escapeHtml };
})();
