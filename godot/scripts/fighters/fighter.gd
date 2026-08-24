extends Node2D
class_name Fighter
## Базовый боец на помосте. Позиция узла = якорь ног на линии земли.
## Вся анимация — позы (pose) + таймер позы (pose_t), как в веб-версии.
##
## TODO (движок/арт): кодовая отрисовка через Sprites.draw_fighter() работает
## из коробки. Для настоящих анимаций подключите AnimatedSprite2D с шитами из
## res://assets/sprites/ и заменяйте _draw() — позы и тайминги останутся теми же.

const POSE_HOLD := ["strike", "dodge", "hurt"] # позы, идущие по pose_t

var pos: int = 0          # логическая клетка 0..5 (движок — источник правды)
var air: float = 0.0      # высота над землёй (прыжок/перекат)
var hp: int = BT.MAX_HP
var facing: int = 1       # 1 — вправо, -1 — влево
var pose: String = "idle"
var pose_t: float = 0.0
var pose_dur: float = 1.0 # мс на позу
var hold_pose: bool = false
var flash: float = 0.0    # вспышка урона 0..1
var lunge: float = 0.0    # рывок вперёд при ударе, px
var dead: bool = false
var faded: bool = false

var ground_y: float = 414.0 # задаёт арена


func look() -> Dictionary:
	return Sprites.PLAYER_LOOK # переопределяют player.gd / enemy.gd


func set_pose(p: String, dur_ms: float) -> void:
	pose = p
	pose_t = 0.0
	pose_dur = dur_ms


func place(cell: int, tile_center: Callable) -> void:
	pos = cell
	position.x = tile_center.call(cell)


func _process(delta: float) -> void:
	var dt := delta * 1000.0 * ArenaTime.scale
	var dirty := false
	if flash > 0.0:
		flash = maxf(0.0, flash - dt / 380.0)
		dirty = true
	if not hold_pose and pose in POSE_HOLD:
		pose_t = minf(1.0, pose_t + dt / pose_dur)
		if pose_t >= 1.0:
			pose = "idle"
		dirty = true
	if pose in ["idle", "walk", "block", "dodge", "roll"]:
		dirty = true # покачивание/развевающиеся детали
	if dirty:
		queue_redraw()


func _draw() -> void:
	if dead and air <= -240.0:
		return
	# тень
	if not dead and air >= 0.0:
		var a := maxf(0.08, 0.4 - air / 260.0)
		var w := maxf(14.0, 30.0 - air / 9.0)
		draw_set_transform(Vector2.ZERO)
		var col := Color(0.02, 0.024, 0.06, a)
		# эллипс из секторов
		var pts := PackedVector2Array()
		for i in range(13):
			var ang := float(i) / 12.0 * TAU
			pts.append(Vector2(cos(ang) * w, sin(ang) * w * 0.28))
		draw_colored_polygon(pts, col)

	# после-образы уклонения
	if pose == "dodge":
		for off in [-14.0, -26.0]:
			Sprites.draw_fighter(self, off * facing, -air, look(), _opts(), 4.0)
	# тело
	Sprites.draw_fighter(self, 0.0, -air, look(), _opts(1.0 if not faded else 0.72), 4.0)
	# дуга блока
	if pose == "block":
		draw_set_transform(Vector2.ZERO)
		for i in range(7):
			var a := -1.1 + float(i) / 6.0 * 2.2
			draw_rect(Rect2(Vector2(facing * 30 + cos(a) * 4, -52 + sin(a) * 30), Vector2(4, 4)), Color(0.68, 0.73, 0.86, 0.5))
	draw_set_transform(Vector2.ZERO)


func _opts(alpha: float = 1.0) -> Dictionary:
	return {
		"facing": facing,
		"pose": pose,
		"pose_t": pose_t,
		"time": ArenaTime.time,
		"flash": flash,
		"lunge": lunge,
		"alpha": alpha,
	}
