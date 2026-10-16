import type {CameraKey} from './timeline';

export type StageName = 'warm-studio' | 'dark-metal' | 'paper-object';
export type StagePreset = {
  background: string;
  ink: string;
  muted: string;
  accent: string;
  body: string;
  face: string;
  floor: string;
  roughness: number;
  metalness: number;
};

const PRESETS: Record<StageName, StagePreset> = {
  'warm-studio': {
    background: '#eeeae3', ink: '#202d35', muted: '#67737a', accent: '#e36a41',
    body: '#253940', face: '#faf7f0', floor: '#e3ded5', roughness: 0.28, metalness: 0.42,
  },
  'dark-metal': {
    background: '#111b23', ink: '#f1f5f5', muted: '#a1b1b8', accent: '#72cdbd',
    body: '#344a58', face: '#d9e9e8', floor: '#15232d', roughness: 0.2, metalness: 0.72,
  },
  'paper-object': {
    background: '#f0e8db', ink: '#493f34', muted: '#807264', accent: '#ae6446',
    body: '#c1a991', face: '#fff9eb', floor: '#e0d0bb', roughness: 0.86, metalness: 0,
  },
};

export function getStagePreset(name: StageName): StagePreset {
  const preset = PRESETS[name];
  if (!preset) throw new Error(`未知空间风格：${name}`);
  return {...preset};
}

// 相机先揭示体积和层次，再回到正视构图；不使用实时轨道控制器。
export const CAMERA_KEYS: readonly CameraKey[] = [
  {at: 0, position: [3.2, 1.8, 10.8], target: [0, 0, 0], fov: 38},
  {at: 2.6, position: [2.3, 1.25, 10.2], target: [0, 0, 0], fov: 38},
  {at: 4.8, position: [3.5, 1.6, 10.8], target: [0, 0, 0.4], fov: 39},
  {at: 6.6, position: [0, 0, 10.8], target: [0, 0, 0], fov: 38},
  {at: 8.5, position: [0.6, 0.5, 12.0], target: [0, 0, 0], fov: 42},
  {at: 11, position: [0, 0, 10.8], target: [0, 0, 0], fov: 38},
  {at: 12, position: [0, 0, 10.8], target: [0, 0, 0], fov: 38},
];
