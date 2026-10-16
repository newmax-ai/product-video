// 跟手的光标。复制到视频工程（如 src/kit/Pointer.tsx），和 templates/motion.js 放在一起
// （TS 工程要在 tsconfig 开 allowJs，或把 motion.js 改名 motion.ts 并补类型）。
//
// 节奏（用户反馈过「点击不跟手、有延迟」后定下的）：
//   - 每个停靠点 at 是「到位」帧；光标在 at - LEAD 帧起步，snappy 弹簧约 9 帧到位
//   - 到位后停 PRESS 帧再按下；按下那一帧（pressFrame）就是界面的反应帧，界面状态从这一帧切换
//   - 涟漪固定在点击点，不跟着光标走
//   - 被拖动的东西直接用 pointerAt() 的坐标，与光标完全同步，不要另写一条缓动
//
// 用法：
//   const stops: Stop[] = [{ at: 0, x: 900, y: 600 }, { at: 30, x: 180, y: 42, click: true }, { at: 70, x: 640, y: 480 }];
//   const collapsed = frame >= pressFrame(stops[1]);
//   <Pointer stops={stops} />
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { SPRINGS, spring, track } from './motion.js';

export type Stop = { at: number; x: number; y: number; click?: boolean };
export const LEAD = 10; // 起步到到位的帧数（30fps）
export const PRESS = 3; // 到位后多久按下

/** 按下（界面反应）帧 */
export const pressFrame = (s: Stop) => s.at + PRESS;

/** 光标在第 f 帧的位置（纯函数，拖拽物也用它） */
export const pointerAt = (f: number, stops: Stop[], fps = 30) => {
  const t = f / fps;
  const keys = stops.map((s, i) => [i === 0 ? 0 : (s.at - LEAD) / fps, s] as const);
  return {
    x: track(t, keys.map(([k, s]) => [k, s.x]), SPRINGS.snappy),
    y: track(t, keys.map(([k, s]) => [k, s.y]), SPRINGS.snappy),
  };
};

export const Pointer: React.FC<{
  stops: Stop[];
  size?: number; // 1.3 左右在 1080p 下清楚
  show?: [number, number]; // 淡入帧、淡出帧
  color?: string; // 涟漪颜色（品牌主色的 rgb，例如 '18,63,58'）
}> = ({ stops, size = 1.3, show, color = '0,0,0' }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { x, y } = pointerAt(f, stops, fps);
  const clicks = stops.filter((s) => s.click).map((s) => ({ at: pressFrame(s), x: s.x, y: s.y }));
  const pressed = clicks.some((c) => f >= c.at && f < c.at + PRESS);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const op = show ? clamp((f - show[0]) / 4) * (1 - clamp((f - show[1]) / 4)) : 1;
  if (op <= 0) return null;
  return (
    <>
      {clicks.map((c) => {
        const p = (f - c.at) / 16;
        if (p < 0 || p > 1) return null;
        const e = spring((f - c.at) / fps, SPRINGS.snappy);
        return (
          <div
            key={c.at}
            style={{
              position: 'absolute',
              left: c.x - 20 * size,
              top: c.y - 20 * size,
              width: 40 * size,
              height: 40 * size,
              borderRadius: 999,
              border: `${2 * size}px solid rgba(${color},${0.5 * (1 - p)})`,
              background: `rgba(${color},${0.1 * (1 - p)})`,
              transform: `scale(${0.35 + 0.9 * e})`,
              zIndex: 60,
              pointerEvents: 'none',
            }}
          />
        );
      })}
      <div style={{ position: 'absolute', left: x, top: y, zIndex: 61, opacity: op, pointerEvents: 'none' }}>
        <svg
          width={22 * size}
          height={22 * size}
          viewBox="0 0 28 28"
          style={{ position: 'absolute', left: -4 * size, top: -3 * size, transform: `scale(${pressed ? 0.84 : 1})`, transformOrigin: '4px 3px', filter: 'drop-shadow(0 1.5px 2px rgba(0,0,0,0.3))' }}
        >
          <path d="M5 3 L5 22 L10 17.5 L13.4 25 L16.6 23.6 L13.3 16.3 L20 16.3 Z" fill="#111" stroke="#fff" strokeWidth={1.7} strokeLinejoin="round" />
        </svg>
      </div>
    </>
  );
};
