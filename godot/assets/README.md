# Ассеты

Проект запускается БЕЗ ассетов — графика кодовая (`scripts/fighters/sprites.gd`),
звук синтезируется (`scripts/audio.gd`). Эта папка — для замены/расширения.

## sprites/

- `sprites/heroes/`  — спрайт-шиты героя (ронин, золотой ронин).
- `sprites/enemies/` — спрайт-шиты врагов (болванчик, кровожад, страж, зеркало, шиниби).

Формат: PNG, сетка кадров 18×24 px (как в кодовом художнике), масштаб ×4+.
Рекомендуемые ряды кадров: `idle(2) walk(4) strike(3) dodge(2) block(1) leap(2) roll(2) hurt(1) ko(1)`.
Подключать через `AnimatedSprite2D`/`AnimationPlayer` вместо вызова
`Sprites.draw_fighter()` (см. TODO в `scripts/fighters/fighter.gd`).

Импорты: Filter = **Nearest** (пиксель-арт!), без mipmaps.

## audio/

- `audio/sfx/`   — свои звуки (WAV/OGG). Имена как в `Sfx.play("thud")`:
  select, slot, back, fight, rattle, reveal, banner, whoosh, leap, land,
  thud, clang, block, dodge, bump, fall, ko, win, lose, tick, slash, reflect, heal, unlock.
- `audio/music/` — свой музыкальный луп (OGG, loop) вместо синтезатора.

## fonts/

Пиксельные шрифты с **кириллицей** (например, Pixel Cyr / Press Start 2P Cyrillic).
TTF/OTF; подключить в Theme проекта + в `draw_string` всплывающих надписей (TODO в arena.gd).
