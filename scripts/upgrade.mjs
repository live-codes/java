#!/usr/bin/env node
/**
 * Upgrade assistant for the pinned TeaVM toolchain.
 *
 *   node scripts/upgrade.mjs            # status: pins, artifact checksums, patch inventory
 *   node scripts/upgrade.mjs --status   # same
 *   node scripts/upgrade.mjs --diff     # regenerate patches/diffs/*.patch from the pinned upstream
 *   node scripts/upgrade.mjs --help
 *
 * Why this exists: `patches/` holds whole files, which is what the build needs but a poor thing to
 * carry across a version bump — you cannot see what we changed. `--diff` turns each one into a unified
 * diff against the upstream source it was taken from, verifies that the diff turns upstream back into
 * our file, and leaves it in `patches/diffs/`. `UPGRADING.md` is the runbook.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'patches', 'manifest.json'), 'utf8'));
const diffsDir = join(root, 'patches', 'diffs');

const args = process.argv.slice(2);
const diff = args.includes('--diff');
const help = args.includes('--help') || args.includes('-h');

if (help) {
  console.log(`Usage: node scripts/upgrade.mjs [--status | --diff]

  --status   (default) print the pins, verify assets/ against the manifest, list every patch
  --diff     fetch each patch's upstream source, write patches/diffs/<file>.patch, and prove the
             patch turns that upstream into the file in patches/ (uses git; needs network)

The runbook is UPGRADING.md.`);
  process.exit(0);
}

const normalize = (text) => text.replace(/\r\n/g, '\n');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const expand = (url, patch) =>
  url
    .replaceAll('{commit}', manifest.teavm.commit)
    .replaceAll('{teaVMVersion}', manifest.teavm.teaVMVersion)
    .replaceAll('{target}', patch.target);

function status() {
  const { repo, commit, teaVMVersion, jdk, binaryen } = manifest.teavm;
  console.log(`pinned: ${repo}@${commit.slice(0, 12)} (TeaVM ${teaVMVersion}), JDK ${jdk}, Binaryen ${binaryen}\n`);

  let problems = 0;

  console.log('artifacts (assets/):');
  for (const [name, expected] of Object.entries(manifest.artifacts)) {
    const path = join(root, 'assets', name);
    if (!existsSync(path)) {
      console.log(`  MISSING  ${name}`);
      problems++;
      continue;
    }
    const actual = sha256(readFileSync(path));
    const ok = actual === expected;
    if (!ok) problems++;
    console.log(`  ${ok ? 'ok      ' : 'MISMATCH'} ${name}`);
    if (!ok) console.log(`           expected ${expected}\n           actual   ${actual}`);
  }

  console.log('\npatches:');
  for (const patch of manifest.patches) {
    const path = join(root, 'patches', patch.file);
    if (!existsSync(path)) {
      console.log(`  MISSING  ${patch.file}`);
      problems++;
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const marker = patch.marker ? text.includes(patch.marker) : true;
    if (!marker) problems++;
    const upstream = patch.upstream ? 'diffable' : patch.kind;
    console.log(`  ${marker ? 'ok      ' : 'NO MARKER'} ${patch.file.padEnd(34)} ${patch.kind.padEnd(16)} ${upstream}`);
  }

  console.log('\nfork-only edits (not in patches/, applied by hand):');
  for (const edit of manifest.forkEdits) {
    console.log(`  ${edit.file}  →  ${edit.target}`);
  }

  console.log(`\n${problems === 0 ? 'inventory consistent' : `${problems} problem(s) above`}`);
  console.log('next: see UPGRADING.md — the short version is re-apply the patches on the new commit,');
  console.log('      rebuild with patches/Dockerfile, re-vendor assets/, then run the acceptance gate.');
  return problems === 0 ? 0 : 1;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return normalize(await response.text());
}

/** Produce a git-shaped unified diff, and let git itself judge whether it applies. */
function makeDiff(before, after, file) {
  const dir = mkdtempSync(join(tmpdir(), 'teavm-diff-'));
  try {
    mkdirSync(join(dir, 'a'), { recursive: true });
    mkdirSync(join(dir, 'b'), { recursive: true });
    writeFileSync(join(dir, 'a', file), before);
    writeFileSync(join(dir, 'b', file), after);
    let patch;
    try {
      patch = execFileSync('git', ['diff', '--no-index', '--unified=3', `a/${file}`, `b/${file}`], {
        cwd: dir,
        encoding: 'utf8',
      });
    } catch (error) {
      // git diff exits 1 when the files differ, which is the normal case here.
      patch = String(error.stdout ?? '');
    }
    if (!patch.trim()) return { patch: '', applies: true };

    // Prove it: put the upstream back at the path the patch names and apply it.
    // git apply reads both sides of the hunk, so put the upstream at the old path and the new one.
    mkdirSync(join(dir, 'c', 'a'), { recursive: true });
    mkdirSync(join(dir, 'c', 'b'), { recursive: true });
    writeFileSync(join(dir, 'c', 'a', file), before);
    writeFileSync(join(dir, 'c', 'b', file), before);
    const patchPath = join(dir, 'change.patch');
    writeFileSync(patchPath, patch);
    execFileSync('git', ['apply', '--unsafe-paths', patchPath], { cwd: join(dir, 'c'), stdio: 'pipe' });
    const result = normalize(readFileSync(join(dir, 'c', 'b', file), 'utf8'));
    return { patch, applies: result === after };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function regenerateDiffs() {
  mkdirSync(diffsDir, { recursive: true });
  let failures = 0;

  for (const patch of manifest.patches) {
    if (!patch.upstream && !patch.upstreamFile) {
      console.log(`skip     ${patch.file} (${patch.kind}, no upstream)`);
      continue;
    }
    let upstream;
    try {
      // Core classes are consumed as a jar, so there is no source URL to fetch: the pristine copy
      // lives in patches/upstream/ instead. Everything else comes from its upstream URL.
      upstream = patch.upstreamFile
        ? normalize(readFileSync(join(root, patch.upstreamFile), 'utf8'))
        : await fetchText(expand(patch.upstream, patch));
    } catch (error) {
      console.log(`FETCH    ${patch.file}: ${error.message}`);
      failures++;
      continue;
    }
    const ours = normalize(readFileSync(join(root, 'patches', patch.file), 'utf8'));
    if (patch.marker && upstream.includes(patch.marker)) {
      console.log(`DROP?    ${patch.file}: the upstream now contains "${patch.marker}" — ${patch.dropWhen ?? 'check whether the patch is still needed'}`);
    }
    const { patch: text, applies } = makeDiff(upstream, ours, patch.file);
    if (!text) {
      console.log(`same     ${patch.file}: identical to upstream (patch can be dropped)`);
      continue;
    }
    if (!applies) {
      console.log(`FAIL     ${patch.file}: the generated diff does not reproduce our file (line endings?)`);
      failures++;
      continue;
    }
    writeFileSync(join(diffsDir, `${patch.file}.patch`), text);
    const touched = (text.match(/^[+-][^+-]/gm) ?? []).length;
    console.log(`ok       ${patch.file}: ${touched} changed lines → patches/diffs/${patch.file}.patch`);
  }

  console.log(`\n${failures === 0 ? 'diffs verified against the pinned upstream' : `${failures} failed`}`);
  return failures === 0 ? 0 : 1;
}

process.exit(diff ? await regenerateDiffs() : status());
