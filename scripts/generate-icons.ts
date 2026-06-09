/**
 * Generates the PWA icons (public/icons/*, app/apple-icon.png) from the
 * design tokens — a branch-graph motif on the dimensional dark gradient.
 * Pure Bun + node:zlib so it runs anywhere: `bun scripts/generate-icons.ts`.
 * Re-run and commit the output whenever the brand palette changes.
 */

import { deflateSync } from "node:zlib";

type RGB = [number, number, number];

// Mirror of app/globals.css tokens.
const BG_0: RGB = [10, 12, 16]; // --bg
const BG_1: RGB = [24, 29, 41]; // --bg-raised
const FG: RGB = [232, 234, 240]; // --fg
const ACCENT: RGB = [124, 156, 255]; // --accent
const ACCENT_2: RGB = [167, 139, 250]; // --accent-2

// ---------- PNG encoding ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA

  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 4)] = 0; // filter: none
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1);
  }

  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

// ---------- drawing ----------

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp01(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1));
  const dx = px - (ax + abx * t);
  const dy = py - (ay + aby * t);
  return Math.hypot(dx, dy);
}

function quadratic(p0: [number, number], c: [number, number], p1: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
    u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
  ];
}

function polylineDistance(px: number, py: number, points: [number, number][]) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    min = Math.min(min, segmentDistance(px, py, a[0], a[1], b[0], b[1]));
  }
  return min;
}

function sample(curve: (t: number) => [number, number], steps: number): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => curve(i / steps));
}

function renderIcon(size: number): Uint8Array {
  const s = size;
  const rgba = new Uint8Array(s * s * 4);
  const stroke = 0.035 * s;
  const nodeRadius = 0.052 * s;
  const edge = Math.max(1, s / 256);

  // Branch motif: main lane with a branch that diverges and merges back.
  const main: [number, number][] = [
    [0.38 * s, 0.84 * s],
    [0.38 * s, 0.16 * s],
  ];
  const branchOut = sample(
    (t) => quadratic([0.38 * s, 0.68 * s], [0.68 * s, 0.64 * s], [0.66 * s, 0.46 * s], t),
    32,
  );
  const branchIn = sample(
    (t) => quadratic([0.66 * s, 0.46 * s], [0.64 * s, 0.28 * s], [0.38 * s, 0.24 * s], t),
    32,
  );
  const nodes: { x: number; y: number; color: RGB }[] = [
    { x: 0.38 * s, y: 0.76 * s, color: ACCENT },
    { x: 0.66 * s, y: 0.46 * s, color: ACCENT_2 },
    { x: 0.38 * s, y: 0.24 * s, color: ACCENT },
  ];

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // Dimensional background: diagonal depth gradient + aurora glows.
      let color = mix(BG_0, BG_1, clamp01((x + y) / (2 * s)));
      const glowA = Math.exp(-(((x - 0.2 * s) ** 2 + (y - 0.05 * s) ** 2) / (0.45 * s) ** 2));
      const glowB = Math.exp(-(((x - 0.85 * s) ** 2 + (y - 0.9 * s) ** 2) / (0.5 * s) ** 2));
      color = mix(color, ACCENT, 0.1 * glowA);
      color = mix(color, ACCENT_2, 0.07 * glowB);

      // Lanes.
      const dMain = polylineDistance(x, y, main);
      const dBranch = Math.min(polylineDistance(x, y, branchOut), polylineDistance(x, y, branchIn));
      const mainAlpha = clamp01((stroke / 2 + edge - dMain) / edge);
      const branchAlpha = clamp01((stroke / 2 + edge - dBranch) / edge);
      color = mix(color, mix(FG, ACCENT, 0.35), 0.8 * mainAlpha);
      color = mix(color, ACCENT_2, 0.9 * branchAlpha);

      // Nodes with a soft glow.
      for (const node of nodes) {
        const d = Math.hypot(x - node.x, y - node.y);
        const glow = Math.exp(-((d / (0.11 * s)) ** 2)) * 0.35;
        color = mix(color, node.color, glow);
        const body = clamp01((nodeRadius - d) / edge);
        color = mix(color, mix(node.color, FG, 0.25), body);
      }

      const i = (y * s + x) * 4;
      rgba[i] = Math.round(color[0]);
      rgba[i + 1] = Math.round(color[1]);
      rgba[i + 2] = Math.round(color[2]);
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

const targets = [
  { path: "public/icons/icon-192.png", size: 192 },
  { path: "public/icons/icon-512.png", size: 512 },
  // Same art: the motif already sits inside the maskable safe zone.
  { path: "public/icons/icon-maskable-512.png", size: 512 },
  { path: "app/apple-icon.png", size: 180 },
];

for (const target of targets) {
  const png = encodePng(target.size, target.size, renderIcon(target.size));
  await Bun.write(target.path, png);
  console.log(`wrote ${target.path} (${png.length} bytes)`);
}
