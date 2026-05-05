#!/usr/bin/env node
// Emits a solid-color PNG to stdout. Usage: node _make-png.mjs <w> <h> <r> <g> <b>
// Used by setup-fake-repo.sh to procedurally generate image fixtures.

import { deflateSync } from "node:zlib";

const [w, h, r, g, b] = process.argv.slice(2).map(Number);
if ([w, h, r, g, b].some((n) => !Number.isFinite(n))) {
  console.error("usage: _make-png.mjs <w> <h> <r> <g> <b>");
  process.exit(1);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tb = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(w, 0);
ihdr.writeUInt32BE(h, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type RGB
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const row = Buffer.alloc(1 + w * 3);
for (let x = 0; x < w; x++) {
  const i = 1 + x * 3;
  row[i] = r;
  row[i + 1] = g;
  row[i + 2] = b;
}
const raw = Buffer.alloc(h * row.length);
for (let y = 0; y < h; y++) row.copy(raw, y * row.length);
const idat = deflateSync(raw);

process.stdout.write(
  Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]),
);
