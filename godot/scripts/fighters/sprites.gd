class_name Sprites
## Blade Step — пиксельный художник. Порт src/game/sprites.ts (сетка 18×24).
## Вся графика кодовая: рисует бойца прямоугольниками на CanvasItem.
##
## TODO (движок/арт): чтобы перейти на настоящие спрайты — положите шиты в
## res://assets/sprites/ и замените вызов draw_fighter() в fighter.gd на
## AnimatedSprite2D. Палитры ниже останутся полезны как референс цветов.

# ============================================================================
# Палитры. kind — ключ бойца; shine — золотой скин (блёстки в engine/arena).
# ============================================================================

const PLAYER_LOOK := {
	"kind": "ronin", "outline": "#1a1a1a",
	"skin": "#ffd9b3", "skinSh": "#e0a877",
	"main": "#2a9d8f", "mainSh": "#1f7a70", "mainHi": "#3fbfae",
	"accent": "#e9c46a", "leg": "#3a4670", "legSh": "#293252", "boot": "#4a3a2a",
	"blade": "#a8a8a8", "bladeSh": "#808080", "bladeHi": "#d0d0d0", "guard": "#4a3a2a",
	"eye": "#1a1a1a", "hair": "#e63946", "gear": "#c9a96e", "gearSh": "#a8895a",
}

const GOLDEN_RONIN_LOOK := {
	"kind": "golden", "outline": "#241a05",
	"skin": "#ffe3bd", "skinSh": "#e8b98a",
	"main": "#e9c46a", "mainSh": "#c19a3d", "mainHi": "#ffd98a",
	"accent": "#c1121f", "leg": "#4a3a1a", "legSh": "#3a2c10", "boot": "#2a1f0a",
	"blade": "#fff3c4", "bladeSh": "#e9c46a", "bladeHi": "#ffffff", "guard": "#8a6d1f",
	"eye": "#1a1a1a", "hair": "#c1121f", "gear": "#f2eeda", "gearSh": "#d4c9a0",
	"shine": true,
}

const ENEMY_LOOKS := {
	"scarecrow": {
		"kind": "scarecrow", "outline": "#1a1a1a",
		"skin": "#8b6f47", "skinSh": "#6f5738",
		"main": "#6b4f2e", "mainSh": "#553e24", "mainHi": "#7f6140",
		"accent": "#4a3520", "leg": "#7a5c34", "legSh": "#5f4626", "boot": "#5f4626",
		"blade": "#5c3d1e", "bladeSh": "#4a3016", "bladeHi": "#74502a", "guard": "#5c3d1e",
		"eye": "#1a1208", "hair": "#d4a017", "gear": "#8b6f47", "gearSh": "#6f5738",
	},
	"oni": {
		"kind": "oni", "outline": "#1a1a1a",
		"skin": "#c1121f", "skinSh": "#97101a",
		"main": "#6a0dad", "mainSh": "#520a85", "mainHi": "#7d2bbf",
		"accent": "#ffd700", "leg": "#c1121f", "legSh": "#97101a", "boot": "#97101a",
		"blade": "#808080", "bladeSh": "#606060", "bladeHi": "#a8a8a8", "guard": "#3a2a1a",
		"eye": "#ffd700", "hair": "#6a0dad", "gear": "#2a2a2a", "gearSh": "#1a1a1a",
	},
	"guard": {
		"kind": "guard", "outline": "#1a1a1a",
		"skin": "#c9b8a0", "skinSh": "#a89880",
		"main": "#2f2f2f", "mainSh": "#232323", "mainHi": "#4a4a4a",
		"accent": "#ffd700", "leg": "#3a3a3a", "legSh": "#2a2a2a", "boot": "#2a2a2a",
		"blade": "#a8a8a8", "bladeSh": "#808080", "bladeHi": "#d0d0d0", "guard": "#5c3d1e",
		"eye": "#ffd700", "hair": "#2a3340", "gear": "#4a4a4a", "gearSh": "#353535",
	},
	"kitsune": {
		"kind": "kitsune", "outline": "#1a1a1a",
		"skin": "#ffffff", "skinSh": "#d8d0ba",
		"main": "#9b5de5", "mainSh": "#7a45bf", "mainHi": "#b57ff0",
		"accent": "#c1121f", "leg": "#f7f3ea", "legSh": "#d8d0ba", "boot": "#8a6a3a",
		"blade": "#00b4d8", "bladeSh": "#0090ad", "bladeHi": "#4dd4ee", "guard": "#52308a",
		"eye": "#1a1a1a", "hair": "#e07b39", "gear": "#ff6b00", "gearSh": "#c77dff",
	},
	"shinobi": {
		"kind": "shinobi", "outline": "#101018",
		"skin": "#e8d5c0", "skinSh": "#c9a98a",
		"main": "#2b2d42", "mainSh": "#1d1f30", "mainHi": "#3f4260",
		"accent": "#c1121f", "leg": "#23253a", "legSh": "#181a2b", "boot": "#101018",
		"blade": "#c9d4e8", "bladeSh": "#97a3c4", "bladeHi": "#eef4ff", "guard": "#3a2a1a",
		"eye": "#7ee081", "hair": "#c1121f", "gear": "#3f4260", "gearSh": "#2b2d42",
	},
}

static func look_for(kind: String) -> Dictionary:
	match kind:
		"ronin": return PLAYER_LOOK
		"golden": return GOLDEN_RONIN_LOOK
		_: return ENEMY_LOOKS[kind]


# ============================================================================
# Отрисовка. x,y — якорь ног (экранные px), s — размер пикселя сетки.
# opts: facing(±1), pose, pose_t(0..1), time, flash(0..1), lunge(px), alpha(0..1)
# ============================================================================

static func draw_fighter(ci: CanvasItem, x: float, y: float, look: Dictionary, opts: Dictionary, s: float = 4.0) -> void:
	var facing: int = opts.get("facing", 1)
	var pose: String = opts.get("pose", "idle")
	var t: float = opts.get("pose_t", 0.0)
	var time: float = opts.get("time", 0.0)
	var flash: float = opts.get("flash", 0.0)
	var lunge: float = opts.get("lunge", 0.0)
	var alpha: float = opts.get("alpha", 1.0)

	var flash_on: bool = flash > 0.0 and int(flash * 8.0) % 2 == 0
	var bob := 0.0
	if pose == "idle":
		bob = sin(time * 3.0) * 1.0
	elif pose == "walk":
		bob = absf(sin(time * 10.0)) * -2.0

	var rot := 0.0
	var oy := 0.0
	if pose == "ko":
		rot = -PI / 2.0
		oy = -2.0
	ci.draw_set_transform(Vector2(x + lunge * facing, y + bob + oy), rot, Vector2(facing, 1))

	var kind: String = look["kind"]

	var px := func(gx: int, gy: int, w: int, h: int, c: String) -> void:
		var col := Color("#ffffff") if flash_on else Color(c)
		col.a = alpha
		ci.draw_rect(Rect2(Vector2((gx - 9) * s, (gy - 24) * s), Vector2(w * s, h * s)), col)

	var walk_sw := sin(time * 10.0) if pose == "walk" else 0.0
	var lean := 0
	if pose == "dodge" or pose == "hurt":
		lean = -1
	elif pose == "roll":
		lean = 2
	elif pose == "strike" and t > 0.3 and t < 0.65:
		lean = 1

	# ---------------- ноги ----------------
	var tuck := 2 if (pose == "leap" or pose == "roll") else (1 if pose == "dodge" else 0)
	var lift_l := 1 if (pose == "walk" and walk_sw > 0.0) else 0
	var lift_r := 1 if (pose == "walk" and walk_sw <= 0.0) else 0
	var leg_h := 5 - tuck
	var oni_w := 1 if kind == "oni" else 0
	px.call(6 - oni_w, 19, 3 + oni_w, leg_h - lift_l, look["leg"])
	px.call(10, 19, 3 + oni_w, leg_h - lift_r, look["legSh"])
	px.call(6 - oni_w, 19, 1, leg_h - lift_l, look["legSh"])
	if kind == "guard" and tuck == 0: # поножи-пластины стража
		px.call(6, 20, 3, 1, look["mainHi"])
		px.call(10, 21, 3, 1, look["mainHi"])
	if tuck == 0:
		px.call(5 - oni_w, 23 - lift_l, 4 + oni_w, 1, look["boot"])
		px.call(10, 23 - lift_r, 4 + oni_w, 1, look["boot"])
		px.call(5 - oni_w, 23 - lift_l, 1, 1, look["outline"])
		px.call(13 + oni_w, 23 - lift_r, 1, 1, look["outline"])

	# хвосты кицунэ — за торсом
	if kind == "kitsune":
		_draw_tails(px, look, time)

	# ---------------- торс ----------------
	_draw_torso(px, look, lean)

	# шарф ронина
	if kind == "ronin" or kind == "golden":
		var wave := 1 if sin(time * 5.0) > 0.0 else 0
		px.call(3 + lean, 10, 8, 1, look["hair"])
		px.call(1 + lean, 10, 2, 1, look["hair"])
		px.call(0 + lean, 11 + wave, 2, 1, look["hair"])
		px.call(10 + lean, 10, 3, 1, look["mainHi"])

	# ---------------- голова ----------------
	_draw_head(px, look, lean, pose)

	# ---------------- рука и оружие ----------------
	_draw_weapon(px, look, pose, t, lean, time)

	ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


static func _draw_torso(px: Callable, look: Dictionary, lean: int) -> void:
	var k: String = look["kind"]
	px.call(5 + lean, 11, 8, 8, look["main"])
	px.call(5 + lean, 11, 2, 8, look["mainSh"])
	px.call(5 + lean, 16, 8, 1, look["accent"]) # пояс
	match k:
		"ronin", "golden": # кимоно с V-вырезом
			px.call(7 + lean, 11, 4, 1, look["mainHi"])
			px.call(8 + lean, 12, 2, 1, look["skin"])
		"scarecrow": # рваная хламида
			px.call(5 + lean, 18, 2, 1, look["mainSh"])
			px.call(9 + lean, 18, 2, 1, look["mainSh"])
			px.call(12 + lean, 18, 1, 1, look["mainSh"])
			px.call(10 + lean, 13, 2, 2, look["mainHi"]) # заплатка
		"oni": # мускулистый голый торс
			px.call(7 + lean, 12, 2, 1, look["skinSh"])
			px.call(11 + lean, 12, 2, 1, look["skinSh"])
			px.call(9 + lean, 14, 1, 2, look["skinSh"])
			px.call(5 + lean, 17, 8, 2, look["main"]) # набедренная повязка
		"guard": # layered-броня с заклёпками
			px.call(5 + lean, 12, 8, 1, look["mainHi"])
			px.call(5 + lean, 14, 8, 1, look["mainHi"])
			px.call(6 + lean, 12, 1, 1, look["accent"])
			px.call(11 + lean, 12, 1, 1, look["accent"])
			px.call(6 + lean, 14, 1, 1, look["accent"])
			px.call(11 + lean, 14, 1, 1, look["accent"])
		"kitsune": # струящееся кимоно
			px.call(5 + lean, 17, 8, 2, look["mainSh"])
			px.call(4 + lean, 18, 1, 1, look["mainSh"])
			px.call(13 + lean, 18, 1, 1, look["mainSh"])
		"shinobi": # перевязь и кушак
			px.call(5 + lean, 11, 8, 1, look["accent"])
			px.call(11 + lean, 12, 1, 4, look["accent"])
			px.call(12 + lean, 10, 1, 4, look["bladeSh"]) # кодати за спиной


static func _draw_head(px: Callable, look: Dictionary, lean: int, pose: String) -> void:
	var k: String = look["kind"]
	# шея
	var neck: String = look["gearSh"] if k == "guard" else (look["mainSh"] if k == "kitsune" else (look["main"] if k == "shinobi" else look["skin"]))
	px.call(7 + lean, 9, 4, 2, neck)
	var hx := 5 + lean
	px.call(hx + 1, 2, 6, 7, look["skin"]) # голова 6×7
	match k:
		"ronin", "golden": # широкополая соломенная шляпа
			px.call(hx - 2, 0, 10, 1, look["gear"])
			px.call(hx - 1, 1, 8, 1, look["gear"])
			px.call(hx, 2, 6, 1, look["gear"])
			px.call(hx - 2, 2, 10, 1, look["gearSh"])
			if pose == "ko":
				px.call(hx + 2, 5, 3, 1, look["eye"])
			else:
				px.call(hx + 2, 5, 1, 1, look["eye"])
				px.call(hx + 4, 5, 1, 1, look["eye"])
		"scarecrow": # мешок с X-глазами
			px.call(hx, 1, 8, 1, look["skinSh"])
			px.call(hx + 2, 0, 2, 1, look["hair"]) # пучок соломы
			px.call(hx + 4, 0, 1, 1, look["hair"])
			# крестики-глаза
			px.call(hx + 1, 4, 1, 1, look["eye"]); px.call(hx + 3, 4, 1, 1, look["eye"])
			px.call(hx + 2, 5, 1, 1, look["eye"])
			px.call(hx + 1, 6, 1, 1, look["eye"]); px.call(hx + 3, 6, 1, 1, look["eye"])
			px.call(hx + 5, 4, 1, 1, look["eye"]); px.call(hx + 7, 4, 1, 1, look["eye"])
			px.call(hx + 6, 5, 1, 1, look["eye"])
			px.call(hx + 5, 6, 1, 1, look["eye"]); px.call(hx + 7, 6, 1, 1, look["eye"])
			px.call(hx + 2, 7, 4, 1, look["eye"]) # рот-стежок
		"oni": # красная морда, рога, клыки
			px.call(hx, 2, 2, 5, look["hair"]) # грива слева
			px.call(hx + 6, 2, 2, 4, look["hair"]) # грива справа
			px.call(hx + 1, 0, 1, 2, look["gear"]) # рога
			px.call(hx + 6, 0, 1, 2, look["gear"])
			if pose == "ko":
				px.call(hx + 2, 4, 2, 1, look["eye"]); px.call(hx + 5, 4, 2, 1, look["eye"])
			else:
				px.call(hx + 2, 4, 1, 2, look["eye"])
				px.call(hx + 5, 4, 1, 2, look["eye"])
			px.call(hx + 2, 7, 1, 2, "#f2eeda") # клыки вниз
			px.call(hx + 5, 7, 1, 2, "#f2eeda")
		"guard": # кабуто с полумесяцем и визором
			px.call(hx, 1, 8, 3, look["gear"])
			px.call(hx - 1, 3, 10, 1, look["gear"])
			px.call(hx + 3, 0, 2, 1, look["accent"]) # золотой полумесяц
			px.call(hx + 2, 1, 1, 1, look["accent"]); px.call(hx + 5, 1, 1, 1, look["accent"])
			px.call(hx + 1, 5, 6, 2, look["gearSh"]) # визор
			if pose != "ko":
				px.call(hx + 2, 5, 1, 1, look["eye"]) # светящиеся глаза
				px.call(hx + 5, 5, 1, 1, look["eye"])
		"kitsune": # белая лисья маска с ушами
			px.call(hx + 1, 0, 2, 2, look["skin"]) # уши
			px.call(hx + 5, 0, 2, 2, look["skin"])
			px.call(hx + 1, 0, 1, 1, look["accent"]); px.call(hx + 6, 0, 1, 1, look["accent"])
			px.call(hx + 2, 4, 2, 1, look["accent"]) # красные узоры
			px.call(hx + 5, 5, 2, 1, look["accent"])
			px.call(hx + 3, 7, 2, 1, look["accent"]) # нос-ромб
			if pose == "ko":
				px.call(hx + 2, 4, 2, 1, look["eye"]); px.call(hx + 5, 4, 2, 1, look["eye"])
			else:
				px.call(hx + 2, 4, 1, 1, look["eye"]); px.call(hx + 5, 4, 1, 1, look["eye"])
			px.call(hx - 1, 3, 1, 5, look["hair"]) # рыжие пряди
			px.call(hx + 8, 3, 1, 4, look["hair"])
		"shinobi": # капюшон и повязка
			px.call(hx, 0, 8, 2, look["gear"])
			px.call(hx - 1, 2, 10, 2, look["gear"])
			px.call(hx - 1, 2, 10, 1, look["gearSh"])
			px.call(hx - 1, 4, 2, 4, look["gearSh"])
			px.call(hx + 7, 4, 2, 4, look["gearSh"])
			px.call(hx + 1, 4, 6, 2, look["skin"]) # полоска глаз
			if pose == "ko":
				px.call(hx + 2, 5, 2, 1, look["eye"]); px.call(hx + 5, 5, 2, 1, look["eye"])
			else:
				px.call(hx + 2, 4, 1, 2, look["eye"])
				px.call(hx + 5, 4, 1, 2, look["eye"])
			px.call(hx + 1, 6, 6, 2, look["mainSh"]) # повязка
			px.call(hx + 1, 6, 6, 1, look["accent"])
			px.call(hx - 2, 5, 2, 1, look["accent"]) # развевающиеся концы
			px.call(hx - 3, 6, 2, 1, look["accent"])


static func _draw_tails(px: Callable, look: Dictionary, time: float) -> void:
	var s1 := int(round(sin(time * 4.0)))
	var s2 := int(round(sin(time * 4.0 + 2.1)))
	px.call(3 - s1, 13, 3, 2, look["skin"])
	px.call(2 - s1, 12, 3, 2, look["skin"])
	px.call(1 - s1, 11, 3, 2, look["skin"])
	px.call(0 - s1, 10, 2, 2, look["gearSh"])
	px.call(3 - s2, 15, 3, 2, look["skin"])
	px.call(1 - s2, 16, 3, 2, look["skin"])
	px.call(0 - s2, 18, 3, 2, look["skin"])
	px.call(-1 - s2, 19, 2, 2, look["gearSh"])


static func _draw_weapon(px: Callable, look: Dictionary, pose: String, t: float, lean: int, time: float) -> void:
	var k: String = look["kind"]
	var hx := 12 + lean
	var hy := 12
	px.call(hx, hy, 2, 2, look["skin"] if k == "oni" else look["main"])
	px.call(hx + 1, hy + 2, 1, 1, look["skinSh"] if k == "oni" else look["mainSh"])
	if k == "guard":
		px.call(hx - 1, hy - 1, 4, 2, look["gear"])
		px.call(hx - 1, hy - 1, 4, 1, look["accent"])
	if k == "oni":
		px.call(hx - 1, hy - 1, 4, 2, look["mainHi"])
	px.call(hx + 1, hy + 2, 2, 1, look["leg"] if k == "scarecrow" else look["skin"])

	var blade := func(bx: int, by: int, dx: int, dy: int, len: int, w: int) -> void:
		for i in range(len):
			var c: String = look["blade"]
			if i == 0: c = look["guard"]
			elif i % 3 == 2: c = look["bladeHi"]
			elif i % 3 == 1: c = look["bladeSh"]
			for j in range(w):
				px.call(bx + dx * i, by + dy * i + j, 1, 1, c)

	var spikes := func(bx: int, by: int, dx: int, dy: int, len: int) -> void:
		var i := 1
		while i < len:
			px.call(bx + dx * i - dy, by + dy * i + dx, 1, 1, look["bladeHi"])
			px.call(bx + dx * i + dy, by + dy * i - dx, 1, 1, look["bladeHi"])
			i += 2

	var hand_x := hx + 2
	var hand_y := hy + 2
	var oni_w := 2 if k == "oni" else 1

	if pose == "block":
		blade.call(hand_x + 1, hand_y + 3, 0, -1, 11, 1)
		blade.call(hand_x + 2, hand_y + 2, 0, -1, 8, 1)
		px.call(hand_x, hand_y + 3, 3, 1, look["guard"])
	elif pose == "strike":
		if t < 0.32:
			blade.call(hand_x, hand_y - 2, -1, -1, 9, oni_w)
		elif t < 0.68:
			blade.call(hand_x + 1, hand_y, 1, 0, 13 if k == "guard" else 11, oni_w)
			if k == "oni": spikes.call(hand_x + 1, hand_y, 1, 0, 11)
			blade.call(hand_x + 1, hand_y + 1, 1, 0, 8, 1)
		else:
			blade.call(hand_x, hand_y + 1, 1, 1, 8, oni_w)
	elif pose == "leap":
		blade.call(hand_x, hand_y - 2, 1, -1, 9, oni_w)
		if k == "oni": spikes.call(hand_x, hand_y - 2, 1, -1, 9)
	elif pose == "dodge":
		blade.call(hand_x, hand_y - 1, 1, -1, 7, oni_w)
	elif pose == "roll":
		blade.call(hand_x - 1, hand_y + 2, -1, 0, 9 if k == "oni" else 8, 1)
	elif k == "guard": # нагината вертикально
		px.call(hand_x + 1, hand_y - 9, 1, 12, look["guard"])
		px.call(hand_x + 1, hand_y - 12, 1, 3, look["blade"])
		px.call(hand_x + 2, hand_y - 13, 1, 2, look["bladeHi"])
		px.call(hand_x + 3, hand_y - 13, 1, 1, look["blade"])
	else: # стойка: клинок вверх-вперёд
		blade.call(hand_x, hand_y - 1, 1, -1, 9, oni_w)
		if k == "oni": spikes.call(hand_x, hand_y - 1, 1, -1, 9)

	# пламя призрачного клинка кицунэ
	if k == "kitsune":
		var f := int(time * 8.0) % 2
		px.call(hand_x + 8, hand_y - 9, 1, 1, look["gear"])
		px.call(hand_x + 9, hand_y - 10 + f, 1, 1, look["gear"])
		px.call(hand_x + 7, hand_y - 10, 1, 1, look["gear"])
		px.call(hand_x + 8, hand_y - 11 - f, 1, 1, look["bladeHi"])
