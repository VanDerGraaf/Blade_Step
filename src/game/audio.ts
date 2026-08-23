// Tiny WebAudio synth — all sfx are generated, no assets.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function initAudio() {
  if (ctx) {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return;
  }
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    startMusic();
  } catch {
    ctx = null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
}
export function isMuted() {
  return muted;
}

interface ToneOpts {
  type?: OscillatorType;
  f0: number;
  f1?: number;
  dur: number;
  vol?: number;
  delay?: number;
}

function tone({ type = "square", f0, f1, dur, vol = 0.2, delay = 0 }: ToneOpts) {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  if (f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  dur: number;
  vol?: number;
  type?: BiquadFilterType;
  f0?: number;
  f1?: number;
  delay?: number;
  q?: number;
}

function noise({ dur, vol = 0.2, type = "highpass", f0 = 1200, f1, delay = 0, q = 1 }: NoiseOpts) {
  if (!ctx || !master || muted) return;
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(f0, t0);
  if (f1) filter.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  select: () => tone({ f0: 660, f1: 990, dur: 0.07, vol: 0.12 }),
  slot: () => {
    tone({ f0: 300, f1: 180, dur: 0.08, vol: 0.16, type: "triangle" });
    noise({ dur: 0.05, vol: 0.08, f0: 2400 });
  },
  back: () => tone({ f0: 420, f1: 260, dur: 0.07, vol: 0.1 }),
  fight: () => {
    tone({ f0: 220, f1: 440, dur: 0.14, vol: 0.2 });
    tone({ f0: 330, f1: 660, dur: 0.18, vol: 0.18, delay: 0.06 });
    noise({ dur: 0.2, vol: 0.1, f0: 800, f1: 3000 });
  },
  rattle: () => {
    for (let i = 0; i < 6; i++)
      noise({ dur: 0.03, vol: 0.09, f0: 2000 + Math.random() * 2500, delay: i * 0.055 });
  },
  reveal: () => {
    noise({ dur: 0.06, vol: 0.1, f0: 3000 });
    tone({ f0: 520, f1: 780, dur: 0.08, vol: 0.1, delay: 0.02 });
  },
  banner: () => {
    tone({ f0: 196, f1: 98, dur: 0.22, vol: 0.26, type: "triangle" });
    noise({ dur: 0.1, vol: 0.12, f0: 400, f1: 120, type: "lowpass" });
  },
  whoosh: () => noise({ dur: 0.16, vol: 0.14, f0: 500, f1: 2600, type: "bandpass", q: 1.4 }),
  leap: () => {
    noise({ dur: 0.22, vol: 0.16, f0: 400, f1: 3200, type: "bandpass", q: 1.2 });
    tone({ f0: 240, f1: 560, dur: 0.18, vol: 0.08, type: "sine" });
  },
  land: () => {
    noise({ dur: 0.08, vol: 0.14, f0: 300, type: "lowpass" });
    tone({ f0: 120, f1: 60, dur: 0.08, vol: 0.1, type: "sine" });
  },
  slash: () => {
    noise({ dur: 0.11, vol: 0.2, f0: 3200, f1: 900 });
    tone({ f0: 900, f1: 220, dur: 0.1, vol: 0.08, type: "sawtooth" });
  },
  thud: () => {
    tone({ f0: 170, f1: 55, dur: 0.16, vol: 0.3, type: "sine" });
    noise({ dur: 0.09, vol: 0.16, f0: 500, type: "lowpass" });
  },
  clang: () => {
    tone({ f0: 1560, f1: 1200, dur: 0.16, vol: 0.14, type: "square" });
    tone({ f0: 2330, f1: 1900, dur: 0.13, vol: 0.1, type: "square", delay: 0.01 });
    noise({ dur: 0.07, vol: 0.14, f0: 4200, f1: 2000 });
  },
  block: () => {
    tone({ f0: 520, f1: 300, dur: 0.1, vol: 0.18, type: "square" });
    tone({ f0: 1180, f1: 900, dur: 0.12, vol: 0.1, delay: 0.01 });
  },
  dodge: () => tone({ f0: 700, f1: 1500, dur: 0.09, vol: 0.09, type: "sine" }),
  bump: () => {
    noise({ dur: 0.05, vol: 0.1, f0: 700, type: "lowpass" });
    tone({ f0: 140, f1: 90, dur: 0.06, vol: 0.12, type: "triangle" });
  },
  fall: () => {
    tone({ f0: 520, f1: 60, dur: 0.55, vol: 0.2, type: "sawtooth" });
    noise({ dur: 0.5, vol: 0.1, f0: 1200, f1: 200 });
  },
  ko: () => {
    tone({ f0: 90, f1: 40, dur: 0.5, vol: 0.32, type: "sine" });
    tone({ f0: 300, f1: 70, dur: 0.4, vol: 0.16, type: "sawtooth", delay: 0.05 });
    noise({ dur: 0.3, vol: 0.2, f0: 600, f1: 100, type: "lowpass" });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ f0: f, dur: 0.16, vol: 0.14, delay: i * 0.11 })
    );
    tone({ f0: 1568, dur: 0.3, vol: 0.1, delay: 0.46 });
  },
  lose: () => {
    [392, 311, 262, 196].forEach((f, i) =>
      tone({ f0: f, f1: f * 0.94, dur: 0.22, vol: 0.14, type: "triangle", delay: i * 0.15 })
    );
  },
  tick: () => tone({ f0: 880, dur: 0.04, vol: 0.07 }),
};

// =====================================================================
// MUSIC — classic 8-bit loop, 32-note lead in D Dorian (D E F G A B C)
// NES-style voices: pulse lead + triangle bass + noise hats.
// =====================================================================

const MELODY = [
  69, 72, 74, 72, 69, 67, 69, -1, // A  C  D  C  A  G  A  .
  74, 72, 69, 67, 64, 67, 69, -1, // D  C  A  G  E  G  A  .
  71, 74, 72, 71, 69, 71, 72, -1, // B  D  C  B  A  B  C  .  (B = дорийская секста)
  74, 72, 69, 67, 69, -1, 74, -1, // D  C  A  G  A  .  D  .  (разрешение в тонику)
];
const BASS = [
  38, 38, 38, 38, // D2  — Dm
  43, 43, 43, 43, // G2  — G
  38, 38, 38, 38, // D2  — Dm
  36, 36, 45, 43, // C2 C2 A2 G2 — каданс
];
const BPM = 132;
const EIGHTH = 60 / BPM / 2;

let musicGain: GainNode | null = null;
let musicTimer: number | null = null;
let mStep = 0;
let mNext = 0;
let musicOn = (typeof localStorage !== "undefined" && localStorage.getItem("bladestep_music")) !== "0";

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function leadNote(midi: number, t0: number) {
  if (midi < 0 || !ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = mtof(midi);
  const d = EIGHTH * 0.85;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.075, t0 + 0.012);
  g.gain.setValueAtTime(0.075, t0 + d * 0.55);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  osc.connect(g).connect(musicGain);
  osc.start(t0);
  osc.stop(t0 + d + 0.05);
}

function bassNote(midi: number, t0: number) {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = mtof(midi);
  const d = EIGHTH * 1.85;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.15, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
  osc.connect(g).connect(musicGain);
  osc.start(t0);
  osc.stop(t0 + d + 0.05);
}

function hat(t0: number, vol: number) {
  if (!ctx || !musicGain) return;
  const len = 0.035;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  src.connect(hp).connect(g).connect(musicGain);
  src.start(t0);
}

function scheduleStep(s: number, t0: number) {
  leadNote(MELODY[s % MELODY.length], t0);
  if (s % 2 === 0) bassNote(BASS[Math.floor(s / 2) % BASS.length], t0);
  if (s % 2 === 1) hat(t0, 0.025); // off-beat hats
  else if (s % 8 === 4) hat(t0, 0.05); // snare-ish accent on beat 3
}

function musicTick() {
  if (!ctx || !musicGain) return;
  while (mNext < ctx.currentTime + 0.15) {
    scheduleStep(mStep, mNext);
    mNext += EIGHTH;
    mStep++;
  }
}

export function startMusic() {
  if (!musicOn || !ctx || !master) return;
  if (musicTimer !== null) return;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = 1;
    musicGain.connect(master);
  }
  mStep = 0;
  mNext = ctx.currentTime + 0.12;
  musicTimer = window.setInterval(musicTick, 40);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function setMusicOn(on: boolean) {
  musicOn = on;
  try {
    localStorage.setItem("bladestep_music", on ? "1" : "0");
  } catch { /* noop */ }
  if (on) startMusic();
  else stopMusic();
}
export function isMusicOn() {
  return musicOn;
}
