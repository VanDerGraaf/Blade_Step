#!/usr/bin/env node
/**
 * Blade Step — упаковка в десктопное приложение через Pake (системный WebView).
 *
 * Использование:
 *   node package-pake.cjs
 *
 * Скрипт сам:
 *   1) ставит npm-зависимости, если их нет,
 *   2) собирает игру локальным vite (vite build --base=./),
 *   3) рисует иконку (tools/make-icon.cjs) и конвертирует в .ico для Windows,
 *   4) запускает pake — на выходе один файл-установщик в корне проекта.
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
  fail(
    "pake завершился с ошибкой. Частые причины:\n" +
      "  - нет Rust (rustup.rs) или cargo не в PATH;\n" +
      "  - Windows: нет MSVC C++ Build Tools (ошибка про link.exe);\n" +
      "  - сеть: cargo не смог скачать крейты с crates.io."
  );
}

// ---------- 5. результат ----------
// pake кладёт артефакты в output/, но проверим и корень — на всякий случай
const outDir = path.join(root, "output");
const isArtifact = (f) => /-setup\.exe$|\.msi$|\.dmg$|\.AppImage$|\.deb$|\.tar\.gz$/.test(f);
const artifacts = [
  ...(fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(isArtifact).map((f) => path.join("output", f)) : []),
  ...fs.readdirSync(root).filter(isArtifact),
];
if (!artifacts.length)
  fail(
    "pake отработал, но файл-установщик не найден ни в output/, ни в корне.\n" +
      "  Посмотрите вручную: папка «output» рядом с pake.json."
  );
log("Готово! Раздавайте файл(ы):");
for (const a of artifacts) log("  → " + a);
