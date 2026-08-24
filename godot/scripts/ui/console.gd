extends Control
## Нижняя панель: рука из 6 кубиков, 3 слота плана, «БОЙ!», таймер 20 с,
## ряд вскрытия кубиков на фазе разрешения. Порт консоли из веб-версии.
##
## TODO (движок/арт): кубики сейчас — стилизованные Button (StyleBoxFlat).
## Для пиксельных иконок действий нарисуйте атлас 6×16px и подставьте сюда.

@onready var engine = get_node("/root/BladeStep")
@onready var hand_box: HBoxContainer = $Plan/HandBox
@onready var slots_box: HBoxContainer = $Plan/SlotsBox
@onready var fight_btn: Button = $Plan/FightBtn
@onready var reset_btn: Button = $Plan/ResetBtn
@onready var msg_lbl: Label = $Msg
@onready var timer_bar: ProgressBar = $Plan/TimerBar
@onready var timer_lbl: Label = $Plan/TimerLbl
@onready var reveal_box: HBoxContainer = $Reveal/Box

var hand: Array = []
var slots: Array = [null, null, null] # индексы в hand
var _timer_left := 0.0
var _timer_on := false
var _die_buttons: Array = []


func _ready() -> void:
	engine.ui_changed.connect(_on_ui)
	fight_btn.pressed.connect(_on_fight)
	reset_btn.pressed.connect(_on_reset)
	for i in range(3):
		var b := Button.new()
		b.custom_minimum_size = Vector2(56, 64)
		b.pressed.connect(_on_slot_pressed.bind(i))
		slots_box.add_child(b)
	_on_ui(engine.ui)


func _on_ui(patch: Dictionary) -> void:
	var u: Dictionary = engine.ui
	msg_lbl.text = "▸ " + u.msg
	var planning: bool = u.phase == "plan"

	if patch.has("playerHand"):
		hand = u.playerHand
		slots = [null, null, null]
		_rebuild_hand()
	# слоты
	for i in range(3):
		var b: Button = slots_box.get_child(i)
		var idx = slots[i]
		if idx != null and idx < hand.size():
			var a: String = hand[idx]
			b.text = BT.ACTION_META[a]["short"]
			_style_die(b, a)
		else:
			b.text = str(i + 1)
			_style_empty(b)
		b.disabled = not planning
	# рука
	for i in range(_die_buttons.size()):
		var db: Button = _die_buttons[i]
		db.disabled = not planning
		var chosen_at := slots.find(i)
		db.modulate = Color(0.4, 0.4, 0.5) if (planning and chosen_at == -1) else Color.WHITE
	# бой
	var ready: bool = slots[0] != null and slots[1] != null and slots[2] != null
	fight_btn.disabled = not (planning and ready)
	fight_btn.visible = planning or u.phase == "thinking"
	reset_btn.visible = planning
	# ряд вскрытия
	reveal_box.visible = u.phase in ["resolve", "ko"]
	visible = u.screen == "play" or u.phase in ["resolve", "ko"]
	if u.phase == "resolve" or u.phase == "ko":
		_update_reveal(u)
	# таймер
	_timer_on = planning and u.mode == "net"
	if _timer_on and patch.has("phase"):
		_timer_left = engine.PLAN_TIME
	timer_bar.visible = _timer_on
	timer_lbl.visible = _timer_on


func _rebuild_hand() -> void:
	for c in hand_box.get_children():
		c.queue_free()
	_die_buttons.clear()
	for i in range(hand.size()):
		var a: String = hand[i]
		var b := Button.new()
		b.custom_minimum_size = Vector2(56, 64)
		b.text = BT.ACTION_META[a]["short"]
		_style_die(b, a)
		b.pressed.connect(_on_die_pressed.bind(i))
		hand_box.add_child(b)
		_die_buttons.append(b)


func _on_die_pressed(i: int) -> void:
	if engine.ui.phase != "plan":
		return
	Audio8.play("select")
	var at := slots.find(i)
	if at != -1:
		slots[at] = null
	else:
		var empty := slots.find(null)
		if empty == -1:
			Audio8.play("bump")
			return
		slots[empty] = i
		Audio8.play("slot")
	_on_ui({})


func _on_slot_pressed(i: int) -> void:
	if slots[i] == null:
		return
	Audio8.play("back")
	slots[i] = null
	_on_ui({})


func _on_reset() -> void:
	Audio8.play("back")
	slots = [null, null, null]
	_on_ui({})


func _on_fight() -> void:
	var plan: Array = []
	for i in range(3):
		var idx = slots[i]
		plan.append(hand[idx] if idx != null else "wait")
	Audio8.play("fight")
	slots = [null, null, null]
	if engine.ui.mode == "net":
		engine.commit_net_plan(plan)
	else:
		engine.fight(plan)


func _update_reveal(u: Dictionary) -> void:
	# 3 пары: свой кубик + кубик врага
	while reveal_box.get_child_count() < 6:
		var b := Button.new()
		b.custom_minimum_size = Vector2(56, 64)
		b.disabled = true
		reveal_box.add_child(b)
	for i in range(3):
		var mine: Button = reveal_box.get_child(i * 2)
		var theirs: Button = reveal_box.get_child(i * 2 + 1)
		var pa = u.playerPlan[i]
		if pa != null:
			mine.text = BT.ACTION_META[pa]["short"]
			_style_die(mine, pa)
		var ea = u.enemyPlan[i]
		if i < u.enemyRevealed and ea != null:
			theirs.text = BT.ACTION_META[ea]["short"]
			_style_die(theirs, ea)
		else:
			theirs.text = "?"
			_style_empty(theirs)


func _process(delta: float) -> void:
	if _timer_on:
		_timer_left = maxf(0.0, _timer_left - delta)
		timer_bar.max_value = engine.PLAN_TIME
		timer_bar.value = _timer_left
		timer_lbl.text = str(int(ceil(_timer_left)))
		if _timer_left <= 0.0:
			_timer_on = false
			_on_fight() # недостающие кубики станут «Стойкой»


func _style_die(b: Button, a: String) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = BT.action_dark(a)
	sb.border_color = Color("#070919")
	sb.set_border_width_all(3)
	sb.set_content_margin_all(4)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_color_override("font_color", BT.action_color(a))


func _style_empty(b: Button) -> void:
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("#1c2244")
	sb.border_color = Color("#39406e")
	sb.set_border_width_all(2)
	b.add_theme_stylebox_override("normal", sb)
	b.add_theme_color_override("font_color", Color("#8f96c4"))
