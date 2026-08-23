// P2P networking via PeerJS (WebRTC + free public signaling broker).
// Host creates a room with a short code; guest joins by that code.

import Peer, { DataConnection } from "peerjs";

export type NetMsg =
  | { t: "hello"; name: string }
  | { t: "begin" }
  | { t: "hand"; hand: string[] }
  | { t: "plan"; plan: string[] }
  | { t: "rematch" }
  | { t: "quit" };

export interface NetHooks {
  onCode: (code: string) => void; // host got its room code
  onConnected: (peerName: string, isHost: boolean) => void;
  onMsg: (m: NetMsg) => void;
  onDrop: () => void; // opponent left / connection lost
  onError: (msg: string) => void;
}

const ID_PREFIX = "bladestep-duel-";

function randCode(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

class NetSession {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private hooks: NetHooks | null = null;
  isHost = false;

  get connected() {
    return this.conn?.open ?? false;
  }

  /** Регистрация обработчиков событий (можно обновлять в любой момент). */
  setHooks(hooks: NetHooks) {
    this.hooks = hooks;
  }

  host() {
    this.teardown();
    this.isHost = true;
    const code = randCode();
    this.peer = new Peer(ID_PREFIX + code.toLowerCase());
    this.peer.on("open", () => this.hooks?.onCode(code));
    this.peer.on("error", (err) => this.handleError(err));
    this.peer.on("connection", (conn) => {
      if (this.conn?.open) {
        conn.close(); // room is full
        return;
      }
      this.bind(conn);
    });
  }

  join(code: string) {
    this.teardown();
    this.isHost = false;
    this.peer = new Peer();
    this.peer.on("error", (err) => this.handleError(err));
    this.peer.on("open", () => {
      const conn = this.peer!.connect(ID_PREFIX + code.trim().toLowerCase(), { reliable: true });
      this.bind(conn);
    });
  }

  private bind(conn: DataConnection) {
    this.conn = conn;
    conn.on("open", () => {
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

  private handleError(err: Error & { type?: string }) {
    const t = err?.type;
    if (t === "unavailable-id" || t === "network" || t === "server-error" || t === "socket-error") {
      this.hooks?.onError("Не удалось связаться с сервером знакомств PeerJS. Проверьте сеть и попробуйте ещё раз.");
    } else if (t === "peer-unavailable") {
      this.hooks?.onError("Комната с таким кодом не найдена. Проверьте код.");
    } else {
      this.hooks?.onError("Сетевая ошибка: " + (t ?? err?.message ?? "неизвестно"));
    }
    this.teardown();
  }

  send(m: NetMsg) {
    if (this.conn?.open) this.conn.send(m);
  }

  teardown() {
    try {
      this.conn?.close();
    } catch {
      /* noop */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* noop */
    }
    this.conn = null;
    this.peer = null;
  }
}

export const net = new NetSession();
