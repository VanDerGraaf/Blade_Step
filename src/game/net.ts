// P2P networking for duels.
//
// Transport 1 — ONLINE (PeerJS/WebRTC): browsers meet on the free public
//   signaling cloud (0.peerjs.com), then talk directly over a data channel.
// Transport 2 — LOCAL (BroadcastChannel): two tabs of the same browser,
//   zero servers, works offline. Same room-code flow as online.

import Peer, { DataConnection } from "peerjs";

export type NetMsg =
  | { t: "hello"; name: string }
  | { t: "begin" }
  | { t: "hand"; hand: string[] }
  | { t: "plan"; plan: string[] }
  | { t: "rematch" }
  | { t: "quit" };

export interface NetHooks {
  onCode?: (code: string) => void; // host got its room code
  onConnected: (peerName: string, isHost: boolean) => void;
  onMsg: (m: NetMsg) => void;
  onDrop: () => void; // opponent left / connection lost
  onError: (msg: string) => void;
  onRetry?: (attempt: number, of: number) => void; // online signaling retry
}

export type Transport = "online" | "local";

const ID_PREFIX = "bladestep-duel-v2-";
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const PEER_CONFIG = {
  debug: 2, // диагностика PeerJS в консоли DevTools
  config: {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" },
    ],
  },
};

function randCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
  return s;
}

const ONLINE_FAIL_HINT =
  "Не удалось связаться с сервером знакомств PeerJS (0.peerjs.com). " +
  "Причины: нет интернета, сервер недоступен из вашей сети или среда блокирует внешние соединения. " +
  "Попробуйте режим «ДВЕ ВКЛАДКИ» — он работает без серверов.";

type LMsg =
  | { k: "hello-host"; code: string; from: string }
  | { k: "accept"; code: string; to: string }
  | { k: "msg"; code: string; from: string; m: NetMsg }
  | { k: "hb"; code: string; from: string }
  | { k: "bye"; code: string; from: string };

class NetSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private hooks: NetHooks | null = null;
  private bc: BroadcastChannel | null = null;
  private tabId = Math.random().toString(36).slice(2);
  private roomCode = "";
  private guestId: string | null = null;
  private localRole: "host" | "guest" | null = null;
  private localConnected = false;
  private hbTimer = 0;
  private watchTimer = 0;
  private probeTimer = 0;
  private lastSeen = 0;
  private attempts = 0;
  private pendingHostCode = "";
  private pendingJoinCode = "";
  transport: Transport = "online";
  isHost = false;

  get connected(): boolean {
    return this.transport === "local" ? this.localConnected : this.conn?.open ?? false;
  }

  setHooks(hooks: NetHooks) {
    this.hooks = hooks;
  }

  // ------------------------------------------------ online (PeerJS)

  hostOnline() {
    this.reset();
    this.transport = "online";
    this.isHost = true;
    this.attempts = 0;
    this.openHost(null);
  }

  joinOnline(code: string) {
    this.reset();
    this.transport = "online";
    this.isHost = false;
    this.attempts = 0;
    this.pendingJoinCode = code.trim().toUpperCase();
    this.openJoin();
  }

  private openHost(code: string | null) {
    this.pendingHostCode = code ?? randCode();
    this.createPeer(ID_PREFIX + this.pendingHostCode.toLowerCase(), () => {
      this.attempts = 0;
      this.hooks?.onCode?.(this.pendingHostCode);
      this.peer!.on("connection", (conn) => {
        if (this.conn?.open) {
          conn.close(); // комната занята
          return;
        }
        this.bindConn(conn);
      });
    });
  }

  private openJoin() {
    this.createPeer(undefined, () => {
      this.attempts = 0;
      const conn = this.peer!.connect(ID_PREFIX + this.pendingJoinCode.toLowerCase(), { reliable: true });
      this.bindConn(conn);
    });
  }

  private createPeer(id: string | undefined, onOpen: () => void) {
    try {
      this.peer?.destroy();
    } catch { /* noop */ }
    this.peer = id ? new Peer(id, PEER_CONFIG) : new Peer(PEER_CONFIG);
    this.peer.on("open", onOpen);
    this.peer.on("disconnected", () => {
      try {
        this.peer?.reconnect();
      } catch { /* noop */ }
    });
    this.peer.on("error", (err) => this.handlePeerError(err as Error & { type?: string }));
  }

  private bindConn(conn: DataConnection) {
    this.conn = conn;
    const openTimeout = window.setTimeout(() => {
      if (!conn.open) {
        this.hooks?.onError("Соперник не ответил вовремя. Проверьте код комнаты.");
        this.teardown();
      }
    }, 15000);
    conn.on("open", () => {
      window.clearTimeout(openTimeout);
      this.send({ t: "hello", name: "Ронин" });
      this.hooks?.onConnected("Соперник", this.isHost);
    });
    conn.on("data", (data) => {
      const m = data as NetMsg;
      if (m && typeof m === "object" && "t" in m) this.hooks?.onMsg(m);
    });
    conn.on("close", () => {
      this.hooks?.onDrop();
      this.teardown();
    });
    conn.on("error", () => {
      this.hooks?.onDrop();
      this.teardown();
    });
  }

  private handlePeerError(err: Error & { type?: string }) {
    const t = err?.type ?? "";
    // код комнаты уже занят — пересоздаём с новым кодом
    if (t === "unavailable-id" && this.isHost && !this.conn?.open) {
      this.hooks?.onRetry?.(1, 3);
      this.openHost(null);
      return;
    }
    const retriable = ["network", "server-error", "socket-error", "socket-closed"];
    if (retriable.includes(t) && this.attempts < 3 && !this.conn?.open) {
      this.attempts++;
      this.hooks?.onRetry?.(this.attempts, 3);
      window.setTimeout(() => {
        if (this.transport !== "online") return;
        if (this.isHost) this.openHost(this.pendingHostCode);
        else this.openJoin();
      }, 900 * this.attempts);
      return;
    }
    if (t === "peer-unavailable") {
      this.hooks?.onError("Комната с таким кодом не найдена. Проверьте код.");
    } else {
      this.hooks?.onError(ONLINE_FAIL_HINT);
    }
    this.softReset();
  }

  // ------------------------------------------------ local (BroadcastChannel)

  hostLocal() {
    this.reset();
    if (typeof BroadcastChannel === "undefined") {
      this.hooks?.onError("Локальный режим не поддерживается этим браузером.");
      return;
    }
    this.transport = "local";
    this.isHost = true;
    this.localRole = "host";
    this.roomCode = randCode();
    this.openChannel();
    this.hooks?.onCode?.(this.roomCode);
  }

  joinLocal(code: string) {
    this.reset();
    if (typeof BroadcastChannel === "undefined") {
      this.hooks?.onError("Локальный режим не поддерживается этим браузером.");
      return;
    }
    this.transport = "local";
    this.isHost = false;
    this.localRole = "guest";
    this.roomCode = code.trim().toUpperCase();
    this.openChannel();
    // стучимся в комнату, пока хост не примет
    this.lastSeen = performance.now();
    this.bc?.postMessage({ k: "hello-host", code: this.roomCode, from: this.tabId } satisfies LMsg);
    this.probeTimer = window.setInterval(() => {
      if (this.localConnected) {
        window.clearInterval(this.probeTimer);
        return;
      }
      if (performance.now() - this.lastSeen > 6000) {
        window.clearInterval(this.probeTimer);
        this.hooks?.onError(
          "Комната не найдена на этом устройстве. Откройте вторую вкладку, создайте комнату и введите её код."
        );
        this.teardown();
        return;
      }
      this.bc?.postMessage({ k: "hello-host", code: this.roomCode, from: this.tabId } satisfies LMsg);
    }, 500);
  }

  private openChannel() {
    this.bc = new BroadcastChannel("bladestep-local-v1");
    this.bc.onmessage = (ev) => this.onLocal(ev.data as LMsg);
    this.hbTimer = window.setInterval(() => {
      if (!this.localConnected) return;
      this.bc?.postMessage({ k: "hb", code: this.roomCode, from: this.tabId } satisfies LMsg);
    }, 1200);
    this.watchTimer = window.setInterval(() => {
      if (this.localConnected && performance.now() - this.lastSeen > 4500) {
        this.hooks?.onDrop();
        this.teardown();
      }
    }, 1000);
  }

  private onLocal(m: LMsg) {
    if (!m || m.code !== this.roomCode) return;
    switch (m.k) {
      case "hello-host":
        if (this.localRole === "host" && !this.guestId) {
          this.guestId = m.from;
          this.localConnected = true;
          this.lastSeen = performance.now();
          this.bc?.postMessage({ k: "accept", code: this.roomCode, to: m.from } satisfies LMsg);
          this.send({ t: "hello", name: "Ронин" });
          this.hooks?.onConnected("Соперник", true);
        }
        break;
      case "accept":
        if (this.localRole === "guest" && m.to === this.tabId) {
          this.localConnected = true;
          this.lastSeen = performance.now();
          this.send({ t: "hello", name: "Ронин" });
          this.hooks?.onConnected("Соперник", false);
        }
        break;
      case "msg":
        if (this.localConnected) {
          this.lastSeen = performance.now();
          this.hooks?.onMsg(m.m);
        }
        break;
      case "hb":
        if (this.localConnected) this.lastSeen = performance.now();
        break;
      case "bye":
        if (this.localConnected) {
          this.hooks?.onDrop();
          this.teardown();
        }
        break;
    }
  }

  // ------------------------------------------------ common

  send(m: NetMsg) {
    if (this.transport === "local") {
      if (this.bc && this.localConnected)
        this.bc.postMessage({ k: "msg", code: this.roomCode, from: this.tabId, m } satisfies LMsg);
    } else if (this.conn?.open) {
      this.conn.send(m);
    }
  }

  private softReset() {
    try {
      this.peer?.destroy();
    } catch { /* noop */ }
    this.peer = null;
    this.conn = null;
  }

  private reset() {
    this.teardown();
  }

  teardown() {
    if (this.bc) {
      try {
        if (this.localConnected)
          this.bc.postMessage({ k: "bye", code: this.roomCode, from: this.tabId } satisfies LMsg);
        this.bc.close();
      } catch { /* noop */ }
    }
    window.clearInterval(this.hbTimer);
    window.clearInterval(this.watchTimer);
    window.clearInterval(this.probeTimer);
    try {
      this.conn?.close();
    } catch { /* noop */ }
    try {
      this.peer?.destroy();
    } catch { /* noop */ }
    this.bc = null;
    this.conn = null;
    this.peer = null;
    this.guestId = null;
    this.localRole = null;
    this.localConnected = false;
    this.attempts = 0;
  }
}

export const net = new NetSession();
