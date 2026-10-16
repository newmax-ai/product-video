// 3D 面板圆角漏边检查（浏览器端 ES module，Three.js r150+）。
// 原理：在每块完全显示的面板的「投影圆角」外侧 offsets 像素处采样，再把所有机身对相机隐藏
// （colorWrite/depthWrite=false，阴影仍由 shadow pass 渲染）重渲一遍，像素差 > threshold 即机身漏到了正面轮廓外。
// 分类：FRONTAL（视角 < frontalDeg 仍漏边，必须 0）/ COLOR（漏出像素色度 > chromaMax，彩色边，必须 0）/
//      edge（斜视下的中性厚度，正常 3D，只记录）。
// 用法：
//   import { makeCornerCheck } from './corner_check.mjs';
//   window.cornerCheck = makeCornerCheck({ THREE, renderer, scene, camera,
//     cards: () => [{ name:'dlg', face: dlgFaceMesh, body: dlgBodyMesh, w:10.6, h:7.2, r:0.18, visible: dlgFullyShown }] });
//   seek(t) 渲染完后调用 window.cornerCheck() → { n, flags:[[name,x,y,diff,deg,[r,g,b],chroma,cls]], pts }
// 约定：face 是位于本地 z=faceZ 平面、以原点为中心的 w×h 圆角矩形；renderer 需 preserveDrawingBuffer:true。
export function makeCornerCheck({ THREE, renderer, scene, camera, cards, offsets = [2, 3.5], arcSamples = 7, threshold = 10, frontalDeg = 20, chromaMax = 24, faceZ = 0 }) {
  const W = renderer.domElement.width, H = renderer.domElement.height, gl = renderer.getContext();
  const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4), v = new THREE.Vector3();
  const proj = (m, x, y) => { v.set(x, y, faceZ).applyMatrix4(m).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H, v.z]; };
  return function cornerCheck() {
    const list = (typeof cards === 'function' ? cards() : cards).filter(c => c.visible !== false && c.face.visible);
    const samples = [];
    for (const c of list) {
      c.face.updateMatrixWorld(true); const m = c.face.matrixWorld;
      const n = new THREE.Vector3(0, 0, 1).transformDirection(m), ctr = new THREE.Vector3().setFromMatrixPosition(m);
      const deg = THREE.MathUtils.radToDeg(n.angleTo(camera.position.clone().sub(ctr)));
      for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const cx = sx * (c.w / 2 - c.r), cy = sy * (c.h / 2 - c.r);
        for (let a = 0; a < arcSamples; a++) {
          const th = (a / (arcSamples - 1)) * Math.PI / 2, dx = sx * Math.cos(th), dy = sy * Math.sin(th);
          const p0 = proj(m, cx + dx * c.r, cy + dy * c.r), p1 = proj(m, cx + dx * (c.r + 0.01), cy + dy * (c.r + 0.01));
          if (Math.abs(p0[2]) > 1) continue;
          const pxu = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 0.01; if (pxu < 0.5) continue; // 侧立到看不见
          for (const off of offsets) { const k = c.r + off / pxu, q = proj(m, cx + dx * k, cy + dy * k), X = Math.round(q[0]), Y = Math.round(q[1]); if (X >= 0 && X < W && Y >= 0 && Y < H) samples.push([c.name, X, Y, deg]); }
        }
      }
    }
    const pts = samples.filter((_, i) => i % (arcSamples * offsets.length) === Math.floor(arcSamples / 2) * offsets.length).map(s => s.slice(0, 3));
    if (!samples.length) return { n: 0, flags: [], pts };
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, A);
    const mats = list.flatMap(c => [].concat(c.body).map(b => b.material)).flat();
    const saved = mats.map(m => [m.colorWrite, m.depthWrite]);
    mats.forEach(m => { m.colorWrite = false; m.depthWrite = false; });
    renderer.render(scene, camera); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, B);
    mats.forEach((m, i) => { m.colorWrite = saved[i][0]; m.depthWrite = saved[i][1]; });
    renderer.render(scene, camera); // 还原正常画面给截图
    const flags = [];
    for (const [name, X, Y, deg] of samples) {
      const i = ((H - 1 - Y) * W + X) * 4; let d = 0; for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(A[i + k] - B[i + k]));
      if (d > threshold) { const px = [A[i], A[i + 1], A[i + 2]], ch = Math.max(...px) - Math.min(...px); flags.push([name, X, Y, d, +deg.toFixed(1), px, ch, deg < frontalDeg ? 'FRONTAL' : ch > chromaMax ? 'COLOR' : 'edge']); }
    }
    return { n: samples.length, flags, pts };
  };
}

// 配套几何：正面 / 机身 / 投影共用的精确圆角矩形（圆弧，与 CSS border-radius 一致），机身背面内缩 inset。
export function rrShape(THREE, w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2, H = Math.PI / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -H, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, H, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, H, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}
export function insetBodyGeometry(THREE, w, h, d, r, { inset = Math.min(0.045, r * 0.5), segments = 32 } = {}) {
  const g = new THREE.ExtrudeGeometry(rrShape(THREE, w, h, r), { depth: d, bevelEnabled: false, curveSegments: segments });
  const hw = w / 2 - r, hh = h / 2 - r, p = g.attributes.position, k = (r - inset) / r, cl = (a, lo, hi) => Math.min(hi, Math.max(lo, a));
  for (let i = 0; i < p.count; i++) { if (p.getZ(i) > d / 2) continue; const x = p.getX(i), y = p.getY(i), cx = cl(x, -hw, hw), cy = cl(y, -hh, hh); p.setXY(i, cx + (x - cx) * k, cy + (y - cy) * k); }
  g.translate(0, 0, -d / 2); g.computeVertexNormals(); return g; // 正面在 z=+d/2→放到 face 后方 0.01–0.02
}
