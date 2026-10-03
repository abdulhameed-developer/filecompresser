"""
Report every *text* colour in the stylesheet and whether it clears WCAG AA.

Only colours used as `color:` matter — a border or a background is not text and
has no 4.5:1 requirement. Non-text UI (borders, fills) is held to 3:1 by
WCAG 1.4.11, which is checked separately.

  python3 scripts/check-text-colors.py
"""

import re
import pathlib

SRC = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'globals.css'


def srgb_to_linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * srgb_to_linear(r) + 0.7152 * srgb_to_linear(g) + 0.0722 * srgb_to_linear(b)


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def to_hex(css_rgb):
    m = re.search(r'rgba?\(([^)]+)\)', css_rgb)
    if not m:
        return None
    parts = [float(v) for v in m.group(1).split(',')]
    if len(parts) >= 4 and parts[3] < 0.5:
        return None  # transparent
    return '#%02x%02x%02x' % tuple(round(p) for p in parts[:3])


text = SRC.read_text()

# Every rule that sets a `color`, and the hex tokens it uses.
text_colours = set()
for block in re.finditer(r'\{([^{}]*)\}', text):
    body = block.group(1)
    m = re.search(r'(?<!-)color:\s*([^;]+);', body)
    if not m:
        continue
    value = m.group(1).strip()
    for hexval in re.findall(r'#[0-9a-fA-F]{6}', value):
        text_colours.add(hexval.lower())

# Surfaces each colour is plausibly used on: white cards, the page, the footer.
surfaces = {'#ffffff': 'white card', '#f7f8f4': 'page', '#fafbf8': 'footer', '#fbfcf8': 'dropzone'}

print(f"{'colour':10} {'on':12} {'ratio':>6}  verdict")
print('-' * 52)
fails = []
for c in sorted(text_colours):
    worst_name, worst = None, 99
    for bg, name in surfaces.items():
        r = contrast(c, bg)
        if r < worst:
            worst, worst_name = r, name
    ok = worst >= 4.5
    if not ok:
        fails.append((c, worst, worst_name))
    print(f'{c:10} {worst_name:12} {worst:6.2f}  {"ok" if ok else "BELOW 4.5"}')

print()
if fails:
    print(f'{len(fails)} text colour(s) below 4.5:1')
else:
    print('all text colours clear 4.5:1')