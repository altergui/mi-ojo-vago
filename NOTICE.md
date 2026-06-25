# Attribution

This project is a modern (React + Vite + TypeScript) rebuild of the **Mi Ojo Vago**
suite of anaglyph (red/cyan) dichoptic games used as adjunct training for amblyopia
("lazy eye").

## Original work

- **Amblyotris** (Tetris) — © 2022 Guilad Gonen — MIT License
  https://github.com/Guiladg/amblyotris
- **Amblyonoid** (Arkanoid) — © 2022 Guilad Gonen — MIT License
  https://github.com/Guiladg/amblyonoid
- Original portal: https://dresiribarren.com.ar/mi-ojo-vago/

The game logic, dichoptic color model, scoring, and assets (sounds, logo) are derived
from the original MIT-licensed source. This rebuild decouples that logic from the DOM,
makes it responsive and touch-capable, and adds long-term training statistics in
`localStorage`.

## Medical disclaimer

These games are a training aid, **not** a medical device or a substitute for
professional care. Amblyopia treatment should be supervised by an ophthalmologist
or orthoptist.
