#!/usr/bin/env node
/**
 * Рисует пиксельную иконку Blade Step (скрещённые катаны на фоне кровавой луны)
 * и сохраняет её как настоящий PNG — без canvas и без скачиваний.
 * Сетка 64×64 «игровых» пикселей, масштаб ×8 → PNG 512×512.
 *
 * Использование: node tools/make-icon.cjs [путь/icon.png]
 */
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const G = 64; // размер сетки
const S = 8; // масштаб одного пикселя
const W = G * S; // итоговый размер PNG

const buf = Buffer.alloc(W * W * 4);

const set = (x, y, r, g, b, a = 255) => {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const i = (y * W + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
};

const px = (gx, gy, c) => {
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) set(gx * S + dx, gy * S + dy, c[0], c[1], c[2]);
};

// ---------- палитра (та же, что в игре) ----------
const NAVY = [10, 13, 29];
const OUT = [26, 26, 26];
const MOON = [193, 18, 31];
const MOOND = [143, 14, 26];
const GOLD = [255, 215, 0];
const STEEL = [168, 168, 168];
const STEELD = [128, 128, 128];
const STEELL = [224, 224, 224];
const TEAL = [42, 157, 143];
const CRIM = [193, 18, 31];
const WOOD = [74, 58, 42];
const WHITE = [255, 255, 255];
const DIM = [110, 120, 170];

// ---------- фон ----------
for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) px(x, y, y > 44 ? [8, 10, 24] : NAVY);

// звёзды
const stars = [
  [6, 5], [15, 3], [26, 7], [52, 6], [58, 14], [4, 22], [60, 34], [9, 40], [55, 44], [12, 55], [50, 56], [30, 3],
];
for (const [x, y] of stars) px(x, y, Math.random() < 0.5 ? WHITE : DIM);

// ---------- кровавая луна ----------
const cx = 32, cy = 21, r = 13;
for (let y = cy - r - 2; y <= cy + r + 2; y++)
  for (let x = cx - r - 2; x <= cx + r + 2; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r + 1.2) px(x, y, OUT);
  }
for (let y = cy - r; y <= cy + r; y++)
  for (let x = cx - r; x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r) px(x, y, MOON);
  }
// кратеры
const crater = (x0, y0, cr) => {
  for (let y = y0 - cr; y <= y0 + cr; y++)
    for (let x = x0 - cr; x <= x0 + cr; x++)
      if (Math.hypot(x - x0, y - y0) <= cr && Math.hypot(x - cx, y - cy) < r - 0.5) px(x, y, MOOND);
};
crater(27, 16, 3);
crater(38, 24, 2);
crater(30, 27, 2);

// ---------- катаны ----------
function line(x0, y0, x1, y1, color, w) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy, x = x0, y = y0;
  const half = Math.floor(w / 2);
  for (let guard = 0; guard < 200; guard++) {
    for (let oy = -half; oy <= half; oy++) for (let ox = -half; ox <= half; ox++) px(x + ox, y + oy, color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

// лезвие: контур → сталь → светлое ядро
const katana = (tipX, tipY, hiltX, hiltY, guardColor) => {
  line(hiltX, hiltY, tipX, tipY, OUT, 5);
  line(hiltX, hiltY, tipX, tipY, STEEL, 3);
  line(hiltX, hiltY, tipX, tipY, STEELD, 1);
  px(tipX, tipY, STEELL);
  px(tipX - Math.sign(tipX - hiltX), tipY - Math.sign(tipY - hiltY), STEELL);
  // цуба (гарда) — короткий перпендикуляр
  const mx = hiltX + Math.sign(tipX - hiltX);
  const my = hiltY + Math.sign(tipY - hiltY);
  line(mx - 2, my + (hiltX < 32 ? -2 : 2), mx + 2, my - (hiltX < 32 ? -2 : 2), OUT, 3);
  line(mx - 2, my + (hiltX < 32 ? -2 : 2), mx + 2, my - (hiltX < 32 ? -2 : 2), guardColor, 1);
  // рукоять
  const hx = hiltX - Math.sign(tipX - hiltX);
  const hy = hiltY - Math.sign(tipY - hiltY);
  line(hx, hy, hx - Math.sign(tipX - hiltX) * 2, hy - Math.sign(tipY - hiltY) * 2, OUT, 3);
  line(hx, hy, hx - Math.sign(tipX - hiltX) * 2, hy - Math.sign(tipY - hiltY) * 2, WOOD, 1);
};

katana(48, 16, 17, 47, TEAL); // лезвие из левого нижнего угла
katana(16, 16, 47, 47, CRIM); // лезвие из правого нижнего угла

// ---------- искры в точке скрещения ----------
const sparks = [
  [32, 31, GOLD], [31, 32, GOLD], [33, 32, GOLD], [32, 33, GOLD], [30, 30, WHITE], [34, 34, WHITE], [34, 30, GOLD],
  [30, 34, GOLD], [32, 29, WHITE], [32, 35, WHITE], [28, 32, DIM], [36, 32, DIM],
];
for (const [x, y, c] of sparks) px(x, y, c);

// ---------- PNG-энкодер (RGBA, встроенный zlib) ----------
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
};

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(W, 4);
ihdr[8] = 8; // глубина цвета
ihdr[9] = 6; // RGBA

const raw = Buffer.alloc(W * (W * 4 + 1));
for (let y = 0; y < W; y++) {
  raw[y * (W * 4 + 1)] = 0; // фильтр: без фильтра
  buf.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = process.argv[2] || path.join(__dirname, "..", "icon.png");
fs.writeFileSync(out, png);
console.log(`OK: иконка ${W}×${W} сохранена в ${out}`);
