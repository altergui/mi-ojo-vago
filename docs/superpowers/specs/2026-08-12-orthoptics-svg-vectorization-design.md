# Orthoptics SVG vectorization — design

Supersedes the canvas-tint mechanism shipped earlier on this same PR
(`src/exercises/orthoptics/tint.ts`, `useTintedSrc`): that fix made the
stimulus/marker images track color calibration by recoloring PNG pixels on a
canvas at runtime. This design replaces that raster approach with real
vector art, which both tracks calibration *and* scales losslessly — the PNGs
were native ~179–384px, so max-width/max-height scaling of them was already
lossy at larger display sizes.

## Goal

Orthoptics' stimulus/marker images are pre-tinted, solid-color-on-transparent
PNGs: fixed maroon `(128,0,0)` or navy `(0,0,128)` RGB, with the shape
carried entirely by the alpha channel (including antialiased edges). Convert
these to vector paths so they render crisply at any size and recolor via a
plain SVG `fill` — no canvas, no runtime image loading.

`home.png` (the topbar Home-button icon) was in scope too, but turned out on
inspection to be a shaded/gradient circular badge, not the flat 2-color
pictogram assumed going in — the same alpha/color-mask tracing approach
produces a poor likeness on it (see "Deviation from plan" below). It stays a
PNG.

Also delete the 5 confirmed-unused legacy PNGs (`Abajo.png`, `Arriba.png`,
`cirN.png`, `D1.png`, `I1.png`) — present in `public/assets/orthoptics/` and
referenced in the original `FUENTES/orthoptics/ortoptics.php`, but never
wired into the React port (no `grep` hits in `src/`).

## Asset pipeline (one-time; not part of `npm run build`)

`scripts/trace-orthoptics-svgs.py`, requiring the system `potrace` binary
(not an npm dependency — this script is a manual regeneration tool, run only
when a source PNG changes, same spirit as a codegen script):

1. **Calibration-affected assets** (13 stimuli + `left.png`/`right.png`
   markers — 15 files, some filenames shared across stimuli): for each,
   threshold the PNG's alpha channel to a 1-bit bitmap (alpha > 50% →
   traced), run `potrace -s --flat` to get an SVG, parse out its `viewBox`
   and path `d`. Write all of them into one generated TS module,
   `src/exercises/orthoptics/silhouettes.ts`, exporting
   `Record<string, { viewBox: string; d: string; width: number; height: number }>`
   keyed by the original filename stem (`cirR`, `houseA`, `left`, ...).

2. Delete the 5 unused PNGs and the 15 PNGs now superseded (13 stimuli +
   `left`/`right`). `public/assets/orthoptics/` ends up with `logo.svg`,
   `home.png`, and nothing else.

## Deviation from plan: `home.png` stays a PNG

The design assumed `home.png` was a flat 2-color pictogram. It's actually a
radial-gradient circular badge with a drop-shadowed house glyph inside —
tracing its blue/white masks with the same tolerance-based approach produced
a shape that only loosely resembled the original (gradient shading and the
shadow were lost entirely; see the design-review screenshot from
implementation). A faithful vector version is possible (hand-authored SVG
gradient + multiple color layers) but is meaningfully more work for an icon
that's small (80×80, rendered at 22×22), decorative, and never scaled up —
not worth it under the "if you can do it faithfully" bar this project was
scoped to. Left as `home.png`, unchanged.

## Runtime

New `Silhouette` component (`src/exercises/orthoptics/Silhouette.tsx`):

```tsx
interface SilhouetteProps {
  name: keyof typeof SILHOUETTES;
  color: string;
  className?: string;
  style?: CSSProperties;
}
```

Looks up `{ viewBox, d, width, height }` in `silhouettes.ts` and renders
`<svg viewBox width height className style><path d={d} fill={color} /></svg>`
directly — no `fetch`, no canvas, no async state, no cache, no flash-of-
stale-shape handling (all needed by the canvas approach specifically because
recoloring required an async image load). Recoloring is just a React prop.

`OrthopticsExercise.tsx` changes:
- Delete `tint.ts`, `tint.test.ts`, `useTintedSrc`.
- The 4 stimulus/marker `<img>` elements become `<Silhouette>`, keeping the
  same `className`/`style` (position/transform/opacity) — svg accepts the
  same CSS properties an img did, so `.ortho__stimulus`/`.ortho__marker` in
  `global.css` need no changes. `width`/`height` come from `silhouettes.ts`
  (the traced bitmap's original pixel size), so existing `max-width`/
  `max-height` scale it exactly as before.
- The Home button's `<img src={`${BASE}/home.png`}>` becomes
  `<img src={`${BASE}/home.svg`}>` — one-line change, still a plain static
  image since it's not calibration-driven.

## Testing

Pure-data tests on `silhouettes.ts` (`silhouettes.test.ts`): every name
referenced by `STIMULI` (plus `left`/`right`) resolves to a non-empty `d`
and a `viewBox` matching `/^0 0 \d+ \d+$/`. Mirrors the project's existing
pattern of testing pure logic/data, not DOM rendering (no game/canvas code
in this repo has DOM-level tests).

## Verification

`vitest run`, `tsc --noEmit`, `npm run build`, then a manual browser check
(same palette-switch check used for the canvas version) confirming the
vector stimuli recolor correctly across both palettes and render crisply.
Push to the PR branch to trigger the `deploy-dev` GitHub Actions job and
confirm on `mi-ojo-vago-dev.guidev.org`.
