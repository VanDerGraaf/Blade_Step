#!/usr/bin/env node
/**
 * Blade Step — крошечный relay-сервер для дуэли «по IP».
 * НУЛЕВАЯ зависимость: только встроенные модули Node (http, crypto, os).
 *
 * Запуск (на машине хоста):
 *   node tools/lan-server.cjs            (порт 5199)
 *   node tools/lan-server.cjs 7777       (свой порт)
 *
 * Сервер показывает IP-адреса машины. Оба игрока вводят в игре
 * «IP:порт» (режим «ПО IP») — первый вошедший становится хостом,
 * второй — гостем; сервер сводит их и просто пересылает сообщения.
 *
 * Локальная сеть: работает сразу. Интернет: пробросьте порт на роутере
 * и вводите публичный IP.
 */
"use strict";

const http = require("http");
const crypto = require("crypto");
const os = require("os");

const PORT = Number(process.argv[2]) || 5199;
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"; // RFC 6455

// ------------------------------------------------ адреса машины

function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const c of list || []) {
      if (c.family === "IPv4" && !c.internal) out.push(c.address);
    }
  }
  return out;
}

// ------------------------------------------------ WebSocket-фреймы (RFC 6455, минимум)

function sendFrame(socket, text) {
  const payload = Buffer.from(text, "utf8");
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {
    /* сокет уже мёртв */
  }
}

function sendPong(socket, payload) {
  const len = payload.length;
  const header = Buffer.from([0x8a, len]); // FIN + opcode 0xA, клиентские кадры < 126
  try {
    socket.write(Buffer.concat([header, payload]));
  } catch {
    /* noop */
  }
}

/** Разбирает один клиентский кадр (всегда маскированный). Возвращает null, если данных пока мало. */
function parseFrame(buf) {
  if (buf.length < 2) return null;
  const op = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let off = 2;
  if (len === 126) {
    if (buf.length < 4) return null;
    len = buf.readUInt16BE(2);
    off = 4;
  } else if (len === 127) {
    if (buf.length < 10) return null;
    len = Number(buf.readBigUInt64BE(2));
    off = 10;
  }
  const maskLen = masked ? 4 : 0;
  if (buf.length < off + maskLen + len) return null;
  let payload = buf.subarray(off + maskLen, off + maskLen + len);
  if (masked) {
    const mask = buf.subarray(off, off + 4);
    const un = Buffer.alloc(len);
    for (let i = 0; i < len; i++) un[i] = payload[i] ^ mask[i & 3];
    payload = un;
  }
  return { op, payload, total: off + maskLen + len };
}

// ------------------------------------------------ комната на двоих

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Blade Step relay server. Откройте игру и введите IP:порт этого сервера.\n");
});

let clients = [];

function broadcastPair(msg) {
  for (const c of clients) sendFrame(c.socket, JSON.stringify(msg));
}

function onLeave(client) {
  const i = clients.indexOf(client);
  if (i < 0) return;
  clients.splice(i, 1);
  try {
    client.socket.destroy();
  } catch {
    /* noop */
  }
  if (clients.length === 1) {
    sendFrame(clients[0].socket, JSON.stringify({ k: "peer-left" }));
    console.log("[room] Боец отключился. Второй уведомлён, комната ждёт нового бойца.");
  } else if (clients.length === 0) {
    console.log("[room] Комната пуста — жду бойцов…");
  }
}

server.on("upgrade", (req, socket) => {
  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }
  const accept = crypto.createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
      "Upgrade: websocket\r\n" +
      "Connection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const client = { socket, buf: Buffer.alloc(0) };

  if (clients.length >= 2) {
    sendFrame(socket, JSON.stringify({ k: "full" }));
    socket.end();
    return;
  }

  const isHost = clients.length === 0;
  clients.push(client);
  sendFrame(socket, JSON.stringify({ k: "role", host: isHost }));
  console.log(`[room] Вошёл ${isHost ? "ХОСТ" : "ГОСТЬ"} (${socket.remoteAddress}). В комнате ${clients.length}/2.`);

  if (clients.length === 2) {
    broadcastPair({ k: "peer" });
    console.log("[room] Оба бойца на месте — дуэль начинается!");
  }

  socket.on("data", (chunk) => {
    client.buf = Buffer.concat([client.buf, chunk]);
    for (;;) {
      const frame = parseFrame(client.buf);
      if (!frame) break;
      client.buf = client.buf.subarray(frame.total);
      if (frame.op === 0x8) {
        // close
        onLeave(client);
        return;
      }
      if (frame.op === 0x9) {
        sendPong(socket, frame.payload);
        continue;
      }
      if (frame.op === 0x1) {
        // text → пересылаем второму бойцу
        const text = frame.payload.toString("utf8");
        for (const c of clients) if (c !== client) sendFrame(c.socket, text);
      }
    }
  });
  socket.on("close", () => onLeave(client));
  socket.on("error", () => onLeave(client));
});

// keep-alive: пинг раз в 25 с, чтобы NAT/брандмауэр не рвал тишину
setInterval(() => {
  for (const c of clients) {
    try {
      c.socket.write(Buffer.from([0x89, 0x00])); // ping без полезной нагрузки
    } catch {
      /* noop */
    }
  }
}, 25000);

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`Порт ${PORT} занят. Запустите с другим портом: node tools/lan-server.cjs ${PORT + 1}`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const ips = lanIps();
  console.log("");
  console.log("=== Blade Step · relay-сервер ===");
  console.log(`Порт: ${PORT}`);
  console.log("");
  console.log("Введите в игре (режим «ПО IP»):");
  if (ips.length) {
    for (const ip of ips) console.log(`  ${ip}:${PORT}   ← локальная сеть`);
  } else {
    console.log(`  127.0.0.1:${PORT}   ← только этот ПК (локальные IP не найдены)`);
  }
  console.log("");
  console.log("Интернет: пробросьте порт " + PORT + " на роутере и вводите публичный IP:" + PORT);
  console.log("Сервер сводит двух бойцов и пересылает ходы. Не закрывайте это окно.");
  console.log("");
});
