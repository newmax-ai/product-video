import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {ProductStage} from './ProductStage';
import {getStagePreset, type StageName} from './presets';
import {progress, smoothstep} from './timeline';

export function SpatialDemo({theme = 'warm-studio'}: {theme?: StageName}) {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const time = frame / fps;
  const p = getStagePreset(theme);
  const portrait = height > width;
  const scale = width / (portrait ? 720 : 1280);
  const chapter = time < 2.6 ? 0 : time < 6.6 ? 1 : time < 9.8 ? 2 : 3;
  const labels = ['看见体积', '展开层次', '组织空间', '回到清晰'];
  const headings = [['让信息', '拥有空间。'], ['不止一面，', '更有层次。'], ['从一个主体，', '展开关联。'], ['空间为表达，', '清晰为内容。']];
  const caption = ['材质、灯光与相机，共同塑造主体。', '几何层级随绝对时间展开，不累积实时状态。', '固定种子组织群体；数量仅为示意。', '停稳、正视，再接入真实产品界面。'][chapter];
  const enter = smoothstep(progress(time, 0, 0.65));
  return <AbsoluteFill style={{backgroundColor: p.background, color: p.ink, fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif'}}>
    <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse at 78% 34%, ${p.face}70, transparent 65%)`}} />
    <ProductStage theme={theme} />
    <div style={{position: 'absolute', top: 48 * scale, left: 60 * scale, right: 60 * scale, display: 'flex', justifyContent: 'space-between', fontSize: 15 * scale, letterSpacing: 1.5 * scale, color: p.muted}}>
      <span>空间镜头实验 / 01</span><span>产品视频 · 设计模板</span>
    </div>
    <div style={{position: 'absolute', left: 60 * scale, top: (portrait ? 135 : 212) * scale, width: (portrait ? 600 : 415) * scale, opacity: enter, transform: `translateY(${(1 - enter) * 14 * scale}px)`}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10 * scale, marginBottom: 22 * scale, color: p.accent, fontSize: 15 * scale, fontWeight: 600}}>
        <span style={{width: 28 * scale, height: 2 * scale, backgroundColor: p.accent}} />{String(chapter + 1).padStart(2, '0')} / {labels[chapter]}
      </div>
      <div style={{fontFamily: '"Songti SC", "Noto Serif CJK SC", serif', fontSize: (portrait ? 67 : 64) * scale, fontWeight: 700, letterSpacing: -2 * scale, lineHeight: 1.25}}>
        {headings[chapter].map((line, i) => <div key={i}>{line}</div>)}
      </div>
      <div style={{marginTop: 24 * scale, maxWidth: 365 * scale, fontSize: 17 * scale, lineHeight: 1.8, color: p.muted}}>{caption}</div>
    </div>
    <div style={{position: 'absolute', left: 60 * scale, right: 60 * scale, bottom: 39 * scale, borderTop: `1px solid ${p.muted}45`, paddingTop: 17 * scale, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 * scale}}>
      <div style={{fontSize: 13 * scale, color: p.muted}}>程序化示意素材 · 非真实产品 UI / 非成片</div>
      <div style={{display: 'flex', gap: 6 * scale}}>{labels.map((label, i) => <div key={label} style={{width: 26 * scale, height: 3 * scale, backgroundColor: i === chapter ? p.accent : `${p.muted}45`}} />)}</div>
    </div>
  </AbsoluteFill>;
}
