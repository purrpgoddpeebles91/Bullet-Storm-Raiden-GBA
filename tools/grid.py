#!/usr/bin/env python3
"""labelled screenshot grid: grid.py OUT.png COLS 'label=file.png' ..."""
import sys
from PIL import Image, ImageDraw
out, cols = sys.argv[1], int(sys.argv[2])
items = [a.split('=', 1) for a in sys.argv[3:]]
ims = [(l, Image.open(f).convert('RGB')) for l, f in items]
w, h = ims[0][1].size
rows = (len(ims) + cols - 1) // cols
g = Image.new('RGB', (cols * w + (cols - 1) * 6, rows * (h + 22)), (24, 24, 32))
d = ImageDraw.Draw(g)
for i, (l, im) in enumerate(ims):
    x, y = (i % cols) * (w + 6), (i // cols) * (h + 22)
    d.text((x + 4, y + 5), l, fill=(255, 255, 255))
    g.paste(im, (x, y + 20))
g.save(out)
