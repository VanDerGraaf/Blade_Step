#!/usr/bin/env node
/**
 * Оборачивает PNG в ICO (PNG-compressed ICO — поддерживается Windows Vista+).
 * Нужно для Pake/Tauri на Windows: сборщик принимает .ico.
 *
 * Использование: node tools/png2ico.cjs icon.png icon.ico
 */
const fs = require("fs");

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Использование: node tools/png2ico.cjs <вход.png> <выход.ico>");
  process.exit(1);
}

const png = fs.readFileSync(input);
if (png[0] !== 0x89 || png[1] !== 0x50 || png[2] !== 0x4e || png[3] !== 0x47) {
  console.error(`Файл «${input}» не является PNG.`);
  process.exit(1);
}

// реальные размеры из IHDR (байты 16..23)
const w = png.readUInt32BE(16);
const h = png.readUInt32BE(20);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: 1 = icon
header.writeUInt16LE(1, 4); // одно изображение

const entry = Buffer.alloc(16);
entry.writeUInt8(w > 255 ? 0 : w, 0); // 0 означает «256 и больше»
entry.writeUInt8(h > 255 ? 0 : h, 1);
entry.writeUInt8(0, 2); // палитра отсутствует
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // цветовые плоскости
entry.writeUInt16LE(32, 6); // бит на пиксель
entry.writeUInt32LE(png.length, 8); // размер данных
entry.writeUInt32LE(22, 12); // смещение данных (6 + 16)

fs.writeFileSync(output, Buffer.concat([header, entry, png]));
console.log(`OK: ${output} (${w}x${h}, PNG-ICO)`);
