"""
Measure the supplied logo without looking at it.

The image cannot be reviewed visually in this environment, so its geometry and
colour content are measured instead: where the opaque pixels actually sit, how
much of the canvas is padding, and what the dominant colours are. That is enough
to decide whether it can be dropped into a 76px-tall header as-is, and whether it
needs cropping to a square first.

  python3 scripts/inspect-logo.py ~/Downloads/filecompresser.png
"""

import sys
from collections import Counter
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "/home/admin/Downloads/filecompresser.png"

im = Image.open(src).convert("RGBA")
w, h = im.size
print(f"source: {src}")
print(f"size:   {w} x {h}  ({w / h:.2f}:1)")

px = im.load()

# Where is the actual artwork? Treat anything meaningfully opaque as content.
alpha = im.getchannel("A")
bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
print(f"opaque bbox: {bbox}")
if bbox:
    x0, y0, x1, y1 = bbox
    cw, ch = x1 - x0, y1 - y0
    print(f"content:     {cw} x {ch}  ({cw / ch:.2f}:1)")
    print(
        f"padding:    left {x0}px ({x0 / w:.1%}), right {w - x1}px ({(w - x1) / w:.1%}), "
        f"top {y0}px ({y0 / h:.1%}), bottom {h - y1}px ({(h - y1) / h:.1%})"
    )

# Dominant colours among the opaque pixels.
colours = Counter()
for y in range(0, h, max(1, h // 200)):
    for x in range(0, w, max(1, w // 200)):
        r, g, b, a = px[x, y]
        if a < 128:
            continue
        # Quantise so near-identical shades collapse together.
        colours[(r // 32 * 32, g // 32 * 32, b // 32 * 32)] += 1

total = sum(colours.values()) or 1
print(f"\nsampled {total} opaque pixels; top colours:")
for (r, g, b), n in colours.most_common(8):
    print(f"  #{r:02x}{g:02x}{b:02x}  {n / total:6.1%}")

transparent = sum(1 for v in alpha.getdata() if v < 128)
print(f"\nfully/near transparent: {transparent / (w * h):.1%} of the canvas")
