// P2P networking for duels — zero third-party services.
//
// Transport "online" — pure WebRTC (no servers at all):
//   host creates an INVITE (SDP offer with bundled ICE candidates, compressed),
//   hands it to a friend through any messenger; the friend returns an ANSWER
//   (SDP answer). Two pastes — and the data channel runs straight between the
//   two browsers. Works over the internet (STUN for NAT traversal).
// Transport "lan" — connect by IP through your own tiny relay server
//   (tools/lan-server.cjs, zero dependencies, run with plain Node). Both
//   players point the game at IP:PORT; the server pairs them and relays
//   messages. Best on one LAN or with a port-forward; ideal for the packaged
//   desktop app where two windows are separate processes.

export type NetMsg =
  | { t: "hello"; name: string }
  | { t: "begin" }
  | { t: "look"; look: string }
  | { t: "hand"; hand: string[] }
  | { t: "plan"; plan: string[] }
  | { t: "rematch" }
  | { t: "lobby" }
  | { t: "quit" };

export interface NetHooks {
  onInvite?: (code: string) => void; // online: host invite ready
  onAnswer?: (code: string) => void; // online: guest answer ready
  onConnected: (peerName: string, isHost: boolean) => void;
  onMsg: (m: NetMsg) => void;
  onDrop: () => void;
  onError: (msg: string) => void;
}

export type Transport = "online" | "lan";

export const HAS_WEBRTC =
  typeof RTCPeerConnection !== "undefined" && typeof window !== "undefined" && !!window.isSecureContext;

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

// ------------------------------------------------ SDP <-> short text code

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64ToBytes(b: string): Uint8Array {
  const s = atob(b.replace(/-/g, "+").replace(/_/g, "/"));
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** Сжимаем SDP (deflate), чтобы код влезал в сообщение мессенджера. */
async function pack(text: string): Promise<string> {
  const CS = (globalThis as unknown as { CompressionStream?: new (f: string) => unknown }).CompressionStream;
  if (!CS) return "R" + bytesToB64(new TextEncoder().encode(text));
  try {
    const cs = new CS("deflate");
    const out = new Blob([text]).stream().pipeThrough(cs as never);
    const buf = await new Response(out).arrayBuffer();
    return "C" + bytesToB64(new Uint8Array(buf));
  } catch {
    return "R" + bytesToB64(new TextEncoder().encode(text));
  }
}

async function unpack(code: string): Promise<string> {
  const clean = code.replace(/[^A-Za-z0-9+/_-]/g, "");
  if (clean.length < 8) throw new Error("too short");
  const kind = clean[0];
  const bytes = b64ToBytes(clean.slice(1));
  const DS = (globalThis as unknown as { DecompressionStream?: new (f: string) => unknown }).DecompressionStream;
  if (kind === "C" && DS) {
    const ds = new DS("deflate");
    const out = new Blob([bytes.buffer as ArrayBuffer]).stream().pipeThrough(ds as never);
    return await new Response(out).text();
  }
  return new TextDecoder().decode(bytes);
}

/** Ждём, пока все ICE-кандидаты соберутся в SDP (иначе код не сработает). */
function waitIce(pc: RTCPeerConnection): Promise<void> {
  return new Promise((res) => {
    if (pc.iceGatheringState === "complete") return res();
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        res();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    window.setTimeout(res, 4000); // fallback: отправим, что успели
  });
}

// ------------------------------------------------ lan server protocol

type LanSrv =
  | { k: "role"; host: boolean }
  | { k: "peer" }
  | { k: "peer-left" }
  | { k: "full" };

class NetSession {
  private hooks: NetHooks | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private connectedFired = false;
  private dcTimer = 0;

  private lanWs: WebSocket | null = null;
  private lanFailed = false;

  transport: Transport = "online";
  isHost = false;

  get connected(): boolean {
    return this.connectedFired;
  }

  setHooks(hooks: NetHooks) {
    this.hooks = hooks;
  }

  // ------------------------------------------------ online (pure WebRTC)

  /** Хост: создаём приглашение (SDP offer). */
  hostOnline() {
    this.teardown();
    this.transport = "online";
    this.isHost = true;
    const pc = this.newPc();
    this.dc = pc.createDataChannel("duel", { ordered: true });
    this.bindDc(this.dc);
    (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIce(pc);
      if (!pc.localDescription) throw new Error("no offer");
      const code = await pack(JSON.stringify(pc.localDescription));
      this.hooks?.onInvite?.(code);
    })().catch(() => this.hooks?.onError("Не удалось создать приглашение. Попробуйте ещё раз."));
  }

  /** Хост: вставляем ответ друга (SDP answer) — после этого канал откроется. */
  acceptAnswer(code: string) {
    if (!this.pc || !this.isHost) return;
    const pc = this.pc;
    (async () => {
      const desc = JSON.parse(await unpack(code)) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(desc);
    })().catch(() =>
      this.hooks?.onError("Код ответа не читается. Вставьте его целиком, без лишних символов.")
    );
  }

  /** Гость: готовимся принять приглашение. */
  joinOnline() {
    this.teardown();
    this.transport = "online";
    this.isHost = false;
    const pc = this.newPc();
    pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.bindDc(e.channel);
    };
  }

  /** Гость: вставляем приглашение хоста, создаём ответ. */
  createAnswer(invite: string) {
    if (!this.pc || this.isHost) return;
    const pc = this.pc;
    (async () => {
      const desc = JSON.parse(await unpack(invite)) as RTCSessionDescriptionInit;
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIce(pc);
      if (!pc.localDescription) throw new Error("no answer");
      const code = await pack(JSON.stringify(pc.localDescription));
      this.hooks?.onAnswer?.(code);
    })().catch(() =>
      this.hooks?.onError("Код приглашения не читается. Вставьте его целиком, без лишних символов.")
    );
  }

  private newPc(): RTCPeerConnection {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    this.pc = pc;
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this.fireConnected();
      else if (s === "failed" || s === "closed") this.drop();
      else if (s === "disconnected") {
        window.clearTimeout(this.dcTimer);
        this.dcTimer = window.setTimeout(() => {
          if (pc.connectionState === "disconnected") this.drop();
        }, 4000);
      }
    };
    return pc;
  }

  private bindDc(dc: RTCDataChannel) {
    dc.onopen = () => this.fireConnected();
    dc.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      try {
        const m = JSON.parse(e.data) as NetMsg;
        if (m && typeof m === "object" && "t" in m) this.hooks?.onMsg(m);
      } catch {
        /* noop */
      }
    };
    dc.onclose = () => {
      if (this.connectedFired) this.drop();
    };
  }

  // ------------------------------------------------ lan (connect by IP)

  /** Подключение к своему relay-серверу: «192.168.1.5:5199» или «ws://…». */
  lanConnect(addrRaw: string) {
    this.teardown();
    this.transport = "lan";
    this.isHost = false; // роль назначит сервер (первый вошедший — хост)
    this.lanFailed = false;
    const clean = addrRaw.trim().replace(/^wss?:\/\//i, "").replace(/\/+$/, "");
    if (!clean || !/^[^\s:/]+(:\d+)?$/.test(clean)) {
      this.hooks?.onError("Введите адрес вида 192.168.1.5:5199 (его показывает lan-server).");
      return;
    }
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://${clean}`);
    } catch {
      this.hooks?.onError("Неверный адрес. Пример: 192.168.1.5:5199");
      return;
    }
    this.lanWs = ws;

    const failTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN && !this.connectedFired) {
        this.lanFailed = true;
        this.hooks?.onError(
          "Не удалось подключиться. Проверьте адрес, что сервер запущен (node tools/lan-server.cjs) и брандмауэр не блокирует порт."
        );
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    }, 8000);

    ws.onmessage = (e) => {
      if (typeof e.data !== "string") return;
      let raw: unknown;
      try {
        raw = JSON.parse(e.data);
      } catch {
        return;
      }
      const m = raw as LanSrv | NetMsg;
      if ("k" in m) {
        if (m.k === "role") this.isHost = m.host;
        else if (m.k === "peer") {
          window.clearTimeout(failTimer);
          this.fireConnected();
        } else if (m.k === "peer-left") this.drop();
        else if (m.k === "full") {
          this.lanFailed = true;
          this.hooks?.onError("Комната уже занята двумя бойцами. Дождитесь конца их дуэли.");
          try {
            ws.close();
          } catch {
            /* noop */
          }
        }
        return;
      }
      if (m && typeof m === "object" && "t" in m) this.hooks?.onMsg(m as NetMsg);
    };
    ws.onclose = () => {
      window.clearTimeout(failTimer);
      if (this.connectedFired) this.drop();
      else if (!this.lanFailed) {
        this.lanFailed = true;
        this.hooks?.onError("Сервер закрыл соединение.");
      }
    };
    ws.onerror = () => {
      /* onclose доложит */
    };
  }

  // ------------------------------------------------ common

  private fireConnected() {
    if (this.connectedFired) return;
    this.connectedFired = true;
    this.send({ t: "hello", name: "Ронин" });
    this.hooks?.onConnected("Соперник", this.isHost);
  }

  private drop() {
    if (!this.connectedFired) return;
    this.hooks?.onDrop();
    this.teardown();
  }

  send(m: NetMsg) {
    if (this.transport === "lan") {
      if (this.lanWs?.readyState === WebSocket.OPEN) this.lanWs.send(JSON.stringify(m));
      return;
    }
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(m));
  }

  teardown() {
    const ws = this.lanWs;
    this.lanWs = null;
    if (ws) {
      ws.onclose = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    window.clearTimeout(this.dcTimer);
    try {
      this.dc?.close();
    } catch {
      /* noop */
    }
    try {
      this.pc?.close();
    } catch {
      /* noop */
    }
    this.dc = null;
    this.pc = null;
    this.connectedFired = false;
  }
}

export const net = new NetSession();
