#!/usr/bin/env python3
"""检查「画面停住后还在抖」：比较成片里相邻帧的像素差异。

界面停稳后，相邻两帧除了光标之外应当完全相同。弹簧没锁定、缩放比例每帧微变、交叉淡化叠了两层阴影，
都会让小图标和阴影边缘在停住后仍然每帧变一点，肉眼看是「一直在抖」。

用法：
  python3 still_diff.py out/video.mp4 --from 13.2 --to 14.0
      逐帧比较这段时间里的相邻帧，打印每对帧变化的像素数和变化区域
  python3 still_diff.py out/video.mp4 --from 13.2 --to 14.0 --region 600,300,400,200
      只看某块区域（x,y,w,h，成片像素），例如只看有阴影的卡片边缘
  python3 still_diff.py a.png b.png
      直接比较两张图（renderStill 渲染的单帧，或同一帧渲染两次检查确定性）
  --ignore x,y,w,h 可重复，排除光标等本来就在动的区域；--threshold 每通道差值阈值（默认 2，过滤编码噪声）

依赖：ffmpeg（抽帧）、Pillow（pip install pillow）。成片是有损编码，停住的画面也可能有 1–2 级噪声，
所以默认阈值是 2；要求严格一致时用 renderStill 渲染的 PNG 比较，阈值设 0。
"""
import argparse
import os
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageChops
except ImportError:
    sys.exit('需要 Pillow：pip install pillow')


def box(s):
    x, y, w, h = (int(v) for v in s.split(','))
    return (x, y, x + w, y + h)


def compare(a, b, region, ignores, threshold):
    if region:
        a, b = a.crop(region), b.crop(region)
    diff = ImageChops.difference(a.convert('RGB'), b.convert('RGB'))
    r, g, b = diff.split()
    mask = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > threshold else 0)  # 取三通道最大差值
    ox, oy = (region[0], region[1]) if region else (0, 0)
    for ig in ignores:
        mask.paste(0, (ig[0] - ox, ig[1] - oy, ig[2] - ox, ig[3] - oy))
    changed = mask.histogram()[255]  # mask 只有 0 / 255 两种值
    bbox = mask.getbbox()
    if bbox:
        bbox = (bbox[0] + ox, bbox[1] + oy, bbox[2] - bbox[0], bbox[3] - bbox[1])
    return changed, bbox


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('inputs', nargs='+')
    ap.add_argument('--from', dest='start', type=float)
    ap.add_argument('--to', dest='end', type=float)
    ap.add_argument('--region', type=box)
    ap.add_argument('--ignore', type=box, action='append', default=[])
    ap.add_argument('--threshold', type=int, default=2)
    args = ap.parse_args()

    if len(args.inputs) == 2 and all(p.lower().endswith(('.png', '.jpg', '.jpeg')) for p in args.inputs):
        changed, bbox = compare(Image.open(args.inputs[0]), Image.open(args.inputs[1]), args.region, args.ignore, args.threshold)
        print(f'变化像素 {changed}' + (f'，区域 x,y,w,h = {bbox}' if bbox else '（完全一致）'))
        sys.exit(1 if changed else 0)

    if args.start is None or args.end is None:
        sys.exit('视频模式需要 --from 和 --to（秒）')
    with tempfile.TemporaryDirectory() as tmp:
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-ss', str(args.start), '-to', str(args.end), '-i', args.inputs[0], os.path.join(tmp, 'f_%04d.png')],
            check=True,
        )
        frames = sorted(os.listdir(tmp))
        if len(frames) < 2:
            sys.exit('这段时间里不到两帧')
        worst = 0
        for i in range(1, len(frames)):
            a = Image.open(os.path.join(tmp, frames[i - 1]))
            b = Image.open(os.path.join(tmp, frames[i]))
            changed, bbox = compare(a, b, args.region, args.ignore, args.threshold)
            worst = max(worst, changed)
            print(f'{frames[i - 1]} → {frames[i]}：变化像素 {changed:6d}' + (f'  区域 {bbox}' if bbox else ''))
        print(f'共 {len(frames)} 帧，单对最大变化 {worst} 像素' + ('：停住的画面应当为 0，检查弹簧锁定 / 缩放取整 / 阴影叠加' if worst else '：稳定'))


if __name__ == '__main__':
    main()
