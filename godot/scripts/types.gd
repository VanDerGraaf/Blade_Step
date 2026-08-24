class_name BT
## Blade Step — типы, константы и метаданные.
## Прямой порт src/game/types.ts. Действия — строки (в GDScript нет union-типов).

const BOARD_SIZE := 6
const PLAYER_START := 1
const ENEMY_START := 4
const MAX_HP := 3

# ---- действия -----------------------------------------------------------
# Базовая колода игрока-ронина:
const ACTIONS: Array = ["fwd", "back", "jump", "dodge", "strike", "block"]
# Особые грани (не выпадают игроку): roll — Шиноби, cleave — Кровожад,
# bash — Страж, reflect — Зеркало, rest — Болванчик. "wait" — служебное (тайм-аут).
const SPECIAL_ACTIONS: Array = ["roll", "cleave", "bash", "reflect", "rest"]

const ACTION_META := {
	"fwd": {
		"name": "Вперёд", "short": "ВПЕРЁД", "color": "#2a9d8f", "dark": "#1c2244",
		"desc": "Шаг к врагу. В упор — просто толкаешься.",
	},
	"back": {
		"name": "Назад", "short": "НАЗАД", "color": "#8f96c4", "dark": "#232b4d",
		"desc": "Шаг от врага. Рвёт дистанцию — удары свистят мимо.",
	},
	"jump": {
		"name": "Прыжок", "short": "ПРЫЖОК", "color": "#3ddad7", "dark": "#123a44",
		"desc": "Рывок на 2 клетки. Перелетает врага в упор. В полёте уязвим: попадание = КРИТ (2 урона). За краем — пропасть.",
	},
	"dodge": {
		"name": "Уклонение", "short": "УКЛОН", "color": "#b08cff", "dark": "#2d2450",
		"desc": "i-frames на шаг: удар проходит сквозь. Не спасает от перепрыгивания.",
	},
	"strike": {
		"name": "Удар", "short": "УДАР", "color": "#ff5964", "dark": "#3a1020",
		"desc": "1 урон по клетке перед собой. По прыгающему — КРИТ (2 урона).",
	},
	"block": {
		"name": "Блок", "short": "БЛОК", "color": "#aebbdd", "dark": "#4a5578",
		"desc": "Гасит удар и отбрасывает атакующего назад. Держит перекат. Бесполезен против прыжка.",
	},
	# ---- особые грани врагов ----
	"roll": {
		"name": "Перекат", "short": "ПЕРЕКАТ", "color": "#7ee081", "dark": "#12301c",
		"desc": "Рывок на 2 клетки понизу. Неуязвим на шаг; в упор проскальзывает под врагом. Отскакивает от блока. За краем — пропасть.",
	},
	"cleave": {
		"name": "Рассечение", "short": "РАССЕЧ", "color": "#ff8c42", "dark": "#3a2010",
		"desc": "Удар на 2 урона — но только в упор и только по наземной цели. По прыгающему свистит.",
	},
	"bash": {
		"name": "Удар щитом", "short": "ЩИТ", "color": "#e9c46a", "dark": "#3a3018",
		"desc": "Если по тебе бьют: удар гасится, атакующий получает 1 урон и отлетает назад. Если не бьют — грань потрачена.",
	},
	"reflect": {
		"name": "Отражение", "short": "ЗЕРКАЛО", "color": "#c77dff", "dark": "#2d1845",
		"desc": "Если по тебе бьют: удар возвращается — атакующий получает 1 урон. Не отражает прыжок.",
	},
	"rest": {
		"name": "Отдых", "short": "ОТДЫХ", "color": "#c9a96e", "dark": "#2e2418",
		"desc": "Болванчик просто стоит — лёгкая мишень.",
	},
	"wait": {
		"name": "Стойка", "short": "СТОЙ", "color": "#8f96c4", "dark": "#1c2244",
		"desc": "Боец застыл без действия — время на план вышло.",
	},
}

# ---- личности и их обличья ----------------------------------------------
const PERSONALITY_KIND := {
	"random": "scarecrow",
	"aggressor": "oni",
	"controller": "guard",
	"mirror": "kitsune",
	"shadow": "shinobi",
}

const ENEMY_KINDS: Array = ["scarecrow", "oni", "guard", "kitsune", "shinobi"]

const PERSONALITIES := {
	"random": {
		"name": "БОЛВАНЧИК", "title": "Новичок", "color": "#8f96c4",
		"quote": "«А? Что? Я просто машу палкой»", "threat": 1,
	},
	"aggressor": {
		"name": "КРОВОЖАД", "title": "Агрессор", "color": "#ff5964",
		"quote": "«Вперёд. Удар. Ещё удар»", "threat": 2,
	},
	"controller": {
		"name": "СТРАЖ", "title": "Контролёр", "color": "#aebbdd",
		"quote": "«Подойди. Я жду»", "threat": 3,
	},
	"mirror": {
		"name": "ЗЕРКАЛО", "title": "Зеркало", "color": "#c77dff",
		"quote": "«Я уже видела твой ход»", "threat": 4,
	},
	"shadow": {
		"name": "ШИНОБИ", "title": "Тень", "color": "#7ee081",
		"quote": "«Ты бьёшь там, где меня уже нет»", "threat": 4,
	},
}

# ---- наборы кубиков (пулы граней) ----------------------------------------
# Каждый боец бросает руку только из своих граней. У всех по 6 кубиков.
const DICE_POOLS := {
	"ronin": ["fwd", "back", "jump", "dodge", "strike", "block"],
	"scarecrow": ["fwd", "back", "dodge", "strike", "rest", "rest"],
	"oni": ["fwd", "back", "jump", "block", "strike", "cleave"],
	"guard": ["fwd", "back", "dodge", "strike", "block", "bash"],
	"kitsune": ["fwd", "back", "jump", "dodge", "strike", "reflect"],
	"shinobi": ["fwd", "back", "roll", "dodge", "strike", "block"],
}

# ---- «Путь героя»: порядок врагов ----------------------------------------
const GAUNTLET_ORDER: Array = ["random", "aggressor", "controller", "mirror", "shadow"]

# ---- типы движений / исходов удара (для справки) --------------------------
# MoveKind: "none" | "walk" | "bump" | "leap" | "roll" | "knock" | "fall" | "knockfall"
# StrikeResult: "none" | "hit" | "trade" | "antiair" | "whiff" | "dodged"
#               | "blocked" | "bashed" | "reflected" | "rolled"

static func action_color(a: String) -> Color:
	return Color(ACTION_META[a]["color"])


static func action_dark(a: String) -> Color:
	return Color(ACTION_META[a]["dark"])
