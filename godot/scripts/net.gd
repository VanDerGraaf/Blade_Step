extends Node
## Blade Step — сетевой слой. Автолоад «Net».
## Порт src/game/net.ts. Два транспорта:
##   online — чистый WebRTC: ручной обмен SDP (приглашение -> ответ), без серверов;
##   lan    — WebSocket-клиент к собственному relay-серверу (tools/lan-server.cjs,
##            запускается на машине хоста; сервер совместим с веб-версией один в один).
##
## Сообщения игры — те же, что в веб-версии:
##   { "t": "hello" } / { "t": "look", "look": kind } / { "t": "begin" }
##   { "t": "hand", "hand": [...] } / { "t": "plan", "plan": [...] }
##   { "t": "rematch" } / { "t": "lobby" } / { "t": "quit" }

signal invite_ready(code: String)     # хост: приглашение готово, передать другу
signal answer_ready(code: String)     # гость: ответ готов, вернуть хосту
signal connected(peer_name: String, is_host: bool)
signal msg(data: Dictionary)
signal dropped
signal net_error(text: String)

enum Mode { NONE, ONLINE_HOST, ONLINE_GUEST, LAN }

var mode: int = Mode.NONE
var is_host := false

# ---- online (WebRTC) ----
var _rtc: WebRTCPeerConnection = null
var _channel: WebRTCDataChannel = null
var _offer_sdp := ""
var _offer_cands: Array = []
var _offer_done := false
var _answer_sdp := ""
var _answer_cands: Array = []
var _answer_done := false

# ---- lan (WebSocket relay) ----
var _ws: WebSocketPeer = null
var _lan_host := false

# TODO: веб-версия жмёт SDP через CompressionStream (deflate) — коды короче.
# В Godot нет встроенного zlib для строк; пока base64 от чистого JSON (~2-3 КБ).
# При желании: собрать строку в PackedByteArray и прогнать через свой deflate.


func _process(_delta: float) -> void:
	if _rtc != null:
		_rtc.poll()
	if _ws != null:
		_ws.poll()
		while _ws.get_ready_state() == WebSocketPeer.STATE_OPEN and _ws.get_available_packet_count() > 0:
			var pkt := _ws.get_packet()
			_on_lan_packet(pkt.get_string_from_utf8())


# ============================================================================
# ONLINE: хост
# ============================================================================

func host_online() -> void:
	teardown()
	if not _has_webrtc():
		net_error.emit("WebRTC недоступен в этой сборке Godot.")
		return
	mode = Mode.ONLINE_HOST
	is_host = true
	_rtc = WebRTCPeerConnection.new()
	_rtc.initialize({"iceServers": _ice_servers()})
	_channel = _rtc.create_data_channel("bladestep", {"ordered": true})
	_bind_rtc_signals()
	var err := _rtc.create_offer()
	if err != OK:
		net_error.emit("Не удалось создать WebRTC-оффер (код %d)." % err)
		teardown()


# ============================================================================
# ONLINE: гость
# ============================================================================

func join_online() -> void:
	teardown()
	if not _has_webrtc():
		net_error.emit("WebRTC недоступен в этой сборке Godot.")
		return
	mode = Mode.ONLINE_GUEST
	is_host = false
	_rtc = WebRTCPeerConnection.new()
	_rtc.initialize({"iceServers": _ice_servers()})
	_bind_rtc_signals()
	# data channel создастся из оффера хоста (dctp)


func create_answer(invite_code: String) -> void:
	if mode != Mode.ONLINE_GUEST or _rtc == null:
		net_error.emit("Сначала нажмите «ВОЙТИ В ДУЭЛЬ».")
		return
	var offer: Dictionary = _decode(invite_code)
	if offer.is_empty() or not offer.has("sdp"):
		net_error.emit("Приглашение повреждено или скопировано не целиком.")
		return
	_answer_cands.clear()
	_answer_done = false
	var err := _rtc.set_remote_description("offer", offer.sdp)
	if err != OK:
		net_error.emit("Не удалось принять приглашение (код %d)." % err)
		return
	for c in offer.get("cands", []):
		_rtc.add_ice_candidate(c)
	err = _rtc.create_answer()
	if err != OK:
		net_error.emit("Не удалось создать ответ (код %d)." % err)


func accept_answer(answer_code: String) -> void:
	if mode != Mode.ONLINE_HOST or _rtc == null:
		net_error.emit("Сначала создайте дуэль.")
		return
	var ans: Dictionary = _decode(answer_code)
	if ans.is_empty() or not ans.has("sdp"):
		net_error.emit("Ответ повреждён или скопирован не целиком.")
		return
	var err := _rtc.set_remote_description("answer", ans.sdp)
	if err != OK:
		net_error.emit("Не удалось принять ответ (код %d)." % err)
		return
	for c in ans.get("cands", []):
		_rtc.add_ice_candidate(c)


func _bind_rtc_signals() -> void:
	_rtc.session_description_created.connect(_on_sdp)
	_rtc.ice_candidate_created.connect(_on_ice)
	_rtc.connection_state_changed.connect(_on_rtc_state)
	_rtc.data_channel_received.connect(_on_channel_received)


func _on_sdp(type: String, sdp: String) -> void:
	var err := _rtc.set_local_description(type, sdp)
	if err != OK:
		push_warning("set_local_description failed: %d" % err)
	if type == "offer":
		_offer_sdp = sdp
	elif type == "answer":
		_answer_sdp = sdp
	_maybe_emit_codes()


func _on_ice(mid: String, index: int, sdp: String) -> void:
	var cand := {"mid": mid, "index": index, "sdp": sdp}
	if _answer_sdp.is_empty():
		_offer_cands.append(cand)
	else:
		_answer_cands.append(cand)
	_maybe_emit_codes()


func _maybe_emit_codes() -> void:
	# Оффер готов, когда есть SDP и канал собран (WebRTC сам сигнализирует
	# конец сбора кандидатов через состояние gathering — упрощённо: ждём
	# собранный канал + паузу). Godot 4 не отдаёт onicegatheringstatechange,
	# поэтому даём кандидатам время собраться и выпускаем код по таймеру.
	if mode == Mode.ONLINE_HOST and not _offer_sdp.is_empty() and not _invite_emitted:
		_invite_timer += 1
		if _invite_timer > 40: # ~0.7 c при 60 fps
			_invite_emitted = true
			invite_ready.emit(_encode({"sdp": _offer_sdp, "cands": _offer_cands}))
	elif mode == Mode.ONLINE_GUEST and not _answer_sdp.is_empty() and not _answer_emitted:
		_answer_timer += 1
		if _answer_timer > 40:
			_answer_emitted = true
			answer_ready.emit(_encode({"sdp": _answer_sdp, "cands": _answer_cands}))


var _invite_emitted := false
var _answer_emitted := false
var _invite_timer := 0
var _answer_timer := 0


func _on_rtc_state(state: int) -> void:
	match state:
		WebRTCPeerConnection.STATE_CONNECTED:
			connected.emit("Соперник", is_host)
		WebRTCPeerConnection.STATE_DISCONNECTED, \
		WebRTCPeerConnection.STATE_FAILED, \
		WebRTCPeerConnection.STATE_CLOSED:
			if mode == Mode.ONLINE_HOST or mode == Mode.ONLINE_GUEST:
				dropped.emit()
				teardown()


func _on_channel_received(ch: WebRTCDataChannel) -> void:
	_channel = ch
	_bind_channel()


func _bind_channel() -> void:
	# Канал готов, когда open; соединение считаем установленным по STATE_CONNECTED.
	pass


# ============================================================================
# LAN: WebSocket-клиент к relay-серверу (ws://IP:PORT)
# ============================================================================

func lan_connect(address: String) -> void:
	teardown()
	var addr := address.strip_edges()
	if not addr.contains("://"):
		addr = "ws://" + addr
	mode = Mode.LAN
	_ws = WebSocketPeer.new()
	var err := _ws.connect_to_url(addr)
	if err != OK:
		net_error.emit("Не удалось подключиться к %s (код %d)." % [address, err])
		teardown()


func _on_lan_packet(text: String) -> void:
	var j: Variant = JSON.parse_string(text)
	if not (j is Dictionary):
		return
	match j.get("k", ""):
		"role":
			_lan_host = bool(j.get("host", false))
			is_host = _lan_host
		"peer":
			connected.emit("Соперник", is_host)
		"peer-left":
			dropped.emit()
		"full":
			net_error.emit("Комната занята — два бойца уже дерутся.")
			teardown()
		_:
			# сервер пересылает сообщения игры без оболочки
			if j.has("t"):
				msg.emit(j)


# ============================================================================
# общее
# ============================================================================

func send(data: Dictionary) -> void:
	var text := JSON.stringify(data)
	match mode:
		Mode.ONLINE_HOST, Mode.ONLINE_GUEST:
			if _channel != null and _channel.get_ready_state() == WebRTCDataChannel.STATE_OPEN:
				_channel.put_packet(text.to_utf8_buffer())
		Mode.LAN:
			if _ws != null and _ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
				_ws.send_text(text)


func teardown() -> void:
	if _channel != null:
		_channel.close()
	if _rtc != null:
		_rtc.close()
	if _ws != null:
		_ws.close()
	_rtc = null
	_channel = null
	_ws = null
	_offer_sdp = ""
	_answer_sdp = ""
	_offer_cands.clear()
	_answer_cands.clear()
	_offer_done = false
	_answer_done = false
	_invite_emitted = false
	_answer_emitted = false
	_invite_timer = 0
	_answer_timer = 0
	mode = Mode.NONE
	is_host = false


func _ice_servers() -> Array:
	return [
		{"urls": ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"]},
	]


func _has_webrtc() -> bool:
	# В редакторе и большинстве сборок WebRTC доступен; headless-сервер — нет.
	return ClassDB.class_exists("WebRTCPeerConnection")


func _encode(d: Dictionary) -> String:
	return Marshalls.utf8_to_base64(JSON.stringify(d))


func _decode(code: String) -> Dictionary:
	var clean := code.strip_edges().replace("\n", "").replace("\r", "")
	var raw := Marshalls.base64_to_utf8(clean)
	if raw == "":
		return {}
	var j: Variant = JSON.parse_string(raw)
	return j if j is Dictionary else {}
