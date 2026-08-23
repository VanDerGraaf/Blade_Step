import {
  Action,
  BOARD_SIZE,
  DICE_POOLS,
  ENEMY_START,
  GameResult,
  MatchStats,
  MAX_HP,
  PERSONALITIES,
  PERSONALITY_KIND,
  Personality,
  PLAYER_START,
} from "./types";
import { aiPlan, resolveStep, rollHand, StepResult } from "./logic";
import { drawFighter, drawShadow, ENEMY_LOOKS, Look, PLAYER_LOOK, Pose, RIVAL_RONIN_LOOK } from "./sprites";
import { sfx } from "./audio";
import type { NetMsg } from "./net";

export const VIEW_W = 960;
export const VIEW_H = 540;
const TILE_W = 118;
const ARENA_X = (VIEW_W - BOARD_SIZE * TILE_W) / 2;
const GROUND_Y = 414;
const TILE_H = 30;

export const tileCenter = (i: number) => ARENA_X + i * TILE_W + TILE_W / 2;

export interface UiSnapshot {
  screen: "menu" | "play" | "over";
  phase: "idle" | "plan" | "thinking" | "resolve" | "ko";
  personality: Personality;
  mode: "ai" | "net";
  netPeer: string | null;
  round: number;
  pHp: number;
  eHp: number;
  step: number;
  enemyRevealed: number;
  enemyPlan: (Action | null)[];
  playerPlan: (Action | null)[];
  playerHand: Action[];
  enemyHand: Action[];
  msg: string;
  msgId: number;
  banner: string | null;
  bannerId: number;
  result: GameResult | null;
  stats: MatchStats;
}

export const initialUi: UiSnapshot = {
  screen: "menu",
  phase: "idle",
  personality: "aggressor",
  mode: "ai",
  netPeer: null,
  round: 1,
  pHp: MAX_HP,
  eHp: MAX_HP,
  step: -1,
  enemyRevealed: 0,
  enemyPlan: [null, null, null],
  playerPlan: [null, null, null],
  playerHand: [],
  enemyHand: [],
  msg: "Выбери соперника и выйди на помост",
  msgId: 0,
  banner: null,
  bannerId: 0,
  result: null,
  stats: freshStats(),
};

function freshStats(): MatchStats {
  return { exchanges: 0, dealt: 0, taken: 0, blocks: 0, dodges: 0, whiffs: 0, leaps: 0 };
}

interface Fighter {
  pos: number;
  x: number;
  air: number;
  fallY: number;
  hp: number;
  facing: 1 | -1;
  pose: Pose;
  poseT: number;
  poseDur: number;
  holdPose: boolean;
  flash: number;
  lunge: number;
  dead: boolean;
  faded: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "rect" | "text" | "mist";
  text?: string;
}

interface Timer {
  t: number;
  ms: number;
  tok: number;
  res: () => void;
}
interface Tween {
  t: number;
  ms: number;
  tok: number;
  fn: (p: number) => void;
  ease: (t: number) => number;
  res: () => void;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t;
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const mkFighter = (pos: number, facing: 1 | -1): Fighter => ({
  pos,
  x: tileCenter(pos),
  air: 0,
  fallY: 0,
  hp: MAX_HP,
  facing,
  pose: "idle",
  poseT: 0,
  poseDur: 1,
  holdPose: false,
  flash: 0,
  lunge: 0,
  dead: false,
  faded: false,
});

export class Engine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private last = 0;
  private time = 0;
  private token = 0;
  paused = false;

  private onUi: (patch: Partial<UiSnapshot>) => void = () => {};
  ui: UiSnapshot = { ...initialUi, enemyPlan: [...initialUi.enemyPlan], playerPlan: [...initialUi.playerPlan], stats: freshStats() };

  private p = mkFighter(PLAYER_START, 1);
  private e = mkFighter(ENEMY_START, -1);
  private eLook: Look = ENEMY_LOOKS.oni;
  private particles: Particle[] = [];
  private timers: Timer[] = [];
  private tweens: Tween[] = [];
  private shakeMag = 0;
  private flashA = 0;
  private slow = 1;

  private pPlan: Action[] = [];
  private ePlan: Action[] = [];
  private playerHand: Action[] = [];
  private enemyHand: Action[] = [];
  private round = 1;

  // ---- сетевой режим ----
  private mode: "ai" | "net" = "ai";
  private netEnemyPlan: Action[] | null = null;
  private netEnemyHand: Action[] = [];
  private planCommitted = false;
  /** Колбэк отправки сообщений сопернику (подключает App). */
  netSend: (m: NetMsg) => void = () => {};
  private histTotal: Partial<Record<Action, number>> = {};
  private histFirst: Partial<Record<Action, number>> = {};
  private samples = 0;
  private stats: MatchStats = freshStats();

  private stars: { x: number; y: number; s: number; tw: number }[] = [];
  private cracks: { x: number; y: number; w: number }[][] = [];

  constructor() {
    for (let i = 0; i < 70; i++)
      this.stars.push({ x: Math.random() * VIEW_W, y: Math.random() * 300, s: Math.random() < 0.85 ? 2 : 3, tw: Math.random() * 7 });
    for (let t = 0; t < BOARD_SIZE; t++) {
      const arr: { x: number; y: number; w: number }[] = [];
      for (let c = 0; c < 3; c++)
        arr.push({ x: ARENA_X + t * TILE_W + 14 + Math.random() * (TILE_W - 40), y: GROUND_Y + 6 + Math.random() * 16, w: 8 + Math.random() * 16 });
      this.cracks.push(arr);
    }
  }

  // ---------------- lifecycle ----------------
  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    this.ctx = canvas.getContext("2d");
    try {
      document.fonts?.load('16px "Press Start 2P"').catch(() => {});
    } catch { /* noop */ }
    this.last = performance.now();
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(50, now - this.last);
      this.last = now;
      if (!this.paused) this.update(dt);
      this.render(dpr);
    };
    this.raf = requestAnimationFrame(loop);
  }

  detach() {
    cancelAnimationFrame(this.raf);
    this.canvas = null;
    this.ctx = null;
  }

  setListener(fn: (patch: Partial<UiSnapshot>) => void) {
    this.onUi = fn;
  }

  private patch(p: Partial<UiSnapshot>) {
    this.ui = { ...this.ui, ...p };
    this.onUi(p);
  }

  private say(msg: string) {
    this.patch({ msg, msgId: this.ui.msgId + 1 });
  }

  private banner(text: string, tok: number) {
    const id = this.ui.bannerId + 1;
    this.patch({ banner: text, bannerId: id });
    this.wait(850, tok).then(() => {
      if (this.ui.bannerId === id) this.patch({ banner: null });
    });
  }

  // ---------------- timing ----------------
  private wait(ms: number, tok: number): Promise<void> {
    return new Promise((res) => this.timers.push({ t: 0, ms, tok, res }));
  }

  private tween(ms: number, fn: (p: number) => void, ease: (t: number) => number, tok: number): Promise<void> {
    return new Promise((res) => this.tweens.push({ t: 0, ms, tok, fn, ease, res }));
  }

  private hitstop(scale: number, ms: number, tok: number) {
    this.slow = scale;
    this.wait(ms, tok).then(() => {
      this.slow = 1;
    });
  }

  private shake(m: number) {
    this.shakeMag = Math.min(1, this.shakeMag + m);
  }

  // ---------------- public flow ----------------
  startMatch(pers: Personality) {
    const tok = ++this.token;
    this.p = mkFighter(PLAYER_START, 1);
    this.e = mkFighter(ENEMY_START, -1);
    this.eLook = ENEMY_LOOKS[PERSONALITY_KIND[pers]];
    this.particles = [];
    this.round = 1;
    this.stats = freshStats();
    this.histTotal = {};
    this.histFirst = {};
    this.samples = 0;
    this.slow = 1;
    this.patch({
      screen: "play",
      phase: "idle",
      personality: pers,
      round: 1,
      pHp: MAX_HP,
      eHp: MAX_HP,
      step: -1,
      enemyRevealed: 0,
      enemyPlan: [null, null, null],
      playerPlan: [null, null, null],
      result: null,
      stats: { ...this.stats },
    });
    this.say(`${PERSONALITIES[pers].name} выходит на помост. Раунд 1 — планируй!`);
    this.startExchange(tok);
  }

  toMenu() {
    this.token++;
    this.mode = "ai";
    this.p = mkFighter(PLAYER_START, 1);
    this.e = mkFighter(ENEMY_START, -1);
    this.eLook = ENEMY_LOOKS.oni;
    this.particles = [];
    this.slow = 1;
    this.patch({ screen: "menu", phase: "idle", result: null, banner: null, step: -1, netPeer: null, mode: "ai" });
  }

  /** Сетевая дуэль: противник — живой игрок (красный ронин). */
  startNetMatch(peerName: string) {
    const tok = ++this.token;
    this.mode = "net";
    this.p = mkFighter(PLAYER_START, 1);
    this.e = mkFighter(ENEMY_START, -1);
    this.eLook = RIVAL_RONIN_LOOK;
    this.particles = [];
    this.round = 1;
    this.stats = freshStats();
    this.netEnemyHand = [];
    this.slow = 1;
    this.patch({
      screen: "play",
      phase: "idle",
      mode: "net",
      netPeer: peerName,
      personality: "mirror",
      round: 1,
      pHp: MAX_HP,
      eHp: MAX_HP,
      step: -1,
      enemyRevealed: 0,
      enemyPlan: [null, null, null],
      playerPlan: [null, null, null],
      result: null,
      stats: { ...this.stats },
    });
    this.say(`Сетевая дуэль с игроком ${peerName}. На план — 20 секунд!`);
    this.startExchange(tok);
  }

  fight(plan: Action[]) {
    if (this.ui.phase !== "plan" || this.mode !== "ai") return;
    const tok = this.token;
    this.pPlan = plan;
    this.patch({ phase: "thinking", playerPlan: [...plan], enemyPlan: [null, null, null], enemyRevealed: 0 });
    this.say(`${PERSONALITIES[this.ui.personality].name} обдумывает ответ...`);
    sfx.rattle();
    this.runExchange(tok);
  }

  private startExchange(tok: number) {
    this.planCommitted = false;
    this.netEnemyPlan = null;
    this.playerHand = rollHand(DICE_POOLS.ronin);
    if (this.mode === "net") {
      // свою руку показываем сопернику; его руку получим по сети
      this.netSend({ t: "hand", hand: [...this.playerHand] });
      this.enemyHand = [...this.netEnemyHand];
    } else {
      this.enemyHand = rollHand(DICE_POOLS[this.ui.personality]);
    }
    this.patch({
      phase: "plan",
      step: -1,
      enemyRevealed: 0,
      enemyPlan: [null, null, null],
      playerPlan: [null, null, null],
      playerHand: [...this.playerHand],
      enemyHand: [...this.enemyHand],
      round: this.round,
    });
    sfx.rattle();
    this.banner(`РАУНД ${this.round}`, tok);
    sfx.banner();
    this.p.holdPose = false;
    this.e.holdPose = false;
    void tok;
  }

  private async runExchange(tok: number) {
    await this.wait(750, tok);
    if (tok !== this.token) return;

    this.ePlan = aiPlan(
      this.ui.personality,
      {
        ePos: this.e.pos,
        pPos: this.p.pos,
        pHp: this.p.hp,
        eHp: this.e.hp,
        round: this.round,
        histTotal: this.histTotal,
        histFirst: this.histFirst,
        samples: this.samples,
      },
      this.enemyHand
    );

    // record player habits AFTER the AI picks (mirror reads history, not telepathy)
    for (let i = 0; i < 3; i++) {
      const a = this.pPlan[i];
      this.histTotal[a] = (this.histTotal[a] ?? 0) + 1;
      if (i === 0) this.histFirst[a] = (this.histFirst[a] ?? 0) + 1;
    }
    this.samples++;

    await this.beginExchange(tok);
  }

  /** Общая часть обмена: оба плана уже известны — разыгрываем шаги. */
  private async beginExchange(tok: number) {
    // precompute all three steps
    const outcomes: StepResult[] = [];
    let pp = this.p.pos;
    let ep = this.e.pos;
    for (let i = 0; i < 3; i++) {
      const r = resolveStep(this.pPlan[i], this.ePlan[i], pp, ep);
      outcomes.push(r);
      pp = r.pMove.to;
      ep = r.eMove.to;
      if (r.pFall || r.eFall) break;
    }

    this.patch({ phase: "resolve" });
    await this.wait(320, tok);
    if (tok !== this.token) return;

    for (let i = 0; i < outcomes.length; i++) {
      if (tok !== this.token) return;
      await this.playStep(i, outcomes[i], tok);
      if (this.ui.screen !== "play") return;
    }

    // exchange survived — tally and loop
    this.stats.exchanges++;
    this.round++;
    this.patch({ stats: { ...this.stats } });
    this.say(
      this.mode === "net"
        ? "Обмен завершён. Оба стоят — 20 секунд на новый план!"
        : "Обмен завершён. Оба стоят — планируй снова!"
    );
    await this.wait(650, tok);
    if (tok !== this.token) return;
    this.startExchange(tok);
  }

  // ---------------- сетевая дуэль ----------------

  /** Отправить свой план (кнопка «БОЙ!» или тайм-аут). */
  commitNetPlan(plan: Action[]) {
    if (this.ui.phase !== "plan" || this.planCommitted) return;
    const tok = this.token;
    this.planCommitted = true;
    this.pPlan = plan;
    this.patch({ phase: "thinking", playerPlan: [...plan] });
    this.netSend({ t: "plan", plan: [...plan] });
    if (this.netEnemyPlan) {
      this.say("Оба плана готовы — клинки решают!");
      this.ePlan = this.netEnemyPlan;
      this.beginExchange(tok);
    } else {
      this.say("План отправлен. Ждём замысел соперника...");
    }
  }

  /** Соперник прислал свою руку кубиков. */
  receiveNetHand(hand: Action[]) {
    this.netEnemyHand = [...hand];
    this.patch({ enemyHand: [...hand] });
  }

  /** Соперник прислал свой план. */
  receiveNetPlan(plan: Action[]) {
    if (this.netEnemyPlan) return; // уже получили в этом раунде
    this.netEnemyPlan = [...plan];
    if (this.planCommitted) {
      this.say("Оба плана готовы — клинки решают!");
      this.ePlan = this.netEnemyPlan;
      this.beginExchange(this.token);
    } else {
      this.say("Соперник готов! Успейте выбрать 3 кубика.");
    }
  }

  // ---------------- per-step choreography ----------------
  private async playStep(i: number, r: StepResult, tok: number) {
    this.patch({
      step: i,
      enemyRevealed: i + 1,
      enemyPlan: this.ePlan.map((a, k) => (k <= i ? a : null)),
    });
    sfx.reveal();
    await this.wait(430, tok);
    if (tok !== this.token) return;

    const P = this.p;
    const E = this.e;

    // stats
    if (r.pMove.kind === "leap" || r.pMove.kind === "roll") this.stats.leaps++;
    if (r.eStrike === "blocked" || r.eStrike === "bashed" || r.eStrike === "reflected") this.stats.blocks++;
    if (r.eStrike === "dodged" || r.eStrike === "rolled") this.stats.dodges++;
    if (r.pStrike === "whiff" || r.pStrike === "rolled") this.stats.whiffs++;

    // --- launch movement animations ---
    this.animateMove(P, r, "p", tok);
    this.animateMove(E, r, "e", tok);

    // --- strikes ---
    const pStrikes = r.pStrike !== "none";
    const eStrikes = r.eStrike !== "none";
    if (!pStrikes) this.poseForAction(P, this.pPlan[i]);
    if (!eStrikes) this.poseForAction(E, this.ePlan[i]);
    if (pStrikes) this.setPose(P, "strike", 560);
    if (eStrikes) this.setPose(E, "strike", 560);

    if (pStrikes || eStrikes) {
      await this.wait(190, tok);
      if (tok !== this.token) return;
      // slash arcs
      if (pStrikes) this.spawnSlash(P, r.clash);
      if (eStrikes) this.spawnSlash(E, r.clash);
      sfx.slash();
      this.lunge(P, pStrikes ? P.facing : 0, tok);
      this.lunge(E, eStrikes ? E.facing : 0, tok);

      await this.wait(50, tok);
      if (tok !== this.token) return;
      this.resolveImpacts(r, tok);
    }

    await this.wait(620, tok);
    if (tok !== this.token) return;

    // settle: logical positions + re-face each other
    P.pos = r.pMove.to;
    E.pos = r.eMove.to;
    if (!r.pFall && !r.eFall) {
      const d: 1 | -1 = E.pos > P.pos ? 1 : -1;
      P.facing = d;
      E.facing = d === 1 ? -1 : 1;
    }
    P.holdPose = false;
    E.holdPose = false;
    if (P.pose === "block" || P.pose === "dodge") P.pose = "idle";
    if (E.pose === "block" || E.pose === "dodge") E.pose = "idle";

    // falls end the match instantly
    if (r.pFall || r.eFall) {
      await this.playFallEnd(r, tok);
      return;
    }

    // KO check
    if (P.hp <= 0 || E.hp <= 0) {
      await this.playKo(tok);
      return;
    }
    await this.wait(160, tok);
  }

  private poseForAction(f: Fighter, a: Action) {
    if (a === "block") {
      this.setPose(f, "block", 700);
      f.holdPose = true;
    } else if (a === "bash") {
      this.setPose(f, "block", 700); // щит вверх
      f.holdPose = true;
    } else if (a === "reflect") {
      this.setPose(f, "dodge", 620); // зеркальная стойка
      sfx.dodge();
      this.ghostBurst(f);
    } else if (a === "dodge") {
      this.setPose(f, "dodge", 620);
      sfx.dodge();
      this.ghostBurst(f);
    }
    // roll: поза ставится в animateMove (knock-отскок уже дал «hurt»)
  }

  private animateMove(f: Fighter, r: StepResult, who: "p" | "e", tok: number) {
    const mv = who === "p" ? r.pMove : r.eMove;
    const opp = who === "p" ? this.e : this.p;
    switch (mv.kind) {
      case "walk": {
        sfx.whoosh();
        this.setPose(f, "walk", 400);
        this.dust(f.x, GROUND_Y, 4, 0.5);
        this.tween(230, (t) => {
          f.x = tileCenter(mv.from) + (tileCenter(mv.to) - tileCenter(mv.from)) * t;
          f.facing = opp.x > f.x ? 1 : -1;
        }, easeInOut, tok).then(() => {
          if (f.pose === "walk") f.pose = "idle";
          this.dust(f.x, GROUND_Y, 3, 0.4);
        });
        break;
      }
      case "bump": {
        sfx.bump();
        const dir = Math.sign(opp.x - f.x) || 1;
        this.tween(150, (t) => {
          f.x = tileCenter(mv.from) + Math.sin(Math.PI * t) * 9 * dir;
        }, (t) => t, tok).then(() => {
          f.x = tileCenter(mv.from);
          this.dust(f.x + dir * 20, GROUND_Y, 3, 0.4);
        });
        break;
      }
      case "leap": {
        sfx.leap();
        this.setPose(f, "leap", 460);
        const h = 34 + mv.dist * 16;
        const fromX = tileCenter(mv.from);
        const toX = tileCenter(mv.to);
        this.dust(f.x, GROUND_Y, 6, 0.7);
        this.tween(380, (t) => {
          f.x = fromX + (toX - fromX) * t;
          f.air = Math.sin(Math.PI * t) * h;
          f.facing = opp.x > f.x ? 1 : -1; // turn mid-air when crossing over
        }, (t) => t, tok).then(() => {
          f.air = 0;
          if (f.pose === "leap") f.pose = "idle";
          this.dust(f.x, GROUND_Y, 7, 0.8);
          sfx.land();
          this.shake(0.12);
        });
        break;
      }
      case "roll": {
        // низкий рывок понизу: призрак-шлейф + клубы пыли
        sfx.dodge();
        sfx.whoosh();
        this.setPose(f, "roll", 420);
        const fromX = tileCenter(mv.from);
        const toX = tileCenter(mv.to);
        const dir = Math.sign(toX - fromX) || 1;
        this.dust(f.x, GROUND_Y, 6, 0.7);
        let ghosts = 0;
        this.tween(300, (t) => {
          f.x = fromX + (toX - fromX) * t;
          if (ghosts < 5 && Math.floor(t * 5) > ghosts) {
            ghosts = Math.floor(t * 5);
            this.ghostAt(f.x - dir * 10, GROUND_Y, -dir, "#7ee081");
            this.dust(f.x - dir * 14, GROUND_Y, 2, 0.5);
          }
        }, easeInOut, tok).then(() => {
          if (f.pose === "roll") f.pose = "idle";
          this.dust(f.x, GROUND_Y, 5, 0.6);
        });
        break;
      }
      case "knock": {
        this.setPose(f, "hurt", 420);
        f.flash = 0.6;
        this.dust(f.x, GROUND_Y, 5, 0.6);
        this.tween(210, (t) => {
          f.x = tileCenter(mv.from) + (tileCenter(mv.to) - tileCenter(mv.from)) * t;
        }, easeOut, tok).then(() => this.dust(f.x, GROUND_Y, 4, 0.5));
        break;
      }
      case "fall": {
        sfx.leap();
        this.setPose(f, "leap", 500);
        const dir = Math.sign(mv.to - mv.from) || 1;
        const fromX = tileCenter(mv.from);
        const edgeX = dir > 0 ? VIEW_W + 60 : -60;
        this.tween(360, (t) => {
          f.x = fromX + (fromX + dir * (TILE_W * 1.4) - fromX) * t;
          f.air = Math.sin(Math.PI * Math.min(1, t * 1.1)) * 60;
        }, (t) => t, tok).then(() => {
          sfx.fall();
          this.shake(0.5);
          this.slowMo(0.4, 650, tok);
          this.tween(520, (t) => {
            f.x = fromX + dir * TILE_W * 1.4 + (edgeX - fromX - dir * TILE_W * 1.4) * t;
            f.air = 60 * (1 - t) - 260 * t * t;
          }, easeIn, tok).then(() => {
            f.dead = true;
          });
        });
        break;
      }
      default:
        break;
    }
  }

  private resolveImpacts(r: StepResult, tok: number) {
    const P = this.p;
    const E = this.e;
    const mid = { x: (P.x + E.x) / 2, y: GROUND_Y - 52 - Math.max(P.air, E.air) * 0.4 };

    const hitFx = (victim: Fighter, color: string, amount: number) => {
      victim.flash = 1;
      this.setPose(victim, "hurt", 420);
      const vy = GROUND_Y - victim.air - 44;
      this.sparks(victim.x, vy, 10 + amount * 6, color);
      this.textPop(victim.x, vy - 34, `-${amount}`, "#ff5964");
      sfx.thud();
      if (amount > 1) sfx.ko(); // тяжёлое попадание
      this.shake(0.4 + amount * 0.18);
      this.flashA = Math.max(this.flashA, 0.12 + amount * 0.06);
      this.hitstop(0.22, 90 + amount * 30, tok);
    };

    // clash — blades cross at midpoint
    if (r.clash) {
      this.sparks(mid.x, mid.y, 22, "#ffc24b");
      this.sparks(mid.x, mid.y, 10, "#e8f4ff");
      this.textPop(mid.x, mid.y - 40, "ЛЯЗГ!", "#ffc24b");
      sfx.clang();
      this.shake(0.7);
      this.flashA = 0.22;
      this.hitstop(0.2, 130, tok);
    }

    if (r.dmgToE) {
      if (r.pStrike === "antiair") {
        this.textPop(E.x, GROUND_Y - E.air - 100, "КРИТ!", "#ffc24b");
        this.textPop(E.x, GROUND_Y - E.air - 78, "в полёте", "#3ddad7");
      }
      if (r.pStrike === "hit" && this.pPlan[this.ui.step] === "cleave")
        this.textPop(E.x, GROUND_Y - E.air - 78, "РАССЕЧЕНИЕ", "#ff8c42");
      hitFx(E, "#ff5964", r.dmgToE);
      E.hp = Math.max(0, E.hp - r.dmgToE);
      this.stats.dealt += r.dmgToE;
    }
    if (r.dmgToP) {
      if (r.eStrike === "antiair") {
        this.textPop(P.x, GROUND_Y - P.air - 100, "КРИТ!", "#ffc24b");
        this.textPop(P.x, GROUND_Y - P.air - 78, "в полёте", "#3ddad7");
      }
      if (r.eStrike === "hit" && this.ePlan[this.ui.step] === "cleave")
        this.textPop(P.x, GROUND_Y - P.air - 78, "РАССЕЧЕНИЕ", "#ff8c42");
      hitFx(P, "#ff8c42", r.dmgToP);
      P.hp = Math.max(0, P.hp - r.dmgToP);
      this.stats.taken += r.dmgToP;
    }
    if (r.dmgToE || r.dmgToP) this.patch({ pHp: P.hp, eHp: E.hp, stats: { ...this.stats } });

    // удар щитом: атакующий отлетает и получает урон (урон уже учтён в dmgToP/dmgToE)
    if (r.pStrike === "bashed") {
      this.blockRing(E, "#e9c46a");
      sfx.block();
      sfx.clang();
      this.sparks(P.x + P.facing * 20, GROUND_Y - 50, 12, "#e9c46a");
      this.textPop(E.x, GROUND_Y - 112, "ЩИТ!", "#e9c46a");
      this.shake(0.5);
    }
    if (r.eStrike === "bashed") {
      this.blockRing(P, "#e9c46a");
      sfx.block();
      sfx.clang();
      this.sparks(E.x + E.facing * 20, GROUND_Y - 50, 12, "#e9c46a");
      this.textPop(P.x, GROUND_Y - 112, "ЩИТ!", "#e9c46a");
      this.shake(0.5);
    }
    // отражение: зеркальная вспышка
    if (r.pStrike === "reflected") {
      this.blockRing(E, "#c77dff");
      sfx.reflect();
      this.sparks(P.x, GROUND_Y - 60, 12, "#c77dff");
      this.textPop(E.x, GROUND_Y - 112, "ЗЕРКАЛО", "#c77dff");
      this.shake(0.4);
    }
    if (r.eStrike === "reflected") {
      this.blockRing(P, "#c77dff");
      sfx.reflect();
      this.sparks(E.x, GROUND_Y - 60, 12, "#c77dff");
      this.textPop(P.x, GROUND_Y - 112, "ЗЕРКАЛО", "#c77dff");
      this.shake(0.4);
    }

    // blocked strike -> clang + ring on blocker
    if (r.pStrike === "blocked") {
      this.blockRing(E);
      sfx.block();
      sfx.clang();
      this.sparks(E.x + E.facing * 26, GROUND_Y - 52, 10, "#aebbdd");
      this.textPop(E.x, GROUND_Y - 110, "БЛОК", "#aebbdd");
      this.shake(0.35);
    }
    if (r.eStrike === "blocked") {
      this.blockRing(P);
      sfx.block();
      sfx.clang();
      this.sparks(P.x + P.facing * 26, GROUND_Y - 52, 10, "#aebbdd");
      this.textPop(P.x, GROUND_Y - 110, "БЛОК", "#aebbdd");
      this.shake(0.35);
    }

    // dodged
    if (r.pStrike === "dodged") this.textPop(E.x, GROUND_Y - 104, "МИМО", "#b08cff");
    if (r.eStrike === "dodged") this.textPop(P.x, GROUND_Y - 104, "МИМО", "#b08cff");
    // ушёл перекатом — клинок рассёк пустоту над спиной
    if (r.pStrike === "rolled") this.textPop(E.x, GROUND_Y - 96, "ПЕРЕКАТ", "#7ee081");
    if (r.eStrike === "rolled") this.textPop(P.x, GROUND_Y - 96, "ПЕРЕКАТ", "#7ee081");
    if (r.pStrike === "whiff") this.textPop(P.x + P.facing * 46, GROUND_Y - 84, "свист", "#8f96c4");
    if (r.eStrike === "whiff") this.textPop(E.x + E.facing * 46, GROUND_Y - 84, "свист", "#8f96c4");
  }

  // ---------------- endings ----------------
  private async playFallEnd(r: StepResult, tok: number) {
    await this.wait(500, tok);
    if (tok !== this.token) return;
    this.banner("ЗА КРАЙ!", tok);
    this.say(r.pFall && r.eFall ? "Оба сорвались в пропасть..." : r.pFall ? "Ты сорвался с помоста!" : "Враг рухнул в пропасть!");
    await this.wait(900, tok);
    if (tok !== this.token) return;
    this.endMatch(r.pFall && r.eFall ? "draw" : r.pFall ? "lose" : "win", tok);
  }

  private async playKo(tok: number) {
    const P = this.p;
    const E = this.e;
    this.patch({ phase: "ko" });
    this.banner("НОКАУТ", tok);
    sfx.ko();
    this.shake(0.9);
    this.flashA = 0.3;
    this.slowMo(0.32, 900, tok);
    const loser = P.hp <= 0 ? P : E;
    const winner = P.hp <= 0 ? E : P;
    this.sparks(loser.x, GROUND_Y - 50, 26, "#ffc24b");
    await this.wait(320, tok);
    if (tok !== this.token) return;
    loser.pose = "ko";
    loser.faded = true;
    this.dust(loser.x, GROUND_Y, 12, 1);
    winner.pose = "idle";
    await this.wait(1150, tok);
    if (tok !== this.token) return;
    this.endMatch(P.hp <= 0 && E.hp <= 0 ? "draw" : P.hp <= 0 ? "lose" : "win", tok);
  }

  private endMatch(result: GameResult, tok: number) {
    this.stats.exchanges++;
    this.patch({ screen: "over", result, stats: { ...this.stats }, phase: "ko" });
    if (result === "win") {
      sfx.win();
      for (let i = 0; i < 40; i++) this.emberBurst(this.p.x, GROUND_Y - 60);
    } else if (result === "lose") {
      sfx.lose();
    } else {
      sfx.clang();
    }
    this.say(
      result === "win"
        ? "Победа! Клинки не спорят."
        : result === "lose"
          ? "Поражение. Помост помнит всё."
          : "Ничья. Помост расступился под обоими."
    );
    void tok;
  }

  // ---------------- poses & fx helpers ----------------
  private setPose(f: Fighter, pose: Pose, dur: number) {
    f.pose = pose;
    f.poseT = 0;
    f.poseDur = dur;
  }

  private lunge(f: Fighter, dir: number, tok: number) {
    if (!dir) return;
    this.tween(90, (t) => {
      f.lunge = 16 * t;
    }, easeOut, tok).then(() =>
      this.tween(200, (t) => {
        f.lunge = 16 * (1 - t);
      }, easeIn, tok)
    );
  }

  private slowMo(scale: number, ms: number, tok: number) {
    this.slow = scale;
    this.wait(ms, tok).then(() => {
      this.slow = 1;
    });
  }

  private dust(x: number, y: number, n: number, power: number) {
    for (let i = 0; i < n; i++)
      this.particles.push({
        x: x + (Math.random() - 0.5) * 26,
        y: y - Math.random() * 6,
        vx: (Math.random() - 0.5) * 60 * power,
        vy: -Math.random() * 46 * power,
        g: 90,
        life: 0,
        max: 340 + Math.random() * 260,
        size: 3 + Math.random() * 4,
        color: Math.random() < 0.5 ? "#5a6aa0" : "#3a4670",
        kind: "rect",
      });
  }

  private sparks(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 60 + Math.random() * 220;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        g: 320,
        life: 0,
        max: 240 + Math.random() * 220,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.6 ? color : "#ffffff",
        kind: "rect",
      });
    }
  }

  private emberBurst(x: number, y: number) {
    this.particles.push({
      x: x + (Math.random() - 0.5) * 120,
      y,
      vx: (Math.random() - 0.5) * 40,
      vy: -60 - Math.random() * 130,
      g: -14,
      life: 0,
      max: 900 + Math.random() * 700,
      size: 2 + Math.random() * 3,
      color: Math.random() < 0.5 ? "#ffc24b" : "#ff8c42",
      kind: "rect",
    });
  }

  private ghostBurst(f: Fighter) {
    for (let i = 0; i < 6; i++)
      this.particles.push({
        x: f.x - f.facing * (8 + i * 5),
        y: GROUND_Y - 20 - Math.random() * 40,
        vx: -f.facing * 30,
        vy: 0,
        g: 0,
        life: 0,
        max: 300,
        size: 4,
        color: "#b08cff",
        kind: "rect",
      });
  }

  /** Призрачный шлейф в точке (для переката). */
  private ghostAt(x: number, y: number, dir: number, color: string) {
    for (let i = 0; i < 4; i++)
      this.particles.push({
        x: x + dir * i * 6,
        y: y - 12 - i * 9,
        vx: dir * 46,
        vy: 0,
        g: 0,
        life: 0,
        max: 260,
        size: 4,
        color,
        kind: "rect",
      });
  }

  private textPop(x: number, y: number, text: string, color: string) {
    this.particles.push({ x, y, vx: 0, vy: -46, g: -20, life: 0, max: 780, size: 13, color, kind: "text", text });
  }

  private spawnSlash(f: Fighter, big: boolean) {
    const x = f.x + f.facing * 44;
    const y = GROUND_Y - f.air - 50;
    for (let i = 0; i < (big ? 14 : 8); i++) {
      const a = -0.9 + Math.random() * 1.8;
      const rad = 26 + Math.random() * (big ? 30 : 20);
      this.particles.push({
        x: x + Math.cos(a) * rad * f.facing,
        y: y + Math.sin(a) * rad,
        vx: f.facing * (60 + Math.random() * 90),
        vy: (Math.random() - 0.5) * 40,
        g: 0,
        life: 0,
        max: 150 + Math.random() * 120,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? "#e8f4ff" : "#ffc24b",
        kind: "rect",
      });
    }
  }

  private blockRing(f: Fighter, color = "#aebbdd") {
    for (let i = 0; i < 10; i++) {
      const a = -1.2 + (i / 9) * 2.4;
      this.particles.push({
        x: f.x + f.facing * 26 + Math.cos(a) * 6,
        y: GROUND_Y - 52 + Math.sin(a) * 26,
        vx: f.facing * 30,
        vy: 0,
        g: 0,
        life: 0,
        max: 260,
        size: 3,
        color,
        kind: "rect",
      });
    }
  }

  // ---------------- update ----------------
  private update(dt: number) {
    const dtw = dt * this.slow;
    this.time += dtw / 1000;

    for (const t of this.timers) t.t += dtw;
    for (const t of this.timers) if (t.t >= t.ms && t.tok === this.token) t.res();
    this.timers = this.timers.filter((t) => t.t < t.ms);

    for (const tw of this.tweens) {
      tw.t += dtw;
      tw.fn(tw.ease(Math.min(1, tw.t / tw.ms)));
    }
    for (const tw of this.tweens) if (tw.t >= tw.ms && tw.tok === this.token) tw.res();
    this.tweens = this.tweens.filter((t) => t.t < t.ms);

    for (const f of [this.p, this.e]) {
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dtw / 380);
      if (!f.holdPose && (f.pose === "strike" || f.pose === "dodge" || f.pose === "hurt")) {
        f.poseT = Math.min(1, f.poseT + dtw / f.poseDur);
        if (f.poseT >= 1) f.pose = "idle";
      }
    }

    // ambient embers
    if (Math.random() < 0.06 && this.particles.length < 220)
      this.particles.push({
        x: Math.random() * VIEW_W,
        y: VIEW_H - 40,
        vx: (Math.random() - 0.5) * 14,
        vy: -16 - Math.random() * 26,
        g: -3,
        life: 0,
        max: 2600 + Math.random() * 1800,
        size: 2,
        color: Math.random() < 0.6 ? "#ff8c42" : "#ffc24b",
        kind: "rect",
      });

    this.particles = this.particles.filter((pt) => {
      pt.life += dtw;
      if (pt.life >= pt.max) return false;
      pt.vy += (pt.g * dtw) / 1000;
      pt.x += (pt.vx * dtw) / 1000;
      pt.y += (pt.vy * dtw) / 1000;
      return true;
    });

    this.shakeMag = Math.max(0, this.shakeMag - dt / 420);
    this.flashA = Math.max(0, this.flashA - dt / 380);
  }

  // ---------------- render ----------------
  private render(dpr: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sh = this.shakeMag * this.shakeMag * 13;
    const ox = (Math.random() - 0.5) * 2 * sh;
    const oy = (Math.random() - 0.5) * 2 * sh;
    ctx.save();
    ctx.translate(ox, oy);

    this.drawBackground(ctx);
    this.drawArena(ctx);
    this.drawFighterShadow(ctx, this.p);
    this.drawFighterShadow(ctx, this.e);
    this.drawFighterBody(ctx, this.p, PLAYER_LOOK);
    this.drawFighterBody(ctx, this.e, this.eLook);
    this.drawParticles(ctx);

    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    vg.addColorStop(0, "rgba(5,6,16,0)");
    vg.addColorStop(1, "rgba(5,6,16,0.62)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    if (this.flashA > 0) {
      ctx.fillStyle = `rgba(255,244,220,${this.flashA})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  private drawFighterShadow(ctx: CanvasRenderingContext2D, f: Fighter) {
    if (f.dead || f.air < 0) return;
    const a = Math.max(0.08, 0.4 - f.air / 260);
    drawShadow(ctx, f.x, GROUND_Y + 6, Math.max(14, 30 - f.air / 9), a);
  }

  private drawFighterBody(ctx: CanvasRenderingContext2D, f: Fighter, look: typeof PLAYER_LOOK) {
    if (f.dead && f.air <= -240) return;
    // dodge afterimages
    if (f.pose === "dodge") {
      for (const [off, al] of [
        [-14, 0.22],
        [-26, 0.1],
      ] as [number, number][]) {
        drawFighter(ctx, f.x + f.facing * off, GROUND_Y + f.fallY, look, {
          facing: f.facing,
          pose: "dodge",
          poseT: f.poseT,
          time: this.time,
          flash: 0,
          lunge: f.lunge,
          alpha: al,
        });
      }
    }
    const alpha = f.faded ? 0.72 : 1;
    drawFighter(ctx, f.x, GROUND_Y - f.air + f.fallY, look, {
      facing: f.facing,
      pose: f.pose,
      poseT: f.poseT,
      time: this.time,
      flash: f.flash,
      lunge: f.lunge,
      alpha,
    });
    // block shield arc
    if (f.pose === "block") {
      ctx.fillStyle = "rgba(174,187,221,0.5)";
      for (let i = 0; i < 7; i++) {
        const a = -1.1 + (i / 6) * 2.2;
        ctx.fillRect(f.x + f.facing * 30 + Math.cos(a) * 4, GROUND_Y - 52 + Math.sin(a) * 30, 4, 4);
      }
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const pt of this.particles) {
      const k = 1 - pt.life / pt.max;
      if (pt.kind === "text") {
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.font = `${pt.size}px "Press Start 2P", monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = "#070919";
        ctx.fillText(pt.text ?? "", pt.x + 2, pt.y + 2);
        ctx.fillStyle = pt.color;
        ctx.fillText(pt.text ?? "", pt.x, pt.y);
        ctx.globalAlpha = 1;
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
        ctx.globalAlpha = 1;
      }
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, "#0a0d1d");
    sky.addColorStop(0.55, "#191540");
    sky.addColorStop(0.8, "#33204d");
    sky.addColorStop(1, "#12102a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // stars
    for (const s of this.stars) {
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.time * 1.4 + s.tw));
      ctx.globalAlpha = tw * 0.8;
      ctx.fillStyle = "#c9d4ff";
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // blood moon
    const mx = 700;
    const my = 118;
    const glow = ctx.createRadialGradient(mx, my, 20, mx, my, 150);
    glow.addColorStop(0, "rgba(255,71,87,0.34)");
    glow.addColorStop(1, "rgba(255,71,87,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - 160, my - 160, 320, 320);
    ctx.fillStyle = "#ff4757";
    ctx.beginPath();
    ctx.arc(mx, my, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d63646";
    for (const [cx, cy, cr] of [
      [-18, -10, 9],
      [12, 16, 7],
      [20, -18, 6],
      [-6, 24, 5],
    ] as [number, number, number][]) {
      ctx.beginPath();
      ctx.arc(mx + cx, my + cy, cr, 0, Math.PI * 2);
      ctx.fill();
    }

    // far mountains
    ctx.fillStyle = "#141134";
    ctx.beginPath();
    ctx.moveTo(0, 330);
    ctx.lineTo(120, 240);
    ctx.lineTo(250, 316);
    ctx.lineTo(390, 226);
    ctx.lineTo(520, 308);
    ctx.lineTo(660, 250);
    ctx.lineTo(820, 318);
    ctx.lineTo(960, 258);
    ctx.lineTo(960, 540);
    ctx.lineTo(0, 540);
    ctx.fill();
    // near ridge
    ctx.fillStyle = "#1b1740";
    ctx.beginPath();
    ctx.moveTo(0, 380);
    ctx.lineTo(170, 316);
    ctx.lineTo(330, 372);
    ctx.lineTo(480, 322);
    ctx.lineTo(640, 378);
    ctx.lineTo(800, 330);
    ctx.lineTo(960, 376);
    ctx.lineTo(960, 540);
    ctx.lineTo(0, 540);
    ctx.fill();

    // torii gate silhouette
    ctx.fillStyle = "#100d28";
    ctx.fillRect(368, 168, 16, 230);
    ctx.fillRect(576, 168, 16, 230);
    ctx.fillRect(330, 150, 300, 16);
    ctx.fillRect(344, 146, 272, 8);
    ctx.fillRect(356, 196, 248, 10);
    ctx.fillStyle = "#241d4a";
    ctx.fillRect(330, 150, 300, 3);

    // hanging lanterns
    for (const [lx, ph] of [
      [150, 0],
      [810, 2.4],
    ] as [number, number][]) {
      const sway = Math.sin(this.time * 0.9 + ph) * 6;
      const ly = 96 + Math.sin(this.time * 1.3 + ph) * 3;
      ctx.strokeStyle = "#070919";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx + sway, ly - 26);
      ctx.stroke();
      const flick = 0.75 + 0.25 * Math.sin(this.time * 7 + ph * 3) * Math.sin(this.time * 11 + ph);
      const lg = ctx.createRadialGradient(lx + sway, ly, 4, lx + sway, ly, 74);
      lg.addColorStop(0, `rgba(255,194,75,${0.34 * flick})`);
      lg.addColorStop(1, "rgba(255,140,66,0)");
      ctx.fillStyle = lg;
      ctx.fillRect(lx + sway - 80, ly - 80, 160, 160);
      ctx.fillStyle = "#c22f3e";
      ctx.fillRect(lx + sway - 11, ly - 18, 22, 34);
      ctx.fillStyle = "#ffc24b";
      ctx.fillRect(lx + sway - 11, ly - 18, 22, 4);
      ctx.fillRect(lx + sway - 11, ly + 12, 22, 4);
      ctx.fillStyle = "#7c1f30";
      ctx.fillRect(lx + sway - 11, ly - 6, 22, 2);
      ctx.fillRect(lx + sway - 11, ly + 2, 22, 2);
    }
  }

  private drawArena(ctx: CanvasRenderingContext2D) {
    // abyss under the platform
    const ab = ctx.createLinearGradient(0, GROUND_Y + TILE_H, 0, VIEW_H);
    ab.addColorStop(0, "#0a0c1e");
    ab.addColorStop(1, "#030409");
    ctx.fillStyle = ab;
    ctx.fillRect(0, GROUND_Y + TILE_H, VIEW_W, VIEW_H - GROUND_Y - TILE_H);

    // mist in the abyss
    for (let i = 0; i < 5; i++) {
      const mx = ((this.time * 14 + i * 210) % (VIEW_W + 200)) - 100;
      const my = GROUND_Y + 60 + (i % 3) * 26;
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = "#8f96c4";
      ctx.fillRect(mx, my, 90, 8);
      ctx.fillRect(mx + 24, my + 8, 60, 6);
      ctx.globalAlpha = 1;
    }

    // tiles
    for (let i = 0; i < BOARD_SIZE; i++) {
      const x = ARENA_X + i * TILE_W;
      // front
      ctx.fillStyle = i % 2 === 0 ? "#232b4d" : "#20274a";
      ctx.fillRect(x, GROUND_Y, TILE_W, TILE_H);
      // top
      ctx.fillStyle = i % 2 === 0 ? "#3a4670" : "#364169";
      ctx.fillRect(x, GROUND_Y - 6, TILE_W, 8);
      ctx.fillStyle = "#5a6aa0";
      ctx.fillRect(x, GROUND_Y - 6, TILE_W, 2);
      ctx.fillStyle = "#070919";
      ctx.fillRect(x + TILE_W - 3, GROUND_Y - 6, 3, TILE_H + 6);
      ctx.fillRect(x, GROUND_Y + TILE_H - 2, TILE_W, 2);
      // cracks
      ctx.fillStyle = "#1a2140";
      for (const c of this.cracks[i]) ctx.fillRect(c.x, c.y, c.w, 2);
      // coordinate notch
      ctx.fillStyle = "#141a33";
      ctx.fillRect(x + TILE_W / 2 - 2, GROUND_Y + 8, 4, 4);
    }

    // hazard edges — pulsing warning stripes
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 4);
    for (const side of [0, BOARD_SIZE - 1]) {
      const x = ARENA_X + side * TILE_W;
      const ex = side === 0 ? x : x + TILE_W - 22;
      ctx.save();
      ctx.beginPath();
      ctx.rect(ex, GROUND_Y - 6, 22, TILE_H + 6);
      ctx.clip();
      for (let s = -1; s < 4; s++) {
        ctx.fillStyle = s % 2 === 0 ? "#ff4757" : "#3a1020";
        ctx.save();
        ctx.translate(ex + s * 12, GROUND_Y - 6);
        ctx.transform(1, 0, -0.6, 1, 0, 0);
        ctx.fillRect(0, 0, 8, TILE_H + 6);
        ctx.restore();
      }
      ctx.restore();
      // glow beyond edge
      const gx = side === 0 ? x - 26 : x + TILE_W + 26;
      const eg = ctx.createRadialGradient(gx, GROUND_Y + 8, 2, gx, GROUND_Y + 8, 46);
      eg.addColorStop(0, `rgba(255,71,87,${0.22 + 0.16 * pulse})`);
      eg.addColorStop(1, "rgba(255,71,87,0)");
      ctx.fillStyle = eg;
      ctx.fillRect(gx - 50, GROUND_Y - 40, 100, 100);
    }
  }
}
