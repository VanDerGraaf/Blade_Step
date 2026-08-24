extends Control
## Верхняя панель: HP-пипсы, раунд, фаза, имя врага.
## TODO (движок/арт): пиксельная тема (Theme с Press Start 2P-подобным шрифтом
## из res://assets/fonts/) вместо системного — подключить на корневом Control.

@onready var engine = get_node("/root/BladeStep")
@onready var p_pips: Label = $PlayerBox/HP
@onready var round_lbl: Label = $Center/Round
@onready var phase_lbl: Label = $Center/Phase
@onready var e_pips: Label = $EnemyBox/HP
@onready var e_name: Label = $EnemyBox/Name

const PHASE_LABEL := {"idle": "—", "plan": "ПЛАН БОЯ", "thinking": "ВРАГ ЗАМЫШЛЯЕТ",
	"resolve": "РАЗРЕШЕНИЕ", "ko": "ФИНАЛ"}


func _ready() -> void:
	engine.ui_changed.connect(_on_ui)
	_on_ui(engine.ui)


func _on_ui(patch: Dictionary) -> void:
	var u: Dictionary = engine.ui
	p_pips.text = _pips(u.pHp)
	e_pips.text = _pips(u.eHp)
	round_lbl.text = "РАУНД %d" % u.round
	phase_lbl.text = PHASE_LABEL.get(u.phase, "")
	var meta: Dictionary = BT.PERSONALITIES[u.personality]
	e_name.text = u.netPeer if u.mode == "net" else meta["name"]
	e_name.add_theme_color_override("font_color", Color(meta["color"]))


func _pips(hp: int) -> String:
	var s := ""
	for i in range(BT.MAX_HP):
		s += "♥" if i < hp else "·"
	return s
