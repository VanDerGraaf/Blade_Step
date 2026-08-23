#!/usr/bin/env node
/**
 * Blade Step — упаковка в десктопное приложение (Neutralino.js, zero-install).
 *
 * Использование:
 *   node package.cjs            — собрать все доступные платформы
 *   node package.cjs win        — только Windows
 *   node package.cjs linux      — только Linux x64
 *   node package.cjs mac_arm64  — только macOS (Apple Silicon)
 *   node package.cjs win linux  — несколько сразу
 *
 * Скрипт: 1) собирает игру (vite build --base=./),
 *         2) скачивает бинарник Neutralino в bin/ (если его ещё нет),
 *         3) складывает готовую папку в release/BladeStep-<платформа>/.
 * Результат можно заархивировать и отправить другу — он просто кликнет.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const NEU_VERSION = "5.6.0";
const DOWNLOAD = `https://github.com/neutralinojs/neutralinojs/releases/download/v${NEU_VERSION}`;

const PLATFORMS = {
  win: { binary: "neutralino-win_x64.exe", folder: "BladeStep-win", exe: "BladeStep.exe" },
  linux: { binary: "neutralino-linux_x64", folder: "BladeStep-linux", exe: "BladeStep" },
  mac_x64: { binary: "neutralino-macos_x64", folder: "BladeStep-macos", exe: "BladeStep" },
  mac_arm64: { binary: "neutralino-macos_arm64", folder: "BladeStep-macos-arm64", exe: "BladeStep" },
};

const root = __dirname;
const binDir = path.join(root, "bin");
const releaseDir = path.join(root, "release");
const distDir = path.join(root, "dist");

function log(s) {
  console.log("\x1b[36m[pack]\x1b[0m " + s);
}
function warn(s) {
  console.warn("\x1b[33m[pack]\x1b[0m " + s);
}
function fail(s) {
  console.error("\x1b[31m[pack]\x1b[0m " + s);
  process.exit(1);
}

// ---------- 0. платформы ----------
const args = process.argv.slice(2).filter(Boolean);
const targets = (args.length ? args : Object.keys(PLATFORMS)).map((a) => a.toLowerCase());
for (const t of targets) {
  if (!PLATFORMS[t]) fail(`Неизвестная платформа «${t}». Доступны: ${Object.keys(PLATFORMS).join(", ")}`);
}

// ---------- 1. сборка игры ----------
log("Собираю игру: vite build --base=./");
try {
  execSync("npx vite build --base=./", { cwd: root, stdio: "inherit" });
} catch {
  fail("Не удалось собрать игру. Убедитесь, что зависимости установлены (npm install выполнен один раз).");
}
if (!fs.existsSync(path.join(distDir, "index.html"))) fail("dist/index.html не найден после сборки.");

// ---------- 2. бинарники Neutralino ----------
async function ensureBinary(name) {
  const dest = path.join(binDir, name);
  if (fs.existsSync(dest)) return dest;
  fs.mkdirSync(binDir, { recursive: true });
  const url = `${DOWNLOAD}/${name}`;
  log(`Скачиваю ${name} (~4 МБ)…`);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(dest, buf);
    log(`Готово: bin/${name}`);
    return dest;
  } catch (e) {
    warn(`Не удалось скачать автоматически (${e.message ?? e}).`);
    warn(`Скачайте вручную: ${url}`);
    warn(`и положите файл в папку bin/ под именем ${name}`);
    return null;
  }
}

// ---------- 3. сборка папок ----------
(async () => {
  let done = 0;
  for (const t of targets) {
    const p = PLATFORMS[t];
    const src = await ensureBinary(p.binary);
    if (!src) continue;

    const out = path.join(releaseDir, p.folder);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });

    const exePath = path.join(out, p.exe);
    fs.copyFileSync(src, exePath);
    fs.chmodSync(exePath, 0o755);
    fs.copyFileSync(path.join(root, "neutralino.config.json"), path.join(out, "neutralino.config.json"));
    fs.cpSync(distDir, path.join(out, "dist"), { recursive: true });

    log(`Собрано: release/${p.folder}/ → запустите «${p.exe}»`);
    done++;
  }

  console.log("");
  if (!done) {
    fail("Ни одна платформа не собрана — скачайте бинарники вручную (ссылки выше).");
  }
  log(`Готово! Папки в release/. Заархивируйте любую (zip) и отправьте другу —`);
  log("ему не нужны ни Node, ни npm, ни браузер: распаковал и кликнул.");
  if (process.platform === "win32" && targets.includes("win")) {
    warn("Windows может спросить «Запустить неизвестное приложение?» — нажмите «Подробнее → Выполнить в любом случае».");
  }
  if (targets.some((t) => t.startsWith("mac"))) {
    warn("macOS: первый запуск через ПКМ → «Открыть» (Gatekeeper).");
  }
  if (targets.includes("linux")) {
    warn("Linux: если файл не исполняемый — chmod +x BladeStep.");
  }
})();
