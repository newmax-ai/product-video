import {useMemo} from 'react';
import {RoundedBox, Environment, Lightformer} from '@react-three/drei';
import {ThreeCanvas} from '@remotion/three';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import type {ReactNode} from 'react';
import {CameraRig} from './CameraRig';
import {getStagePreset, CAMERA_KEYS, type StageName, type StagePreset} from './presets';
import {sceneState, seededUnit, type Vec3} from './timeline';

// 示例面板仅测试几何和光影，不是任何产品 UI 或能力证明。
function PlaceholderFace({preset}: {preset: StagePreset}) {
  return <group position={[0, 0, 0.036]}>
    <RoundedBox args={[0.62, 0.07, 0.012]} radius={0.025} position={[-1.06, 0.61, 0]}>
      <meshBasicMaterial color={preset.accent} />
    </RoundedBox>
    {[0, 1, 2].map(i => <RoundedBox key={i} args={[1.2 - i * 0.17, 0.04, 0.012]} radius={0.012} position={[-0.76 - i * 0.085, 0.29 - i * 0.18, 0]}>
      <meshBasicMaterial color={preset.body} transparent opacity={0.75 - i * 0.15} />
    </RoundedBox>)}
    <RoundedBox args={[0.93, 1.12, 0.027]} radius={0.09} position={[0.86, 0.06, 0]}>
      <meshStandardMaterial color={preset.body} roughness={0.48} />
    </RoundedBox>
    <mesh position={[0.86, 0.12, 0.03]} rotation={[0, 0, -0.45]}>
      <torusGeometry args={[0.27, 0.055, 12, 40, Math.PI * 1.7]} />
      <meshStandardMaterial color={preset.accent} roughness={0.26} metalness={0.2} />
    </mesh>
    <RoundedBox args={[0.76, 0.19, 0.028]} radius={0.07} position={[-0.98, -0.58, 0]}>
      <meshStandardMaterial color={preset.accent} roughness={0.4} />
    </RoundedBox>
  </group>;
}

function ProductObject({time, preset, face}: {time: number; preset: StagePreset; face?: ReactNode}) {
  const state = sceneState(time);
  return <group rotation={[-state.turn * 0.5, -state.turn, 0]}>
    <RoundedBox args={[4.0, 2.65, 0.36]} radius={0.2} smoothness={4} castShadow receiveShadow position={[0, 0, -0.18]}>
      <meshPhysicalMaterial color={preset.body} roughness={preset.roughness} metalness={preset.metalness} clearcoat={0.38} clearcoatRoughness={0.25} />
    </RoundedBox>
    <RoundedBox args={[3.64, 2.3, 0.07]} radius={0.15} castShadow position={[0, 0, 0.06 + state.separation * 0.35]}>
      <meshStandardMaterial color={preset.accent} roughness={0.32} metalness={0.12} />
    </RoundedBox>
    <RoundedBox args={[3.46, 2.12, 0.055]} radius={0.13} castShadow position={[0, 0, 0.13 + state.separation * 1.0]}>
      <meshPhysicalMaterial color={preset.face} roughness={0.44} metalness={0.06} clearcoat={0.3} />
    </RoundedBox>
    <group position={[0, 0, 0.2 + state.separation * 1.78]}>
      <RoundedBox args={[3.23, 1.91, 0.065]} radius={0.11} castShadow>
        <meshStandardMaterial color={preset.face} roughness={0.72} />
      </RoundedBox>
      {face ?? <PlaceholderFace preset={preset} />}
    </group>
    <mesh position={[1.88, -0.38, -0.14]} rotation={[0, Math.PI / 2, 0]}>
      <cylinderGeometry args={[0.05, 0.05, 0.07, 16]} />
      <meshStandardMaterial color={preset.accent} metalness={0.4} roughness={0.24} />
    </mesh>
  </group>;
}

function Gallery({time, preset}: {time: number; preset: StagePreset}) {
  const strength = sceneState(time).gallery;
  const items = useMemo(() => Array.from({length: 8}, (_, i) => ({
    angle: (i / 8) * Math.PI * 2,
    offset: seededUnit(17, i) * 0.25,
  })), []);
  return <group>
    {items.map((item, i) => {
      const radius = 3.0 + item.offset;
      const position: Vec3 = [Math.cos(item.angle) * radius, Math.sin(item.angle) * radius * 0.58, -0.7 + item.offset];
      return <group key={i} position={position} scale={strength * 0.9} rotation={[0, -0.1 * Math.cos(item.angle), Math.sin(item.angle) * 0.06]}>
        <RoundedBox args={[0.82, 0.56, 0.065]} radius={0.06} castShadow>
          <meshStandardMaterial color={i % 3 === 0 ? preset.accent : preset.face} roughness={0.4} metalness={0.12} />
        </RoundedBox>
        <RoundedBox args={[0.43, 0.032, 0.01]} radius={0.01} position={[-0.1, 0.1, 0.041]}>
          <meshBasicMaterial color={preset.body} />
        </RoundedBox>
        <RoundedBox args={[0.25, 0.026, 0.01]} radius={0.01} position={[-0.19, -0.01, 0.041]}>
          <meshBasicMaterial color={preset.body} transparent opacity={0.4} />
        </RoundedBox>
      </group>;
    })}
  </group>;
}

export function ProductStage({theme = 'warm-studio', face}: {theme?: StageName; face?: ReactNode}) {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const time = frame / fps;
  const preset = getStagePreset(theme);
  const portrait = height > width;
  const state = sceneState(time);
  return <ThreeCanvas width={width} height={height} shadows="percentage" camera={{position: [3.2, 1.8, 10.8], fov: 38, near: 0.1, far: 80}}
    gl={{antialias: true, alpha: true, preserveDrawingBuffer: true}} style={{position: 'absolute', inset: 0}}>
    <CameraRig time={time} keys={CAMERA_KEYS} portrait={portrait} />
    <ambientLight intensity={0.75} />
    <directionalLight position={[4, 7, 6]} intensity={2.8} color="#fff3e0" castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.0005} />
    <directionalLight position={[-5, 2, 4]} intensity={1.25} color="#dceaf8" />
    <directionalLight position={[2, 4, -6]} intensity={2.0} color="#ffffff" />
    {/* 固定的一次环境捕获，无 CDN、无计时器、无连续累积阴影。 */}
    <Environment frames={1} resolution={128}>
      <Lightformer intensity={3} position={[0, 4, 3]} rotation={[Math.PI / 2, 0, 0]} scale={[8, 3, 1]} color="#ffffff" />
      <Lightformer intensity={2} position={[-4, 1, 2]} rotation={[0, Math.PI / 2, 0]} scale={[3, 6, 1]} color="#e2edfa" />
      <Lightformer intensity={2} position={[4, 2, -1]} rotation={[0, -Math.PI / 2, 0]} scale={[3, 5, 1]} color="#ffe7cb" />
    </Environment>
    <group position={portrait ? [0, -0.7, 0] : [1.55, 0.16, 0]} scale={portrait ? 0.84 : 1}>
      <ProductObject time={time} preset={preset} face={face} />
      <group scale={1 - state.gallery * 0.02}><Gallery time={time} preset={preset} /></group>
    </group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.05, 0]} receiveShadow>
      <planeGeometry args={[200, 200]} />
      <shadowMaterial transparent opacity={0.13} />
    </mesh>
  </ThreeCanvas>;
}
