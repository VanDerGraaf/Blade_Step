class_name ArenaTime
## Глобальное игровое время и slow-mo (хитстоп). Движок/арена/бойцы
## читают отсюда; пауза и хитстоп меняют scale.
##
## TODO (движок): если захотите честную паузу сцены — tree.paused +
## process_mode, но для пошаговой дуэли достаточно этого флага.

static var time: float = 0.0
static var scale: float = 1.0
static var paused: bool = false


static func advance(delta: float) -> void:
	if paused:
		return
	time += delta * scale
