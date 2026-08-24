import { Action, BOARD_SIZE, Personality } from "./types";

export type MoveKind = "none" | "walk" | "bump" | "leap" | "roll" | "knock" | "fall";

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
  | "antiair" // struck a jumper mid-flight — CRIT
  | "blocked" // hit a block, attacker knocked back
  | "bashed" // hit a shield-bash: attacker hurt AND knocked back
  | "reflected" // hit a mirror: attacker hurt
  | "dodged" // target had i-frames
  | "rolled" // target slid under — untouchable
  | "whiff"; // swung at empty air

export interface StepResult {
  pMove: MoveInfo;
  eMove: MoveInfo;
  dmgToP: number;
  dmgToE: number;
  pStrike: StrikeResult; // outcome of PLAYER's strike-like action
  eStrike: StrikeResult; // outcome of ENEMY's strike-like action
  pFall: boolean;
  eFall: boolean;
  clash: boolean; // blades crossed — both take damage
  log: string[];
}

const clampPos = (p: number) => Math.max(0, Math.min(BOARD_SIZE - 1, p));
const sign = (n: number) => (n >= 0 ? 1 : -1);
const isStrikeLike = (a: Action) => a === "strike" || a === "cleave";

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

  // ---------- movement pass (tentative, pre-knockback) ----------
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
      case "roll": {
        const landing = pos + 2 * dir;
        if (landing < 0 || landing > BOARD_SIZE - 1) return move(pos, landing, "fall");
        return move(pos, landing, "roll"); // at dist 1 slides UNDER the foe
      }
      default:
        return move(pos, pos, "none");
    }
  };

  let pMv = tentative(pAct, pPos, pDir);
  let eMv = tentative(eAct, ePos, eDir);

  // roll into a blocking foe -> bounced back one tile (the shield is a wall at knee height)
  if (pMv.kind === "roll" && eAct === "block" && dist0 === 1) pMv = move(pPos, clampPos(pPos - pDir), "knock");
  if (eMv.kind === "roll" && pAct === "block" && dist0 === 1) eMv = move(ePos, clampPos(ePos - eDir), "knock");

  // ---------- damage pass ----------
  // A strike/cleave only connects if the target is on the ADJACENT tile at the swing,
  // or is leaping OVER the striker (antiair crit, strikes only). A roller is untouchable.
  const evalStrike = (
    act: Action,
    oppAct: Action,
    oppMv: MoveInfo,
    myStart: number,
    dist: number
  ): StrikeResult => {
    if (!isStrikeLike(act)) return "none";
    // sliding under the blade — nothing touches a roller
    if (oppAct === "roll") return "rolled";
    // airborne target: only a plain strike cuts them down (crit); cleave swings under
    if (oppAct === "jump") {
      if (act === "strike" && dist === 1) return "antiair";
      return "whiff";
    }
    // out of reach -> swing at air
    if (dist !== 1) return "whiff";
    // adjacent: did they step back out of range?
    const retreated = Math.abs(oppMv.to - myStart) > dist;
    if (retreated) return "whiff";
    if (oppAct === "dodge") return "dodged";
    if (oppAct === "block") return "blocked";
    if (oppAct === "bash") return "bashed";
    if (oppAct === "reflect") return "reflected";
    return "hit"; // they walked in / stood their ground / crossed blades
  };

  let pStrike = evalStrike(pAct, eAct, eMv, pPos, dist0);
  let eStrike = evalStrike(eAct, pAct, pMv, ePos, dist0);

  // blades cross: mutual hits become a trade (1 dmg each, even cleave — blades lock)
  const clash = pStrike === "hit" && eStrike === "hit";
  if (clash) {
    pStrike = "trade";
    eStrike = "trade";
  }

  const dmgOf = (act: Action, s: StrikeResult): number => {
    if (s === "antiair") return 2; // crit
    if (s === "trade") return 1;
    if (s === "hit") return act === "cleave" ? 2 : 1;
    return 0;
  };

  let dmgToE = dmgOf(pAct, pStrike);
  let dmgToP = dmgOf(eAct, eStrike);
  // shield-bash / mirror punish the attacker
  if (pStrike === "bashed" || pStrike === "reflected") dmgToP += 1;
  if (eStrike === "bashed" || eStrike === "reflected") dmgToE += 1;

  // knockback: striker who hit a block or a shield-bash is pushed back 1
  if (pStrike === "blocked" || pStrike === "bashed") pMv = move(pPos, clampPos(pPos - pDir), "knock");
  if (eStrike === "blocked" || eStrike === "bashed") eMv = move(ePos, clampPos(ePos - eDir), "knock");

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

  // jump collisions (rollers travel low and never collide with jumpers)
  if (pMv.kind === "leap" && eMv.kind === "leap" && pMv.to === eMv.to) {
    pMv = move(pPos, pPos + pDir, "leap");
    eMv = move(ePos, ePos + eDir, "leap");
  }
  // both roll onto the same tile -> both come up short
  if (pMv.kind === "roll" && eMv.kind === "roll" && pMv.to === eMv.to) {
    pMv = move(pPos, pPos + pDir, "roll");
    eMv = move(ePos, ePos + eDir, "roll");
  }

  const resolveLeap = (my: MoveInfo, opp: MoveInfo, oppAct: Action, myStart: number, oppStart: number, dir: number): MoveInfo => {
    if (my.kind !== "leap" && my.kind !== "roll") return my;
    const swap = opp.kind === my.kind && my.to === oppStart && opp.to === myStart;
    if (swap) return my; // glorious mid-air (or under-legs) swap
    if (opp.kind === my.kind && my.to === opp.to) return move(myStart, myStart + dir, my.kind);
    if (my.to === opp.to && oppAct !== "back") {
      // opponent ends where we land -> land one tile short
      return move(myStart, myStart + dir, my.kind);
    }
    if (my.to === opp.to && oppAct === "back") {
      // opponent stepped back onto our landing tile -> take their old tile
      return move(myStart, oppStart, my.kind);
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
      antiair: "КРИТ в полёте",
      blocked: "упёрся в блок",
      bashed: "получил щитом в лицо",
      reflected: "удар вернулся",
      dodged: "рассёк воздух",
      rolled: "ушёл перекатом",
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

/** Roll a fresh hand of 6 dice from the fighter's own face pool. */
export function rollHand(pool: Action[], rng: () => number = Math.random): Action[] {
  return Array.from({ length: 6 }, () => pool[Math.floor(rng() * pool.length)]);
}

/** Weighted pick constrained to the dice actually in the hand (consumes one). */
function weightedPickFromPool(w: Weights, pool: Action[], rng: () => number = Math.random): Action {
  if (pool.length === 0) return "fwd";
  const avail = [...new Set(pool)];
  const entries = avail.map((a) => [a, w[a] ?? 0] as [Action, number]).filter(([, v]) => v > 0);
  if (entries.length === 0) return pool[Math.floor(rng() * pool.length)];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let roll = rng() * total;
  for (const [a, v] of entries) {
    roll -= v;
    if (roll <= 0) return a;
  }
  return entries[entries.length - 1][0];
}

/** would a 2-tile dash from ePos toward the player land off the board? */
const dashSuicide = (ePos: number, pPos: number) => {
  const dir = sign(pPos - ePos);
  const landing = ePos + 2 * dir;
  return landing < 0 || landing > BOARD_SIZE - 1;
};

function sanitize(w: Weights, ctx: AiContext): Weights {
  const out = { ...w };
  if (dashSuicide(ctx.ePos, ctx.pPos)) {
    out.jump = 0;
    out.roll = 0;
  }
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  if (dist >= 3) {
    out.strike = (out.strike ?? 0) * 0.25; // mostly wasted at range
    out.cleave = (out.cleave ?? 0) * 0.2;
    out.bash = (out.bash ?? 0) * 0.2;
    out.reflect = (out.reflect ?? 0) * 0.35;
  }
  return out;
}

/** how often does the player open (or play at all) with a strike? 0..1 */
function playerStrikeProb(ctx: AiContext): number {
  const total = Object.values(ctx.histTotal).reduce((s, v) => s + (v ?? 0), 0) || 1;
  return ((ctx.histTotal.strike ?? 0) * 0.6 + (ctx.histFirst.strike ?? 0) * 1.2) / total;
}

function aggressorWeights(ctx: AiContext, slot: number, prev: Action | null): Weights {
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  let w: Weights;
  if (dist <= 1) w = { strike: 34, cleave: 30, block: 10, dodge: 8, jump: 10, fwd: 4, back: 4 };
  else if (dist >= 3) w = { fwd: 38, jump: 26, strike: 12, cleave: 8, block: 6, dodge: 6, back: 4 };
  else w = { strike: 24, cleave: 16, fwd: 22, jump: 14, block: 8, dodge: 10, back: 6 };
  if (ctx.eHp === 1) { w.dodge = (w.dodge ?? 0) + 12; w.block = (w.block ?? 0) + 10; }
  if (slot === 2 && (prev === "fwd" || prev === "jump")) w.cleave = (w.cleave ?? 0) + 22; // arrive and rend
  return sanitize(w, ctx);
}

function controllerWeights(ctx: AiContext, slot: number, prev: Action | null): Weights {
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  const expectsStrike = playerStrikeProb(ctx) > 0.3;
  let w: Weights = { dodge: 22, block: 20, bash: expectsStrike ? 22 : 10, back: 12, strike: 12, fwd: 8, jump: 4 };
  if (slot === 0) { w.dodge = (w.dodge ?? 0) * 1.6; w.block = (w.block ?? 0) * 1.6; w.bash = (w.bash ?? 0) * 1.5; }
  if (prev === "dodge" || prev === "block" || prev === "bash") w.strike = (w.strike ?? 0) * 2.6; // punish
  if (dist === 1) { w.strike = (w.strike ?? 0) * 1.5; w.bash = (w.bash ?? 0) * 1.4; w.back = (w.back ?? 0) * 1.3; }
  if (dist >= 3) { w.fwd = (w.fwd ?? 0) * 1.7; }
  if (ctx.pHp === 1) w.strike = (w.strike ?? 0) * 1.5; // smell blood
  return sanitize(w, ctx);
}

function counterOf(a: Action, dist: number): Weights {
  switch (a) {
    case "fwd": return { strike: 46, back: 26, jump: 28 };
    case "back": return { jump: 42, fwd: 40, strike: 18 };
    case "jump": return { strike: 66, back: 16, dodge: 18 }; // anti-air read (crit!)
    case "dodge": return { fwd: 44, block: 30, strike: 26 };
    case "strike": return dist <= 1 ? { dodge: 44, block: 36, strike: 20 } : { fwd: 46, jump: 30, strike: 24 };
    case "block": return { jump: 52, fwd: 32, strike: 16 };
    case "wait": return { strike: 60, fwd: 30, jump: 10 }; // free hit on a frozen foe
    case "rest": return { strike: 56, fwd: 30, jump: 14 }; // free hit on an idling dummy
    case "roll": return { block: 52, strike: 28, fwd: 20 };
    case "cleave": return { jump: 56, block: 30, dodge: 14 };
    case "bash": return { dodge: 40, back: 34, fwd: 26 };
    case "reflect": return { dodge: 40, back: 34, fwd: 26 };
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
  if (pick === "strike") w.reflect = (w.reflect ?? 0) + 38; // the mirror answers a blade with a mirror
  // human noise: 28% random spice
  if (Math.random() < 0.28) {
    const rnd = weightedPick({ fwd: 1, back: 1, jump: 1, dodge: 1, strike: 1 });
    w[rnd] = (w[rnd] ?? 0) + 40;
  }
  if (ctx.eHp === 1) { w.dodge = (w.dodge ?? 0) + 14; }
  return sanitize(w, ctx);
}

function shadowWeights(ctx: AiContext, slot: number, prev: Action | null): Weights {
  const dist = Math.abs(ctx.pPos - ctx.ePos);
  const expectsStrike = playerStrikeProb(ctx) > 0.25 || slot === 0;
  // The Shadow: slip under the expected swing, cut from behind.
  let w: Weights = {
    roll: expectsStrike ? 46 : 24,
    strike: dist === 1 ? 30 : 14,
    dodge: 14,
    fwd: dist >= 2 ? 18 : 8,
    back: 8,
    block: 6,
  };
  if (prev === "roll") w.strike = (w.strike ?? 0) + 42; // arrived behind you — cut
  if (prev === "roll" || prev === "dodge") w.roll = (w.roll ?? 0) * 0.5; // don't chain slips forever
  if (ctx.pHp === 1) w.strike = (w.strike ?? 0) * 1.6;
  if (ctx.eHp === 1) { w.dodge = (w.dodge ?? 0) + 12; w.roll = (w.roll ?? 0) + 8; }
  return sanitize(w, ctx);
}

/** Pick 3 dice from the rolled `hand`, consuming each chosen die. */
export function aiPlan(pers: Personality, ctx: AiContext, hand: Action[]): Action[] {
  const pool = [...hand];
  const plan: Action[] = [];
  for (let slot = 0; slot < 3; slot++) {
    let w: Weights;
    switch (pers) {
      case "random":
        // Болванчик: две из шести граней — пустой «Отдых», манекен иногда просто стоит
        w = sanitize({ fwd: 1, back: 1, jump: 1, dodge: 1, strike: 1, block: 1, rest: 1 }, ctx);
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
      case "shadow":
        w = shadowWeights(ctx, slot, plan[slot - 1] ?? null);
        break;
    }
    const pick = weightedPickFromPool(w, pool);
    plan.push(pick);
    const at = pool.indexOf(pick);
    if (at >= 0) pool.splice(at, 1);
  }
  return plan;
}
