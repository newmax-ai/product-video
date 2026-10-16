export type Vec3 = [number, number, number];
export type CameraKey = {at: number; position: Vec3; target: Vec3; fov: number};

const finite = (value: number) => {
  if (!Number.isFinite(value)) throw new Error('时间轴参数必须是有限数值');
  return value;
};

export const clamp01 = (value: number) => Math.max(0, Math.min(1, finite(value)));
export const smoothstep = (value: number) => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};
export const progress = (time: number, start: number, end: number) => {
  [time, start, end].forEach(finite);
  if (end <= start) throw new Error('时间窗口结束必须晚于开始');
  return clamp01((time - start) / (end - start));
};
export const mix3 = (a: Vec3, b: Vec3, p: number): Vec3 => [
  a[0] + (b[0] - a[0]) * p,
  a[1] + (b[1] - a[1]) * p,
  a[2] + (b[2] - a[2]) * p,
];

// 绝对时间采样，不积累 delta；跳帧、倒放和并行渲染不依赖上一帧。
export function sampleCamera(keys: readonly CameraKey[], time: number): CameraKey {
  finite(time);
  if (!keys.length) throw new Error('相机至少需要一个关键帧');
  keys.forEach((key, i) => {
    [key.at, key.fov, ...key.position, ...key.target].forEach(finite);
    if (key.fov <= 0 || key.fov >= 180) throw new Error('视角必须位于 0 到 180 度之间');
    if (i > 0 && key.at <= keys[i - 1].at) throw new Error('相机关键帧时间必须严格递增');
    if (key.position.every((v, axis) => v === key.target[axis])) throw new Error('相机不能位于观察目标上');
  });
  const copy = (key: CameraKey): CameraKey => ({...key, position: [...key.position], target: [...key.target]});
  if (time <= keys[0].at) return copy(keys[0]);
  if (time >= keys[keys.length - 1].at) return copy(keys[keys.length - 1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (time <= b.at) {
      const p = smoothstep(progress(time, a.at, b.at));
      return {at: time, position: mix3(a.position, b.position, p), target: mix3(a.target, b.target, p), fov: a.fov + (b.fov - a.fov) * p};
    }
  }
  throw new Error('相机时间轴采样失败');
}

// 稳定散布只由种子和索引决定，不使用 Math.random()。
export function seededUnit(seed: number, index: number) {
  if (!Number.isInteger(seed) || !Number.isInteger(index)) throw new Error('随机种子和索引必须是整数');
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967296;
}

export function sceneState(time: number) {
  const t = Math.max(0, Math.min(12, finite(time)));
  const front = smoothstep(progress(t, 5.2, 6.6));
  return {
    separation: smoothstep(progress(t, 2.6, 4.1)) * (1 - smoothstep(progress(t, 5.2, 6.6))),
    gallery: smoothstep(progress(t, 7.0, 8.2)) * (1 - smoothstep(progress(t, 9.8, 11.0))),
    front,
    turn: (1 - front) * (0.2 + 0.09 * Math.cos(t * 0.6)),
  };
}
