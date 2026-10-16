#!/usr/bin/env python3
"""圆角放大裁切表（200–400%）：python3 corner_crops.py <pts.json> <帧目录> <输出.png> [--fps 30] [--scale 4] [--size 60]
pts.json：{"<秒>": [["名称", x, y], ...]}，可直接用 corner_check.mjs 返回的 pts（每个角一个点）。
帧文件名为 f_00000.png（帧号 = round(秒×fps)）。每行一个时间点，每格一个角，左上角标名称和时间。"""
import json, sys
from PIL import Image, ImageDraw
a = sys.argv; pts = json.load(open(a[1])); fdir = a[2]; out = a[3]
opt = lambda k, d: type(d)(a[a.index(k) + 1]) if k in a else d
fps, sc, sz = opt('--fps', 30.0), opt('--scale', 4), opt('--size', 60)
rows = []
for t, ps in sorted(pts.items(), key=lambda x: float(x[0])):
    im = Image.open(f'{fdir}/f_{round(float(t) * fps):05d}.png').convert('RGB'); tiles = []
    for name, x, y in ps:
        c = im.crop((x - sz // 2, y - sz // 2, x + sz // 2, y + sz // 2)).resize((sz * sc, sz * sc), Image.NEAREST)
        d = ImageDraw.Draw(c); d.rectangle((0, 0, 110, 14), fill='black'); d.text((2, 2), f'{name} {float(t):.1f}s', fill='yellow'); tiles.append(c)
    if tiles: rows.append(tiles)
T = sz * sc; Wd = max(len(r) for r in rows) * T
S = Image.new('RGB', (Wd, T * len(rows)), (40, 40, 40))
for j, r in enumerate(rows):
    for i, c in enumerate(r): S.paste(c, (i * T, j * T))
S.save(out); print(out, S.size, f'{sum(len(r) for r in rows)} 个角，{sc * 100}%')
