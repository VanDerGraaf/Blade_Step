import { Action, BOARD_SIZE, Personality } from "./types";

export type MoveKind = "none" | "walk" | "bump" | "leap" | "knock" | "fall";

export interface MoveInfo {
  from: number;
  to: number;
  kind: MoveKind;
  dist: number; // tiles actually travelled (for arc height)
}

export type StrikeResult =
  | "none"
  | "hit" // clean hit
  | "trade" // both struck, both hurt
  | "antiair" // struck a jumper mid-flight
  | "blocked" // hit a block, attacker knocked back
  | "dodged" // target had i-frames
  | "whiff"; // swung at empty air

export interface StepResult {
  pMove: MoveInfo;
  eMove: MoveInfo;
  dmgToP: 0 | 1;
  dmgToE: 0 | 1;
  pStrike: StrikeResult; // outcome of PLAYER's strike
  eStrike: StrikeResult; // outcome of ENEMY's strike
  pFall: boolean;
  eFall: boolean;
  clash: boolean; // blades crossed — both take damage
  log: string[];
}

const clampPos = (p: number) => Math.max(0, Math.min(BOARD_SIZE - 1, p));
const sign = (n: number) => (n >= 0 ? 1 : -1);

const move = (from: number, to: number, kind: MoveKind): MoveInfo => ({
  from,
  to,
  kind,
  dist: Math.abs(to - from),
});

/**
 * Simultaneous resolution of one step.
 * pPos/ePos are logical positions BEFORE the step. Both act at once.
 */
export function resolveStep(pAct: Action, eAct: Action, pPos: number, ePos: number): StepResult {
  const dist0 = Math.abs(ePos - pPos);
  const pDir = sign(ePos - pPos);
  const eDir = -pDir;
  const log: string[] = [];

  // ---------- damage pass ----------
  const evalStrike = (act: Action, oppAct: Action, dist: number): StrikeResult => {
    if (act !== "strike") return "none";
    if (oppAct === "jump") return dist <= 2 ? "antiair" : "whiff";
    if (oppAct === "dodge") return "dodged";
    if (oppAct === "block") return "blocked";
    if (dist === 1) return "hit";
    return "whiff";
  };

  let pStrike = evalStrike(pAct, eAct, dist0);
  let eStrike = evalStrike(eAct, pAct, dist0);

  // blades cross: mutual hits become a trade
  const clash = pStrike === "hit" && eStrike === "hit";
  if (clash) {
    pStrike = "trade";
    eStrike = "trade";
  }

  const dmgToE: 0 | 1 = pStrike === "hit" || pStrike === "trade" || pStrike === "antiair" ? 1 : 0;
  const dmgToP: 0 | 1 = eStrike === "hit" || eStrike === "trade" || eStrike === "antiair" ? 1 : 0;

  // ---------- movement pass (tentative) ----------
  const tentative = (act: Action, pos: number, dir: number): MoveInfo => {
    switch (act) {
      case "fwd": {
        if (dist0 === 1) return move(pos, pos, "bump");
        return move(pos, pos + dir, "walk");
      }
      case "back": {
        const to = clampPos(pos - dir);
        return move(pos, to, to === pos ? "none" : "walk");
      }
      case "jump": {
        const landing = pos + 2 * dir;
        if (landing < 0 || landing > BOARD_SIZE - 1) return move(pos, landing, "fall");
        return move(pos, landing, "leap");
      }
      default:
        return move(pos, pos, "none");
    }
  };

  let pMv = tentative(pAct, pPos, pDir);
  let eMv = tentative(eAct, ePos, eDir);

  // knockback: striker who hit a block is pushed back 1
  if (pStrike === "blocked") pMv = move(pPos, clampPos(pPos - pDir), "knock");
  if (eStrike === "blocked") eMv = move(ePos, clampPos(ePos - eDir), "knock");

  // head-on: both walk into the same tile
  if (
    pMv.kind === "walk" && eMv.kind === "walk" &&
    pAct === "fwd" && eAct === "fwd" && pMv.to === eMv.to
  ) {
    pMv = move(pPos, pPos, "bump");
    eMv = move(ePos, ePos, "bump");
  }

  // walk into opponent's final tile -> bump
  if (pMv.kind === "walk" && pMv.to === eMv.to) pMv = move(pPos, pPos, "bump");
  else if (eMv.kind === "walk" && eMv.to === pMv.to) eMv = move(ePos, ePos, "bump");

  // jump collisions
  // both leap onto the very same tile -> both drop one short
  if (pMv.kind === "leap" && eMv.kind === "leap" && pMv.to === eMv.to) {
    pMv = move(pPos, pPos + pDir, "leap");
    eMv = move(ePos, ePos + eDir, "leap");
  }
  const resolveLeap = (my: MoveInfo, opp: MoveInfo, oppAct: Action, myStart: number, oppStart: number, dir: number): MoveInfo => {
    if (my.kind !== "leap") return my;
    const swap = opp.kind === "leap" && my.to === oppStart && opp.to === myStart;
    if (swap) return my; // glorious mid-air swap
    if (opp.kind === "leap" && my.to === opp.to) return move(myStart, myStart + dir, "leap"); // same landing -> drop short
    if (my.to === opp.to && oppAct !== "back") {
      // opponent ends where we land -> land one tile short
      return move(myStart, myStart + dir, "leap");
    }
    if (my.to === opp.to && oppAct === "back") {
      // opponent stepped back onto our landing tile -> take their old tile
      return move(myStart, oppStart, "leap");
    }
    return my;
  };

  pMv = resolveLeap(pMv, eMv, eAct, pPos, ePos, pDir);
  eMv = resolveLeap(eMv, pMv, pAct, ePos, pPos, eDir);

  const pFall = pMv.kind === "fall";
  const eFall = eMv.kind === "fall";

  // ---------- log ----------
  const name = (s: StrikeResult) =>
    ({
      hit: "чистое попадание",
      trade: "клинки скрестились",
      antiair: "сбил в полёте",
      blocked: "упёрся в блок",
      dodged: "рассёк воздух",
      whiff: "промах",
      none: "",
    } as Record<StrikeResult, string>)[s];

  if (pStrike !== "none") log.push(`Вы: удар — ${name(pStrike)}`);
  if (eStrike !== "none") log.push(`Враг: удар — ${name(eStrike)}`);
  if (pFall) log.push("Вы шагнули за край!");
  if (eFall) log.push("Враг рухнул в пропасть!");

  return { pMove: pMv, eMove: eMv, dmgToP, dmgToE, pStrike, eStrike, pFall, eFall, clash, log };
}

/** Apply a step to positions; returns [newPPos, newEPos]. */
export function applyStep(r: StepResult): [number, number] {
  return [r.pMove.to, r.eMove.to];
}

// ------------------------------------------------------------------
// AI
// ------------------------------------------------------------------

export interface AiContext {
  ePos: number;
  pPos: number;
  pHp: number;
  eHp: number;
  round: number;
  histTotal: Partial<Record<Action, number>>;
  histFirst: Partial<Record<Action, number>>;
  samples: number;
}

type Weights = Partial<Record<Action, number>>;

function weightedPick(w: Weights, rng: () => number = Math.random): Action {
  const entries = Object.entries(w).filter(([, v]) => (v ?? 0) > 0) as [Action, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let roll = rng() * total;
  for (const [a, v] of entries) {
    roll -= v;
    if (roll <= 0) return a;
  }
  return entries[entries.length - 1][0];
}

const jumpSuicide = (ePos: number, pPos: number) => {
  const dir = sign(pPos - ePos);
  const landing = ePos + 2 * dir;
  return landing < 0 || landing > BOARD_SIZE - 1;
};

function sanitize(w: Weights, ctx: AiContext): Weights {
  const out = { ...w };
  if (jumpSuicide(ctx.ePos, ctx.pPos)) out.jump = 0;
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  if (dist >= 3) out.strike = (out.strike ?? 0) * 0.25; // mostly wasted at range
  return out;
}

function aggressorWeights(ctx: AiContext, slot: number, prev: Action | null): Weights {
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  let w: Weights;
  if (dist <= 1) w = { strike: 56, block: 10, dodge: 12, jump: 10, fwd: 6, back: 6 };
  else if (dist >= 3) w = { fwd: 38, jump: 26, strike: 14, block: 8, dodge: 9, back: 5 };
  else w = { strike: 34, fwd: 24, jump: 16, block: 8, dodge: 12, back: 6 };
  if (ctx.eHp === 1) { w.dodge = (w.dodge ?? 0) + 12; w.block = (w.block ?? 0) + 10; }
  if (slot === 2 && prev === "fwd") w.strike = (w.strike ?? 0) + 20; // arrive and cut
  return sanitize(w, ctx);
}

function controllerWeights(ctx: AiContext, slot: number, prev: Action | null): Weights {
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  let w: Weights = { dodge: 26, block: 24, back: 14, strike: 14, fwd: 10, jump: 12 };
  if (slot === 0) { w.dodge = (w.dodge ?? 0) * 1.7; w.block = (w.block ?? 0) * 1.7; }
  if (prev === "dodge" || prev === "block") w.strike = (w.strike ?? 0) * 2.4; // punish
  if (dist === 1) { w.strike = (w.strike ?? 0) * 1.5; w.back = (w.back ?? 0) * 1.4; }
  if (dist >= 3) { w.fwd = (w.fwd ?? 0) * 1.6; w.jump = (w.jump ?? 0) * 1.4; }
  if (ctx.pHp === 1) w.strike = (w.strike ?? 0) * 1.5; // smell blood
  return sanitize(w, ctx);
}

function counterOf(a: Action, dist: number): Weights {
  switch (a) {
    case "fwd": return { strike: 46, back: 26, jump: 28 };
    case "back": return { jump: 42, fwd: 40, strike: 18 };
    case "jump": return { strike: 66, back: 16, dodge: 18 }; // anti-air read
    case "dodge": return { fwd: 44, block: 30, strike: 26 };
    case "strike": return dist <= 1 ? { dodge: 44, block: 36, strike: 20 } : { fwd: 46, jump: 30, strike: 24 };
    case "block": return { jump: 52, fwd: 32, strike: 16 };
  }
}

function mirrorWeights(ctx: AiContext, slot: number): Weights {
  if (ctx.samples < 2) return aggressorWeights(ctx, slot, null); // opening: press
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  const pick =
    (slot === 0 && ctx.histFirst && Object.keys(ctx.histFirst).length
      ? (Object.entries(ctx.histFirst).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0][0] as Action)
      : null) ??
    (Object.entries(ctx.histTotal).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] as Action | undefined) ??
    "fwd";
  const w = counterOf(pick, dist);
  // human noise: 28% random spice
  if (Math.random() < 0.28) {
    const rnd = weightedPick({ fwd: 1, back: 1, jump: 1, dodge: 1, strike: 1, block: 1 });
    w[rnd] = (w[rnd] ?? 0) + 40;
  }
  if (ctx.eHp === 1) { w.dodge = (w.dodge ?? 0) + 14; }
  return sanitize(w, ctx);
}

export function aiPlan(pers: Personality, ctx: AiContext): Action[] {
  const plan: Action[] = [];
  for (let slot = 0; slot < 3; slot++) {
    let w: Weights;
    switch (pers) {
      case "random":
        w = sanitize({ fwd: 1, back: 1, jump: 1, dodge: 1, strike: 1, block: 1 }, ctx);
        break;
      case "aggressor":
        w = aggressorWeights(ctx, slot, plan[slot - 1] ?? null);
        break;
      case "controller":
        w = controllerWeights(ctx, slot, plan[slot - 1] ?? null);
        break;
      case "mirror":
        w = mirrorWeights(ctx, slot);
        break;
    }
    plan.push(weightedPick(w));
  }
  return plan;
}
