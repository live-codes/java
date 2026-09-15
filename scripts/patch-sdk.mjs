// Patch the javac SDK archive so it exposes the Java-visible API surface.
//
// Two bugs in the fork's StdlibConverter leak TeaVM internals into the SDK:
//   1. methods declared as `getClass0()` with @Rename("getClass") keep their internal
//      name, so javac cannot resolve `getClass()` / `getMessage()` / ...
//   2. InnerClasses entries keep the pre-rename owner names, so `Map.Entry` does not
//      resolve even though Map$Entry.class exists.
//
// The archive is gzip-wrapped framing of (u16 nameLen, name, u32 dataLen, classBytes).
// Class files are patched by appending constant-pool entries (indexes are stable, so
// nothing else shifts) and repointing the affected indexes.

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';

const RENAME_DESC = 'Lorg/teavm/interop/Rename;';
const CLASS_PREFIX = 'org/teavm/classlib/java/';

const renameClass = (name) => {
  if (name.startsWith(CLASS_PREFIX)) {
    const slash = name.lastIndexOf('/');
    if (name[slash + 1] !== 'T') return name;
    return 'java/' + name.slice(CLASS_PREFIX.length, slash) + '/' + name.slice(slash + 2);
  }
  if (name.startsWith('org/threeten/bp/')) return 'java/time/' + name.slice('org/threeten/bp/'.length);
  return name;
};

function patchClass(buf) {
  if (buf.length < 10 || buf.readUInt32BE(0) !== 0xCAFEBABE) return { buf, renames: [], inner: 0 };
  const poolCount = buf.readUInt16BE(8);

  // --- pass 1: constant pool -------------------------------------------------
  const utf8 = new Map(); // index -> string
  const utf8Index = new Map(); // string -> index
  const classToUtf8 = new Map(); // class index -> utf8 index
  let off = 10;
  for (let i = 1; i < poolCount; i++) {
    const tag = buf[off];
    if (tag === 1) {
      const len = buf.readUInt16BE(off + 1);
      const str = buf.toString('utf8', off + 3, off + 3 + len);
      utf8.set(i, str);
      if (!utf8Index.has(str)) utf8Index.set(str, i);
      off += 3 + len;
    } else if (tag === 7) {
      classToUtf8.set(i, buf.readUInt16BE(off + 1));
      off += 3;
    } else if (tag === 3 || tag === 4 || tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) {
      off += 5;
    } else if (tag === 5 || tag === 6) {
      off += 9;
      i++;
    } else if (tag === 15) {
      off += 4;
    } else if (tag === 16 || tag === 19 || tag === 20) {
      off += 3;
    } else {
      return { buf, renames: [], inner: 0, error: `unexpected constant tag ${tag}` };
    }
  }
  const poolEnd = off;

  // --- helpers to append pool entries ---------------------------------------
  // Appended pool entries must be emitted in index order, so keep one ordered list.
  const appended = []; // Buffer, in index order
  const extraClass = []; // {index, utf8Index}
  let nextIndex = poolCount;
  const internUtf8 = (str) => {
    const existing = utf8Index.get(str);
    if (existing !== undefined) return existing;
    const bytes = Buffer.from(str, 'utf8');
    const entry = Buffer.alloc(3 + bytes.length);
    entry[0] = 1;
    entry.writeUInt16BE(bytes.length, 1);
    bytes.copy(entry, 3);
    const index = nextIndex++;
    appended.push(entry);
    utf8Index.set(str, index);
    return index;
  };
  const internClass = (name) => {
    const utf = internUtf8(name);
    for (const [clsIndex, utfIndex] of classToUtf8) if (utfIndex === utf) return clsIndex;
    for (const entry of extraClass) if (entry.utf8Index === utf) return entry.index;
    const index = nextIndex++;
    extraClass.push({ index, utf8Index: utf });
    const entry = Buffer.alloc(3);
    entry[0] = 7;
    entry.writeUInt16BE(utf, 1);
    appended.push(entry);
    return index;
  };

  const patches = []; // {offset, value}
  const renames = [];

  // --- walk fields, methods, attributes -------------------------------------
  const readAttributes = (start, count) => {
    let p = start;
    const attrs = [];
    for (let i = 0; i < count; i++) {
      const nameIndex = buf.readUInt16BE(p);
      const len = buf.readUInt32BE(p + 2);
      attrs.push({ nameIndex, name: utf8.get(nameIndex), dataOffset: p + 6, len });
      p += 6 + len;
    }
    return { attrs, end: p };
  };

  // @Rename("X") -> "X"
  const renameTarget = (attr) => {
    const { dataOffset, len } = attr;
    const end = dataOffset + len;
    let p = dataOffset;
    const numAnnotations = buf.readUInt16BE(p);
    p += 2;
    for (let a = 0; a < numAnnotations && p + 4 <= end; a++) {
      const typeIndex = buf.readUInt16BE(p);
      p += 2;
      const typeName = utf8.get(typeIndex);
      const numPairs = buf.readUInt16BE(p);
      p += 2;
      let value = null;
      for (let k = 0; k < numPairs && p + 3 <= end; k++) {
        const pairName = utf8.get(buf.readUInt16BE(p));
        p += 2;
        const tag = String.fromCharCode(buf[p]);
        p += 1;
        if (tag === 's') {
          const v = utf8.get(buf.readUInt16BE(p));
          p += 2;
          if (pairName === 'value') value = v;
        } else if (tag === 'B' || tag === 'C' || tag === 'S' || tag === 'I' || tag === 'Z') {
          p += 2;
        } else if (tag === 'D' || tag === 'F' || tag === 'J') {
          p += 2;
        } else if (tag === 'e') {
          p += 4;
        } else if (tag === 'c') {
          p += 2;
        } else if (tag === '[') {
          const n = buf.readUInt16BE(p);
          p += 2 + n * 3;
        } else if (tag === '@') {
          // nested annotation: skip conservatively
          p = end;
        }
      }
      if (typeName === RENAME_DESC && value) return value;
    }
    return null;
  };

  // Collect declarations first: a rename is only safe when it does not collide with a
  // member that already exists here, and constructors must keep their special names.
  const declarations = new Set();
  const candidates = [];
  const considerRename = (nameIndexOffset, name, desc) => {
    declarations.add(`${name}\u0000${desc}`);
    candidates.push({ nameIndexOffset, name, desc });
  };
  const applyRenames = (kind) => {
    for (const candidate of candidates) {
      const { nameIndexOffset, name, desc } = candidate;
      if (candidate.target === undefined) continue;
      const target = candidate.target;
      if (name === '<init>' || name === '<clinit>') continue;
      if (target === name) continue;
      if (declarations.has(`${target}\u0000${desc}`)) continue;
      patches.push({ offset: nameIndexOffset, value: internUtf8(target) });
      renames.push(`${kind} ${name} -> ${target}`);
    }
  };

  let p = poolEnd;
  p += 6; // access, this, super
  const interfaceCount = buf.readUInt16BE(p);
  p += 2 + interfaceCount * 2;
  const fieldCount = buf.readUInt16BE(p);
  p += 2;
  for (let i = 0; i < fieldCount; i++) {
    const nameIndexOffset = p + 2;
    const name = utf8.get(buf.readUInt16BE(nameIndexOffset));
    const desc = utf8.get(buf.readUInt16BE(nameIndexOffset + 2));
    const { attrs, end } = readAttributes(p + 8, buf.readUInt16BE(p + 6));
    p = end;
    considerRename(nameIndexOffset, name, desc);
    for (const attr of attrs) {
      if (attr.name === 'RuntimeInvisibleAnnotations' || attr.name === 'RuntimeVisibleAnnotations') {
        const target = renameTarget(attr);
        if (target) candidates[candidates.length - 1].target = target;
      }
    }
  }
  const methodCount = buf.readUInt16BE(p);
  p += 2;
  const methodStart = candidates.length;
  for (let i = 0; i < methodCount; i++) {
    const nameIndexOffset = p + 2;
    const name = utf8.get(buf.readUInt16BE(nameIndexOffset));
    const desc = utf8.get(buf.readUInt16BE(nameIndexOffset + 2));
    const { attrs, end } = readAttributes(p + 8, buf.readUInt16BE(p + 6));
    p = end;
    considerRename(nameIndexOffset, name, desc);
    for (const attr of attrs) {
      if (attr.name === 'RuntimeInvisibleAnnotations' || attr.name === 'RuntimeVisibleAnnotations') {
        const target = renameTarget(attr);
        if (target) candidates[candidates.length - 1].target = target;
      }
    }
  }
  applyRenames('member');
  void methodStart;
  const classAttrCount = buf.readUInt16BE(p);
  p += 2;
  let innerCount = 0;
  const { attrs: classAttrs } = readAttributes(p, classAttrCount);
  for (const attr of classAttrs) {
    if (attr.name !== 'InnerClasses') continue;
    let q = attr.dataOffset;
    const n = buf.readUInt16BE(q);
    q += 2;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        const idxOffset = q + k * 2;
        const idx = buf.readUInt16BE(idxOffset);
        if (idx === 0) continue;
        const utf = classToUtf8.get(idx);
        if (utf === undefined) continue;
        const current = utf8.get(utf);
        if (current === undefined) continue;
        const renamed = renameClass(current);
        if (renamed !== current) {
          patches.push({ offset: idxOffset, value: internClass(renamed) });
          innerCount++;
        }
      }
      q += 8;
    }
  }

  if (patches.length === 0 && appended.length === 0) {
    return { buf, renames: [], inner: 0 };
  }

  // --- rebuild: header + pool(+appended) + patched remainder ----------------
  const rest = Buffer.from(buf.subarray(poolEnd));
  for (const { offset, value } of patches) {
    rest.writeUInt16BE(value & 0xffff, offset - poolEnd);
  }
  const out = Buffer.concat([
    buf.subarray(0, 8),
    (() => {
      const c = Buffer.alloc(2);
      c.writeUInt16BE(nextIndex);
      return c;
    })(),
    buf.subarray(10, poolEnd),
    Buffer.concat(appended),
    rest,
  ]);
  return { buf: out, renames, inner: innerCount };
}

// --- archive framing --------------------------------------------------------

/**
 * Patch a javac SDK archive and report what changed.
 *
 * @param {Buffer} raw decompressed archive (see the framing note at the top)
 * @returns {{archive: Buffer, classes: number, renames: number, innerClasses: number, samples: string[]}}
 */
export function patchSdkArchive(raw) {
  const out = [];
  let off = 0;
  let classes = 0;
  let renames = 0;
  let innerClasses = 0;
  const samples = [];
  while (off + 6 <= raw.length) {
    const nameLen = raw.readUInt16BE(off);
    const nameStart = off + 2;
    const dataLenOffset = nameStart + nameLen;
    const name = raw.toString('utf8', nameStart, dataLenOffset);
    const dataLen = raw.readUInt32BE(dataLenOffset);
    const dataStart = dataLenOffset + 4;
    const data = raw.subarray(dataStart, dataStart + dataLen);
    off = dataStart + dataLen;

    const result = patchClass(data);
    if (result.renames.length || result.inner) {
      classes++;
      renames += result.renames.length;
      innerClasses += result.inner;
      if (samples.length < 10 && result.renames.length) samples.push(`${name}: ${result.renames.join(', ')}`);
    }
    const nameBuf = Buffer.from(name, 'utf8');
    const header = Buffer.alloc(2);
    header.writeUInt16BE(nameBuf.length);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(result.buf.length);
    out.push(header, nameBuf, lenBuf, result.buf);
  }
  return {
    archive: gzipSync(Buffer.concat(out), { level: 9 }),
    classes,
    renames,
    innerClasses,
    samples,
  };
}

const [, , input, output] = process.argv;
if (input && output) {
  const result = patchSdkArchive(gunzipSync(readFileSync(input)));
  writeFileSync(output, result.archive);
  console.log(`classes patched : ${result.classes}`);
  console.log(`member renames  : ${result.renames}`);
  console.log(`InnerClasses    : ${result.innerClasses}`);
  for (const s of result.samples) console.log('  ' + s);
  console.log(`wrote ${output} (${result.archive.length} bytes)`);
}
