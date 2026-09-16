// Corpus runner: serves this repo, runs the corpus on both engines in headless
// Chrome, and reports where they agree and differ.
//
//   node corpus/run.mjs            # both engines
//   node corpus/run.mjs teavm      # only @live-codes/java-wasm
//   node corpus/run.mjs baseline   # only LiveCodes/Doppio
//
// Results land in corpus/results.json.

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = Number(process.env.PORT || 8933);
const BASE = `http://localhost:${PORT}/corpus/`;
const only = process.argv[2];
// ONLY=a,b,c runs just those programs (both harnesses read it) — for re-checking failures on the
// slow Doppio baseline without paying for the whole set.
const QUERY = process.env.ONLY ? `?only=${encodeURIComponent(process.env.ONLY)}` : '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chromePath = process.env.CHROME_PATH || CHROME;

async function startServer() {
  const server = spawn(process.execPath, [join(root, 'scripts/serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}teavm.html`)).ok) return server;
    } catch {
      /* not up */
    }
    await sleep(200);
  }
  server.kill();
  throw new Error('static server did not start');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      }
    });
    ws.addEventListener('error', (e) => reject(new Error('ws error: ' + (e.message || e))));
    ws.addEventListener('open', () =>
      resolve({
        send(method, params = {}) {
          const mid = ++id;
          ws.send(JSON.stringify({ id: mid, method, params }));
          return new Promise((res, rej) => pending.set(mid, { resolve: res, reject: rej }));
        },
        close: () => ws.close(),
      })
    );
  });
}

async function findPage(port, marker) {
  for (let i = 0; i < 100; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === 'page' && t.url.includes(marker));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {
      /* not up */
    }
    await sleep(500);
  }
  throw new Error('page target not found for ' + marker);
}

async function runEngine(pageName, budgetMs) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const profile = mkdtempSync(join(tmpdir(), 'corpus-'));
  const chrome = spawn(
    chromePath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      BASE + pageName + QUERY,
    ],
    { stdio: 'ignore' }
  );

  try {
    const page = await findPage(port, `corpus/${pageName}`);
    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');

    const started = Date.now();
    let phase = '';
    while (Date.now() - started < budgetMs) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify({done: window.corpusDone === true, phase: window.corpusPhase || ""})',
        returnByValue: true,
      });
      const state = JSON.parse(r.result?.value || '{}');
      if (state.phase && state.phase !== phase) {
        phase = state.phase;
        process.stderr.write(`\r  ${pageName}: ${phase}`.padEnd(70));
      }
      if (state.done) break;
      await sleep(1000);
    }
    process.stderr.write('\n');

    const out = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.corpusResults)',
      returnByValue: true,
    });
    cdp.close();
    const parsed = JSON.parse(out.result?.value || 'null');
    if (!parsed) throw new Error(`${pageName} produced no results`);
    return parsed;
  } finally {
    chrome.kill();
  }
}

const normalize = (s) =>
  String(s ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .trim();

const server = await startServer();
let teavm = null;
let baseline = null;

try {
  if (only !== 'baseline') {
    console.log('\n== @live-codes/java-wasm ==');
    teavm = await runEngine('teavm.html', 10 * 60 * 1000);
    console.log(`  init ${teavm.initMs} ms, ${teavm.results.length} programs`);
  }
  if (only !== 'teavm') {
    console.log('\n== LiveCodes baseline (Doppio / JDK 8) ==');
    console.log('  first run fetches ~85 MB of jars from unpkg — this takes a while');
    baseline = await runEngine('baseline.html', 25 * 60 * 1000);
    console.log(`  init ${baseline.initMs} ms, ${baseline.results.length} programs`);
    if (baseline.fatal) console.log(`  FATAL: ${baseline.fatal}`);
  }
} finally {
  server.kill();
}

const RESULTS_FILE = process.env.ONLY ? 'corpus/results-only.json' : 'corpus/results.json';
writeFileSync(join(root, RESULTS_FILE), JSON.stringify({ teavm, baseline }, null, 2));

if (!teavm || !baseline) {
  console.log(`\nWrote ${RESULTS_FILE} (single engine).`);
  process.exit(0);
}

const byId = (engine) => new Map((engine.results ?? []).map((r) => [r.id, r]));
const t = byId(teavm);
const b = byId(baseline);
const ids = [...new Set([...t.keys(), ...b.keys()])];

const buckets = { same: [], differ: [], teavmOnly: [], baselineOnly: [], bothFail: [] };
for (const id of ids) {
  const a = t.get(id);
  const c = b.get(id);
  const aOk = a?.ok;
  const cOk = c?.ok;
  const aOut = normalize(a?.stdout);
  const cOut = normalize(c?.stdout);
  if (aOk && cOk) {
    (aOut === cOut ? buckets.same : buckets.differ).push({ id, a: aOut, c: cOut });
  } else if (aOk && !cOk) {
    buckets.teavmOnly.push({ id, out: aOut, why: c?.error || `exit ${c?.exitCode}` });
  } else if (!aOk && cOk) {
    buckets.baselineOnly.push({ id, why: a?.error || `exit ${a?.exitCode}`, out: cOut });
  } else {
    buckets.bothFail.push({ id, a: a?.error || `exit ${a?.exitCode}`, c: c?.error || `exit ${c?.exitCode}` });
  }
}

const clip = (s, n = 160) => {
  const one = String(s ?? '').replace(/\n/g, ' ⏎ ');
  return one.length > n ? one.slice(0, n) + '…' : one;
};

console.log('\n================ corpus summary ================');
console.log(`programs compared        : ${ids.length}`);
console.log(`identical output         : ${buckets.same.length}`);
console.log(`different output         : ${buckets.differ.length}`);
console.log(`java-wasm only           : ${buckets.teavmOnly.length}   (baseline failed)`);
console.log(`baseline only            : ${buckets.baselineOnly.length}   <-- REGRESSION RISK`);
console.log(`both failed              : ${buckets.bothFail.length}`);

const section = (title, rows, fmt) => {
  if (!rows.length) return;
  console.log(`\n--- ${title} ---`);
  for (const r of rows) console.log(fmt(r));
};

section('baseline only (works on Doppio, fails on java-wasm)', buckets.baselineOnly, (r) =>
  `  ${r.id.padEnd(20)} java-wasm: ${clip(r.why, 120)}`
);
section('different output', buckets.differ, (r) =>
  `  ${r.id.padEnd(20)}\n      java-wasm: ${clip(r.a, 120)}\n      baseline : ${clip(r.c, 120)}`
);
section('java-wasm only (fails on Doppio — modern Java)', buckets.teavmOnly, (r) =>
  `  ${r.id.padEnd(20)} doppio: ${clip(r.why, 120)}`
);
section('both failed', buckets.bothFail, (r) =>
  `  ${r.id.padEnd(20)} java-wasm: ${clip(r.a, 90)} | doppio: ${clip(r.c, 90)}`
);

// Timing summary
const sum = (arr, key) => arr.reduce((acc, r) => acc + (r[key] > 0 ? r[key] : 0), 0);
console.log('\n================ timings ================');
console.log(`java-wasm : init ${teavm.initMs} ms | compile ${sum(teavm.results, 'compileMs')} ms | generate ${sum(teavm.results, 'generateMs')} ms | run ${sum(teavm.results, 'runMs')} ms`);
console.log(`baseline  : init ${baseline.initMs} ms | compile ${sum(baseline.results, 'compileMs')} ms | run ${sum(baseline.results, 'runMs')} ms`);
console.log('\nWrote corpus/results.json');
