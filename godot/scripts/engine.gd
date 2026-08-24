extends Node
## Blade Step — движок потока игры. Порт src/game/engine.ts.
## Владеет состоянием (ui-снапшот, руки, планы, режим) и хореографией шагов.
## UI-скрипты подписываются на ui_changed и читают engine.ui.
##
## TODO (движок): тонкая настройка таймингов твинов/пауз под ощущение Godot —
## все цифры перенесены 1-в-1 из веб-версии (мс), крутите смело.

signal ui_changed(patch: Dictionary)
signal golden_unlocked
signal net_meta(m: Dictionary) # lobby/rematch/quit — для UI

const PLAN_TIME := 20.0 # секунд на планирование (сетевая игра)

@onready var arena: Arena = $Arena
@onready var player: Player = $Arena/Player
@onready var enemy: Enemy = $Arena/Enemy
@onready var hud = $UI/HUD
@onready var console_ui = $UI/Console
@onready var menu_ui = $UI/Menu
@onready var lobby_ui = $UI/Lobby
@onready var screens = $UI/Screens

var ui: Dictionary = {}

var _token := 0
var _mode := "ai" # ai | net | gauntlet
var _round := 1
var _p_plan: Array = []
var _e_plan: Array = []
var _player_hand: Array = []
var _enemy_hand: Array = []
var _gauntlet_index := 0
var _use_golden := false
var _shine_timer := 0.0
var _hist_total: Dictionary = {}
var _hist_first: Dictionary = {}
var _samples := 0
var _stats: Dictionary = {}
var _net_enemy_plan = null
var _net_enemy_hand: Array = []
var _plan_committed := false


func _ready() -> void:
	_reset_ui()
	player.ground_y = arena.GROUND_Y
	enemy.ground_y = arena.GROUND_Y
	player.place(BT.PLAYER_START, arena.tile_center_cb())
	enemy.place(BT.ENEMY_START, arena.tile_center_cb())
	player.facing = 1
	enemy.facing = -1
	Net.msg.connect(_on_net_msg)
	Net.connected.connect(func(_n, _h): net_meta.emit({"t": "connected"}))
	Net.dropped.connect(func(): net_meta.emit({"t": "quit"}))


func _reset_ui() -> void:
	_stats = _fresh_stats()
	ui = {
		"screen": "menu", "phase": "idle", "personality": "aggressor",
		"mode": "ai", "netPeer": null,
		"gauntletIndex": 0, "gauntletHealed": false,
		"round": 1, "pHp": BT.MAX_HP, "eHp": BT.MAX_HP,
		"step": -1, "enemyRevealed": 0,
		"enemyPlan": [null, null, null], "playerPlan": [null, null, null],
		"playerHand": [], "enemyHand": [],
		"msg": "Выбери соперника и выйди на помост", "banner": null,
		"result": null, "stats": _stats.duplicate(),
	}


func _fresh_stats() -> Dictionary:
	return {"exchanges": 0, "dealt": 0, "taken": 0, "blocks": 0,
		"dodges": 0, "whiffs": 0, "leaps": 0}


func _patch(p: Dictionary) -> void:
	for k in p:
		ui[k] = p[k]
	ui_changed.emit(p)


func _say(m: String) -> void:
	_patch({"msg": m})


func _banner(text: String, tok: int) -> void:
	_patch({"banner": text})
	await get_tree().create_timer(0.85).timeout
	if tok == _token and ui.banner == text:
		_patch({"banner": null})


func _wait(ms: float, tok: int) -> bool: # false — поток отменён
	await get_tree().create_timer(ms / 1000.0).timeout
	return tok == _token


# ============================================================================
# Публичное API (зовет UI)
# ============================================================================

func start_match(pers: String) -> void:
	var tok := _new_match()
	enemy.personality = pers
	player.use_golden = false
	enemy.look() # обновит палитру при следующем кадре
	_patch({"screen": "play", "phase": "idle", "personality": pers, "mode": "ai",
		"round": 1, "result": null})
	_say("%s выходит на помост. Раунд 1 — планируй!" % BT.PERSONALITIES[pers]["name"])
	_start_exchange(tok)


func start_gauntlet(use_golden: bool) -> void:
	_new_match()
	_use_golden = use_golden
	_gauntlet_index = 0
	player.use_golden = use_golden
	_patch({"gauntletIndex": 0, "gauntletHealed": false, "pHp": BT.MAX_HP})
	_start_gauntlet_fight()


func next_gauntlet() -> void:
	_start_gauntlet_fight()


func start_net_match(peer_name: String, my_kind: String, peer_kind: String) -> void:
	var tok := _new_match()
	_mode = "net"
	player.use_golden = my_kind == "golden"
	enemy.personality = "aggressor" # не используется: планы приходят по сети
	enemy.set_meta("kind", peer_kind)
	_patch({"screen": "play", "phase": "idle", "mode": "net", "netPeer": peer_name,
		"round": 1, "result": null})
	_say("Сетевая дуэль с игроком %s. На план — 20 секунд!" % peer_name)
	_start_exchange(tok)


func back_to_lobby() -> void:
	_token += 1
	_reset_match_nodes()
	_patch({"screen": "lobby", "phase": "idle", "round": 1, "result": null,
		"banner": null, "step": -1, "pHp": BT.MAX_HP, "eHp": BT.MAX_HP,
		"playerHand": [], "enemyHand": [],
		"enemyPlan": [null, null, null], "playerPlan": [null, null, null]})


func to_menu() -> void:
	_token += 1
	_mode = "ai"
	_gauntlet_index = 0
	player.use_golden = false
	_reset_match_nodes()
	_patch({"screen": "menu", "phase": "idle", "result": null, "banner": null,
		"step": -1, "netPeer": null, "mode": "ai",
		"gauntletIndex": 0, "gauntletHealed": false})


func fight(plan: Array) -> void:
	if ui.phase != "plan" or _mode == "net":
		return
	_p_plan = plan
	_patch({"phase": "thinking", "playerPlan": plan.duplicate(),
		"enemyPlan": [null, null, null], "enemyRevealed": 0})
	_say("%s обдумывает ответ..." % BT.PERSONALITIES[ui.personality]["name"])
	Audio8.play("rattle")
	_run_exchange(_token)


func commit_net_plan(plan: Array) -> void:
	if ui.phase != "plan" or _mode != "net":
		return
	_p_plan = plan
	_patch({"phase": "thinking", "playerPlan": plan.duplicate()})
	Net.send({"t": "plan", "plan": plan})
	_plan_committed = true
	_say("План отправлен. Ждём соперника…")
	_maybe_start_net_exchange()


# ============================================================================
# Раунды
# ============================================================================

func _new_match() -> int:
	_token += 1
	_round = 1
	_stats = _fresh_stats()
	_hist_total = {}
	_hist_first = {}
	_samples = 0
	_reset_match_nodes()
	ArenaTime.scale = 1.0
	return _token


func _reset_match_nodes() -> void:
	for f in [player, enemy]:
		f.hp = BT.MAX_HP
		f.dead = false
		f.faded = false
		f.air = 0.0
		f.flash = 0.0
		f.lunge = 0.0
		f.pose = "idle"
		f.hold_pose = false
	player.place(BT.PLAYER_START, arena.tile_center_cb())
	enemy.place(BT.ENEMY_START, arena.tile_center_cb())
	player.facing = 1
	enemy.facing = -1
	player.queue_redraw()
	enemy.queue_redraw()


func _start_gauntlet_fight() -> void:
	var tok := _token + 1
	_token = tok
	var pers: String = BT.GAUNTLET_ORDER[_gauntlet_index]
	_mode = "gauntlet"
	enemy.personality = pers
	player.hp = ui.pHp # HP копится между боями
	enemy.hp = BT.MAX_HP
	_round = 1
	_stats = _fresh_stats()
	player.place(BT.PLAYER_START, arena.tile_center_cb())
	enemy.place(BT.ENEMY_START, arena.tile_center_cb())
	player.facing = 1
	enemy.facing = -1
	_patch({"screen": "play", "phase": "idle", "mode": "gauntlet",
		"personality": pers, "round": 1, "pHp": player.hp, "eHp": BT.MAX_HP,
		"step": -1, "enemyRevealed": 0, "result": null,
		"enemyPlan": [null, null, null], "playerPlan": [null, null, null],
		"stats": _stats.duplicate()})
	_say("Путь героя · враг %d/5: %s. Раунд 1!" % [_gauntlet_index + 1, BT.PERSONALITIES[pers]["name"]])
	_start_exchange(tok)


func _start_exchange(tok: int) -> void:
	var p_pool: Array = BT.DICE_POOLS["ronin"]
	var e_pool: Array
	if _mode == "net":
		e_pool = BT.DICE_POOLS[enemy.get_meta("kind", "ronin")]
	else:
		e_pool = BT.DICE_POOLS[BT.PERSONALITY_KIND[ui.personality]]
	_player_hand = Logic.roll_hand(p_pool)
	_enemy_hand = Logic.roll_hand(e_pool)
	_patch({"phase": "plan", "step": -1, "enemyRevealed": 0,
		"enemyPlan": [null, null, null], "playerPlan": [null, null, null],
		"playerHand": _player_hand.duplicate(), "enemyHand": _enemy_hand.duplicate(),
		"round": _round})
	Audio8.play("rattle")
	player.hold_pose = false
	enemy.hold_pose = false
	if _mode == "net":
		_net_enemy_plan = null
		_plan_committed = false
		Net.send({"t": "hand", "hand": _player_hand})


func _run_exchange(tok: int) -> void:
	await _wait(750, tok)
	if tok != _token:
		return

	if _mode == "net":
		if _net_enemy_plan == null:
			return # дождёмся плана соперника
		_e_plan = _net_enemy_plan
	else:
		_e_plan = enemy.make_plan(_ai_ctx(), _enemy_hand)

	# привычки игрока записываем ПОСЛЕ выбора ИИ (зеркало читает историю, не телепатию)
	for i in range(3):
		var a: String = _p_plan[i]
		_hist_total[a] = _hist_total.get(a, 0) + 1
		if i == 0:
			_hist_first[a] = _hist_first.get(a, 0) + 1
	_samples += 1

	# предвычисляем все три шага
	var outcomes: Array = []
	var pp: int = player.pos
	var ep: int = enemy.pos
	for i in range(3):
		var r := Logic.resolve_step(_p_plan[i], _e_plan[i], pp, ep)
		outcomes.append(r)
		pp = r.pMove.to
		ep = r.eMove.to
		if r.pFall or r.eFall:
			break

	_patch({"phase": "resolve"})
	await _wait(320, tok)
	if tok != _token:
		return

	for i in range(outcomes.size()):
		if tok != _token:
			return
		await _play_step(i, outcomes[i], tok)
		if ui.screen != "play":
			return

	_stats.exchanges += 1
	_round += 1
	_patch({"stats": _stats.duplicate()})
	_say("Обмен завершён. Оба стоят — планируй снова!")
	await _wait(650, tok)
	if tok != _token:
		return
	_start_exchange(tok)


func _maybe_start_net_exchange() -> void:
	if _plan_committed and _net_enemy_plan != null and ui.phase == "thinking":
		_run_exchange(_token)


func _ai_ctx() -> Dictionary:
	return {
		"ePos": enemy.pos, "pPos": player.pos,
		"pHp": player.hp, "eHp": enemy.hp, "round": _round,
		"histTotal": _hist_total, "histFirst": _hist_first, "samples": _samples,
	}


# ============================================================================
# Хореография шага
# ============================================================================

func _play_step(i: int, r: Dictionary, tok: int) -> void:
	var ep: Array = _e_plan.duplicate()
	for k in range(3):
		ep[k] = _e_plan[k] if k <= i else null
	_patch({"step": i, "enemyRevealed": i + 1, "enemyPlan": ep})
	Audio8.play("reveal")
	await _wait(520, tok)
	if tok != _token:
		return

	if r.pMove.kind == "leap":
		_stats.leaps += 1
	if r.eStrike == "blocked":
		_stats.blocks += 1
	if r.eStrike == "dodged":
		_stats.dodges += 1
	if r.pStrike == "whiff":
		_stats.whiffs += 1

	_animate_move(player, r.pMove, enemy, tok)
	_animate_move(enemy, r.eMove, player, tok)

	var p_strikes: bool = r.pStrike != "none"
	var e_strikes: bool = r.eStrike != "none"
	if not p_strikes:
		_pose_for_action(player, _p_plan[i])
	if not e_strikes:
		_pose_for_action(enemy, _e_plan[i])
	if p_strikes:
		player.set_pose("strike", 560)
	if e_strikes:
		enemy.set_pose("strike", 560)

	if p_strikes or e_strikes:
		await _wait(190, tok)
		if tok != _token:
			return
		if p_strikes:
			arena.slash_burst(player, r.clash)
		if e_strikes:
			arena.slash_burst(enemy, r.clash)
		Audio8.play("slash")
		if p_strikes:
			_lunge(player)
		if e_strikes:
			_lunge(enemy)
		await _wait(50, tok)
		if tok != _token:
			return
		_impacts(r, tok)

	await _wait(620, tok)
	if tok != _token:
		return

	# финальные позиции + разворот друг к другу
	player.pos = r.pMove.to
	enemy.pos = r.eMove.to
	if not r.pFall and not r.eFall:
		var d := 1 if enemy.pos > player.pos else -1
		player.facing = d
		enemy.facing = -d
	player.hold_pose = false
	enemy.hold_pose = false
	for f in [player, enemy]:
		if f.pose in ["block", "dodge"]:
			f.pose = "idle"

	if r.pFall or r.eFall:
		await _play_fall_end(r, tok)
		return
	if player.hp <= 0 or enemy.hp <= 0:
		await _play_ko(tok)
		return
	await _wait(160, tok)


func _pose_for_action(f: Fighter, a: String) -> void:
	match a:
		"block", "bash":
			f.set_pose("block", 700)
			f.hold_pose = true
		"reflect":
			f.set_pose("dodge", 620)
			Audio8.play("dodge")
			arena.ghost_burst(f)
		"dodge":
			f.set_pose("dodge", 620)
			Audio8.play("dodge")
			arena.ghost_burst(f)


func _lunge(f: Fighter) -> void:
	var tw := create_tween()
	tw.tween_property(f, "lunge", 16.0 * f.facing, 0.09)
	tw.tween_property(f, "lunge", 0.0, 0.2)


func _animate_move(f: Fighter, mv: Dictionary, opp: Fighter, tok: int) -> void:
	var from_x := arena.tile_center(mv.from)
	var to_x := arena.tile_center(clampi(mv.to, -1, BT.BOARD_SIZE))
	match mv.kind:
		"walk":
			Audio8.play("whoosh")
			f.set_pose("walk", 400)
			arena.dust(f.position.x, arena.GROUND_Y, 4, 0.5)
			var tw := create_tween()
			tw.tween_property(f, "position:x", to_x, 0.23).set_trans(Tween.TRANS_SINE)
			await tw.finished
			if f.pose == "walk":
				f.pose = "idle"
			arena.dust(f.position.x, arena.GROUND_Y, 3, 0.4)
		"bump":
			Audio8.play("bump")
			var dir := signf(opp.position.x - f.position.x)
			if dir == 0.0:
				dir = 1.0
			var base := f.position.x
			var tw2 := create_tween()
			tw2.tween_method(func(t: float): f.position.x = base + sin(PI * t) * 9.0 * dir, 0.0, 1.0, 0.15)
			await tw2.finished
			f.position.x = from_x
		"leap", "roll":
			Audio8.play("leap")
			f.set_pose("roll" if mv.kind == "roll" else "leap", 460)
			var h := 34.0 + mv.dist * 16.0
			if mv.kind == "roll":
				h = 10.0 # перекат стелется понизу
			arena.dust(f.position.x, arena.GROUND_Y, 6, 0.7)
			var tw3 := create_tween()
			tw3.tween_method(func(t: float):
				f.position.x = lerpf(from_x, to_x, t)
				f.air = sin(PI * t) * h
				if mv.kind == "leap":
					f.facing = 1 if opp.position.x > f.position.x else -1
			, 0.0, 1.0, 0.38)
			await tw3.finished
			f.air = 0.0
			if f.pose in ["leap", "roll"]:
				f.pose = "idle"
			arena.dust(f.position.x, arena.GROUND_Y, 7, 0.8)
			Audio8.play("land")
			arena.shake(0.12)
		"knock":
			f.set_pose("hurt", 420)
			f.flash = 0.6
			arena.dust(f.position.x, arena.GROUND_Y, 5, 0.6)
			var tw4 := create_tween()
			tw4.tween_property(f, "position:x", to_x, 0.21).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			await tw4.finished
			arena.dust(f.position.x, arena.GROUND_Y, 4, 0.5)
		"fall", "knockfall":
			if mv.kind == "knockfall":
				Audio8.play("block")
				f.flash = 0.8
			else:
				Audio8.play("leap")
			f.set_pose("hurt" if mv.kind == "knockfall" else "leap", 500)
			var dir2 := signf(float(mv.to - mv.from))
			if dir2 == 0.0:
				dir2 = 1.0
			var edge_x := VIEW_W_PLUS if dir2 > 0.0 else -60.0
			var peak := from_x + dir2 * (Arena.TILE_W * 1.4)
			arena.dust(f.position.x, arena.GROUND_Y, 6, 0.7)
			var tw5 := create_tween()
			tw5.tween_method(func(t: float):
				f.position.x = lerpf(from_x, peak, t)
				f.air = sin(PI * minf(1.0, t * 1.1)) * 60.0
			, 0.0, 1.0, 0.36)
			await tw5.finished
			Audio8.play("fall")
			arena.shake(0.55)
			ArenaTime.scale = 0.4
			var tw6 := create_tween()
			tw6.tween_method(func(t: float):
				f.position.x = lerpf(peak, edge_x, t)
				f.air = 60.0 * (1.0 - t) - 260.0 * t * t
			, 0.0, 1.0, 0.52)
			await tw6.finished
			f.dead = true
			ArenaTime.scale = 1.0


const VIEW_W_PLUS := 1020.0


func _impacts(r: Dictionary, tok: int) -> void:
	var mid := Vector2((player.position.x + enemy.position.x) / 2.0,
		arena.GROUND_Y - 52.0 - maxf(player.air, enemy.air) * 0.4)

	if r.clash:
		arena.sparks(mid.x, mid.y, 22, "#ffc24b")
		arena.sparks(mid.x, mid.y, 10, "#e8f4ff")
		arena.text_pop(mid.x, mid.y - 40.0, "ЛЯЗГ!", "#ffc24b")
		Audio8.play("clang")
		arena.shake(0.7)
		arena.flash_a = 0.22
		arena.hitstop(0.2, 130)

	if r.dmgToE > 0:
		if r.pStrike == "antiair":
			arena.text_pop(enemy.position.x, arena.GROUND_Y - enemy.air - 100.0, "КРИТ!", "#ffc24b")
			arena.text_pop(enemy.position.x, arena.GROUND_Y - enemy.air - 78.0, "в полёте", "#3ddad7")
		if r.pStrike == "hit" and _p_plan[ui.step] == "cleave":
			arena.text_pop(enemy.position.x, arena.GROUND_Y - enemy.air - 78.0, "РАССЕЧЕНИЕ", "#ff8c42")
		_hit_fx(enemy, "#ff5964")
		enemy.hp = maxi(0, enemy.hp - r.dmgToE)
		_stats.dealt += r.dmgToE
	if r.dmgToP > 0:
		if r.eStrike == "antiair":
			arena.text_pop(player.position.x, arena.GROUND_Y - player.air - 100.0, "КРИТ!", "#ffc24b")
			arena.text_pop(player.position.x, arena.GROUND_Y - player.air - 78.0, "в полёте", "#3ddad7")
		if r.eStrike == "hit" and _e_plan[ui.step] == "cleave":
			arena.text_pop(player.position.x, arena.GROUND_Y - player.air - 78.0, "РАССЕЧЕНИЕ", "#ff8c42")
		_hit_fx(player, "#ff8c42")
		player.hp = maxi(0, player.hp - r.dmgToP)
		_stats.taken += r.dmgToP
	if r.dmgToE > 0 or r.dmgToP > 0:
		_patch({"pHp": player.hp, "eHp": enemy.hp, "stats": _stats.duplicate()})

	for pair in [["bashed", "#e9c46a", "ЩИТ!"], ["reflected", "#c77dff", "ЗЕРКАЛО"]]:
		if r.pStrike == pair[0]:
			arena.block_ring(enemy, pair[1])
			Audio8.play("block" if pair[0] == "bashed" else "reflect")
			arena.sparks(player.position.x + player.facing * 20.0, arena.GROUND_Y - 50.0, 12, pair[1])
			arena.text_pop(enemy.position.x, arena.GROUND_Y - 112.0, pair[2], pair[1])
			arena.shake(0.5)
		if r.eStrike == pair[0]:
			arena.block_ring(player, pair[1])
			Audio8.play("block" if pair[0] == "bashed" else "reflect")
			arena.sparks(enemy.position.x + enemy.facing * 20.0, arena.GROUND_Y - 50.0, 12, pair[1])
			arena.text_pop(player.position.x, arena.GROUND_Y - 112.0, pair[2], pair[1])
			arena.shake(0.5)

	if r.pStrike == "blocked":
		arena.block_ring(enemy)
		Audio8.play("block")
		arena.text_pop(enemy.position.x, arena.GROUND_Y - 110.0, "БЛОК", "#aebbdd")
		arena.shake(0.35)
	if r.eStrike == "blocked":
		arena.block_ring(player)
		Audio8.play("block")
		arena.text_pop(player.position.x, arena.GROUND_Y - 110.0, "БЛОК", "#aebbdd")
		arena.shake(0.35)
	if r.pStrike == "dodged":
		arena.text_pop(enemy.position.x, arena.GROUND_Y - 104.0, "МИМО", "#b08cff")
	if r.eStrike == "dodged":
		arena.text_pop(player.position.x, arena.GROUND_Y - 104.0, "МИМО", "#b08cff")
	if r.pStrike == "whiff":
		arena.text_pop(player.position.x + player.facing * 46.0, arena.GROUND_Y - 84.0, "свист", "#8f96c4")
	if r.eStrike == "whiff":
		arena.text_pop(enemy.position.x + enemy.facing * 46.0, arena.GROUND_Y - 84.0, "свист", "#8f96c4")
	void tok


func _hit_fx(victim: Fighter, color: String) -> void:
	victim.flash = 1.0
	victim.set_pose("hurt", 420)
	var vy := arena.GROUND_Y - victim.air - 44.0
	arena.sparks(victim.position.x, vy, 14, color)
	arena.text_pop(victim.position.x, vy - 34.0, "-1", "#ff5964")
	Audio8.play("thud")
	arena.shake(0.55)
	arena.flash_a = maxf(arena.flash_a, 0.16)
	arena.hitstop(0.22, 110)


# ============================================================================
# Исходы
# ============================================================================

func _play_fall_end(r: Dictionary, tok: int) -> void:
	await _wait(500, tok)
	if tok != _token:
		return
	_banner("ЗА КРАЙ!", tok)
	if r.pFall and r.eFall:
		_say("Оба сорвались в пропасть...")
	elif r.pFall:
		_say("Ты сорвался с помоста!")
	else:
		_say("Враг рухнул в пропасть!")
	await _wait(900, tok)
	if tok != _token:
		return
	var result := "draw" if (r.pFall and r.eFall) else ("lose" if r.pFall else "win")
	_end_match(result, tok)


func _play_ko(tok: int) -> void:
	_patch({"phase": "ko"})
	_banner("НОКАУТ", tok)
	Audio8.play("ko")
	arena.shake(0.9)
	arena.flash_a = 0.3
	ArenaTime.scale = 0.32
	var loser: Fighter = player if player.hp <= 0 else enemy
	var winner: Fighter = enemy if player.hp <= 0 else player
	arena.sparks(loser.position.x, arena.GROUND_Y - 50.0, 26, "#ffc24b")
	await _wait(320, tok)
	if tok != _token:
		ArenaTime.scale = 1.0
		return
	loser.pose = "ko"
	loser.faded = true
	arena.dust(loser.position.x, arena.GROUND_Y, 12, 1.0)
	winner.pose = "idle"
	await _wait(1150, tok)
	ArenaTime.scale = 1.0
	if tok != _token:
		return
	var both := player.hp <= 0 and enemy.hp <= 0
	_end_match("draw" if both else ("lose" if player.hp <= 0 else "win"), tok)


func _end_match(result: String, tok: int) -> void:
	_stats.exchanges += 1

	if _mode == "gauntlet":
		if result == "win":
			Audio8.play("win")
			var healed: bool = player.hp < BT.MAX_HP
			if healed:
				player.hp = mini(BT.MAX_HP, player.hp + 1)
				Audio8.play("heal")
			var next := _gauntlet_index + 1
			if next >= BT.GAUNTLET_ORDER.size():
				_patch({"screen": "g_done", "result": result, "pHp": player.hp,
					"stats": _stats.duplicate(), "phase": "ko"})
				_say("Путь пройден! Все пятеро повержены.")
				golden_unlocked.emit()
			else:
				_gauntlet_index = next
				_patch({"screen": "g_rest", "result": result, "pHp": player.hp,
					"gauntletIndex": next, "gauntletHealed": healed,
					"stats": _stats.duplicate(), "phase": "ko"})
				_say("Враг повержен. +1 HP!" if healed else "Враг повержен. HP уже полное.")
		else:
			Audio8.play("lose")
			_patch({"screen": "g_over", "result": result, "stats": _stats.duplicate(), "phase": "ko"})
			_say("Путь оборван. Помост ждёт новой попытки.")
		return

	_patch({"screen": "over", "result": result, "stats": _stats.duplicate(), "phase": "ko"})
	if result == "win":
		Audio8.play("win")
		for i in range(40):
			arena.sparks(player.position.x + randf() * 80.0 - 40.0, arena.GROUND_Y - 60.0, 1, "#ffc24b")
	elif result == "lose":
		Audio8.play("lose")
	else:
		Audio8.play("clang")
	void tok


# ============================================================================
# Сеть
# ============================================================================

func _on_net_msg(m: Dictionary) -> void:
	match m.get("t", ""):
		"hand":
			_net_enemy_hand = m.hand
		"plan":
			_net_enemy_plan = m.plan
			_maybe_start_net_exchange()
		"begin":
			pass # лобби-старт обрабатывает UI
		_:
			net_meta.emit(m)


func _process(delta: float) -> void:
	# блёстки золотого скина
	if player.use_golden and ui.screen == "play":
		_shine_timer -= delta
		if _shine_timer <= 0.0:
			_shine_timer = 0.09
			arena.shine_spark(player.position.x, arena.GROUND_Y)
