// 闭式弹簧 + 多目标叠加。复制到视频工程（如 src/lib/motion.js），Remotion 与纯 HTML seek(t) 都能直接用。
// 所有函数都是时间的纯函数：渲染第 812 帧不需要先模拟 0–811 帧，逐帧导出结果每次一致。
//
// 用法：
//   import { spring, track, SPRINGS } from './motion.js';
//   const t = frame / fps;                                   // 秒
//   const s = spring(t - 1.2, SPRINGS.snappy);               // 1.2s 起跳，0→1（有微小过冲）
//   const x = track(t, [[0, 120], [1.0, 640], [2.4, 980]]);  // 光标 x：每次换目标叠加一根新弹簧，不重启
//   const w = track(t, [[0, 360], [3.0, 520]], SPRINGS.default);

/** 弹簧预设：response = 大致到位时间（秒），damping = 阻尼比（1 = 无过冲，越小过冲越大）。 */
export const SPRINGS = {
  snappy: { response: 0.28, damping: 0.86 }, // 按钮、开关、光标、菜单：过冲约 0.5%
  default: { response: 0.42, damping: 0.9 }, // 卡片、容器、镜头：过冲约 0.2%
  heavy: { response: 0.6, damping: 1 }, // 大标题、数字、logo：无过冲
  playful: { response: 0.5, damping: 0.62 }, // 吉祥物、贴纸：明显回弹，只在品牌调性允许时用
};

/**
 * 从 0 走到 1 的闭式阻尼弹簧。t < 0 返回 0。
 * @param {number} t 距离起跳的秒数
 * @param {{response:number, damping:number}} [cfg]
 */
export function spring(t, cfg = SPRINGS.default) {
  if (t <= 0) return 0;
  // 到位后锁定为 1：残差此时 < 3e-6（playful 约 5e-5），但若继续输出，浏览器每帧都会按新值重新栅格化，小图标 / 阴影边缘会一直抖
  if (t >= cfg.response * 2.5) return 1;
  const w = (2 * Math.PI) / cfg.response;
  const z = cfg.damping;
  if (z >= 1) {
    // 临界阻尼（>1 也按临界处理，避免拖泥带水）
    return 1 - Math.exp(-w * t) * (1 + w * t);
  }
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/**
 * 多次换目标的值：初始值 + 每次变化各自一根从变化时刻起跳的弹簧。运动连续，不会因为重启弹簧而顿一下。
 * @param {number} t 当前秒数
 * @param {Array<[number, number]>} keys [[时刻, 目标值], ...]，按时刻升序，第一项是初始值
 * @param {{response:number, damping:number}} [cfg]
 */
export function track(t, keys, cfg = SPRINGS.default) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    v += (keys[i][1] - keys[i - 1][1]) * spring(t - keys[i][0], cfg);
  }
  return v;
}

/** 线性映射 + 夹紧，给 spring 结果换算到实际属性区间用：lerp(0.94, 1, s)。 */
export const lerp = (a, b, s) => a + (b - a) * s;

/**
 * 节拍网格：把时间吸到最近的拍（或半拍）上，分镜和关键动作都按它排。
 * @param {number} t 秒
 * @param {number} bpm
 * @param {number} [offset] 第一拍的时间（秒），从音轨测得
 * @param {number} [division] 1 = 整拍，2 = 半拍
 */
export function snapToBeat(t, bpm, offset = 0, division = 1) {
  const beat = 60 / bpm / division;
  return offset + Math.round((t - offset) / beat) * beat;
}
