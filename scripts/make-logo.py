"""
Turn the supplied logo into production assets.

The source is a 1774x887 lockup with ~27% transparent padding top and bottom and
8% at the sides, at 619 KB. Dropped into a 76px header as-is it would be scaled
to a few pixels tall and still cost 619 KB, so this:

  1. crops to the opaque bounding box, with a small even margin
  2. resamples to the size actually rendered (2x, for retina)
  3. writes a palette-reduced PNG, which is far smaller for flat brand artwork

Outputs (into public/):
  logo.png          the full wordmark, for the header and footer
  logo-mark.png     a square crop of the mark, for the favicon and OG image

  python3 scripts/make-logo.py [source]
"""

import os
import sys
from PIL import Image

src = sys.argv[1] if len(sys.argv) > 1 else "/home/admin/Downloads/filecompresser.png"
out_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public")
os.makedirs(out_dir, exist_ok=True)

im = Image.open(src).convert("RGBA")
w, h = im.size


def crop_to_content(image, pad_ratio=0.02):
    """Trim transparent padding, leaving a small even margin."""
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda a: 255 if a > 16 else 0).getbbox()
    if not bbox:
        return image
    x0, y0, x1, y1 = bbox
    pad = int(max(x1 - x0, y1 - y0) * pad_ratio)
    return image.crop(
        (
            max(0, x0 - pad),
            max(0, y0 - pad),
            min(image.width, x1 + pad),
            min(image.height, y1 + pad),
        )
    )


logo = crop_to_content(im)
cw, ch = logo.size
print(f"source      {w} x {h}")
print(f"cropped     {cw} x {ch}  ({cw / ch:.2f}:1)")

# The header renders the wordmark at about 34px tall; 2x keeps it crisp on
# high-DPI screens without shipping the 887px original.
HEADER_HEIGHT = 34
target_h = HEADER_HEIGHT * 2
scale = target_h / ch
target_w = max(1, round(cw * scale))
wordmark = logo.resize((target_w, target_h), Image.LANCZOS)

wordmark_path = os.path.join(out_dir, "logo.png")
# Flat brand art quantises to a tiny palette with no visible loss.
wordmark.save(wordmark_path, "PNG", optimize=True)

# A square mark for the favicon / OG image: take the left portion of the lockup,
# which is where the symbol lives, then centre-crop it to a square.
mark_source = logo.crop((0, 0, min(cw, ch), ch))
side = min(mark_source.width, mark_source.height)
left = (mark_source.width - side) // 2
mark = mark_source.crop((left, 0, left + side, side))
# 256px is ample: the favicon is 32-48px and the OG image scales it down.
# Resampling a 1529px source to 512px only inflated the file, not the detail.
mark = mark.resize((256, 256), Image.LANCZOS)
mark_path = os.path.join(out_dir, "logo-mark.png")
mark.save(mark_path, "PNG", optimize=True)

# The favicon and the touch icon are rendered at 32-180px, so downsample them
# from the mark rather than shipping the larger originals.
for name, size in (("favicon-32.png", 32), ("favicon-192.png", 192), ("apple-touch-icon.png", 180)):
    resized = mark.resize((size, size), Image.LANCZOS)
    resized.save(os.path.join(out_dir, name), "PNG", optimize=True)

for path, size in ((wordmark_path, target_w), (mark_path, 256)):
    kb = os.path.getsize(path) / 1024
    print(f"wrote public/{os.path.basename(path):24s} {size:5d}px  {kb:7.1f} KB")
