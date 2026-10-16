#!/usr/bin/env bash
# 用法：scene_cuts.sh <video.mp4> [阈值=0.25]
# 列出硬切时间点和镜头平均时长，用来对照分镜检查节奏。
set -euo pipefail
in="${1:?用法: scene_cuts.sh <video.mp4> [threshold]}"
th="${2:-0.25}"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
cuts=$(ffmpeg -i "$in" -vf "select='gt(scene,${th})',showinfo" -f null - 2>&1 \
  | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 || true)
echo "时长: ${dur}s"
echo "切点: $(echo $cuts)"
echo "$cuts" | awk -v d="$dur" 'NF{n++; if(p!=""&&$1-p<0.2){n--} p=$1} END{printf "镜头数(约): %d，平均镜头时长: %.1fs\n", n+1, d/(n+1)}'
echo "提示：淡入淡出/模糊转场不会被识别为硬切，镜头数以分镜为准。"
