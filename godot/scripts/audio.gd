extends Node
## Blade Step — 8-битный звук и музыка. Автолоад «Audio8».
## Порт src/game/audio.ts. Вместо WebAudio-осцилляторов все звуки ПРЕДРЕНДЕРЯТСЯ
## в PCM (AudioStreamWAV, 22050 Гц, моно) один раз при старте — дальше просто play().
## Музыка — тот же 32-нотный лид в ре-дорийском ладу, отрендеренный в зацикленный буфер.
##
## TODO (движок): для идеальных петлевых бэкграундов можно вынести музыку в .ogg;
## текущий пред-рендер не требует никаких ассетов и звучит 1-в-1 как веб-версия.

const RATE := 22050
const TAU := 6.28318530718

var muted := false
var music_on := true

var _streams: Dictionary = {}               # name -> AudioStreamWAV
var _players: Array[AudioStreamPlayer] = []
var _music_player: AudioStreamPlayer = null

# ============================================================================
# Музыка: 32-нотный лид в D Dorian (D E F G A B C), бас + хэты (как в вебе)
# ============================================================================
const MELODY: Array = [
	69, 72, 74, 72, 69, 67, 69, -1, # A  C  D  C  A  G  A  .
	74, 72, 69, 67, 64, 67, 69, -1, # D  C  A  G  E  G  A  .
	71, 74, 72, 71, 69, 71, 72, -1, # B  D  C  B  A  B  C  .  (B = дорийская секста)
	74, 72, 69, 67, 69, -1, 74, -1, # D  C  A  G  A  .  D  .  (разрешение в тонику)
]
const BASS: Array = [
	38, 38, 38, 38, # D2 — Dm
	43, 43, 43, 43, # G2 — G
	38, 38, 38, 38, # D2 — Dm
	36, 36, 45, 43, # C2 C2 A2 G2 — каданс
]
const BPM := 132
const EIGHTH := 60.0 / BPM / 2.0


func _ready() -> void:
	randomize()
	_build_sfx()
	_build_music()
	# пул игроков для sfx
	for i in 10:
		var p := AudioStreamPlayer.new()
		p.bus = "Master"
		add_child(p)
		_players.append(p)
	_music_player = AudioStreamPlayer.new()
	_music_player.bus = "Master"
	_music_player.volume_db = -3.0
	add_child(_music_player)
	# TODO (движок): веб-версия стартует музыку после первого жеста пользователя;
	# в Godot аудио можно играть сразу — при желании включить по первому вводу.
	start_music()


static func _mtof(m: int) -> float:
	return 440.0 * pow(2.0, (m - 69) / 12.0)


# ---- PCM-билдер ----------------------------------------------------------

class Baker:
	var buf: PackedFloat32Array

	func _init(seconds: float) -> void:
		buf.resize(int(seconds * BAudio.RATE))
		buf.fill(0.0)

	func add_tone(type: String, f0: float, f1: float, dur: float, vol: float, delay: float) -> void:
		var n := int(dur * BAudio.RATE)
		var start := int(delay * BAudio.RATE)
		var phase := 0.0
		for i in n:
			var idx := start + i
			if idx >= buf.size():
				break
			var t := float(i) / n
			var f := f0 * pow(f1 / f0, t) if f1 > 0.0 else f0
			phase += BAudio.TAU * f / BAudio.RATE
			var s := 0.0
			match type:
				"square":
					s = 1.0 if sin(phase) >= 0.0 else -1.0
				"sawtooth":
					s = 2.0 * fmod(phase / BAudio.TAU, 1.0) - 1.0
				"triangle":
					s = 2.0 * absf(2.0 * fmod(phase / BAudio.TAU, 1.0) - 1.0) - 1.0
				_: # sine
					s = sin(phase)
			# огибающая: быстрая атака, экспоненциальный спад
			var env := clampf(float(i) / (0.012 * BAudio.RATE), 0.0, 1.0)
			env *= pow(0.001, t)
			buf[idx] += s * vol * env

	func add_noise(dur: float, vol: float, filter: String, f0: float, f1: float, delay: float, q: float) -> void:
		var n := int(dur * BAudio.RATE)
		var start := int(delay * BAudio.RATE)
		var y := 0.0
		var prev_x := 0.0
		for i in n:
			var idx := start + i
			if idx >= buf.size():
				break
			var t := float(i) / n
			var f := f0 * pow(maxf(f1, 30.0) / f0, t) if f1 > 0.0 else f0
			var x := randf() * 2.0 - 1.0
			match filter:
				"lowpass":
					var a := 1.0 - exp(-BAudio.TAU * f / BAudio.RATE)
					y += a * (x - y)
				"highpass":
					var a := exp(-BAudio.TAU * f / BAudio.RATE)
					y = a * (y + x - prev_x)
				"bandpass":
					var a1 := 1.0 - exp(-BAudio.TAU * f * q / BAudio.RATE)
					y += a1 * (x - y)
					var a2 := exp(-BAudio.TAU * maxf(f * 0.4, 30.0) / BAudio.RATE)
					y = a2 * (y + x - prev_x)
				_:
					y = x
			prev_x = x
			var env := pow(0.001, t)
			buf[idx] += y * vol * env

	func bake(loop: bool = false) -> AudioStreamWAV:
		var data := PackedByteArray()
		data.resize(buf.size() * 2)
		for i in buf.size():
			var v := int(clampf(buf[i], -1.0, 1.0) * 32760.0)
			data.encode_s16(i * 2, v)
		var s := AudioStreamWAV.new()
		s.format = AudioStreamWAV.FORMAT_16_BITS
		s.mix_rate = BAudio.RATE
		s.stereo = false
		s.data = data
		if loop:
			s.loop_mode = AudioStreamWAV.LOOP_FORWARD
			s.loop_begin = 0
			s.loop_end = buf.size()
		return s


# ---- словарь SFX (порт объекта sfx из audio.ts) ---------------------------

func _build_sfx() -> void:
	# каждый звук — мини-«партитура» из tone/noise
	var defs := {
		"select": [[["tone", "square", 660, 990, 0.07, 0.12, 0.0]]],
		"reflect": [
			["tone", "triangle", 1320, 1980, 0.16, 0.1, 0.0],
			["tone", "sine", 880, 660, 0.22, 0.08, 0.0],
		],
		"heal": [
			["tone", "triangle", 523, 659, 0.12, 0.12, 0.0],
			["tone", "triangle", 659, 784, 0.16, 0.12, 0.09],
		],
		"unlock": _unlock_score(),
		"slot": [
			["tone", "triangle", 300, 180, 0.08, 0.16, 0.0],
			["noise", 0.05, 0.08, "highpass", 2400, 0, 0.0, 1.0],
		],
		"back": [["tone", "square", 420, 260, 0.07, 0.1, 0.0]],
		"fight": [
			["tone", "square", 220, 440, 0.14, 0.2, 0.0],
			["tone", "square", 330, 660, 0.18, 0.18, 0.06],
			["noise", 0.2, 0.1, "highpass", 800, 3000, 0.0, 1.0],
		],
		"rattle": _rattle_score(),
		"reveal": [
			["noise", 0.06, 0.1, "highpass", 3000, 0, 0.0, 1.0],
			["tone", "square", 520, 780, 0.08, 0.1, 0.02],
		],
		"banner": [
			["tone", "triangle", 196, 98, 0.22, 0.26, 0.0],
			["noise", 0.1, 0.12, "lowpass", 400, 120, 0.0, 1.0],
		],
		"whoosh": [["noise", 0.16, 0.14, "bandpass", 500, 2600, 0.0, 1.4]],
		"leap": [
			["noise", 0.22, 0.16, "bandpass", 400, 3200, 0.0, 1.2],
			["tone", "sine", 240, 560, 0.18, 0.08, 0.0],
		],
		"land": [
			["noise", 0.08, 0.14, "lowpass", 300, 0, 0.0, 1.0],
			["tone", "sine", 160, 90, 0.09, 0.14, 0.0],
		],
		"clang": [
			["tone", "square", 1560, 1200, 0.16, 0.14, 0.0],
			["noise", 0.07, 0.14, "highpass", 4200, 2000, 0.0, 1.0],
			["tone", "square", 2330, 1900, 0.13, 0.1, 0.01],
		],
		"block": [
			["tone", "square", 520, 300, 0.1, 0.18, 0.0],
			["tone", "square", 1180, 900, 0.12, 0.1, 0.01],
		],
		"dodge": [["tone", "sine", 700, 1500, 0.09, 0.09, 0.0]],
		"bump": [
			["noise", 0.05, 0.1, "lowpass", 700, 0, 0.0, 1.0],
			["tone", "triangle", 140, 90, 0.06, 0.12, 0.0],
		],
		"fall": [
			["tone", "sawtooth", 520, 60, 0.55, 0.2, 0.0],
			["noise", 0.5, 0.1, "highpass", 1200, 200, 0.0, 1.0],
		],
		"ko": [
			["tone", "sine", 90, 40, 0.5, 0.32, 0.0],
			["noise", 0.3, 0.2, "lowpass", 600, 100, 0.0, 1.0],
			["tone", "sawtooth", 300, 70, 0.4, 0.16, 0.05],
		],
		"win": [
			["tone", "square", 523, 523, 0.16, 0.14, 0.0],
			["tone", "square", 659, 659, 0.16, 0.14, 0.11],
			["tone", "square", 784, 784, 0.16, 0.14, 0.22],
			["tone", "square", 1047, 1047, 0.16, 0.14, 0.33],
			["tone", "square", 1568, 1568, 0.3, 0.1, 0.46],
		],
		"lose": [
			["tone", "triangle", 392, 368, 0.22, 0.14, 0.0],
			["tone", "triangle", 311, 292, 0.22, 0.14, 0.15],
			["tone", "triangle", 262, 246, 0.22, 0.14, 0.3],
			["tone", "triangle", 196, 184, 0.22, 0.14, 0.45],
		],
		"tick": [["tone", "square", 880, 880, 0.04, 0.07, 0.0]],
	}
	for name in defs:
		var total := 0.0
		for ev in defs[name]:
			total = maxf(total, float(ev[ev.size() - 2]) + float(ev[3]))
		var b := Baker.new(total + 0.15)
		for ev in defs[name]:
			if ev[0] == "tone":
				b.add_tone(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6])
			else:
				b.add_noise(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7])
		_streams[name] = b.bake()


func _unlock_score() -> Array:
	var seq := [523, 659, 784, 1047, 1319]
	var out: Array = []
	for i in seq.size():
		out.append(["tone", "square", seq[i], seq[i], 0.14, 0.12, i * 0.09])
	out.append(["tone", "triangle", 1568, 2093, 0.4, 0.1, seq.size() * 0.09])
	return out


func _rattle_score() -> Array:
	var out: Array = []
	for i in 6:
		out.append(["noise", 0.03, 0.09, "highpass", 2000 + randf() * 2500, 0, i * 0.055, 1.0])
	return out


# ---- музыка: пред-рендер всего лупа ----------------------------------------

func _build_music() -> void:
	var steps := MELODY.size()
	var total := steps * EIGHTH + 0.25 # хвост под затухание баса
	var b := Baker.new(total)
	for s in steps:
		var t0 := s * EIGHTH
		var midi: int = MELODY[s]
		if midi >= 0: # leadNote — square, 25% duty ≈ square
			_lead(b, _mtof(midi), t0)
		if s % 2 == 0: # bassNote
			_bass(b, _mtof(BASS[(s / 2) % BASS.size()]), t0)
		if s % 2 == 1:
			_hat(b, t0, 0.025)
		elif s % 8 == 4:
			_hat(b, t0, 0.05) # snare-ish акцент на третью долю
	_streams["__music"] = b.bake(true)


func _lead(b: Baker, f: float, t0: float) -> void:
	var d := EIGHTH * 0.85
	var n := int(d * BAudio.RATE)
	var start := int(t0 * BAudio.RATE)
	var phase := 0.0
	for i in n:
		var idx := start + i
		if idx >= b.buf.size():
			break
		phase += TAU * f / RATE
		var s := 1.0 if sin(phase) >= 0.0 else -1.0
		var t := float(i) / n
		var env: float
		var atk := 0.012 / d
		if t < atk:
			env = t / atk * 0.075
		elif t < 0.55:
			env = 0.075
		else:
			env = 0.075 * pow(0.001 / 0.075, (t - 0.55) / 0.45)
		b.buf[idx] += s * env


func _bass(b: Baker, f: float, t0: float) -> void:
	var d := EIGHTH * 1.85
	var n := int(d * BAudio.RATE)
	var start := int(t0 * BAudio.RATE)
	var phase := 0.0
	for i in n:
		var idx := start + i
		if idx >= b.buf.size():
			break
		phase += TAU * f / RATE
		var s := 2.0 * absf(2.0 * fmod(phase / TAU, 1.0) - 1.0) - 1.0
		var t := float(i) / n
		var env := clampf(t / (0.02 / d), 0.0, 1.0) * 0.15 * pow(0.001 / 0.15, t)
		b.buf[idx] += s * env


func _hat(b: Baker, t0: float, vol: float) -> void:
	b.add_noise(0.035, vol, "highpass", 6500, 0, t0, 1.0)


# ---- публичное API ----------------------------------------------------------

func play(name: String) -> void:
	if muted or not _streams.has(name):
		return
	for p in _players:
		if not p.playing:
			p.stream = _streams[name]
			p.play()
			return
	_players[0].stream = _streams[name]
	_players[0].play()


func set_muted(m: bool) -> void:
	muted = m
	if m:
		for p in _players:
			p.stop()


func start_music() -> void:
	if not music_on or _music_player == null:
		return
	_music_player.stream = _streams.get("__music")
	if not _music_player.playing:
		_music_player.play()


func stop_music() -> void:
	if _music_player != null:
		_music_player.stop()


func set_music_on(on: bool) -> void:
	music_on = on
	if on:
		start_music()
	else:
		stop_music()
