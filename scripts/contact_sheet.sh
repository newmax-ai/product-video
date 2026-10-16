#!/usr/bin/env bash
# 用法：contact_sheet.sh <video.mp4> [每秒帧数=1] [输出目录=<视频名>_sheets]
# 把视频按固定帧率抽帧，拼成 4×4 联系表，方便逐张检查画面。
set -euo pipefail
in="${1:?用法: contact_sheet.sh <video.mp4> [fps] [outdir]}"
fps="${2:-1}"
out="${3:-${in%.*}_sheets}"
mkdir -p "$out"
ffmpeg -v error -y -i "$in" -vf "fps=${fps},scale=480:-1,tile=4x4" "$out/sheet_%02d.jpg"
dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$in")
echo "时长 ${dur}s，每秒 ${fps} 帧，每张 16 格（从左到右、从上到下）"
ls -1 "$out"/sheet_*.jpg
