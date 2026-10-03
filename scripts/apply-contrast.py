"""
Apply the computed contrast replacements to globals.css.

Each colour is only darkened enough to clear WCAG AA against the surface it is
used on, along its own hue, so the palette keeps its character. Colours used
only on the dark section are left untouched — they already pass there.

  python3 scripts/apply-contrast.py [--dry-run]
"""

import pathlib
import re
import sys

SRC = pathlib.Path(__file__).resolve().parent.parent / 'app' / 'globals.css'

# Only colours that carry text on a light surface. Borders, fills and the dark
# section are excluded on purpose.
REPLACEMENTS = {
    '#6b7c73': '#65756c',  # section labels, eyebrow, tool facts
    '#6c7d74': '#64746c',  # tools-dropdown and mobile-menu group headings
    '#6e7d75': '#66746d',  # compression level pills
    '#6f9430': '#5c7b28',  # serif emphasis
    '#78867f': '#68756e',  # queued/cancelled file badge
    '#7a8981': '#68746e',  # secondary body text, footer, file metadata
    '#7c8a82': '#69756e',  # supported-format strip
    '#7d8b84': '#69756f',  # field labels
    '#8b9690': '#6b746f',  # tool card descriptions
    '#8b9791': '#6b7470',  # engine note
    '#96a29c': '#6a736f',  # remove button
    # Accent green: used as text (links, current page) and as an icon colour.
    '#7ea31f': '#627f18',
}

dry_run = '--dry-run' in sys.argv
text = SRC.read_text()
original = text

for old, new in REPLACEMENTS.items():
    pattern = re.compile(re.escape(old), re.IGNORECASE)
    count = len(pattern.findall(text))
    if count:
        text = pattern.sub(new, text)
        print(f'  {old} -> {new}  ({count} occurrence{"s" if count != 1 else ""})')

if dry_run:
    print('\ndry run: nothing written')
    raise SystemExit(0)

SRC.write_text(text)
changed = sum(1 for a, b in zip(original.splitlines(), text.splitlines()) if a != b)
print(f'\nrewrote globals.css ({len(original)} -> {len(text)} bytes)')