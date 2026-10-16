// Apache-2.0 · Copyright 2026 Jay
// 自包含验收夹具；UI 是程序化样例，不冒充实际产品。无实时动画时钟或外部资产。
import * as THREE from './node_modules/three/build/three.module.js';
const W = 640, H = 360, FPS = 30, FRAMES = 360;
const output = document.querySelector('#film'), ctx = output.getContext('2d', { alpha: false });
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.setClearColor(0x17212b);
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-6.4, 6.4, 3.6, -3.6, 0.1, 100);
camera.position.set(0, 0, 12); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
scene.add(new THREE.AmbientLight(0xffffff, 2));
const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(4, 6, 8); scene.add(key);
const group = new THREE.Group(); scene.add(group);
group.add(new THREE.Mesh(new THREE.BoxGeometry(8.08, 4.68, 0.22), new THREE.MeshStandardMaterial({ color: 0x516675, roughness: 0.45, metalness: 0.3 })));
const ui = document.createElement('canvas'); ui.width = 1024; ui.height = 588;
const u = ui.getContext('2d');
const texture = new THREE.CanvasTexture(ui); texture.colorSpace = THREE.SRGBColorSpace;
const screen = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.6), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
screen.position.z = 0.121; group.add(screen);
const clamp = v => Math.max(0, Math.min(1, v));
const ease = v => { const x = clamp(v); return x * x * (3 - 2 * x); };
const text = (c, value, x, y, size, color) => { c.font = `500 ${size}px system-ui, sans-serif`; c.fillStyle = color; c.fillText(value, x, y); };
const panelBounds = () => {
  const points = [[-4, 2.3], [4, 2.3], [4, -2.3], [-4, -2.3]].map(([x, y]) => {
    const p = new THREE.Vector3(x, y, 0); screen.localToWorld(p); p.project(camera);
    return { x: (p.x + 1) * W / 2, y: (1 - p.y) * H / 2 };
  });
  return { x: Math.min(...points.map(p => p.x)), y: Math.min(...points.map(p => p.y)),
    w: Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), h: Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)) };
};
window.__ready = false;
window.__noDOM = false; // 这里控制的是 2D 合成层，不是 DOM 导出；报告必须说明此边界。
window.seek = async seconds => {
  const t = Math.max(0, Math.min(12, Number(seconds)));
  const progress = clamp((t - 4.2) / 3.2);
  const phrase = '检查制作链路';
  const typed = phrase.slice(0, Math.max(0, Math.min(phrase.length, Math.floor((t - 1) * 3))));
  window.demoState = { time: t, input: typed, progress, complete: t >= 8, layer: t >= 8 && !window.__noDOM ? '2d' : '3d' };
  u.fillStyle = '#edf2f5'; u.fillRect(0, 0, ui.width, ui.height);
  u.fillStyle = '#dce7ed'; u.fillRect(0, 0, 1024, 125);
  text(u, '制作链路检查', 42, 83, 54, '#17212b');
  text(u, `输入：${typed || '等待输入'}`, 42, 212, 48, '#243a48');
  text(u, t >= 8 ? '结果：帧序列已就绪' : t >= 4.2 ? '状态：正在验证' : '状态：准备', 42, 306, 48, '#243a48');
  u.fillStyle = '#c9d6de'; u.fillRect(42, 365, 940, 28);
  u.fillStyle = '#008f87'; u.fillRect(42, 365, Math.round(940 * progress), 28);
  text(u, t >= 8 ? '✓ 完成' : `${Math.round(progress * 100)}%`, 42, 485, 56, '#006c66');
  texture.needsUpdate = true;
  const settle = ease(t / 7);
  group.rotation.y = -0.48 * (1 - settle); group.rotation.x = 0.13 * (1 - settle);
  group.position.x = -0.25 * (1 - settle); group.position.y = -0.05;
  screen.visible = t < 8 || window.__noDOM;
  scene.updateMatrixWorld(true);
  renderer.render(scene, camera);
  ctx.drawImage(renderer.domElement, 0, 0);
  const bounds = panelBounds();
  if (t >= 8 && !window.__noDOM) ctx.drawImage(ui, bounds.x, bounds.y, bounds.w, bounds.h);
  text(ctx, 'PRODUCT VIDEO / PIPELINE CHECK', 28, 34, 20, '#e9f1f5');
  text(ctx, '程序化验收夹具 · 非真实产品案例', 28, 334, 16, '#bacbd6');
  text(ctx, `${String(Math.min(FRAMES - 1, Math.floor(t * FPS))).padStart(3, '0')} / ${FRAMES}`, 519, 334, 14, '#bacbd6');
  return window.demoState;
};
window.exportStatus = { state: 'idle', frames: 0 };
window.exportReference = async () => {
  if (window.exportStatus.state === 'running') throw new Error('已有导出正在执行');
  window.exportStatus = { state: 'running', frames: 0 };
  try {
    const response = await fetch('/__capture_config', { cache: 'no-store' });
    if (!response.ok) throw new Error('需要 serve_reference.py，普通静态服务器不接收帧');
    const config = await response.json();
    if (config.frames !== FRAMES || config.width !== W || config.height !== H || config.fps !== FPS) throw new Error('服务器帧参数与夹具不一致');
    for (let f = 0; f < FRAMES; f++) {
      await window.seek(f / FPS);
      const blob = await new Promise((resolve, reject) => output.toBlob(b => b ? resolve(b) : reject(new Error('PNG 编码失败')), 'image/png'));
      const saved = await fetch(`/__frame/${f}`, { method: 'POST', headers: { 'Content-Type': 'image/png', 'X-Render-Session': config.session }, body: blob });
      if (!saved.ok) throw new Error(`帧 ${f} 写入失败：${await saved.text()}`);
      window.exportStatus.frames = f + 1;
      document.querySelector('#status').textContent = `导出 ${f + 1}/${FRAMES}`;
    }
    window.exportStatus.state = 'complete';
    document.querySelector('#status').textContent = '360 帧已导出；还需编码、ffprobe 与视觉验收。';
  } catch (error) { window.exportStatus.state = 'failed'; window.exportStatus.error = String(error); throw error; }
  return window.exportStatus;
};
await document.fonts.ready;
await window.seek(0);
window.__ready = true;
document.querySelector('#status').textContent = '本地资源就绪；帧由 seek(t) 唯一决定。';
document.querySelector('#time').oninput = e => window.seek(Number(e.target.value));
document.querySelector('#result').onclick = () => window.seek(9);
document.querySelector('#export').onclick = () => window.exportReference().catch(error => { document.querySelector('#status').textContent = String(error); });
