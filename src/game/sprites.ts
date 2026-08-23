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
  outline: "#1a1a1a",
  skin: "#ffd9b3",
  skinSh: "#e0a877",
  main: "#2a9d8f", // бирюзовое кимоно
  mainSh: "#1f7a70",
  mainHi: "#3fbfae",
  accent: "#e9c46a", // золотой пояс
  leg: "#2a3350",
  legSh: "#1f2740",
  boot: "#5f4626",
  blade: "#a8a8a8", // серое лезвие катаны
  bladeSh: "#808080",
  bladeHi: "#d0d0d0",
  guard: "#4a3a2a",
  eye: "#1a1a1a",
  hair: "#e63946", // красный шарф
  gear: "#c9a96e", // соломенная шляпа
  gearSh: "#a8895a",
};

export const ENEMY_LOOKS: Record<Exclude<FighterKind, "ronin">, Look> = {
  scarecrow: {
    kind: "scarecrow",
    outline: "#1a1a1a",
    skin: "#8b6f47", // мешковина
    skinSh: "#6f5738",
    main: "#6b4f2e", // рваная хламида
    mainSh: "#553e24",
    mainHi: "#7f6140",
    accent: "#4a3520", // верёвка
    leg: "#7a5c34",
    legSh: "#5f4626",
    boot: "#5f4626", // босые ноги
    blade: "#5c3d1e", // деревянный посох
    bladeSh: "#4a3016",
    bladeHi: "#74502a",
    guard: "#5c3d1e",
    eye: "#1a1208",
    hair: "#d4a017", // солома
    gear: "#8b6f47",
    gearSh: "#6f5738",
  },
  oni: {
    kind: "oni",
    outline: "#1a1a1a",
    skin: "#c1121f", // красная кожа
    skinSh: "#97101a",
    main: "#6a0dad", // фиолетовая набедренная повязка
    mainSh: "#520a85",
    mainHi: "#7d2bbf",
    accent: "#ffd700",
    leg: "#c1121f",
    legSh: "#97101a",
    boot: "#97101a", // босой
    blade: "#808080", // металлическая канабо
    bladeSh: "#606060",
    bladeHi: "#a8a8a8",
    guard: "#3a2a1a",
    eye: "#ffd700", // жёлтые светящиеся глаза
    hair: "#6a0dad", // фиолетовая грива
    gear: "#2a2a2a", // чёрные рога
    gearSh: "#1a1a1a",
  },
  guard: {
    kind: "guard",
    outline: "#1a1a1a",
    skin: "#c9b8a0",
    skinSh: "#a89880",
    main: "#2f2f2f", // тёмная layered-броня
    mainSh: "#232323",
    mainHi: "#4a4a4a",
    accent: "#ffd700", // золотые акценты
    leg: "#3a3a3a",
    legSh: "#2a2a2a",
    boot: "#2a2a2a",
    blade: "#a8a8a8", // нагината
    bladeSh: "#808080",
    bladeHi: "#d0d0d0",
    guard: "#5c3d1e", // деревянное древко
    eye: "#ffd700", // светящиеся глаза
    hair: "#2a3340",
    gear: "#4a4a4a", // стальной кабуто
    gearSh: "#353535",
  },
  kitsune: {
    kind: "kitsune",
    outline: "#1a1a1a",
    skin: "#ffffff", // белая лисья маска
    skinSh: "#d8d0ba",
    main: "#9b5de5", // фиолетовое кимоно
    mainSh: "#7a45bf",
    mainHi: "#b57ff0",
    accent: "#c1121f", // красные узоры
    leg: "#f7f3ea", // белые таби
    legSh: "#d8d0ba",
    boot: "#8a6a3a",
    blade: "#00b4d8", // призрачный голубой клинок
    bladeSh: "#0090ad",
    bladeHi: "#4dd4ee",
    guard: "#52308a",
    eye: "#1a1a1a",
    hair: "#e07b39", // рыжие волосы
    gear: "#ff6b00", // оранжевое пламя
    gearSh: "#c77dff", // фиолетовые кончики хвостов
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
  const oniWide = look.kind === "oni" ? 1 : 0; // мускулистые ноги они
  px(6 - oniWide, 19, 3 + oniWide, legH - liftL, look.leg);
  px(10, 19, 3 + oniWide, legH - liftR, look.legSh);
  px(6 - oniWide, 19, 1, legH - liftL, look.legSh); // inner shade
  // поножи-пластины стража
  if (look.kind === "guard" && tuck === 0) {
    px(6, 20, 3, 1, look.mainHi);
    px(10, 21, 3, 1, look.mainHi);
  }
  if (tuck === 0) {
    px(5 - oniWide, 23 - liftL, 4 + oniWide, 1, look.boot);
    px(10, 23 - liftR, 4 + oniWide, 1, look.boot);
    px(5 - oniWide, 23 - liftL, 1, 1, look.outline);
    px(13 + oniWide, 23 - liftR, 1, 1, look.outline);
  }

  // per-kind extras behind torso
  if (look.kind === "kitsune") drawTails(ctx, px, look, C, o);

  // ---------------- torso ----------------
  drawTorso(ctx, px, look, C, lean);

  // scarf / sash detail
  if (look.kind === "ronin") {
    const wave = Math.sin(o.time * 5) > 0 ? 1 : 0; // лёгкое колыхание
    px(3 + lean, 10, 8, 1, look.hair); // красный шарф на шее
    px(1 + lean, 10, 2, 1, look.hair); // хвост, развевающийся назад
    px(0 + lean, 11 + wave, 2, 1, look.hair);
    px(10 + lean, 10, 3, 1, look.mainHi);
  }

  // ---------------- head + face + gear ----------------
  drawHead(ctx, px, look, C, lean, pose);

  // ---------------- arm + weapon ----------------
  drawArmWeapon(ctx, px, look, C, pose, t, lean, o);

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
    // рваная хламида с неровным краем
    px(x, 11, 9, 7, look.main);
    px(x, 11, 2, 7, look.mainSh);
    px(x + 7, 12, 1, 5, look.mainSh);
    px(x + 2, 12, 2, 1, look.mainHi);
    px(x + 5, 13, 2, 1, look.mainHi);
    // неровный рваный низ
    px(x + 1, 18, 2, 1, look.main);
    px(x + 4, 18, 1, 1, look.main);
    px(x + 6, 18, 2, 1, look.main);
    px(x + 3, 18, 1, 1, look.mainSh);
    // верёвочный пояс с узлом
    px(x, 15, 9, 1, look.accent);
    px(x + 4, 15, 2, 1, look.accent);
    px(x + 4, 16, 1, 2, look.accent); // свисающий конец
    // заплатки и дыры
    px(x + 5, 12, 2, 2, look.mainSh);
    px(x + 1, 13, 1, 1, look.outline);
    px(x + 6, 17, 1, 1, look.outline);
    px(x + 2, 16, 1, 1, look.outline);
  } else if (k === "oni") {
    // мускулистый красный торс
    px(x, 11, 9, 5, look.skin);
    px(x, 11, 2, 5, look.skinSh);
    px(x + 7, 11, 1, 5, look.skinSh);
    // рельеф мышц: грудь и пресс
    px(x + 3, 12, 3, 1, look.skinSh); // линия груди
    px(x + 4, 13, 1, 2, look.skinSh); // пресс
    px(x + 3, 14, 1, 1, look.skinSh);
    px(x + 5, 14, 1, 1, look.skinSh);
    // фиолетовая набедренная повязка
    px(x, 16, 9, 3, look.main);
    px(x, 16, 9, 1, look.mainHi);
    px(x + 2, 17, 2, 2, look.mainSh);
    px(x + 5, 17, 2, 2, look.mainSh);
    px(x, 16, 1, 3, look.accent); // золотая кайма
    px(x + 8, 16, 1, 3, look.accent);
  } else if (k === "guard") {
    // тёмная пластинчатая layered-броня
    px(x, 11, 9, 8, look.main);
    px(x, 11, 2, 8, look.mainSh);
    px(x + 7, 11, 1, 8, look.mainSh);
    // горизонтальные пластины
    px(x, 13, 9, 1, look.mainSh);
    px(x, 15, 9, 1, look.mainSh);
    px(x, 17, 9, 1, look.mainSh);
    px(x + 2, 12, 5, 1, look.mainHi);
    px(x + 3, 14, 3, 1, look.mainHi);
    px(x + 3, 16, 3, 1, look.mainHi);
    // заклёпки
    px(x + 1, 12, 1, 1, look.mainHi);
    px(x + 7, 12, 1, 1, look.mainHi);
    px(x + 1, 16, 1, 1, look.mainHi);
    px(x + 7, 16, 1, 1, look.mainHi);
    // золотой ворот и пряжка
    px(x, 11, 9, 1, look.accent);
    px(x + 3, 15, 3, 1, look.accent);
  } else if (k === "kitsune") {
    // струящееся фиолетовое кимоно
    px(x, 11, 9, 7, look.main);
    px(x, 11, 2, 7, look.mainSh);
    px(x + 7, 12, 1, 5, look.mainSh);
    px(x + 2, 12, 3, 1, look.mainHi); // воротник
    px(x + 4, 13, 3, 1, look.mainHi);
    // красный пояс-оби
    px(x, 15, 9, 1, look.accent);
    px(x + 3, 16, 1, 2, look.accent);
    // волнистый подол
    px(x + 1, 18, 2, 1, look.mainSh);
    px(x + 6, 18, 2, 1, look.mainSh);
  } else {
    // бирюзовое кимоно ронина с V-вырезом
    px(x, 11, 9, 7, look.main);
    px(x, 11, 2, 7, look.mainSh);
    px(x + 7, 12, 1, 5, look.mainSh);
    // V-образный вырез
    px(x + 3, 11, 1, 1, look.skinSh);
    px(x + 5, 11, 1, 1, look.skinSh);
    px(x + 4, 12, 1, 1, look.skinSh);
    px(x + 2, 12, 3, 1, look.mainHi); // лацкан
    // широкий золотой пояс
    px(x, 14, 9, 2, look.accent);
    px(x + 3, 16, 1, 1, look.accent);
    px(x, 14, 9, 1, "#f5d78a"); // светлая кромка пояса
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
    // крупная голова-мешок из мешковины
    px(hx - 1, 2, 10, 8, look.skin);
    px(hx - 1, 2, 10, 1, look.skinSh);
    px(hx - 1, 9, 10, 1, look.skinSh);
    px(hx - 1, 2, 1, 8, look.skinSh);
    px(hx + 7, 3, 1, 6, look.skinSh);
    // пучок соломы сверху
    px(hx + 1, 0, 1, 2, look.hair);
    px(hx + 3, 0, 2, 2, look.hair);
    px(hx + 6, 0, 1, 2, look.hair);
    px(hx + 4, 1, 1, 1, "#e8c040");
    px(hx - 1, 4, 1, 2, look.hair);
    px(hx + 8, 4, 1, 2, look.hair);
    // два чёрных крестика вместо глаз (X X)
    if (pose === "ko") {
      px(hx + 1, 5, 3, 1, look.eye);
      px(hx + 5, 5, 3, 1, look.eye);
    } else {
      px(hx + 1, 4, 1, 1, look.eye); px(hx + 3, 4, 1, 1, look.eye);
      px(hx + 2, 5, 1, 1, look.eye);
      px(hx + 1, 6, 1, 1, look.eye); px(hx + 3, 6, 1, 1, look.eye);
      px(hx + 5, 4, 1, 1, look.eye); px(hx + 7, 4, 1, 1, look.eye);
      px(hx + 6, 5, 1, 1, look.eye);
      px(hx + 5, 6, 1, 1, look.eye); px(hx + 7, 6, 1, 1, look.eye);
    }
    // рот — горизонтальная линия со стёжками
    px(hx + 2, 8, 5, 1, look.eye);
    px(hx + 3, 7, 1, 1, look.eye);
    px(hx + 5, 7, 1, 1, look.eye);
  } else if (k === "oni") {
    // красная морда
    px(hx, 3, 8, 6, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 3, 1, 6, look.skinSh);
    // жёлтые светящиеся глаза
    if (pose === "ko") {
      px(hx + 2, 5, 2, 1, look.outline);
      px(hx + 5, 5, 2, 1, look.outline);
    } else {
      px(hx + 2, 5, 2, 1, look.eye);
      px(hx + 5, 5, 2, 1, look.eye);
    }
    // белые клыки-бивни, торчащие вниз
    px(hx + 2, 8, 1, 2, "#f2eeda");
    px(hx + 5, 8, 1, 2, "#f2eeda");
    // фиолетовая грива
    px(hx - 1, 2, 10, 2, look.hair);
    px(hx - 1, 4, 2, 5, look.hair);
    px(hx + 7, 4, 2, 4, look.hair);
    px(hx, 1, 1, 1, look.hair);
    px(hx + 7, 1, 1, 1, look.hair);
    // два чёрных рога
    px(hx + 1, 0, 1, 3, look.gear);
    px(hx + 6, 0, 1, 3, look.gear);
  } else if (k === "guard") {
    // лицо скрыто, светящиеся глаза сквозь забрало
    px(hx, 3, 8, 6, look.gearSh);
    // стальной кабуто
    px(hx, 2, 8, 2, look.gear);
    px(hx + 1, 1, 6, 1, look.gear);
    px(hx, 2, 1, 5, look.gearSh);
    px(hx + 7, 2, 1, 5, look.gearSh);
    // золотой полумесяц
    px(hx + 3, 0, 2, 1, look.accent);
    px(hx + 2, 1, 1, 1, look.accent);
    px(hx + 5, 1, 1, 1, look.accent);
    // забрало с прорезями и светящимися глазами
    px(hx, 4, 8, 1, look.gear);
    if (pose === "ko") {
      px(hx + 2, 6, 2, 1, look.outline);
      px(hx + 5, 6, 2, 1, look.outline);
    } else {
      px(hx + 2, 6, 2, 1, look.eye);
      px(hx + 5, 6, 2, 1, look.eye);
    }
    px(hx, 7, 8, 2, look.gearSh); // нижняя пластина
    // нащёчники
    px(hx - 1, 4, 1, 4, look.gearSh);
    px(hx + 8, 4, 1, 4, look.gearSh);
  } else if (k === "kitsune") {
    // белая лисья маска
    px(hx, 3, 8, 6, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 3, 1, 6, look.skinSh);
    // красные узоры на маске
    px(hx + 1, 4, 1, 2, look.accent);
    px(hx + 6, 4, 1, 2, look.accent);
    px(hx + 3, 3, 2, 1, look.accent); // узор на лбу
    px(hx + 3, 7, 2, 1, look.accent); // нос/пасть
    // глаза-щелочки
    if (pose === "ko") {
      px(hx + 2, 5, 2, 1, look.outline);
      px(hx + 5, 5, 2, 1, look.outline);
    } else {
      px(hx + 2, 5, 2, 1, look.eye);
      px(hx + 5, 5, 2, 1, look.eye);
    }
    // лисьи уши
    px(hx, 1, 2, 2, look.hair);
    px(hx + 6, 1, 2, 2, look.hair);
    px(hx, 0, 1, 1, look.hair);
    px(hx + 7, 0, 1, 1, look.hair);
    px(hx + 1, 2, 1, 1, look.accent); // внутреннее ухо
    px(hx + 6, 2, 1, 1, look.accent);
    // рыжие волосы по бокам маски
    px(hx - 1, 3, 1, 5, look.hair);
    px(hx + 8, 3, 1, 4, look.hair);
  } else {
    // лицо ронина под шляпой (минимум деталей)
    px(hx, 4, 8, 5, look.skin);
    px(hx, 8, 8, 1, look.skinSh);
    px(hx, 4, 1, 5, look.skinSh);
    // два тёмных пикселя-глаза
    if (pose === "ko") {
      px(hx + 2, 6, 2, 1, look.eye);
      px(hx + 5, 6, 2, 1, look.eye);
    } else {
      px(hx + 3, 6, 1, 1, look.eye);
      px(hx + 5, 6, 1, 1, look.eye);
    }
    // широкая соломенная шляпа-конус
    px(hx - 2, 3, 12, 1, look.gear);
    px(hx - 2, 4, 12, 1, look.gearSh); // тень под полями
    px(hx - 1, 2, 10, 1, look.gear);
    px(hx + 1, 1, 6, 1, look.gear);
    px(hx + 2, 0, 4, 1, look.gear);
    px(hx + 2, 1, 4, 1, look.gearSh);
  }
}

// ---------------------------------------------------------------- tails (kitsune)

function drawTails(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, o: DrawOpts) {
  void ctx;
  void C;
  // два пушистых белых хвоста с фиолетовыми кончиками, покачиваются вразнобой
  const s1 = Math.round(Math.sin(o.time * 4));
  const s2 = Math.round(Math.sin(o.time * 4 + 2.1));
  // верхний хвост: растёт из-под торса, уходит назад-вверх
  px(3 - s1, 13, 3, 2, look.skin);
  px(2 - s1, 12, 3, 2, look.skin);
  px(1 - s1, 11, 3, 2, look.skin);
  px(0 - s1, 10, 2, 2, look.gearSh); // фиолетовый кончик
  // нижний хвост: уходит назад-вниз
  px(3 - s2, 15, 3, 2, look.skin);
  px(1 - s2, 16, 3, 2, look.skin);
  px(0 - s2, 18, 3, 2, look.skin);
  px(-1 - s2, 19, 2, 2, look.gearSh); // фиолетовый кончик
}

// ---------------------------------------------------------------- arm + weapon

function drawArmWeapon(ctx: CanvasRenderingContext2D, px: Px, look: Look, C: CFn, pose: Pose, t: number, lean: number, o: DrawOpts) {
  void ctx;
  void C;
  const k = look.kind;
  const hx = 12 + lean;
  const hy = 12;

  // плечо / рука (у они — мускулистая, красная)
  px(hx, hy, 2, 2, k === "oni" ? look.skin : look.main);
  px(hx + 1, hy + 2, 1, 1, k === "oni" ? look.skinSh : look.mainSh);
  // наплечники
  if (k === "guard") {
    px(hx - 1, hy - 1, 4, 2, look.gear);
    px(hx - 1, hy - 1, 4, 1, look.accent); // золотая кромка
  }
  if (k === "oni") px(hx - 1, hy - 1, 4, 2, look.mainHi);
  // кисть
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

  // шипы канабо (они): выступы по обе стороны линии
  const spikes = (bx: number, by: number, dx: number, dy: number, len: number) => {
    for (let i = 1; i < len; i += 2) {
      px(bx + dx * i - dy, by + dy * i + dx, 1, 1, look.bladeHi);
      px(bx + dx * i + dy, by + dy * i - dx, 1, 1, look.bladeHi);
    }
  };

  const handX = hx + 2;
  const handY = hy + 2;

  if (pose === "block") {
    bladeLine(handX + 1, handY + 3, 0, -1, 11, 1);
    bladeLine(handX + 2, handY + 2, 0, -1, 8, 1);
    px(handX, handY + 3, 3, 1, look.guard);
  } else if (pose === "strike") {
    if (t < 0.32) {
      bladeLine(handX, handY - 2, -1, -1, 9, k === "oni" ? 2 : 1);
    } else if (t < 0.68) {
      bladeLine(handX + 1, handY, 1, 0, k === "guard" ? 13 : 11, k === "oni" ? 2 : 1);
      if (k === "oni") spikes(handX + 1, handY, 1, 0, 11);
      bladeLine(handX + 1, handY + 1, 1, 0, 8, 1);
    } else {
      // возврат в стойку — клинок вверх-вперёд
      bladeLine(handX + 1, handY - 1, 1, -1, 8, k === "oni" ? 2 : 1);
      if (k === "oni") spikes(handX + 1, handY - 1, 1, -1, 8);
    }
  } else if (pose === "leap") {
    bladeLine(handX, handY - 2, 1, -1, 9, k === "oni" ? 2 : 1);
    if (k === "oni") spikes(handX, handY - 2, 1, -1, 9);
  } else if (pose === "dodge") {
    bladeLine(handX, handY - 1, 1, -1, 7, k === "oni" ? 2 : 1);
  } else if (k === "guard") {
    // нагината вертикально: длинное древко + изогнутое лезвие наверху
    px(handX + 1, handY - 9, 1, 12, look.guard); // древко
    px(handX + 1, handY - 12, 1, 3, look.blade); // лезвие
    px(handX + 2, handY - 13, 1, 2, look.bladeHi); // изгиб
    px(handX + 3, handY - 13, 1, 1, look.blade);
  } else if (k === "scarecrow") {
    // посох вертикально, упирается в землю
    px(handX + 1, handY - 7, 1, 11, look.guard);
    px(handX + 1, handY - 7, 1, 1, look.bladeSh); // сучок наверху
  } else {
    // боевая стойка — клинок поднят вверх-вперёд
    bladeLine(handX, handY - 1, 1, -1, 9, k === "oni" ? 2 : 1);
    if (k === "oni") spikes(handX, handY - 1, 1, -1, 9);
  }

  // кицунэ: оранжевое пламя вокруг кончика призрачного клинка (мерцает)
  if (k === "kitsune") {
    const f = Math.floor(o.time * 8) % 2;
    px(handX + 8, handY - 10, 1, 1, look.gear);
    px(handX + 9, handY - 9 - f, 1, 1, look.gear);
    px(handX + 7, handY - 9, 1, 1, look.gear);
    px(handX + 8, handY - 8 + f, 1, 1, look.bladeHi);
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
