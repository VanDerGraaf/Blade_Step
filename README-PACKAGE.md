# Blade Step — десктопная упаковка (Neutralino.js)

Игра упаковывается в обычную программу: **один исполняемый файл + папка с игрой**.
Другу не нужны Node, npm, браузер или установка — он распаковывает архив и кликает.

## Быстрый старт (на компьютере упаковщика)

Требуется только Node.js (тот же, что уже стоит для разработки).

```bash
node package.cjs            # все платформы
node package.cjs win        # только Windows
node package.cjs linux      # только Linux x64
node package.cjs mac_arm64  # macOS Apple Silicon
node package.cjs win linux  # несколько сразу
```

Скрипт сам:
1. ставит зависимости (`npm install`), если в папке ещё нет `node_modules` —
   свежую копию проекта можно упаковывать сразу, ничего не делая вручную;
2. собирает игру **локальным** vite проекта с относительными путями (`--base=./`);
3. скачивает бинарник Neutralino v5.6.0 (~4 МБ) в папку `bin/`;
4. складывает готовую папку в `release/BladeStep-<платформа>/`.

> Важно: не запускайте `npx vite build` вручную в свежей папке без `node_modules` —
> npx скачает чужой vite, который не найдёт плагины проекта. `node package.cjs` делает всё правильно.

Результат — папка вида:

```
release/BladeStep-win/
  BladeStep.exe             ← двойной клик = игра
  neutralino.config.json
  dist/                     ← сборка игры
```

Заархивируйте её в zip и отправьте. Всё.

## Если скачивание не сработало

Скачайте вручную и положите в `bin/`:

- Windows: https://github.com/neutralinojs/neutralinojs/releases/download/v5.6.0/neutralino-win_x64.exe
- Linux x64: https://github.com/neutralinojs/neutralinojs/releases/download/v5.6.0/neutralino-linux_x64
- Linux ARM: https://github.com/neutralinojs/neutralinojs/releases/download/v5.6.0/neutralino-linux_arm64
- macOS Intel: https://github.com/neutralinojs/neutralinojs/releases/download/v5.6.0/neutralino-macos_x64
- macOS Apple Silicon: https://github.com/neutralinojs/neutralinojs/releases/download/v5.6.0/neutralino-macos_arm64

Затем повторите `node package.cjs <платформа>` — скрипт найдёт файл в `bin/` и пропустит скачивание.

## Запуск прямо из проекта (без release/)

1. Скопируйте бинарник из `bin/` в корень проекта (рядом с `neutralino.config.json`),
   переименовав по имени платформы: `neutralino-win_x64.exe` / `neutralino-linux_x64` / …
2. Если нет `node_modules` — один раз выполните `npm install`.
3. Соберите игру: `npx vite build --base=./` (уже с установленными зависимостями).
4. Запустите бинарник из корня — он подхватит конфиг и откроет `dist/`.

## Первый запуск у получателя

- **Windows:** SmartScreen может спросить «Неизвестное приложение» → *Подробнее → Выполнить в любом случае* (файл не подписан).
- **macOS:** первый раз через правый клик → «Открыть» (Gatekeeper).
- **Linux:** если нет прав — `chmod +x BladeStep`.

## Мультиплеер в десктопной версии

Работает ровно как в браузере: обмен двумя кодами через WebRTC, без серверов.
Режим «Две вкладки» тоже работает (BroadcastChannel доступен в веб-вью).

## Как это устроено

Neutralino — исполняемый файл ~4 МБ с системным веб-вью (WebView2 / WebKitGTK / WKWebView).
Он читает `neutralino.config.json`, открывает нативное окно «Blade Step» (1280×820,
минимум 960×640, по центру экрана) и грузит в него `dist/index.html`.
Никаких фоновых процессов, установки в систему или автозапуска — чистый portable.
