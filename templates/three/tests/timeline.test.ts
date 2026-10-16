import {describe, expect, it} from 'vitest';
import {clamp01, progress, smoothstep, mix3, sampleCamera, seededUnit, sceneState, type CameraKey} from '../timeline';
import {getStagePreset, CAMERA_KEYS} from '../presets';

const keys: CameraKey[] = [
  {at: 0, position: [0, 0, 10], target: [0, 0, 0], fov: 40},
  {at: 2, position: [4, 2, 6], target: [1, 0, 0], fov: 50},
];

describe('有界时间曲线', () => {
  it('夹住边界并保留内部数值', () => {
    expect([-1, 0, 0.4, 1, 2].map(clamp01)).toEqual([0, 0, 0.4, 1, 1]);
    for (const invalid of [NaN, Infinity, -Infinity]) expect(() => clamp01(invalid)).toThrow();
  });
  it('窗口前后落定，中点对称', () => {
    expect([-1, 2, 3, 4, 9].map(t => progress(t, 2, 4))).toEqual([0, 0, 0.5, 1, 1]);
    expect([0, 0.5, 1].map(smoothstep)).toEqual([0, 0.5, 1]);
    expect(() => progress(0, 1, 1)).toThrow();
    expect(() => progress(0, 2, 1)).toThrow();
    expect(() => progress(NaN, 0, 1)).toThrow();
    expect(() => progress(0, Infinity, 1)).toThrow();
    expect(mix3([0, 2, 4], [4, 6, 8], 0.5)).toEqual([2, 4, 6]);
  });
});

describe('绝对时间相机', () => {
  it('窗口之外保持两端，窗口内平滑采样', () => {
    expect(sampleCamera(keys, -3)).toEqual(keys[0]);
    expect(sampleCamera(keys, 8)).toEqual(keys[1]);
    expect(sampleCamera(keys, 1)).toEqual({at: 1, position: [2, 1, 8], target: [0.5, 0, 0], fov: 45});
    expect(sampleCamera([keys[0]], 9)).toEqual(keys[0]);
  });
  it('不共享可变向量、不修改输入', () => {
    const before = JSON.stringify(keys);
    const sampled = sampleCamera(keys, 0);
    sampled.position[0] = 999;
    expect(JSON.stringify(keys)).toBe(before);
  });
  it('跳帧、倒序、重复定位与顺序采样相同', () => {
    const times = [0, 1, 2, 0.25, 1.75, 0.25];
    const expected = times.map(t => sampleCamera(keys, t));
    times.slice().reverse().forEach(t => sampleCamera(keys, t));
    expect(times.map(t => sampleCamera(keys, t))).toEqual(expected);
    for (const key of CAMERA_KEYS) expect(sampleCamera(CAMERA_KEYS, key.at).position).toEqual(key.position);
  });
  it('拒绝无效时间轴和无效相机', () => {
    expect(() => sampleCamera([], 0)).toThrow();
    expect(() => sampleCamera(keys, NaN)).toThrow();
    expect(() => sampleCamera([keys[1], keys[0]], 0)).toThrow();
    expect(() => sampleCamera([keys[0], keys[0]], 0)).toThrow();
    for (const fov of [0, 180, NaN]) expect(() => sampleCamera([{...keys[0], fov}], 0)).toThrow();
    expect(() => sampleCamera([{...keys[0], position: [NaN, 0, 1]}], 0)).toThrow();
    expect(() => sampleCamera([{...keys[0], at: Infinity}], 0)).toThrow();
    expect(() => sampleCamera([{...keys[0], position: [0, 0, 0]}], 0)).toThrow();
  });
});

describe('稳定布局和镜头状态', () => {
  it('种子固定，结果有界且分布不同', () => {
    const values = Array.from({length: 200}, (_, i) => seededUnit(42, i));
    expect(values.every(v => v >= 0 && v < 1)).toBe(true);
    expect(new Set(values).size).toBe(200);
    expect(values).toEqual(Array.from({length: 200}, (_, i) => seededUnit(42, i)));
    expect(seededUnit(43, 0)).not.toBe(values[0]);
    expect(() => seededUnit(1.5, 0)).toThrow();
    expect(() => seededUnit(1, Infinity)).toThrow();
  });
  it('镜头状态无累积，起始完整，结束停稳', () => {
    expect(sceneState(-1)).toEqual(sceneState(0));
    expect(sceneState(12)).toEqual(sceneState(20));
    expect(sceneState(0).separation).toBe(0);
    expect(sceneState(5).separation).toBe(1);
    expect(sceneState(12).separation).toBe(0);
    expect(sceneState(12).gallery).toBe(0);
    expect(sceneState(8.5).gallery).toBe(1);
    expect(sceneState(6.8).front).toBe(1);
    expect(sceneState(12).turn).toBe(0);
    expect(sceneState(0).turn).not.toBe(0);
    expect(() => sceneState(NaN)).toThrow();
  });
  it('三个风格都有独立的可读材质参数，非法名称拒绝', () => {
    for (const name of ['warm-studio', 'dark-metal', 'paper-object'] as const) {
      const p = getStagePreset(name);
      expect(p.background).toMatch(/^#[a-fA-F0-9]{6}$/);
      expect(p.roughness).toBeGreaterThanOrEqual(0);
      expect(p.roughness).toBeLessThanOrEqual(1);
      expect(p.metalness).toBeGreaterThanOrEqual(0);
      expect(p.metalness).toBeLessThanOrEqual(1);
    }
    expect(getStagePreset('warm-studio').body).not.toBe(getStagePreset('dark-metal').body);
    expect(() => getStagePreset('missing' as never)).toThrow();
  });
});
