#!/usr/bin/env python3
"""配乐分析：测 BPM、节拍网格、每小节能量、drop 位置；也能测音效的峰值偏移。

依赖：pip install librosa（会带上 numpy）

用法：
  python3 analyze_music.py bgm.mp3                 # 打印摘要，并写出 bgm.beats.json
  python3 analyze_music.py bgm.mp3 --beats-per-bar 3
  python3 analyze_music.py bgm.mp3 --bpm 120 --downbeat 8.0   # 已知 BPM / 某个小节首拍时直接指定
  python3 analyze_music.py --peak whoosh.wav       # 音效峰值距文件开头多少秒

分镜怎么用：
  - 表头写 BPM 和 first_downbeat；镜头起止、硬切吸附到 beats / downbeats（见 templates/motion.js 的 snapToBeat）
  - 全片最大的揭示（logo、核心结果、One More Thing）放在 drop 那一小节的第一拍（脚本给 3 个候选，听一遍再定）
  - 音效要让「峰值」落在事件上：音效起点 = 事件时间 - peak 偏移
"""
import argparse
import json
import sys

import numpy as np

try:
    import librosa
except ImportError:
    sys.exit("缺少 librosa：pip install librosa")


def peak_offset(path):
    y, sr = librosa.load(path, sr=None, mono=True)
    i = int(np.argmax(np.abs(y)))
    print(f"{path}: 峰值在 {i / sr:.3f}s（时长 {len(y) / sr:.3f}s）")


def analyze(path, beats_per_bar, bpm=None, downbeat=None):
    y, sr = librosa.load(path, sr=22050, mono=True)
    duration = len(y) / sr
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
    detected = librosa.frames_to_time(beat_frames, sr=sr)
    if bpm is None and len(detected) < 8:
        sys.exit("检测到的拍太少：换一首节奏清晰的曲子，或用 --bpm 指定")

    # 周期：对检测到的拍做线性拟合（比 librosa 的速度估计准得多）；给了 --bpm 就用给定值
    if len(detected) >= 8:
        # 按相邻间隔逐个累加编号：漏检的拍（间隔≈2 拍）只影响局部，误差不会沿全曲累积
        steps = np.maximum(1, np.round(np.diff(detected) / np.median(np.diff(detected))))
        idx = np.concatenate([[0], np.cumsum(steps)])
        fit_period, fit_offset = np.polyfit(idx, detected, 1)
    else:
        fit_period, fit_offset = 60 / bpm, 0.0
    period = 60 / bpm if bpm else fit_period
    offset = fit_offset % period
    # 网格从 0 秒铺到结尾（前奏没有鼓时检测会漏掉开头的拍）
    beats = np.arange(offset, duration, period)

    # 小节首拍：段落变化（新声部进入、鼓停）几乎总落在小节第一拍上，
    # 取能量跳变最集中的那个相位；给了 --downbeat 就用给定值
    rms = librosa.feature.rms(y=y)[0]
    rms_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr)
    def mean_rms(a, b):
        seg = rms[(rms_t >= a) & (rms_t < b)]
        return float(seg.mean()) if len(seg) else 0.0
    # 取能量变化最大的 5 个拍，按变化幅度加权投票定相位。这只是猜测：
    # 自动判断小节首拍本身不可靠，必须由人听一遍确认，或用 --downbeat 指定
    change = np.array([abs(mean_rms(t, t + period) - mean_rms(t - period, t)) if t >= period else 0.0 for t in beats])
    confidence = None
    if downbeat is not None:
        phase = int(np.argmin(np.abs(beats - downbeat))) % beats_per_bar
    else:
        votes = np.zeros(beats_per_bar)
        for i in np.argsort(change)[-5:]:
            votes[i % beats_per_bar] += change[i]
        phase = int(np.argmax(votes))
        confidence = float(votes[phase] / votes.sum()) if votes.sum() else 0.0
    downbeats = beats[phase::beats_per_bar]

    # 每小节能量（归一到 0–1）；能量跳升最大的前 3 个小节作为 drop 候选
    bars = []
    for i, start in enumerate(downbeats):
        end = downbeats[i + 1] if i + 1 < len(downbeats) else duration
        bars.append({"bar": i + 1, "start": round(float(start), 3), "energy": mean_rms(start, end)})
    top = max(b["energy"] for b in bars) or 1.0
    for b in bars:
        b["energy"] = round(b["energy"] / top, 3)
    jumps = sorted(((bars[i]["energy"] - bars[i - 1]["energy"], i) for i in range(1, len(bars))), reverse=True)
    drops = [dict(bars[i], jump=round(j, 3)) for j, i in jumps[:3] if j > 0]

    out = {
        "file": path,
        "duration": round(duration, 3),
        "bpm": round(60 / period, 2),
        "bpm_source": "given" if bpm else "fit",
        "beat_seconds": round(float(period), 4),
        "beats_per_bar": beats_per_bar,
        "first_downbeat": round(float(downbeats[0]), 3),
        "downbeat_source": "given" if downbeat is not None else "guess",
        "downbeat_confidence": None if confidence is None else round(confidence, 2),
        "beats": [round(float(t), 3) for t in beats],
        "downbeats": [round(float(t), 3) for t in downbeats],
        "bars": bars,
        "drop_candidates": drops,
    }
    dst = path.rsplit(".", 1)[0] + ".beats.json"
    with open(dst, "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    src = "指定" if bpm else "拟合"
    print(f"时长 {duration:.2f}s ｜ BPM {60 / period:.2f}（{src}）｜ 一拍 {period:.3f}s ｜ 第一个小节首拍 {downbeats[0]:.3f}s")
    print("小节能量：" + " ".join(f"{b['bar']}@{b['start']:.1f}s:{b['energy']:.2f}" for b in bars))
    if confidence is not None:
        level = "较高" if confidence >= 0.7 else "低，必须人工确认"
        print(f"小节首拍是猜的（投票占比 {confidence:.0%}，置信度{level}）")
    for d in drops:
        print(f"drop 候选：第 {d['bar']} 小节 {d['start']:.2f}s（能量 +{d['jump']:.2f}）")
    print("核对：小节首拍和 drop 用耳朵听一遍；不对就用 --downbeat / --bpm 指定后重跑")
    print(f"已写出 {dst}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("audio", nargs="?")
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--bpm", type=float, help="已知 BPM（曲库页面 / 文件元数据）时直接指定")
    ap.add_argument("--downbeat", type=float, help="已知某个小节第一拍的时间（秒）时指定")
    ap.add_argument("--peak", help="只测这个音效文件的峰值偏移")
    a = ap.parse_args()
    if a.peak:
        peak_offset(a.peak)
    elif a.audio:
        analyze(a.audio, a.beats_per_bar, a.bpm, a.downbeat)
    else:
        ap.print_help()
