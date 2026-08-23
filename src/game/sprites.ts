// Detailed procedural pixel-art fighters on an 18x24 grid (4px cells).
// One shared humanoid skeleton; each kind adds its own head, torso, gear and weapon.

export type Pose = "idle" | "walk" | "leap" | "strike" | "dodge" | "block" | "hurt" | "ko";

export type FighterKind = "ronin" | "scarecrow" | "oni" | "guard" | "kitsune";

export interface Look {
  kind: FighterKind;
  outline: string;
  skin: string;
  skinSh: string;
  main: string;
  mainSh: string;
  mainHi: string;
  accent: string;
  leg: string;
  legSh: string;
  boot: string;
  blade: string;
  bladeSh: string;
  bladeHi: string;
  guard: string;
  eye: string;
  hair: string;
  gear: string;
  gearSh: string;
}

export const PLAYER_LOOK: Look = {
  kind: "ronin",
  outline: "#171225",
  skin: "#ffd9b3",
  skinSh: "#e0a877",
  main: "#2fa8a0",
  mainSh: "#1c7a74",
  mainHi: "#45c4ba",
  accent: "#ffc24b",
  leg: "#2a3350",
  legSh: "#1f2740",
  boot: "#5f4626",
  blade: "#e8f4ff",
  bladeSh: "#9fd8ff",
  bladeHi: "#ffffff",
  guard: "#8a5a2a",
  eye: "#171225",
  hair: "#3a2a1a",
  gear: "#e8b95a",
  gearSh: "#c89a3e",
};

export const ENEMY_LOOKS: Record<Exclude<FighterKind, "ronin">, Look> = {
  scarecrow: {
    kind: "scarecrow",
    outline: "#241a10",
    skin: "#c8a05a",
    skinSh: "#a8823e",
    main: "#6e6252",
    mainSh: "#57503f",
    mainHi: "#857a66",
    accent: "#a8823e",
    leg: "#7a5c34",
    legSh: "#5f4626",
    boot: "#4a3a22",
    blade: "#9a8a7a",
    bladeSh: "#77695a",
    bladeHi: "#b0a292",
    guard: "#5f4626",
    eye: "#1a1208",
    hair: "#e8c96a",
    gear: "#a8823e",
    gearSh: "#7a5c34",
  },
  oni: {
    kind: "oni",
    outline: "#1c0a12",
    skin: "#d94f4f",
    skinSh: "#a92e35",
    main: "#48182a",
    mainSh: "#351020",
    mainHi: "#6e2436",
    accent: "#ffc24b",
    leg: "#3a1f33",
    legSh: "#291424",
    boot: "#1f1420",
    blade: "#8f96a8",
    bladeSh: "#6a7080",
    bladeHi: "#c8cede",
    guard: "#3a2a1a",
    eye: "#ffd23f",
    hair: "#2b0d1e",
    gear: "#f2eeda",
    gearSh: "#c8c2ae",
  },
  guard: {
    kind: "guard",
    outline: "#10141e",
    skin: "#c9b8a0",
    skinSh: "#a89880",
    main: "#5a7a9a",
    mainSh: "#41597a",
    mainHi: "#7a9ab8",
    accent: "#ffc24b",
    leg: "#33485e",
    legSh: "#263849",
    boot: "#1c2836",
    blade: "#dfe8f2",
    bladeSh: "#a8b4c8",
    bladeHi: "#ffffff",
    guard: "#8a6a3a",
    eye: "#7adfff",
    hair: "#2a3340",
    gear: "#5a7a9a",
    gearSh: "#41597a",
  },
  kitsune: {
    kind: "kitsune",
    outline: "#1a1428",
    skin: "#f2eeda",
    skinSh: "#d8d0ba",
    main: "#b8a8d8",
    mainSh: "#9484b8",
    mainHi: "#d0c4e8",
    accent: "#ff5964",
    leg: "#9484b8",
    legSh: "#7a6a9e",
    boot: "#9484b8",
    blade: "#e8f4ff",
    bladeSh: "#b8d8f2",
    bladeHi: "#ffffff",
    guard: "#52308a",
    eye: "#ff5964",
    hair: "#f2eeda",
    gear: "#f2eeda",
    gearSh: "#d8d0ba",
  },
};

interface DrawOpts {
  facing: 1 | -1;
  pose: Pose;
  poseT: number;
  time: number;
  flash: number;
  lunge: number;
  alpha?: number;
}

export function drawFighter(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  look: Look,
  o: DrawOpts,
  s = 4
) {
  const flashOn = o.flash > 0 && Math.floor(o.flash * 8) % 2 === 0;
  const C = (c: string) => (flashOn ? "#ffffff" : c);
  const bob =
    o.pose === "idle"
      ? Math.sin(o.time * 3) * 1
      : o.pose === "walk"
        ? Math.abs(Math.sin(o.time * 10)) * -2
        : 0;

  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.translate(x + o.lunge * o.facing, y + bob);
  ctx.scale(o.facing, 1);
  if (o.pose === "ko") {
    ctx.translate(0, -2);
    ctx.rotate(-Math.PI / 2);
  }

  // grid 18 wide (center 9), 24 tall (24 = feet)
  const px = (gx: number, gy: number, w: number, h: number, c: string) => {
    ctx.fillStyle = C(c);
    ctx.fillRect((gx - 9) * s, (gy - 24) * s, w * s, h * s);
  };

  const pose = o.pose;
  const t = o.poseT;
  const walkSw = pose === "walk" ? Math.sin(o.time * 10) : 0;
  const lean =
    pose === "dodge" || pose === "hurt" ? -1 : pose === "strike" && t > 0.3 && t < 0.65 ? 1 : 0;

  // ---------------- legs ----------------
  const tuck = pose === "leap" ? 2 : pose === "dodge" ? 1 : 0;
  const liftL = pose === "walk" && walkSw > 0 ? 1 : 0;
  const liftR = pose === "walk" && walkSw <= 0 ? 1 : 0;
  const legH = 5 - tuck;
  px(6, 19, 3, legH - liftL, look.leg);
  px(10, 19, 3, legH - liftR, look.legSh);
  px(6, 19, 1, legH - liftL, look.legSh); // inner shade
  if (tuck === 0) {
    px(5, 23 - liftL, 4, 1, look.boot);
    px(10, 23 - liftR, 4, 1, look.boot);
    px(5, 23 - liftL, 1, 1, look.outline);
    px(13, 23 - liftR, 1, 1, look.outline);
  }

  // per-kind extras behind torso
  if (look.kind === "kitsune") drawTails(ctx, px, look, C, o);

  // ---------------- torso ----------------
  drawTorso(ctx, px, look, C, lean);

  // scarf / sash detail
  if (look.kind === "ronin") {
    px(3 + lean, 11, 2, 2, look.mainSh); // scarf tail
    px(3 + lean, 10, 8, 1, look.mainSh); // collar
    px(10 + lean, 10, 3, 1, look.mainHi);
  }

  // ---------------- head + face + gear ----------------
  drawHead(ctx, px, look, C, lean, pose);

  // ---------------- arm + weapon ----------------
  drawArmWeapon(ctx, px, look, C, pose, t, lean);

  ctx.restore();
}

// ---------------------------------------------------------------- torso

function drawTorso(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, lean: number) {
  void ctx;
  void C;
  const k = look.kind;
  const x = 5 + lean;

  // neck bridging head and torso
  const neck = k === "guard" ? look.gearSh : k === "kitsune" ? look.mainSh : k === "scarecrow" ? look.skin : look.skin;
  px(7 + lean, 9, 4, 2, neck);

  if (k === "scarecrow") {
    // tattered robe
    px(x, 11, 9, 8, look.main);
    px(x, 11, 2, 8, look.mainSh);
    px(x + 7, 12, 1, 6, look.mainSh);
    px(x + 2, 12, 2, 1, look.mainHi);
    px(x + 5, 14, 2, 1, look.mainHi);
    px(x, 16, 9, 1, look.accent); // rope belt
    px(x + 3, 17, 1, 2, look.accent); // rope end
    // patches
    px(x + 5, 11, 2, 2, look.mainSh);
    px(x + 1, 14, 1, 1, look.outline);
    px(x + 6, 16, 1, 1, look.outline);
  } else if (k === "oni") {
    // muscular chest + armor skirt
    px(x, 11, 9, 5, look.skin); // bare chest
    px(x, 11, 2, 5, look.skinSh);
    px(x + 3, 12, 3, 1, look.skinSh); // pec line
    px(x + 4, 13, 1, 2, look.skinSh);
    px(x, 11, 9, 1, look.mainSh); // strap
    px(x + 6, 11, 1, 5, look.mainSh);
    px(x, 16, 9, 3, look.main); // armored skirt
    px(x, 16, 9, 1, look.mainHi);
    px(x + 2, 17, 2, 2, look.mainSh);
    px(x + 5, 17, 2, 2, look.mainSh);
    px(x, 16, 1, 3, look.accent); // gold trim
    px(x + 8, 16, 1, 3, look.accent);
  } else if (k === "guard") {
    // layered lamellar armor
    px(x, 11, 9, 8, look.main);
    px(x, 11, 9, 1, look.mainHi);
    px(x, 11, 2, 8, look.mainSh);
    px(x, 13, 9, 1, look.mainSh); // plate seam
    px(x, 15, 9, 1, look.mainSh);
    px(x + 2, 12, 5, 1, look.mainHi);
    px(x + 3, 14, 3, 1, look.mainHi);
    px(x, 11, 9, 1, look.accent); // gold collar
    px(x + 3, 16, 3, 1, look.accent); // belt buckle
    px(x, 18, 9, 1, look.mainSh);
  } else if (k === "kitsune") {
    // flowing robes
    px(x, 11, 9, 7, look.main);
    px(x, 11, 2, 7, look.mainSh);
    px(x + 7, 12, 1, 5, look.mainSh);
    px(x + 2, 12, 2, 1, look.mainHi);
    px(x + 4, 14, 3, 1, look.mainHi);
    px(x, 15, 9, 1, look.accent); // red sash
    px(x + 3, 16, 1, 2, look.accent);
    // robe hem wisps
    px(x + 1, 18, 2, 1, look.mainSh);
    px(x + 6, 18, 2, 1, look.mainSh);
  } else {
    // ronin gi
    px(x, 11, 9, 7, look.main);
    px(x, 11, 2, 7, look.mainSh);
    px(x + 7, 12, 1, 5, look.mainSh);
    px(x + 2, 12, 3, 1, look.mainHi); // lapel highlight
    px(x, 14, 9, 1, look.accent); // belt
    px(x + 3, 15, 1, 2, look.accent);
    px(x + 4, 12, 1, 2, look.outline); // gi fold
    px(x, 18, 9, 1, look.mainSh);
  }
}

// ---------------------------------------------------------------- head

function drawHead(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, lean: number, pose: Pose) {
  void ctx;
  void C;
  const k = look.kind;
  const hx = 5 + lean;

  if (k === "scarecrow") {
    // burlap sack head
    px(hx, 3, 8, 6, look.skin);
    px(hx, 3, 8, 1, look.skinSh);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 3, 1, 6, look.skinSh);
    // stitched X eyes
    px(hx + 5, 5, 1, 1, look.eye);
    px(hx + 6, 4, 1, 1, look.eye);
    px(hx + 6, 6, 1, 1, look.eye);
    px(hx + 2, 5, 1, 1, look.eye);
    px(hx + 1, 4, 1, 1, look.eye);
    px(hx + 1, 6, 1, 1, look.eye);
    // stitched mouth
    px(hx + 4, 7, 3, 1, look.eye);
    px(hx + 4, 6, 1, 1, look.eye);
    px(hx + 6, 6, 1, 1, look.eye);
    // straw tufts
    px(hx + 2, 2, 1, 2, look.hair);
    px(hx + 5, 1, 1, 3, look.hair);
    px(hx + 7, 2, 1, 2, look.hair);
    px(hx - 1, 5, 1, 2, look.hair);
    px(hx + 8, 5, 1, 2, look.hair);
  } else if (k === "oni") {
    // red face
    px(hx, 3, 8, 6, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 3, 1, 6, look.skinSh);
    // eyes
    px(hx + 4, 5, 2, 1, look.eye);
    if (pose === "ko") px(hx + 4, 5, 2, 1, look.outline);
    // fangs + jaw
    px(hx + 4, 8, 1, 1, "#f2eeda");
    px(hx + 6, 8, 1, 1, "#f2eeda");
    // mane
    px(hx - 1, 2, 10, 2, look.hair);
    px(hx - 1, 4, 2, 4, look.hair);
    px(hx + 7, 4, 2, 3, look.hair);
    px(hx, 1, 1, 1, look.hair);
    px(hx + 7, 1, 1, 1, look.hair);
    // horns
    px(hx + 1, 0, 1, 2, look.gear);
    px(hx + 6, 0, 1, 2, look.gear);
    px(hx + 1, 0, 1, 1, look.gearSh);
  } else if (k === "guard") {
    // mostly helmet, glowing eyes through visor
    px(hx, 3, 8, 6, look.skin);
    px(hx, 6, 8, 3, look.gearSh); // face guard
    px(hx, 5, 8, 1, look.gear); // visor bar
    px(hx + 4, 6, 2, 1, look.eye); // glowing eyes
    if (pose === "ko") px(hx + 4, 6, 2, 1, look.outline);
    // helmet dome
    px(hx, 2, 8, 2, look.gear);
    px(hx + 1, 1, 6, 1, look.gear);
    px(hx, 2, 1, 4, look.gearSh);
    // gold crescent crest
    px(hx + 3, 0, 2, 1, look.accent);
    px(hx + 2, 1, 1, 1, look.accent);
    px(hx + 5, 1, 1, 1, look.accent);
    // neck guard
    px(hx - 1, 5, 1, 3, look.gearSh);
    px(hx + 8, 5, 1, 3, look.gearSh);
  } else if (k === "kitsune") {
    // white fox mask
    px(hx, 3, 8, 6, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 3, 1, 6, look.skinSh);
    // red markings
    px(hx + 1, 4, 1, 2, look.accent);
    px(hx + 7, 4, 1, 2, look.accent);
    px(hx + 4, 7, 1, 1, look.accent); // nose
    // slit eyes
    px(hx + 3, 5, 2, 1, look.eye);
    px(hx + 6, 5, 1, 1, look.eye);
    if (pose === "ko") px(hx + 3, 5, 3, 1, look.outline);
    // fox ears
    px(hx, 1, 2, 2, look.hair);
    px(hx + 6, 1, 2, 2, look.hair);
    px(hx, 0, 1, 1, look.hair);
    px(hx + 7, 0, 1, 1, look.hair);
    px(hx, 2, 1, 1, look.skinSh);
    px(hx + 7, 2, 1, 1, look.skinSh);
  } else {
    // ronin face under hat
    px(hx, 4, 8, 5, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 4, 1, 5, look.skinSh);
    px(hx + 5, 6, 1, 1, look.eye);
    if (pose === "ko") px(hx + 4, 6, 3, 1, look.eye);
    px(hx + 4, 8, 2, 1, look.skinSh); // stubble shadow
    // straw hat
    px(hx - 2, 3, 12, 1, look.gear);
    px(hx - 1, 2, 10, 1, look.gear);
    px(hx + 1, 1, 6, 1, look.gear);
    px(hx + 2, 0, 4, 1, look.gear);
    px(hx - 2, 4, 12, 1, look.gearSh);
    px(hx + 2, 1, 4, 1, look.gearSh);
  }
}

// ---------------------------------------------------------------- tails (kitsune)

function drawTails(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, o: DrawOpts) {
  void ctx;
  void C;
  const sway = Math.sin(o.time * 4) * 1;
  // two ghostly tails behind
  px(1 - sway, 13, 3, 2, look.mainSh);
  px(0 - sway, 15, 3, 2, look.mainSh);
  px(-1 - sway, 17, 2, 2, look.mainSh);
  px(2 - sway, 12, 2, 2, look.main);
  px(1 - sway, 18, 2, 1, look.gear);
}

// ---------------------------------------------------------------- arm + weapon

function drawArmWeapon(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, pose: Pose, t: number, lean: number) {
  void ctx;
  void C;
  const k = look.kind;
  const hx = 12 + lean;
  const hy = 12;

  // shoulder / arm
  px(hx, hy, 2, 2, k === "oni" ? look.skin : look.main);
  px(hx + 1, hy + 2, 1, 1, k === "oni" ? look.skinSh : look.mainSh);
  // pauldron for guard / oni
  if (k === "guard") px(hx - 1, hy - 1, 4, 2, look.gear);
  if (k === "oni") px(hx - 1, hy - 1, 4, 2, look.mainHi);
  // hand
  px(hx + 1, hy + 2, 2, 1, k === "scarecrow" ? look.leg : look.skin);

  const bladeLine = (bx: number, by: number, dx: number, dy: number, len: number, w: number) => {
    for (let i = 0; i < len; i++) {
      let c = look.blade;
      if (i === 0) c = look.guard;
      else if (i % 3 === 2) c = look.bladeHi;
      else if (i % 3 === 1) c = look.bladeSh;
      for (let j = 0; j < w; j++) px(bx + dx * i, by + dy * i + j, 1, 1, c);
    }
  };

  const handX = hx + 2;
  const handY = hy + 2;

  if (pose === "block") {
    bladeLine(handX + 1, handY + 3, 0, -1, 11, 1);
    bladeLine(handX + 2, handY + 2, 0, -1, 8, 1);
    px(handX, handY + 3, 3, 1, look.guard);
  } else if (pose === "strike") {
    if (t < 0.32) bladeLine(handX, handY - 2, -1, -1, 9, 1);
    else if (t < 0.68) {
      bladeLine(handX + 1, handY, 1, 0, k === "guard" ? 13 : 11, k === "oni" ? 2 : 1);
      bladeLine(handX + 1, handY + 1, 1, 0, 8, 1);
    } else bladeLine(handX, handY + 1, 1, 1, 8, 1);
  } else if (pose === "leap") {
    bladeLine(handX, handY - 2, 1, -1, 9, 1);
  } else if (pose === "dodge") {
    bladeLine(handX, handY + 1, 1, 1, 7, 1);
  } else {
    bladeLine(handX, handY, 1, 1, 9, k === "oni" ? 2 : 1);
  }

  // kitsune spirit flame at blade tip when idle
  if (k === "kitsune" && pose === "idle") {
    px(handX + 8, handY + 8, 1, 1, look.eye);
  }
}

type Px = (gx: number, gy: number, w: number, h: number, c: string) => void;
type CFn = (c: string) => string;

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, alpha: number) {
  ctx.fillStyle = `rgba(5,6,16,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, w, w * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}
