/**
 * wait   — внутреннее действие «ничего не делать» (тайм-аут в сетевой игре).
 * rest   — Отдых (Болванчик): намеренно ничего не делает — просто стоит. Пустая грань.
 * roll   — Перекат (Шиноби): рывок на 2 клетки понизу, неуязвим, проскальзывает под врагом.
 * cleave — Рассечение (Они): удар на 2 урона, мажет по прыгающим.
 * bash   — Удар щитом (Страж): при вашей атаке гасит её, вы получаете 1 урон и отлетаете.
 * reflect— Отражение (Кицунэ): при вашей атаке гасит её, вы получаете 1 урон.
 */
export type Action =
  | "fwd" | "back" | "jump" | "dodge" | "strike" | "block" | "wait"
  | "roll" | "cleave" | "bash" | "reflect" | "rest";

/** Колода игрока-ронина. */
export const ACTIONS: Action[] = ["fwd", "back", "jump", "dodge", "strike", "block"];

/** Особые грани врагов (вне колоды игрока). */
export const SPECIAL_ACTIONS: Action[] = ["roll", "cleave", "bash", "reflect", "rest"];

/** Наборы кубиков: из этих граней каждый боец бросает свою руку (6 кубиков). */
export const DICE_POOLS: Record<EnemyKind | "ronin", Action[]> = {
  scarecrow: ["fwd", "back", "dodge", "strike", "rest", "rest"], // учебный манекен: без прыжка и блока, 2 пустые грани
  oni: ["fwd", "back", "jump", "block", "strike", "cleave"], // рассечение вместо уклонения
  guard: ["fwd", "back", "dodge", "strike", "block", "bash"], // удар щитом вместо прыжка
  kitsune: ["fwd", "back", "jump", "dodge", "strike", "reflect"], // отражение вместо блока
  shinobi: ["fwd", "back", "roll", "dodge", "strike", "block"], // перекат вместо прыжка
  ronin: ACTIONS,
};

export interface ActionMeta {
  name: string;
  short: string;
  color: string;
  dark: string;
  desc: string;
  tip: string;
}

export const ACTION_META: Record<Action, ActionMeta> = {
  fwd: {
    name: "Вперёд",
    short: "ШАГ",
    color: "#ffc24b",
    dark: "#8a5f14",
    desc: "Шаг к врагу. В упор — упрёшься, сквозь не пройти.",
    tip: "Сокращай дистанцию, чтобы бить.",
  },
  back: {
    name: "Назад",
    short: "ОТСТУП",
    color: "#5b8cff",
    dark: "#1f3a8a",
    desc: "Шаг от врага. У края арены ты прижат к стене.",
    tip: "Спасает от удара, отдаёт инициативу.",
  },
  jump: {
    name: "Прыжок",
    short: "ПРЫЖОК",
    color: "#3ddad7",
    dark: "#0e6b69",
    desc: "Рывок на 2 клетки. С дистанции 1 перелетаешь врага за спину. В полёте уязвим: попадание — КРИТ (2 урона)!",
    tip: "За краем арены — падение в пропасть.",
  },
  dodge: {
    name: "Уклонение",
    short: "УКЛОН",
    color: "#b08cff",
    dark: "#52308a",
    desc: "Остаёшься на месте, но игнорируешь удар (i-frames).",
    tip: "Читай врага — уклон карает промахи.",
  },
  strike: {
    name: "Удар",
    short: "УДАР",
    color: "#ff5964",
    dark: "#8a1f2b",
    desc: "1 урон по клетке перед собой. Обоюдный удар — урон получат оба. По прыгающему — КРИТ (2 урона). По перекату — свист.",
    tip: "Достаёт только в упор или перелетающего врага.",
  },
  block: {
    name: "Блок",
    short: "БЛОК",
    color: "#aebbdd",
    dark: "#4a5578",
    desc: "Гасит удар и отбрасывает атакующего назад. Бесполезен против прыжка. Держит Перекат Шиноби.",
    tip: "Ставь первым, контратакуй вторым.",
  },
  wait: {
    name: "Стойка",
    short: "СТОЙ",
    color: "#8f96c4",
    dark: "#1c2244",
    desc: "Боец застыл без действия — время на план вышло.",
    tip: "Не успел за 20 секунд — стоишь и ждёшь.",
  },
  roll: {
    name: "Перекат",
    short: "ПЕРЕКАТ",
    color: "#7ee081",
    dark: "#1f6b33",
    desc: "Рывок на 2 клетки понизу. Неуязвим: по перекату нельзя попасть. С дистанции 1 проскальзывает под врагом за спину. Упирается в блок — отскакивает.",
    tip: "Грань Шиноби. Лечится блоком и зажимом у края.",
  },
  cleave: {
    name: "Рассечение",
    short: "РАССЕЧ",
    color: "#ff8c42",
    dark: "#8a3d14",
    desc: "Мощный удар на 2 урона. Достаёт только в упор и только по наземной цели — прыгающий улетает целым.",
    tip: "Грань Кровожада. Прыгай — и она свистнет мимо.",
  },
  bash: {
    name: "Удар щитом",
    short: "ЩИТ",
    color: "#e9c46a",
    dark: "#8a6d1f",
    desc: "Если в этот шаг по стражу бьют: удар гасится, атакующий получает 1 урон и отлетает назад. Если не бьют — грань потрачена зря.",
    tip: "Грань Стража. Не ведись — выманивай.",
  },
  reflect: {
    name: "Отражение",
    short: "ЗЕРКАЛО",
    color: "#c77dff",
    dark: "#5b2a8a",
    desc: "Если в этот шаг по кицунэ бьют: удар гасится, атакующий получает 1 урон. Не бьют — грань свистит в пустоту.",
    tip: "Грань Зеркала. Блефуй и трать её впустую.",
  },
  rest: {
    name: "Отдых",
    short: "ОТДЫХ",
    color: "#c9a96e",
    dark: "#7a6238",
    desc: "Болванчик замирает и ничего не делает — просто стоит. Ни движения, ни атаки, ни защиты: легкая мишень.",
    tip: "Пустая грань Болванчика. Дыши и планируй спокойно.",
  },
};

export type Personality = "random" | "aggressor" | "controller" | "mirror" | "shadow";

/** Visual design of each enemy, tied to its AI personality. */
export type EnemyKind = "scarecrow" | "oni" | "guard" | "kitsune" | "shinobi";

export const PERSONALITY_KIND: Record<Personality, EnemyKind> = {
  random: "scarecrow",
  aggressor: "oni",
  controller: "guard",
  mirror: "kitsune",
  shadow: "shinobi",
};

export const ENEMY_KINDS: EnemyKind[] = ["scarecrow", "oni", "guard", "kitsune", "shinobi"];

export interface PersonalityMeta {
  name: string;
  title: string;
  color: string;
  quote: string;
  threat: number; // 1..5
}

export const PERSONALITIES: Record<Personality, PersonalityMeta> = {
  random: {
    name: "БОЛВАНЧИК",
    title: "Новичок",
    color: "#8f96c4",
    quote: "«А? Что? Я просто машу палкой»",
    threat: 1,
  },
  aggressor: {
    name: "КРОВОЖАД",
    title: "Агрессор",
    color: "#ff5964",
    quote: "«Вперёд. Удар. Ещё удар»",
    threat: 2,
  },
  controller: {
    name: "СТРАЖ",
    title: "Контролёр",
    color: "#aebbdd",
    quote: "«Сначала промахнись ты»",
    threat: 3,
  },
  mirror: {
    name: "ЗЕРКАЛО",
    title: "Чтец привычек",
    color: "#c77dff",
    quote: "«Я уже видел этот ход»",
    threat: 4,
  },
  shadow: {
    name: "ШИНОБИ",
    title: "Тень",
    color: "#7ee081",
    quote: "«Ты бьёшь там, где меня уже нет»",
    threat: 4,
  },
};

// ---------- арена и матч ----------

export const BOARD_SIZE = 6;
export const PLAYER_START = 1;
export const ENEMY_START = 4;
export const MAX_HP = 3;

export type GameResult = "win" | "lose" | "draw";

export interface MatchStats {
  exchanges: number;
  dealt: number;
  taken: number;
  blocks: number;
  dodges: number;
  whiffs: number;
  leaps: number;
}
