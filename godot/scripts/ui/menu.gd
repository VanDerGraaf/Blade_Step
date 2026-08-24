extends Control
## Главное меню: соперники (5 личностей + «СЛУЧАЙ»), «Путь героя»,
## экипировка золотого скина, сетевая дуэль. Строится из types.gd.
## TODO (движок/арт): карточки — простые Button; сюда же просится
## пиксельная тема и превью бойцов (см. FighterThumb в lobby.gd).

@onready var engine = get_node("/root/BladeStep")
@onready var vbox: VBoxContainer = $Panel/VBox
@onready var golden_btn: Button = $Panel/VBox/GoldenBtn

var _pers: String = "aggressor"
var _golden_unlocked := false
var _golden_equip := false


func _ready() -> void:
	visible = true
	# карточки соперников
	for pers in BT.PERSONALITIES:
		var meta: Dictionary = BT.PERSONALITIES[pers]
		var b := Button.new()
		b.text = "%s — %s · %s" % [meta["name"], meta["title"], meta["quote"]]
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.pressed.connect(func():
			_pers = pers
			Audio8.play("select")
			_mark(b))
		vbox.add_child(b)
		vbox.move_child(b, 0)
	# «Случай»
	var any_b := Button.new()
	any_b.text = "СЛУЧАЙ ? — кого пришлёт помост"
	any_b.pressed.connect(func():
		var all: Array = BT.PERSONALITIES.keys()
		_pers = all[randi() % all.size()]
		Audio8.play("select"))
	vbox.add_child(any_b)
	vbox.move_child(any_b, 1)
	# «К бою»
	var start_b := Button.new()
	start_b.text = "К БОЮ"
	start_b.pressed.connect(_on_start)
	vbox.add_child(start_b)
	vbox.move_child(start_b, 2)
	# путь героя
	var g_b := Button.new()
	g_b.text = "ПУТЬ ГЕРОЯ — все пятеро по очереди, +1 HP за победу"
	g_b.pressed.connect(func():
		Audio8.play("fight")
		visible = false
		engine.start_gauntlet(_golden_equip))
	vbox.add_child(g_b)
	vbox.move_child(g_b, 3)
	# золотой скин
	golden_btn.pressed.connect(func():
		if not _golden_unlocked:
			return
		_golden_equip = not _golden_equip
		_refresh_golden()
		Audio8.play("select"))
	_refresh_golden()
	engine.golden_unlocked.connect(func():
		_golden_unlocked = true
		_refresh_golden()
		Audio8.play("unlock"))
	# сеть
	var host_b := Button.new()
	host_b.text = "СЕТЬ: СОЗДАТЬ ДУЭЛЬ (ХОСТ)"
	host_b.pressed.connect(func(): Net.host_online())
	vbox.add_child(host_b)
	var join_b := Button.new()
	join_b.text = "СЕТЬ: ВОЙТИ (ГОСТЬ)"
	join_b.pressed.connect(func(): Net.join_online())
	vbox.add_child(join_b)


func _mark(chosen: Button) -> void:
	for c in vbox.get_children():
		if c is Button:
			c.modulate = Color.WHITE


func _on_start() -> void:
	Audio8.play("fight")
	visible = false
	engine.start_match(_pers)


func _refresh_golden() -> void:
	if not _golden_unlocked:
		golden_btn.text = "ЗОЛОТОЙ РОНИН — награда за «Путь героя» (закрыто)"
		golden_btn.disabled = true
	else:
		golden_btn.disabled = false
		golden_btn.text = "ЗОЛОТОЙ РОНИН: %s" % ("НАДЕТ" if _golden_equip else "СНЯТ")


func _show_menu() -> void:
	visible = true
