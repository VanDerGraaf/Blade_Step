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
