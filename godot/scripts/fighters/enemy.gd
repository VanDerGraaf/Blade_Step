extends Fighter
class_name Enemy
## ВРАГ. Личность определяет и мозг (веса в logic.gd), и обличье (sprites.gd).
##
## Как добавить нового врага:
##   1. Палитра            → sprites.gd : ENEMY_LOOKS["имя"]
##   2. Особая грань/веса  → logic.gd  : counter_of() / *_weights()
##   3. Личность и мета    → types.gd  : PERSONALITIES, PERSONALITY_KIND
##   4. Набор кубиков      → types.gd  : DICE_POOLS["имя"]
##   5. Карточка в меню    → ui/menu.gd (строится из types.gd автоматически)

var personality: String = "aggressor" # random | aggressor | controller | mirror | shadow


func look() -> Dictionary:
	return Sprites.ENEMY_LOOKS[BT.PERSONALITY_KIND[personality]]


## Спланировать обмен: выбрать 3 кубика из выброшенной руки.
func make_plan(ctx: Dictionary, hand: Array) -> Array:
	return Logic.ai_plan(personality, ctx, hand)
