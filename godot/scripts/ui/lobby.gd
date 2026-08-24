extends Control
## Сетевое лобби выбора бойца: 6 карточек с живыми пиксельными превью.
## Превью рисует тот же кодовый художник (Sprites), что и бой.

@onready var engine = get_node("/root/BladeStep")
@onready var grid: GridContainer = $Panel/Grid
@onready var status_lbl: Label = $Panel/Status
@onready var start_btn: Button = $Panel/StartBtn

var my_kind: String = ""
var peer_kind: String = ""


class Thumb extends Control:
	var kind := "ronin"
	func _process(_d: float) -> void:
		queue_redraw()
	func _draw() -> void:
		Sprites.draw_fighter(self, size.x / 2.0, size.y - 6.0, Sprites.look_for(kind),
			{"facing": 1, "pose": "idle", "pose_t": 0.0,
			"time": float(Time.get_ticks_msec()) / 1000.0, "flash": 0.0,
			"lunge": 0.0, "alpha": 1.0}, 2.0)


func _ready() -> void:
	visible = false
	for kind in ["ronin", "scarecrow", "oni", "guard", "kitsune", "shinobi"]:
		var card := Button.new()
		card.custom_minimum_size = Vector2(92, 118)
		var th := Thumb.new()
		th.kind = kind
		th.set_anchors_preset(Control.PRESET_FULL_RECT)
		th.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(th)
		var lbl := Label.new()
		lbl.text = BT.PERSONALITIES.get(_pers_of(kind), {}).get("name", "РОНИН")
		lbl.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
		lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		lbl.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(lbl)
		card.pressed.connect(_pick.bind(kind))
		grid.add_child(card)
	start_btn.pressed.connect(_start)
	Net.msg.connect(_on_msg)


func _pers_of(kind: String) -> String:
	for p in BT.PERSONALITY_KIND:
		if BT.PERSONALITY_KIND[p] == kind:
			return p
	return "aggressor"


func show_lobby() -> void:
	visible = true
	status_lbl.text = "Выберите бойца. Соперник: %s" % engine.ui.netPeer


func _pick(kind: String) -> void:
	if kind == peer_kind:
		return
	my_kind = kind
	Audio8.play("select")
	Net.send({"t": "look", "look": kind})
	_refresh()


func _on_msg(m: Dictionary) -> void:
	match m.get("t", ""):
		"look":
			peer_kind = m.look
			if my_kind == peer_kind:
				my_kind = ""
			_refresh()
		"begin":
			if not Net.is_host:
				_do_start()


func _refresh() -> void:
	var can := my_kind != "" and peer_kind != "" and my_kind != peer_kind
	start_btn.disabled = not (can and Net.is_host)
	status_lbl.text = "ВЫ: %s · СОПЕРНИК: %s" % [
		"…" if my_kind == "" else my_kind.to_upper(),
		"…" if peer_kind == "" else peer_kind.to_upper()]


func _start() -> void:
	if start_btn.disabled:
		return
	Audio8.play("fight")
	Net.send({"t": "begin"})
	_do_start()


func _do_start() -> void:
	visible = false
	engine.start_net_match(engine.ui.netPeer, my_kind, peer_kind)
