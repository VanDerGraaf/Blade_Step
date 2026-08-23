#!/usr/bin/env node
/**
 * Blade Step — упаковка в десктопное приложение через Pake (системный WebView).
 *
 * Использование:
 *   node package-pake.cjs          — полная упаковка
 *   node package-pake.cjs --find   — только найти уже собранный файл (быстро)
 *
 * Скрипт сам:
 *   1) ставит npm-зависимости, если их нет,
 *   2) собирает игру локальным vite (vite build --base=./),
 *   3) рисует иконку (tools/make-icon.cjs) и конвертирует в .ico для Windows,
 *   4) запускает pake — установщик появится в output/ (скрипт найдёт и покажет путь).
 *
 * Требования (один раз на машине упаковщика):
 *   - Rust:        https://rustup.rs
 *   - Pake CLI:    npm i -g pake-cli
 *   - Windows:     MSVC C++ Build Tools (Visual Studio Installer → «Разработка
 *                  классических приложений на C++»), WebView2 уже есть в Win10/11.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const distDir = path.join(root, "dist");
const iconPng = path.join(root, "icon.png");
const iconIco = path.join(root, "icon.ico");
const pakeJson = path.join(root, "pake.json");

const log = (s) => console.log("\x1b[36m[pack]\x1b[0m " + s);
const warn = (s) => console.warn("\x1b[33m[pack]\x1b[0m " + s);
const fail = (s) => {
  console.error("\x1b[31m[pack]\x1b[0m " + s);
  process.exit(1);
};

/** Рекурсивный поиск собранных артефактов по всему проекту. */
const isArtifact = (f) => /-setup\.exe$|_x64\.exe$|\.msi$|\.dmg$|\.AppImage$|\.deb$|\.tar\.gz$/.test(f);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "src", "public", "tools"]);
function findArtifacts() {
  const found = [];
  (function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (isArtifact(e.name) || (e.name.endsWith(".exe") && dir.startsWith(path.join(root, "output")))) {
        found.push(path.relative(root, p));
      }
    }
  })(root);
  return found;
}

/** Вывод содержимого папки (на один уровень вглубь) для диагностики. */
function dumpDir(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    warn(`  ${rel}/ — отсутствует`);
    return;
  }
  warn(`  ${rel}/:`);
  try {
    for (const f of fs.readdirSync(abs)) {
      const p = path.join(abs, f);
      warn(`    - ${f}${fs.statSync(p).isDirectory() ? "/" : ""}`);
      if (fs.statSync(p).isDirectory()) {
        for (const g of fs.readdirSync(p).slice(0, 12)) warn(`        - ${g}`);
      }
    }
  } catch {
    /* noop */ }
}

// Быстрый режим: только найти уже собранное, ничего не пересобирая
if (process.argv.includes("--find")) {
  const found = findArtifacts();
  if (found.length) {
    log("Найдено:");
    for (const a of found) log("  → " + a);
  } else {
    warn("Ничего не найдено. Содержимое подозрительных папок:");
    for (const d of ["output", path.join("target", "release", "bundle"), path.join("target", "release")]) dumpDir(d);
  }
  process.exit(0);
}

// ---------- 1. зависимости и сборка ----------
if (!fs.existsSync(path.join(root, "node_modules", "vite"))) {
  warn("Зависимости не установлены (нет node_modules) — выполняю npm install…");
  try {
    execSync("npm install", { cwd: root, stdio: "inherit" });
  } catch {
    fail("npm install не удался. Проверьте сеть и доступ к registry.npmjs.org.");
  }
}

log("Собираю игру: vite build --base=./");
const npmBin = path.join(root, "node_modules", ".bin");
const viteBin = process.platform === "win32" ? "vite.cmd" : "vite";
const viteCmd = fs.existsSync(path.join(npmBin, viteBin)) ? `"${path.join(npmBin, viteBin)}"` : "npx vite";
try {
  execSync(`${viteCmd} build --base=./`, { cwd: root, stdio: "inherit" });
} catch {
  fail("Не удалось собрать игру. Запустите вручную: npm install, затем node package-pake.cjs.");
}
if (!fs.existsSync(path.join(distDir, "index.html"))) fail("dist/index.html не найден после сборки.");
log("Игра собрана.");

// ---------- 2. иконка ----------
if (!fs.existsSync(iconPng)) {
  log("Рисую иконку (tools/make-icon.cjs)…");
  execSync(`node "${path.join(root, "tools", "make-icon.cjs")}" "${iconPng}"`, { stdio: "inherit" });
}
let iconFile = "icon.png";
if (process.platform === "win32") {
  log("Конвертирую иконку в icon.ico (PNG-ICO)…");
  execSync(`node "${path.join(root, "tools", "png2ico.cjs")}" "${iconPng}" "${iconIco}"`, { stdio: "inherit" });
  iconFile = "icon.ico";
}

// ---------- 3. проверка pake ----------
try {
  execSync("pake --version", { stdio: "pipe" });
} catch {
  fail(
    "Команда pake не найдена.\n" +
      "  1) Установите Rust:            https://rustup.rs\n" +
      "  2) Установите Pake CLI:        npm i -g pake-cli\n" +
      "  3) Windows: нужны MSVC C++ Build Tools (компонент Visual Studio Installer).\n" +
      "После этого повторите: node package-pake.cjs"
  );
}

// ---------- 4. запуск pake ----------
const cfg = JSON.parse(fs.readFileSync(pakeJson, "utf8"));
const origIcon = cfg.icon;
cfg.icon = iconFile;
fs.writeFileSync(pakeJson, JSON.stringify(cfg, null, 2) + "\n");

log("Запускаю pake — первый раз он качает крейты и компилирует приложение, это займёт несколько минут…");
let ok = true;
try {
  execSync("pake", { cwd: root, stdio: "inherit" });
} catch {
  ok = false;
}
cfg.icon = origIcon;
fs.writeFileSync(pakeJson, JSON.stringify(cfg, null, 2) + "\n");
if (!ok) {
  warn("pake завершился с ненулевым кодом — всё равно поищу, что собралось…");
}

// ---------- 5. результат ----------
// Разные версии pake кладут артефакты в разные места (output/, output/<name>/,
// target/release/bundle/…). Ищем рекурсивно по всему проекту.
const artifacts = findArtifacts();

if (!artifacts.length) {
  warn("Установщик не найден. Содержимое подозрительных папок:");
  for (const d of ["output", path.join("target", "release", "bundle"), path.join("target", "release")]) dumpDir(d);
  fail(
    "Пришлите вывод выше — по нему станет видно, куда pake положил приложение\n" +
      "(возможно, это просто папка с .exe внутри, а не установщик)."
  );
}
log("Готово! Раздавайте файл(ы):");
for (const a of artifacts) log("  → " + a);
