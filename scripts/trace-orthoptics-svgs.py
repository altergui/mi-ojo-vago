#!/usr/bin/env python3
"""
Vectorizes Orthoptics' pre-tinted PNGs into SVG paths.

Not part of `npm run build` — this is a manual regeneration tool, run only
when a source PNG under public/assets/orthoptics/ changes. Requires the
`potrace` binary (Debian/Ubuntu: `apt-get install potrace`) and Pillow
(`pip install pillow`), neither of which are runtime/build dependencies of
the app itself.

Two kinds of source assets, handled differently:

1. Calibration-affected assets (13 stimulus PNGs + left.png/right.png
   markers): solid-color-on-transparent silhouettes where the *alpha*
   channel carries the shape (including antialiased edges) and the RGB is a
   near-uniform maroon/navy that calibration should override. We threshold
   the alpha channel to a 1-bit bitmap and trace *that* — the traced path's
   color is irrelevant, since the app supplies it at render time via `fill`.
   Output: one generated TS module (silhouettes.ts) with {viewBox,
   transform, d, width, height} per file, for a React component to render
   as <svg viewBox><g transform><path d fill={color}/></g></svg>. `transform`
   is potrace's own SVG output transform (unit de-quantization + Y-flip) —
   kept as-is rather than baked into the path data, to avoid reimplementing
   potrace's path-coordinate math.

home.png (topbar Home-button icon) is deliberately NOT handled here: it
turned out to be a shaded/gradient circular badge, not a flat-color
pictogram, so the same alpha/color-mask tracing produces a poor likeness.
It's decorative and not calibration-affected, so it stays a PNG.

Usage: python3 scripts/trace-orthoptics-svgs.py
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

REPO_ROOT = Path(__file__).resolve().parent.parent
ASSETS = REPO_ROOT / "public" / "assets" / "orthoptics"
OUT_TS = REPO_ROOT / "src" / "exercises" / "orthoptics" / "silhouettes.ts"

POTRACE = "potrace"  # must be on PATH

# Calibration-affected: (output key -> source filename stem)
SILHOUETTES = [
    "cirR", "cirA", "face", "solR", "solA", "crossR", "crossA",
    "houseR", "houseA", "carR", "carA", "stereoR", "stereoA",
    "left", "right",
]

SVG_RE = re.compile(
    r'viewBox="0 0 (?P<w>[\d.]+) (?P<h>[\d.]+)".*?'
    r'<g transform="(?P<transform>[^"]+)"\s*\n?fill="#000000" stroke="none">\s*'
    r'<path d="(?P<d>[^"]+)"/>',
    re.DOTALL,
)


def trace_alpha_mask(png_path: Path, tmp_dir: Path) -> dict:
    im = Image.open(png_path).convert("RGBA")
    alpha = im.split()[3]
    # Opaque (shape) -> black/ink for potrace; transparent (background) -> white.
    bw = alpha.point(lambda p: 0 if p > 127 else 255, mode="1")
    pbm_path = tmp_dir / (png_path.stem + ".pbm")
    bw.save(pbm_path)

    svg_path = tmp_dir / (png_path.stem + ".svg")
    subprocess.run(
        [POTRACE, str(pbm_path), "-s", "--flat", "--tight", "-o", str(svg_path)],
        check=True,
    )
    svg_text = svg_path.read_text()
    m = SVG_RE.search(svg_text)
    if not m:
        raise RuntimeError(f"could not parse potrace SVG output for {png_path.name}")
    return {
        "width": round(float(m["w"])),
        "height": round(float(m["h"])),
        "transform": m["transform"],
        "d": m["d"],
    }


def main() -> None:
    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        entries = {}
        for name in SILHOUETTES:
            png_path = ASSETS / f"{name}.png"
            if not png_path.exists():
                print(f"skip {name}: {png_path} not found", file=sys.stderr)
                continue
            entries[name] = trace_alpha_mask(png_path, tmp_dir)
            print(f"traced {name}")

        write_silhouettes_ts(entries)


def write_silhouettes_ts(entries: dict) -> None:
    lines = [
        "/**",
        " * Vector silhouettes traced from Orthoptics' original pre-tinted PNGs",
        " * (public/assets/orthoptics/*.png, alpha channel = shape) via",
        " * scripts/trace-orthoptics-svgs.py. GENERATED — do not hand-edit; rerun",
        " * the script against updated source PNGs instead.",
        " *",
        " * `transform` is potrace's own coordinate de-quantization/Y-flip, kept",
        " * verbatim rather than baked into `d`. Render as:",
        " *   <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>",
        " *     <g transform={transform} fill={color}><path d={d} /></g>",
        " *   </svg>",
        " */",
        "",
        "export interface Silhouette {",
        "  width: number;",
        "  height: number;",
        "  transform: string;",
        "  d: string;",
        "}",
        "",
        "export const SILHOUETTES: Record<string, Silhouette> = {",
    ]
    for name, e in entries.items():
        lines.append(f"  {name}: {{")
        lines.append(f"    width: {e['width']},")
        lines.append(f"    height: {e['height']},")
        lines.append(f"    transform: {ts_str(e['transform'])},")
        lines.append(f"    d: {ts_str(e['d'])},")
        lines.append("  },")
    lines.append("};")
    lines.append("")
    OUT_TS.write_text("\n".join(lines))


def ts_str(s: str) -> str:
    # potrace wraps long path/transform data across lines with raw newlines;
    # collapse to single spaces (path syntax treats whitespace as a plain
    # separator) so the result is a valid single-line TS string literal.
    single_line = " ".join(s.split())
    return "'" + single_line.replace("\\", "\\\\").replace("'", "\\'") + "'"


if __name__ == "__main__":
    main()
