extends Fighter
class_name Player
## ГЛАВНЫЙ ГЕРОЙ — ронин. Расписывать здесь:
##  - золотой скин (награда за «Путь героя», use_golden);
##  - блёстки золотого скина спавнит арена (см. arena.gd, "shine");
##  - план боя собирает UI-консоль, исполняет engine.gd.
##
## Внешность меняется в sprites.gd (PLAYER_LOOK / GOLDEN_RONIN_LOOK).
## Новые позы/оружие героя — тоже туда.

var use_golden: bool = false


func look() -> Dictionary:
	return Sprites.GOLDEN_RONIN_LOOK if use_golden else Sprites.PLAYER_LOOK
