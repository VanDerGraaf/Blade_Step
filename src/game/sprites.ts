// Procedural pixel-art fighter painter. Everything is drawn on a 4px grid,
// crisp rects only — no image assets.

export type Pose = "idle" | "walk" | "leap" | "strike" | "dodge" | "block" | "hurt" | "ko";

export interface FighterLook {
  outline: string;
  skin: string;
  skinSh: string;
  main: string;
  mainSh: string;
  accent: string;
  leg: string;
  legSh: string;
  blade: string;
  bladeEdge: string;
  guard: string;
  eye: string;
  hair: string;
}

export const PLAYER_LOOK: FighterLook = {
  outline: "#171225",
  skin: "#ffd9b3",
  skinSh: "#e0a877",
  main: "#2fa8a0",
  mainSh: "#1c7a74",
  accent: "#ffc24b",
  leg: "#2a3350",
  legSh: "#1f2740",
  blade: "#e8f4ff",
  bladeEdge: "#9fd8ff",
  guard: "#8a5a2a",
  eye: "#171225",
  hair: "#ffc24b",
};

export const ENEMY_LOOK: FighterLook = {
  outline: "#190a14",
  skin: "#e04a4a",
  skinSh: "#a92e35",
  main: "#6e2436",
  mainSh: "#48182a",
  accent: "#ffc24b",
  leg: "#3a1f33",
  legSh: "#291424",
  blade: "#dfe8f2",
  bladeEdge: "#8f96c4",
  guard: "#3a2a1a",
  eye: "#ffd23f",
  hair: "#2b0d1e",
};

interface DrawOpts {
  facing: 1 | -1;
  pose: Pose;
  poseT: number; // 0..1 inside pose
  time: number; // global, for bobbing
  flash: number; // 0..1 hit flash
  lunge: number; // px offset toward facing (strike dash)
  alpha?: number;
}

/** x,y = feet anchor (screen px). s = pixel unit (default 4). */
export function drawFighter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: FighterLook,
  o: DrawOpts,
  s = 4
) {
  const flashOn = o.flash > 0 && Math.floor(o.flash * 8) % 2 === 0;
  const C = (c: string) => (flashOn ? "#ffffff" : c);
  const bob =
    o.pose === "idle" ? Math.sin(o.time * 3) * 1 : o.pose === "walk" ? Math.abs(Math.sin(o.time * 10)) * -2 : 0;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.translate(x + o.lunge * o.facing, y + bob);
  ctx.scale(o.facing, 1);
  if (o.pose === "ko") {
    ctx.translate(0, -2);
    ctx.rotate(-Math.PI / 2);
  }

  const px = (gx: number, gy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = C(c);
    ctx.fillRect((gx - 8) * s, (gy - 20) * s, w * s, h * s);
  };

  // grid: 16 wide (0..15, center 8), 20 tall (0 top, 20 feet)
  const pose = o.pose;
  const t = o.poseT;

  // ---------- legs ----------
  const stepL = pose === "walk" ? (Math.sin(o.time * 10) > 0 ? 1 : 0) : 0;
  const stepR = pose === "walk" ? (Math.sin(o.time * 10) > 0 ? 0 : 1) : 0;
  const tuck = pose === "leap" ? 2 : 0;
  px(5, 16, 2, 4 - tuck - stepL, look.leg);
  px(9, 16, 2, 4 - tuck - stepR, look.legSh);
  if (tuck === 0) {
    px(4, 19 - stepL, 3, 1, look.outline); // feet
    px(9, 19 - stepR, 3, 1, look.outline);
  }

  // ---------- torso ----------
  const lean = pose === "dodge" || pose === "hurt" ? -1 : pose === "strike" && t > 0.3 && t < 0.65 ? 1 : 0;
  px(4 + lean, 9, 8, 7, look.main);
  px(4 + lean, 13, 8, 1, look.accent); // belt
  px(4 + lean, 9, 2, 7, look.mainSh); // side shade
  px(11 + lean, 10, 1, 2, look.mainSh);

  // ---------- head ----------
  const hx = 5 + lean;
  px(hx, 3, 6, 6, look.skin);
  px(hx, 7, 6, 2, look.skinSh);
  px(hx + 4, 5, 1, 1, look.eye); // eye (facing side)
  if (pose === "ko") px(hx + 3, 5, 3, 1, look.eye); // closed eye line

  // ---------- hat (player) / mane+horns (enemy) ----------
  if (look.hair === "#ffc24b") {
    // straw ronin hat
    px(hx - 2, 2, 10, 1, look.accent);
    px(hx - 1, 1, 8, 1, look.accent);
    px(hx + 1, 0, 4, 1, look.accent);
    px(hx - 2, 3, 10, 1, "#d99a2b");
  } else {
    // oni mane
    px(hx - 1, 2, 8, 2, look.hair);
    px(hx - 1, 4, 2, 4, look.hair);
    px(hx + 5, 4, 2, 3, look.hair);
    px(hx, 1, 1, 1, look.hair);
    px(hx + 5, 1, 1, 1, look.hair);
    // horns
    px(hx, 0, 1, 2, "#f2eeda");
    px(hx + 5, 0, 1, 2, "#f2eeda");
    // fang
    px(hx + 4, 8, 1, 1, "#f2eeda");
  }

  // ---------- sword arm ----------
  const handX = 11 + lean;
  const handY = 10;
  px(handX, handY, 2, 1, look.skin); // hand

  const blade = (bx: number, by: number, dx: number, dy: number, len: number) => {
    for (let i = 0; i < len; i++) {
      const c = i === 0 ? look.guard : i % 3 === 2 ? look.bladeEdge : look.blade;
      px(bx + dx * i, by + dy * i, 1, 1, c);
    }
  };

  if (pose === "block") {
    blade(handX + 2, handY + 3, 0, -1, 11);
    blade(handX + 3, handY + 2, 0, -1, 8);
    px(handX + 1, handY + 3, 3, 1, look.guard);
  } else if (pose === "strike") {
    if (t < 0.32) blade(handX + 1, handY - 1, -1, -1, 9); // windup behind
    else if (t < 0.68) {
      blade(handX + 2, handY, 1, 0, 11); // horizontal cut
      blade(handX + 2, handY + 1, 1, 0, 8);
    } else blade(handX + 1, handY + 1, 1, 1, 8); // recover
  } else if (pose === "leap") {
    blade(handX + 1, handY - 1, 1, -1, 9);
  } else if (pose === "dodge") {
    blade(handX + 1, handY + 2, 1, 1, 7);
  } else {
    blade(handX + 1, handY + 1, 1, 1, 9); // rest
  }

  ctx.restore();
}

/** Little shadow under a fighter. */
export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha: number) {
  ctx.fillStyle = `rgba(5,6,16,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}
