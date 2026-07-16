#!/usr/bin/env node
// Emits a solid-color PNG to stdout. Usage: node _make-png.mjs <w> <h> <r> <g> <b>
// Used by setup-fake-repo.sh to procedurally generate image fixtures.

import { deflateSync } from "node:zlib";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

export function createSolidPng(w, h, r, g, b) {
  if ([w, h, r, g, b].some((value) => !Number.isInteger(value) || value < 0)) {
    throw new TypeError("PNG dimensions and channels must be non-negative integers.");
  }
  if (w === 0 || h === 0 || [r, g, b].some((value) => value > 255)) {
    throw new RangeError("PNG dimensions must be positive and channels must be at most 255.");
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

  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] != null && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const values = process.argv.slice(2).map(Number);
  if (values.length !== 5 || values.some((value) => !Number.isFinite(value))) {
    console.error("usage: _make-png.mjs <w> <h> <r> <g> <b>");
    process.exit(1);
  }
  process.stdout.write(createSolidPng(...values));
}
