extends Node2D
class_name Arena
## Помост: 6 клеток над пропастью, фон (луна, тории, фонари, звёзды),
## частицы, тряска и slow-mo. Порт визуальной части src/game/engine.ts.
##
## TODO (движок/арт): всплывающие надписи рисуются системным шрифтом —
## подложите пиксельный шрифт с кириллицей из res://assets/fonts/
## (предзагрузка в _ready, использовать в text_pop()).

const VIEW_W := 960
const VIEW_H := 540
const TILE_W := 118
const BOARD := BT.BOARD_SIZE
const ARENA_X := (VIEW_W - BOARD * TILE_W) / 2
const GROUND_Y := 414.0
const TILE_H := 30.0

var shake_mag := 0.0
var flash_a := 0.0
var _stars: Array = []
var _cracks: Array = []
var _particles: Array = [] # {x,y,vx,vy,g,life,max,size,color,kind,text}


func _ready() -> void:
	for i in range(70):
		_stars.append({
			"x": randf() * VIEW_W, "y": randf() * 300.0,
			"s": 2.0 if randf() < 0.85 else 3.0, "tw": randf() * 7.0,
		})
	for t in range(BOARD):
		var arr: Array = []
		for c in range(3):
			arr.append({
				"x": ARENA_X + t * TILE_W + 14.0 + randf() * (TILE_W - 40.0),
				"y": GROUND_Y + 6.0 + randf() * 16.0,
				"w": 8.0 + randf() * 16.0,
			})
		_cracks.append(arr)


func tile_center(i: int) -> float:
	return ARENA_X + i * TILE_W + TILE_W / 2.0


func tile_center_cb() -> Callable:
	return tile_center


func shake(m: float) -> void:
	shake_mag = minf(1.0, shake_mag + m)


func hitstop(s: float, ms: float) -> void:
	ArenaTime.scale = s
	await get_tree().create_timer(ms / 1000.0).timeout
	ArenaTime.scale = 1.0


# ---------------- частицы ----------------

func dust(x: float, y: float, n: int, power: float) -> void:
	for i in range(n):
		_particles.append({
			"x": x + (randf() - 0.5) * 26.0, "y": y - randf() * 6.0,
			"vx": (randf() - 0.5) * 60.0 * power, "vy": -randf() * 46.0 * power,
			"g": 90.0, "life": 0.0, "max": 340.0 + randf() * 260.0,
			"size": 3.0 + randf() * 4.0,
			"color": Color("#5a6aa0") if randf() < 0.5 else Color("#3a4670"),
			"kind": "rect", "text": "",
		})


func sparks(x: float, y: float, n: int, color: String) -> void:
	for i in range(n):
		var a := randf() * TAU
		var v := 60.0 + randf() * 220.0
		_particles.append({
			"x": x, "y": y, "vx": cos(a) * v, "vy": sin(a) * v - 40.0,
			"g": 320.0, "life": 0.0, "max": 240.0 + randf() * 220.0,
			"size": 2.0 + randf() * 3.0,
			"color": Color(color) if randf() >= 0.6 else Color.WHITE,
			"kind": "rect", "text": "",
		})


func text_pop(x: float, y: float, text: String, color: String) -> void:
	_particles.append({
		"x": x, "y": y, "vx": 0.0, "vy": -46.0, "g": -20.0,
		"life": 0.0, "max": 780.0, "size": 13.0, "color": Color(color),
		"kind": "text", "text": text,
	})


func ghost_burst(f: Fighter) -> void:
	for i in range(6):
		_particles.append({
			"x": f.position.x - f.facing * (8.0 + i * 5.0),
			"y": GROUND_Y - 20.0 - randf() * 40.0,
			"vx": -f.facing * 30.0, "vy": 0.0, "g": 0.0,
			"life": 0.0, "max": 300.0, "size": 4.0,
			"color": Color("#b08cff"), "kind": "rect", "text": "",
		})


func shine_spark(x: float, y: float) -> void:
	_particles.append({
		"x": x + (randf() - 0.5) * 40.0, "y": y - randf() * 70.0,
		"vx": 0.0, "vy": -20.0 - randf() * 20.0, "g": 0.0,
		"life": 0.0, "max": 500.0 + randf() * 400.0,
		"size": 2.0 + randf() * 2.0,
		"color": Color("#ffd98a") if randf() < 0.5 else Color("#ffffff"),
		"kind": "rect", "text": "",
	})


func block_ring(f: Fighter, color: String = "#aebbdd") -> void:
	for i in range(10):
		var a := -1.2 + float(i) / 9.0 * 2.4
		_particles.append({
			"x": f.position.x + f.facing * 26.0 + cos(a) * 6.0,
			"y": GROUND_Y - 52.0 + sin(a) * 26.0,
			"vx": f.facing * 30.0, "vy": 0.0, "g": 0.0,
			"life": 0.0, "max": 260.0, "size": 3.0,
			"color": Color(color), "kind": "rect", "text": "",
		})


func slash_burst(f: Fighter, big: bool) -> void:
	var x := f.position.x + f.facing * 44.0
	var y := GROUND_Y - f.air - 50.0
	for i in range(14 if big else 8):
		var a := -0.9 + randf() * 1.8
		var rad := 26.0 + randf() * (30.0 if big else 20.0)
		_particles.append({
			"x": x + cos(a) * rad * f.facing, "y": y + sin(a) * rad,
			"vx": f.facing * (60.0 + randf() * 90.0), "vy": (randf() - 0.5) * 40.0,
			"g": 0.0, "life": 0.0, "max": 150.0 + randf() * 120.0,
			"size": 2.0 + randf() * 3.0,
			"color": Color("#e8f4ff") if randf() < 0.5 else Color("#ffc24b"),
			"kind": "rect", "text": "",
		})


func _process(delta: float) -> void:
	ArenaTime.advance(delta)
	var dt := delta * 1000.0 * ArenaTime.scale

	# фоновые угольки
	if randf() < 0.06 and _particles.size() < 220:
		_particles.append({
			"x": randf() * VIEW_W, "y": VIEW_H - 40.0,
			"vx": (randf() - 0.5) * 14.0, "vy": -16.0 - randf() * 26.0,
			"g": -3.0, "life": 0.0, "max": 2600.0 + randf() * 1800.0,
			"size": 2.0,
			"color": Color("#ff8c42") if randf() < 0.6 else Color("#ffc24b"),
			"kind": "rect", "text": "",
		})

	var i := 0
	while i < _particles.size():
		var p: Dictionary = _particles[i]
		p.life += dt
		if p.life >= p.max:
			_particles.remove_at(i)
			continue
		p.vy += p.g * dt / 1000.0
		p.x += p.vx * dt / 1000.0
		p.y += p.vy * dt / 1000.0
		i += 1

	shake_mag = maxf(0.0, shake_mag - delta / 0.42)
	flash_a = maxf(0.0, flash_a - delta / 0.38)

	var sh := shake_mag * shake_mag * 13.0
	position = Vector2((randf() - 0.5) * 2.0 * sh, (randf() - 0.5) * 2.0 * sh)
	queue_redraw()


# ---------------- отрисовка ----------------

func _draw() -> void:
	_draw_background()
	_draw_tiles()
	for p in _particles:
		var k: float = 1.0 - p.life / p.max
		if p.kind == "text":
			var font := ThemeDB.fallback_font
			var sz: float = p.size
			draw_string(font, Vector2(p.x + 2.0, p.y + 2.0), p.text,
				HORIZONTAL_ALIGNMENT_CENTER, -1, int(sz * 1.6), Color(0.02, 0.02, 0.06, k))
			var c: Color = p.color
			c.a = k
			draw_string(font, Vector2(p.x, p.y), p.text,
				HORIZONTAL_ALIGNMENT_CENTER, -1, int(sz * 1.6), c)
		else:
			var c: Color = p.color
			c.a = k
			draw_rect(Rect2(Vector2(p.x, p.y), Vector2(p.size, p.size)), c)
	# вспышка кадра
	if flash_a > 0.0:
		draw_rect(Rect2(Vector2.ZERO, Vector2(VIEW_W, VIEW_H)), Color(1.0, 0.96, 0.86, flash_a))


func _draw_background() -> void:
	# небо полосами (пиксельный градиент)
	var bands: Array = [["#0a0d1d", 0, 150], ["#151238", 150, 260], ["#191540", 260, 330], ["#241a45", 330, 400], ["#33204d", 400, 470], ["#12102a", 470, 540]]
	for b in bands:
		draw_rect(Rect2(0, b[1], VIEW_W, b[2] - b[1]), Color(b[0]))
	# звёзды
	for s in _stars:
		var tw := 0.35 + 0.65 * absf(sin(ArenaTime.time * 1.4 + s.tw))
		var c := Color("#c9d4ff")
		c.a = tw * 0.8
		draw_rect(Rect2(s.x, s.y, s.s, s.s), c)
	# кровавая луна
	var mx := 700.0
	var my := 118.0
	draw_circle(Vector2(mx, my), 66.0, Color(1.0, 0.28, 0.34, 0.16))
	draw_circle(Vector2(mx, my), 52.0, Color("#ff4757"))
	for cr in [[-18.0, -10.0, 9.0], [12.0, 16.0, 7.0], [20.0, -18.0, 6.0], [-6.0, 24.0, 5.0]]:
		draw_circle(Vector2(mx + cr[0], my + cr[1]), cr[2], Color("#d63646"))
	# дальние горы
	var far := PackedVector2Array([
		Vector2(0, 330), Vector2(120, 240), Vector2(250, 316), Vector2(390, 226),
		Vector2(520, 308), Vector2(660, 250), Vector2(820, 318), Vector2(960, 258),
		Vector2(960, 540), Vector2(0, 540)])
	draw_colored_polygon(far, Color("#141134"))
	var near := PackedVector2Array([
		Vector2(0, 380), Vector2(170, 316), Vector2(330, 372), Vector2(480, 322),
		Vector2(640, 378), Vector2(800, 330), Vector2(960, 376),
		Vector2(960, 540), Vector2(0, 540)])
	draw_colored_polygon(near, Color("#1b1740"))
	# тории
	draw_rect(Rect2(368, 168, 16, 230), Color("#100d28"))
	draw_rect(Rect2(576, 168, 16, 230), Color("#100d28"))
	draw_rect(Rect2(330, 150, 300, 16), Color("#100d28"))
	draw_rect(Rect2(344, 146, 272, 8), Color("#100d28"))
	draw_rect(Rect2(356, 196, 248, 10), Color("#100d28"))
	draw_rect(Rect2(330, 150, 300, 3), Color("#241d4a"))
	# фонари
	for l in [[150.0, 0.0], [810.0, 2.4]]:
		var lx: float = l[0]
		var ph: float = l[1]
		var sway := sin(ArenaTime.time * 0.9 + ph) * 6.0
		var ly := 96.0 + sin(ArenaTime.time * 1.3 + ph) * 3.0
		draw_line(Vector2(lx, 0), Vector2(lx + sway, ly - 26.0), Color("#070919"), 2.0)
		draw_circle(Vector2(lx + sway, ly), 60.0, Color(1.0, 0.76, 0.3, 0.10))
		draw_rect(Rect2(lx + sway - 11.0, ly - 18.0, 22.0, 34.0), Color("#c22f3e"))
		draw_rect(Rect2(lx + sway - 11.0, ly - 18.0, 22.0, 4.0), Color("#ffc24b"))
		draw_rect(Rect2(lx + sway - 11.0, ly + 12.0, 22.0, 4.0), Color("#ffc24b"))
		draw_rect(Rect2(lx + sway - 11.0, ly - 6.0, 22.0, 2.0), Color("#7c1f30"))
		draw_rect(Rect2(lx + sway - 11.0, ly + 2.0, 22.0, 2.0), Color("#7c1f30"))


func _draw_tiles() -> void:
	# бездна
	draw_rect(Rect2(0, GROUND_Y + TILE_H, VIEW_W, VIEW_H - GROUND_Y - TILE_H), Color("#05060f"))
	for i in range(5):
		var mxp := fmod(ArenaTime.time * 14.0 + i * 210.0, VIEW_W + 200.0) - 100.0
		var myp := GROUND_Y + 60.0 + float(i % 3) * 26.0
		draw_rect(Rect2(mxp, myp, 90, 8), Color(0.56, 0.59, 0.77, 0.05))
		draw_rect(Rect2(mxp + 24.0, myp + 8.0, 60, 6), Color(0.56, 0.59, 0.77, 0.05))
	for i in range(BOARD):
		var x := ARENA_X + i * TILE_W
		var even := i % 2 == 0
		draw_rect(Rect2(x, GROUND_Y, TILE_W, TILE_H), Color("#232b4d") if even else Color("#20274a"))
		draw_rect(Rect2(x, GROUND_Y - 6.0, TILE_W, 8.0), Color("#3a4670") if even else Color("#364169"))
		draw_rect(Rect2(x, GROUND_Y - 6.0, TILE_W, 2.0), Color("#5a6aa0"))
		draw_rect(Rect2(x + TILE_W - 3.0, GROUND_Y - 6.0, 3.0, TILE_H + 6.0), Color("#070919"))
		draw_rect(Rect2(x, GROUND_Y + TILE_H - 2.0, TILE_W, 2.0), Color("#070919"))
		for c in _cracks[i]:
			draw_rect(Rect2(c.x, c.y, c.w, 2.0), Color("#1a2140"))
		draw_rect(Rect2(x + TILE_W / 2.0 - 2.0, GROUND_Y + 8.0, 4.0, 4.0), Color("#141a33"))
	# края-пропасти: пульсирующие полосы и зарево
	var pulse := 0.5 + 0.5 * sin(ArenaTime.time * 4.0)
	for side in [0, BOARD - 1]:
		var x := ARENA_X + side * TILE_W
		var ex := x if side == 0 else x + TILE_W - 22.0
		for s in range(-1, 4):
			var c := Color("#ff4757") if s % 2 == 0 else Color("#3a1020")
			var pts := PackedVector2Array([
				Vector2(ex + s * 12.0, GROUND_Y - 6.0),
				Vector2(ex + s * 12.0 + 8.0, GROUND_Y - 6.0),
				Vector2(ex + s * 12.0 + 8.0 - 0.6 * (TILE_H + 6.0), GROUND_Y + TILE_H),
				Vector2(ex + s * 12.0 - 0.6 * (TILE_H + 6.0), GROUND_Y + TILE_H)])
			# обрезка по краю — упрощённо рисуем только полосу
			var clipped: PackedVector2Array = []
			for p2 in pts:
				if p2.x >= ex - 1.0 and p2.x <= ex + 23.0:
					clipped.append(p2)
			if clipped.size() >= 3:
				draw_colored_polygon(clipped, c)
		var gx := (x - 26.0) if side == 0 else (x + TILE_W + 26.0)
		draw_circle(Vector2(gx, GROUND_Y + 8.0), 40.0, Color(1.0, 0.28, 0.34, 0.10 + 0.08 * pulse))
