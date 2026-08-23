// P2P networking for duels — zero third-party signaling services.
//
// Transport "online" — pure WebRTC (no PeerJS):
//   host creates an INVITE (SDP offer with bundled ICE candidates, compressed),
//   hands it to a friend through any messenger; the friend returns an ANSWER
//   (SDP answer). Two pastes — and the data channel runs straight between the
//   two browsers. Works over the internet (STUN for NAT traversal).
// Transport "local" — BroadcastChannel: two tabs of the same browser, offline.

export type NetMsg =
  | { t: "hello"; name: string }
  | { t: "begin" }
  | { t: "hand"; hand: string[] }
  | { t: "plan"; plan: string[] }
  | { t: "rematch" }
  | { t: "quit" };

export interface NetHooks {
  onCode?: (code: string) => void; // local mode: room code
  onInvite?: (code: string) => void; // online: host invite ready
  onAnswer?: (code: string) => void; // online: guest answer ready
  onConnected: (peerName: string, isHost: boolean) => void;
  onMsg: (m: NetMsg) => void;
  onDrop: () => void;
  onError: (msg: string) => void;
}

export type Transport = "online" | "local";

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

function randCode(): string {
  let s = "";
  for (let i = 0; i < 4; i++) s += ABC[Math.floor(Math.random() * ABC.length)];
  return s;
}

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

type LMsg =
  | { k: "hello-host"; code: string; from: string }
  | { k: "accept"; code: string; to: string }
  | { k: "msg"; code: string; from: string; m: NetMsg }
  | { k: "hb"; code: string; from: string }
  | { k: "bye"; code: string; from: string };

class NetSession {
  private hooks: NetHooks | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private connectedFired = false;
  private dcTimer = 0;

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

  transport: Transport = "online";
  isHost = false;

  get connected(): boolean {
    return this.transport === "local" ? this.localConnected : this.connectedFired;
  }

  setHooks(hooks: NetHooks) {
    this.hooks = hooks;
  }

  // ------------------------------------------------ online (pure WebRTC)

  /** Хост: создаём приглашение (SDP offer). */
  hostOnline() {
    this.reset();
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
    this.reset();
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
    dc.onopen = () => {
      this.fireConnected();
      this.send({ t: "hello", name: "Ронин" });
    };
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

  private fireConnected() {
    if (this.connectedFired) return;
    this.connectedFired = true;
    this.hooks?.onConnected("Соперник", this.isHost);
  }

  private drop() {
    if (!this.connectedFired && !this.pc) return;
    this.hooks?.onDrop();
    this.teardown();
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
      if (this.localConnected) {
        this.bc?.postMessage({ k: "msg", code: this.roomCode, from: this.tabId, m } satisfies LMsg);
      }
      return;
    }
    if (this.dc?.readyState === "open") this.dc.send(JSON.stringify(m));
  }

  private softReset() {
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

  private reset() {
    this.teardown();
  }

  teardown() {
    if (this.transport === "local" && this.bc) {
      if (this.localConnected) {
        this.bc.postMessage({ k: "bye", code: this.roomCode, from: this.tabId } satisfies LMsg);
      }
      window.clearInterval(this.hbTimer);
      window.clearInterval(this.watchTimer);
      window.clearInterval(this.probeTimer);
      try {
        this.bc.close();
      } catch {
        /* noop */
      }
      this.bc = null;
      this.localConnected = false;
      this.guestId = null;
      this.localRole = null;
      this.roomCode = "";
    }
    this.softReset();
  }
}

export const net = new NetSession();
