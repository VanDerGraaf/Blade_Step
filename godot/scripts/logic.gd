class_name BL
## Blade Step — чистая боевая логика и ИИ.
## Прямой порт src/game/logic.ts. Никаких зависимостей от движка —
## обе стороны сети прогоняют одни и те же функции и получают одинаковый результат.
##
## Словари-записи:
##   MoveInfo     = { "from": int, "to": int, "kind": String, "dist": int }
##   StepResult   = { "pMove": MoveInfo, "eMove": MoveInfo, "dmgToP": int, "dmgToE": int,
##                    "pStrike": String, "eStrike": String, "pFall": bool, "eFall": bool,
##                    "clash": bool, "log": Array[String] }
##   AiContext    = { "ePos": int, "pPos": int, "pHp": int, "eHp": int, "round": int,
##                    "histTotal": Dictionary, "histFirst": Dictionary, "samples": int }


static func _clamp_pos(p: int) -> int:
	return clampi(p, 0, BT.BOARD_SIZE - 1)


static func _sgn(n: int) -> int:
	return 1 if n >= 0 else -1


static func _is_strike_like(a: String) -> bool:
	return a == "strike" or a == "cleave"


static func _mv(from: int, to: int, kind: String) -> Dictionary:
	return {"from": from, "to": to, "kind": kind, "dist": absi(to - from)}


## Одновременное разрешение одного шага.
## p_pos/e_pos — логические позиции ДО шага. Оба бойца действуют одновременно.
static func resolve_step(p_act: String, e_act: String, p_pos: int, e_pos: int) -> Dictionary:
	var dist0 := absi(e_pos - p_pos)
	var p_dir := _sgn(e_pos - p_pos)
	var e_dir := -p_dir
	var log: Array[String] = []

	# ---------- проход движения (предварительный, до отбросов) ----------
	var tentative := func(act: String, pos: int, dir: int) -> Dictionary:
		match act:
			"fwd":
				if dist0 == 1:
					return _mv(pos, pos, "bump")
				return _mv(pos, pos + dir, "walk")
			"back":
				var to := _clamp_pos(pos - dir)
				return _mv(pos, to, "none" if to == pos else "walk")
			"jump", "roll":
				var landing := pos + 2 * dir
				if landing < 0 or landing > BT.BOARD_SIZE - 1:
					return _mv(pos, landing, "fall")
				return _mv(pos, landing, "leap" if act == "jump" else "roll")
			_:
				return _mv(pos, pos, "none")

	var p_mv: Dictionary = tentative.call(p_act, p_pos, p_dir)
	var e_mv: Dictionary = tentative.call(e_act, e_pos, e_dir)

	# Перекат в блокирующего врага -> отскок на клетку назад (щит — стена на уровне колен).
	if p_mv.kind == "roll" and e_act == "block" and dist0 == 1:
		p_mv = _mv(p_pos, _clamp_pos(p_pos - p_dir), "knock")
	if e_mv.kind == "roll" and p_act == "block" and dist0 == 1:
		e_mv = _mv(e_pos, _clamp_pos(e_pos - e_dir), "knock")

	# ---------- проход урона ----------
	# Удар/рассечение соединяются, только если цель на СОСЕДНЕЙ клетке в момент взмаха
	# (учитываем одновременное сближение!) или перепрыгивает бьющего (antiair-крит, только strike).
	# Перекатчик неуязвим.
	var eval_strike := func(act: String, opp_act: String, opp_mv: Dictionary, my_start: int, dist: int) -> String:
		if not _is_strike_like(act):
			return "none"
		# проскользнул под клинком — перекатчика ничто не достаёт
		if opp_act == "roll":
			return "rolled"
		# воздушная цель: только обычный удар сбивает (крит); рассечение свистит понизу
		if opp_act == "jump":
			if act == "strike" and dist == 1:
				return "antiair"
			return "whiff"
		# вне досягаемости -> свист
		if dist != 1:
			return "whiff"
		# рядом: цель отступила с клетки?
		var retreated: bool = absi(int(opp_mv.to) - my_start) > dist
		if retreated:
			return "whiff"
		match opp_act:
			"dodge": return "dodged"
			"block": return "blocked"
			"bash": return "bashed"
			"reflect": return "reflected"
		return "hit" # стоял / шёл навстречу / отдыхал

	# Дистанция ПОСЛЕ одновременного движения: шаг вплотную под взмах = попадание.
	var final_dist := absi(int(e_mv.to) - int(p_mv.to))
	var p_strike: String = eval_strike.call(p_act, e_act, e_mv, p_pos, final_dist)
	var e_strike: String = eval_strike.call(e_act, p_act, p_mv, e_pos, final_dist)

	# Клинки скрещиваются: взаимные попадания становятся разменом (по 1 урону, даже рассечением).
	var clash: bool = p_strike == "hit" and e_strike == "hit"
	if clash:
		p_strike = "trade"
		e_strike = "trade"

	var dmg_of := func(act: String, s: String) -> int:
		if s == "antiair":
			return 2 # крит
		if s == "trade":
			return 1
		if s == "hit":
			return 2 if act == "cleave" else 1
		return 0

	var dmg_to_e: int = dmg_of.call(p_act, p_strike)
	var dmg_to_p: int = dmg_of.call(e_act, e_strike)
	# Удар щитом / зеркало наказывают атакующего.
	if p_strike == "bashed" or p_strike == "reflected":
		dmg_to_p += 1
	if e_strike == "bashed" or e_strike == "reflected":
		dmg_to_e += 1

	# Отброс: бивший в блок или щит отлетает на клетку назад;
	# отброшенный за край доски — улетает в пропасть.
	if p_strike == "blocked" or p_strike == "bashed":
		var kb := p_pos - p_dir
		p_mv = _mv(p_pos, kb, "knockfall" if (kb < 0 or kb > BT.BOARD_SIZE - 1) else "knock")
	if e_strike == "blocked" or e_strike == "bashed":
		var kb := e_pos - e_dir
		e_mv = _mv(e_pos, kb, "knockfall" if (kb < 0 or kb > BT.BOARD_SIZE - 1) else "knock")

	# Лоб в лоб: оба идут в одну клетку.
	if p_mv.kind == "walk" and e_mv.kind == "walk" and p_act == "fwd" and e_act == "fwd" and p_mv.to == e_mv.to:
		p_mv = _mv(p_pos, p_pos, "bump")
		e_mv = _mv(e_pos, e_pos, "bump")

	# Идущий наступает на конечную клетку другого -> упор.
	if p_mv.kind == "walk" and p_mv.to == e_mv.to:
		p_mv = _mv(p_pos, p_pos, "bump")
	elif e_mv.kind == "walk" and e_mv.to == p_mv.to:
		e_mv = _mv(e_pos, e_pos, "bump")

	# Столкновения прыжков (перекатчики летят низко и с прыгунами не сталкиваются).
	if p_mv.kind == "leap" and e_mv.kind == "leap" and p_mv.to == e_mv.to:
		p_mv = _mv(p_pos, p_pos + p_dir, "leap")
		e_mv = _mv(e_pos, e_pos + e_dir, "leap")
	# Оба переката в одну клетку -> оба не доезжают.
	if p_mv.kind == "roll" and e_mv.kind == "roll" and p_mv.to == e_mv.to:
		p_mv = _mv(p_pos, p_pos + p_dir, "roll")
		e_mv = _mv(e_pos, e_pos + e_dir, "roll")

	var resolve_leap := func(my: Dictionary, opp: Dictionary, opp_act: String, my_start: int, opp_start: int, dir: int) -> Dictionary:
		if my.kind != "leap" and my.kind != "roll":
			return my
		var swap: bool = opp.kind == my.kind and my.to == opp_start and opp.to == my_start
		if swap:
			return my # эффектный размен в воздухе (или под ногами)
		if opp.kind == my.kind and my.to == opp.to:
			return _mv(my_start, my_start + dir, my.kind)
		if my.to == opp.to and opp_act != "back":
			# противник заканчивает там, где мы приземляемся -> приземляемся на клетку раньше
			return _mv(my_start, my_start + dir, my.kind)
		if my.to == opp.to and opp_act == "back" and opp.to != opp_start:
			# противник РЕАЛЬНО отступил с нашей клетки приземления -> занимаем его старую
			return _mv(my_start, opp_start, my.kind)
		return my

	p_mv = resolve_leap.call(p_mv, e_mv, e_act, p_pos, e_pos, p_dir)
	e_mv = resolve_leap.call(e_mv, p_mv, p_act, e_pos, p_pos, e_dir)

	# Инвариант: двое на земле никогда не делят клетку.
	var on_board := func(x: int) -> bool: return x >= 0 and x <= BT.BOARD_SIZE - 1
	if on_board.call(int(p_mv.to)) and on_board.call(int(e_mv.to)) and p_mv.to == e_mv.to:
		var step_back := func(mv2: Dictionary, dir: int) -> Dictionary:
			return _mv(mv2.from, _clamp_pos(int(mv2.to) - dir), mv2.kind) if mv2.to != mv2.from else mv2
		var p_air: bool = p_mv.kind == "leap" or p_mv.kind == "roll"
		var e_air: bool = e_mv.kind == "leap" or e_mv.kind == "roll"
		if p_air and e_air:
			p_mv = step_back.call(p_mv, p_dir)
			e_mv = step_back.call(e_mv, e_dir)
		elif p_air:
			p_mv = step_back.call(p_mv, p_dir)
		elif e_air:
			e_mv = step_back.call(e_mv, e_dir)
		else:
			p_mv = _mv(p_pos, p_pos, "bump")
			e_mv = _mv(e_pos, e_pos, "bump")

	var is_fall := func(k: String) -> bool: return k == "fall" or k == "knockfall"
	var p_fall: bool = is_fall.call(p_mv.kind)
	var e_fall: bool = is_fall.call(e_mv.kind)

	# ---------- лог ----------
	var name_of := func(s: String) -> String:
		match s:
			"hit": return "чистое попадание"
			"trade": return "клинки скрестились"
			"antiair": return "КРИТ в полёте"
			"blocked": return "упёрся в блок"
			"bashed": return "получил щитом в лицо"
			"reflected": return "удар вернулся"
			"dodged": return "рассёк воздух"
			"rolled": return "ушёл перекатом"
			"whiff": return "промах"
		return ""

	if p_strike != "none":
		log.append("Вы: удар — " + name_of.call(p_strike))
	if e_strike != "none":
		log.append("Враг: удар — " + name_of.call(e_strike))
	if p_fall:
		log.append("Вы шагнули за край!")
	if e_fall:
		log.append("Враг рухнул в пропасть!")

	return {
		"pMove": p_mv, "eMove": e_mv,
		"dmgToP": dmg_to_p, "dmgToE": dmg_to_e,
		"pStrike": p_strike, "eStrike": e_strike,
		"pFall": p_fall, "eFall": e_fall,
		"clash": clash, "log": log,
	}


static func apply_step(r: Dictionary) -> Array:
	return [r.pMove.to, r.eMove.to]


# ===========================================================================
# ИИ
# ===========================================================================

static func _weighted_pick(w: Dictionary) -> String:
	var total := 0.0
	for k in w:
		total += float(w[k])
	if total <= 0.0:
		return "fwd"
	var roll := randf() * total
	for k in w:
		roll -= float(w[k])
		if roll <= 0.0:
			return k
	return w.keys()[-1]


## Свежая рука из 6 кубиков из собственного пула граней бойца.
static func roll_hand(pool: Array) -> Array:
	var hand: Array = []
	for i in 6:
		hand.append(pool[randi() % pool.size()])
	return hand


## Взвешенный выбор, ограниченный кубиками, реально лежащими в руке (съедает один).
static func _weighted_pick_from_pool(w: Dictionary, pool: Array) -> String:
	if pool.is_empty():
		return "fwd"
	var avail: Array = []
	for a in pool:
		if not avail.has(a):
			avail.append(a)
	var entries: Array = []
	for a in avail:
		var v: float = float(w.get(a, 0.0))
		if v > 0.0:
			entries.append([a, v])
	if entries.is_empty():
		return pool[randi() % pool.size()]
	var total := 0.0
	for e in entries:
		total += e[1]
	var roll := randf() * total
	for e in entries:
		roll -= e[1]
		if roll <= 0.0:
			return e[0]
	return entries[-1][0]


## Прыжок/перекат с e_pos в сторону игрока улетит за доску?
static func _dash_suicide(e_pos: int, p_pos: int) -> bool:
	var dir := _sgn(p_pos - e_pos)
	var landing := e_pos + 2 * dir
	return landing < 0 or landing > BT.BOARD_SIZE - 1


static func _sanitize(w: Dictionary, ctx: Dictionary) -> Dictionary:
	var out := w.duplicate()
	if _dash_suicide(ctx.ePos, ctx.pPos):
		out["jump"] = 0
		out["roll"] = 0
	var dist := absi(ctx.pPos - ctx.ePos)
	if dist >= 3:
		out["strike"] = float(out.get("strike", 0)) * 0.25 # mostly wasted at range
		out["cleave"] = float(out.get("cleave", 0)) * 0.2
		out["bash"] = float(out.get("bash", 0)) * 0.2
		out["reflect"] = float(out.get("reflect", 0)) * 0.35
	return out


## Как часто игрок открывает (или вообще играет) ударом? 0..1
static func _player_strike_prob(ctx: Dictionary) -> float:
	var total := 0.0
	for v in ctx.histTotal.values():
		total += float(v)
	if total <= 0.0:
		total = 1.0
	return (float(ctx.histTotal.get("strike", 0)) * 0.6 + float(ctx.histFirst.get("strike", 0)) * 1.2) / total


static func _aggressor_weights(ctx: Dictionary, slot: int, prev) -> Dictionary:
	var dist := absi(ctx.pPos - ctx.ePos)
	var w: Dictionary
	if dist <= 1:
		w = {"strike": 34, "cleave": 30, "block": 10, "dodge": 8, "jump": 10, "fwd": 4, "back": 4}
	elif dist >= 3:
		w = {"fwd": 38, "jump": 26, "strike": 12, "cleave": 8, "block": 6, "dodge": 6, "back": 4}
	else:
		w = {"strike": 24, "cleave": 16, "fwd": 22, "jump": 14, "block": 8, "dodge": 10, "back": 6}
	if ctx.eHp == 1:
		w["dodge"] = float(w.get("dodge", 0)) + 12
		w["block"] = float(w.get("block", 0)) + 10
	if slot == 2 and (prev == "fwd" or prev == "jump"):
		w["cleave"] = float(w.get("cleave", 0)) + 22 # arrive and rend
	return _sanitize(w, ctx)


static func _controller_weights(ctx: Dictionary, slot: int, prev) -> Dictionary:
	var dist := absi(ctx.pPos - ctx.ePos)
	var expects_strike: bool = _player_strike_prob(ctx) > 0.3
	var w: Dictionary = {
		"dodge": 22, "block": 20, "bash": 22 if expects_strike else 10,
		"back": 12, "strike": 12, "fwd": 8, "jump": 4,
	}
	if slot == 0:
		w["dodge"] = float(w.get("dodge", 0)) * 1.6
		w["block"] = float(w.get("block", 0)) * 1.6
		w["bash"] = float(w.get("bash", 0)) * 1.5
	if prev == "dodge" or prev == "block" or prev == "bash":
		w["strike"] = float(w.get("strike", 0)) * 2.6 # punish
	if dist == 1:
		w["strike"] = float(w.get("strike", 0)) * 1.5
		w["bash"] = float(w.get("bash", 0)) * 1.4
		w["back"] = float(w.get("back", 0)) * 1.3
	if dist >= 3:
		w["fwd"] = float(w.get("fwd", 0)) * 1.7
	if ctx.pHp == 1:
		w["strike"] = float(w.get("strike", 0)) * 1.5 # smell blood
	return _sanitize(w, ctx)


static func _counter_of(a: String, dist: int) -> Dictionary:
	match a:
		"fwd": return {"strike": 46, "back": 26, "jump": 28}
		"back": return {"jump": 42, "fwd": 40, "strike": 18}
		"jump": return {"strike": 66, "back": 16, "dodge": 18} # anti-air read (crit!)
		"dodge": return {"fwd": 44, "block": 30, "strike": 26}
		"strike":
			if dist <= 1:
				return {"dodge": 44, "block": 36, "strike": 20}
			return {"fwd": 46, "jump": 30, "strike": 24}
		"block": return {"jump": 52, "fwd": 32, "strike": 16}
		"wait": return {"strike": 60, "fwd": 30, "jump": 10} # free hit on a frozen foe
		"rest": return {"strike": 56, "fwd": 30, "jump": 14} # free hit on an idling dummy
		"roll": return {"block": 52, "strike": 28, "fwd": 20}
		"cleave": return {"jump": 56, "block": 30, "dodge": 14}
		"bash": return {"dodge": 40, "back": 34, "fwd": 26}
		"reflect": return {"dodge": 40, "back": 34, "fwd": 26}
	return {"strike": 50, "fwd": 30, "jump": 20}


static func _mirror_weights(ctx: Dictionary, slot: int) -> Dictionary:
	if ctx.samples < 2:
		return _aggressor_weights(ctx, slot, null) # opening: press
	var dist := absi(ctx.pPos - ctx.ePos)
	var pick: String = "fwd"
	if slot == 0 and not ctx.histFirst.is_empty():
		pick = _most_frequent(ctx.histFirst)
	elif not ctx.histTotal.is_empty():
		pick = _most_frequent(ctx.histTotal)
	var w := _counter_of(pick, dist)
	if pick == "strike":
		w["reflect"] = float(w.get("reflect", 0)) + 38 # зеркало отвечает зеркалом
	# человеческий шум: 28% случайной «приправы»
	if randf() < 0.28:
		var rnd := _weighted_pick({"fwd": 1, "back": 1, "jump": 1, "dodge": 1, "strike": 1})
		w[rnd] = float(w.get(rnd, 0)) + 40
	if ctx.eHp == 1:
		w["dodge"] = float(w.get("dodge", 0)) + 14
	return _sanitize(w, ctx)


static func _most_frequent(hist: Dictionary) -> String:
	var best: String = "fwd"
	var best_v := -1.0
	for k in hist:
		if float(hist[k]) > best_v:
			best_v = float(hist[k])
			best = k
	return best


static func _shadow_weights(ctx: Dictionary, slot: int, prev) -> Dictionary:
	var dist := absi(ctx.pPos - ctx.ePos)
	var expects_strike: bool = _player_strike_prob(ctx) > 0.25 or slot == 0
	# Тень: проскальзывает под ожидаемым взмахом и режет со спины.
	var w: Dictionary = {
		"roll": 46 if expects_strike else 24,
		"strike": 30 if dist == 1 else 14,
		"dodge": 14,
		"fwd": 18 if dist >= 2 else 8,
		"back": 8,
		"block": 6,
	}
	if prev == "roll":
		w["strike"] = float(w.get("strike", 0)) + 42 # arrived behind you — cut
	if prev == "roll" or prev == "dodge":
		w["roll"] = float(w.get("roll", 0)) * 0.5 # don't chain slips forever
	if ctx.pHp == 1:
		w["strike"] = float(w.get("strike", 0)) * 1.6
	if ctx.eHp == 1:
		w["dodge"] = float(w.get("dodge", 0)) + 12
		w["roll"] = float(w.get("roll", 0)) + 8
	return _sanitize(w, ctx)


## Выбирает 3 кубика из выброшенной руки `hand`, съедая каждый выбранный.
static func ai_plan(pers: String, ctx: Dictionary, hand: Array) -> Array:
	var pool: Array = hand.duplicate()
	var plan: Array = []
	for slot in 3:
		var w: Dictionary
		match pers:
			"random":
				# Болванчик: две из шести граней — пустой «Отдых», манекен иногда просто стоит
				w = _sanitize({"fwd": 1, "back": 1, "jump": 1, "dodge": 1, "strike": 1, "block": 1, "rest": 1}, ctx)
			"aggressor":
				w = _aggressor_weights(ctx, slot, plan[slot - 1] if slot > 0 else null)
			"controller":
				w = _controller_weights(ctx, slot, plan[slot - 1] if slot > 0 else null)
			"mirror":
				w = _mirror_weights(ctx, slot)
			"shadow":
				w = _shadow_weights(ctx, slot, plan[slot - 1] if slot > 0 else null)
			_:
				w = _sanitize({"fwd": 1, "back": 1, "jump": 1, "dodge": 1, "strike": 1, "block": 1}, ctx)
		var pick := _weighted_pick_from_pool(w, pool)
		plan.append(pick)
		var at := pool.find(pick)
		if at >= 0:
			pool.remove_at(at)
	return plan
