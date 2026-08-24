extends Control
## Экраны исходов: итог дуэли, привал «Пути героя», «Путь пройден», «Путь оборван».

@onready var engine = get_node("/root/BladeStep")
@onready var title_lbl: Label = $Panel/Title
@onready var body_lbl: Label = $Panel/Body
@onready var stats_lbl: Label = $Panel/Stats
@onready var btn_a: Button = $Panel/BtnA
@onready var btn_b: Button = $Panel/BtnB


func _ready() -> void:
	visible = false
	engine.ui_changed.connect(_on_ui)


func _on_ui(patch: Dictionary) -> void:
	if not patch.has("screen"):
		return
	match engine.ui.screen:
		"over": _show_duel_over()
		"g_rest": _show_rest()
		"g_done": _show_done()
		"g_over": _show_g_over()
		_: visible = false


func _bind(btn: Button, cb: Callable) -> void:
	for c in btn.pressed.get_connections():
		btn.pressed.disconnect(c.callable)
	btn.pressed.connect(cb)


func _show_duel_over() -> void:
	var r: String = engine.ui.result
	title_lbl.text = {"win": "ПОБЕДА", "lose": "ПОРАЖЕНИЕ", "draw": "НИЧЬЯ"}[r]
	body_lbl.text = engine.ui.msg
	stats_lbl.text = _stats_text()
	btn_a.text = "РЕВАНШ"
	_bind(btn_a, func():
		if engine.ui.mode != "net":
			engine.start_match(engine.ui.personality))
	btn_b.text = "В МЕНЮ"
	_bind(btn_b, func(): engine.to_menu())
	visible = true


func _show_rest() -> void:
	var idx: int = engine.ui.gauntletIndex
	var healed: bool = engine.ui.gauntletHealed
	title_lbl.text = "ВРАГ ПОВЕРЖЕН"
	body_lbl.text = ("+1 HP! " if healed else "HP уже полное. ") + \
		"Следующий: %s (%d/5). HP: %d/%d" % [
			BT.PERSONALITIES[BT.GAUNTLET_ORDER[idx]]["name"],
			idx + 1, engine.ui.pHp, BT.MAX_HP]
	stats_lbl.text = _stats_text()
	btn_a.text = "ДАЛЬШЕ"
	_bind(btn_a, func(): engine.next_gauntlet())
	btn_b.text = "В МЕНЮ"
	_bind(btn_b, func(): engine.to_menu())
	visible = true


func _show_done() -> void:
	title_lbl.text = "ПУТЬ ПРОЙДЕН!"
	body_lbl.text = "Все пятеро повержены. Награда: ЗОЛОТОЙ РОНИН (ищите в меню)."
	stats_lbl.text = _stats_text()
	btn_a.text = "ЕЩЁ РАЗ"
	_bind(btn_a, func(): engine.start_gauntlet(true))
	btn_b.text = "В МЕНЮ"
	_bind(btn_b, func(): engine.to_menu())
	visible = true


func _show_g_over() -> void:
	title_lbl.text = "ПУТЬ ОБОРВАН"
	body_lbl.text = engine.ui.msg
	stats_lbl.text = _stats_text()
	btn_a.text = "ЗАНОВО"
	_bind(btn_a, func(): engine.start_gauntlet(false))
	btn_b.text = "В МЕНЮ"
	_bind(btn_b, func(): engine.to_menu())
	visible = true


func _stats_text() -> String:
	var s: Dictionary = engine.ui.stats
	return "обмены: %d · урон: %d · получено: %d · блоки: %d · уклоны: %d · прыжки: %d" % [
		s.exchanges, s.dealt, s.taken, s.blocks, s.dodges, s.leaps]
