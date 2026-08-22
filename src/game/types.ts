export type Action = "fwd" | "back" | "jump" | "dodge" | "strike" | "block";

export const ACTIONS: Action[] = ["fwd", "back", "jump", "dodge", "strike", "block"];

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
    desc: "Рывок на 2 клетки. С дистанции 1 перелетаешь врага за спину. В полёте уязвим для удара!",
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
    desc: "1 урон по клетке перед собой. Обоюдный удар — урон получат оба. По блоку — отскочишь.",
    tip: "Достаёт только в упор или перелетающего врага.",
  },
  block: {
    name: "Блок",
    short: "БЛОК",
    color: "#aebbdd",
    dark: "#4a5578",
    desc: "Гасит удар и отбрасывает атакующего назад. Бесполезен против прыжка.",
    tip: "Ставь первым, контратакуй вторым.",
  },
};

export type Personality = "random" | "aggressor" | "controller" | "mirror";

export interface PersonalityMeta {
  name: string;
  title: string;
  color: string;
  quote: string;
  threat: number; // 1..4
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
    color: "#b08cff",
    quote: "«Я уже видел этот ход»",
    threat: 4,
  },
};

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

export const BOARD_SIZE = 6;
export const PLAYER_START = 1;
export const ENEMY_START = 4;
export const MAX_HP = 3;
