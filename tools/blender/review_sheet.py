"""Tile a review round's renders with the design reference into one sheet.

usage: python3 -I review_sheet.py <review_dir> <tag> <reference.jpg> <out.png>
"""
import glob
import sys

from PIL import Image, ImageDraw

review_dir, tag, ref_path, out_path = sys.argv[1:5]
shots = sorted(glob.glob(f"{review_dir}/{tag}_*.png"))
tiles = [Image.open(p).convert("RGB") for p in shots]
tw, th = tiles[0].size

ref = Image.open(ref_path).convert("RGB")
ref = ref.resize((tw * 2, int(ref.height * tw * 2 / ref.width)))

sheet = Image.new("RGB", (tw * 2, th * 2 + ref.height), "black")
for i, t in enumerate(tiles[:4]):
    sheet.paste(t.resize((tw, th)), ((i % 2) * tw, (i // 2) * th))
sheet.paste(ref, (0, th * 2))

draw = ImageDraw.Draw(sheet)
for i, p in enumerate(shots[:4]):
    draw.text(((i % 2) * tw + 12, (i // 2) * th + 10), p.rsplit("/", 1)[-1], fill=(255, 160, 60))
draw.text((12, th * 2 + 10), "REFERENCE", fill=(255, 160, 60))
sheet.save(out_path)
print(out_path)
