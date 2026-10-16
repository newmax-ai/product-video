// 浏览器端重叠检查。先裁到视口与可计算的祖先裁切范围，再比较可见矩形。
// 支持矩形 overflow 裁切与无圆角 inset()；复杂裁切发生潜在交叠时返回 unverified，不能自动通过。
// 配置：text / ui / decor 为选择器；uiRectsHook 为投影框钩子路径；minOpacity 默认 .02，pad 为安全距离。
// 返回 sourceSamples，供汇总逐一验证已配置来源。optionalSources 的豁免由渲染器与汇总校验。
(function () {
  const sourceKeys = ['text', 'ui', 'decor', 'uiRectsHook'];
  const intersect = (a, b) => {
    const r = { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
    return r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
  };
  const fromDOM = r => ({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  const axisAligned = transform => {
    if (!transform || transform === 'none') return true;
    const match = /^matrix\(([^)]+)\)$/.exec(transform);
    if (!match) return false;
    const m = match[1].split(',').map(Number);
    return m.length === 6 && m[0] > 0 && m[3] > 0 && Math.abs(m[1]) < 1e-8 && Math.abs(m[2]) < 1e-8;
  };
  const insetRect = (value, box, sx, sy) => {
    const match = /^inset\(([^()]+)\)$/.exec(value);
    if (!match || /round/.test(match[1])) return null;
    const parts = match[1].trim().split(/\s+/);
    if (parts.length < 1 || parts.length > 4 || parts.some(p => !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|%)?$/.test(p))) return null;
    const [a, b = a, c = a, d = b] = parts;
    const length = (p, size, scale) => parseFloat(p) * (p.endsWith('%') ? size / 100 : scale);
    return { x0: box.x0 + length(d, box.x1 - box.x0, sx), x1: box.x1 - length(b, box.x1 - box.x0, sx),
      y0: box.y0 + length(a, box.y1 - box.y0, sy), y1: box.y1 - length(c, box.y1 - box.y0, sy) };
  };
  window.__overlapCheck = function (cfg = {}) {
    const minO = cfg.minOpacity ?? 0.02, pad = cfg.pad ?? 0;
    if (!Number.isFinite(minO) || minO < 0 || minO > 1 || !Number.isFinite(pad) || pad < 0) throw new Error('重叠检查透明度或安全距离无效');
    const viewport = { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
    const styles = new WeakMap(), geometry = new WeakMap();
    const css = el => { if (!styles.has(el)) styles.set(el, getComputedStyle(el)); return styles.get(el); };
    const opacity = el => {
      // visibility 可由后代恢复；display:none 与祖先 opacity:0 不可恢复。
      if (css(el).visibility !== 'visible') return 0;
      let value = 1;
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
        const s = css(e);
        if (s.display === 'none') return 0;
        value *= Number(s.opacity);
      }
      return value;
    };
    const visible = el => { const o = opacity(el); return o > 0 && o >= minO; };
    const clipsAxis = v => ['hidden', 'clip', 'scroll', 'auto', 'overlay'].includes(v);
    const clipBox = (el, input) => {
      let bounds = intersect(input, viewport);
      const uncertain = new Set(), chain = [];
      for (let e = el; e && e.nodeType === 1; e = e.parentElement) chain.push(e);
      // 任一祖先的旋转/透视都会改变子节点的坐标系；不能先用错误的矩形把候选裁掉。
      const aligned = chain.every(e => axisAligned(css(e).transform) && (!css(e).rotate || css(e).rotate === 'none') && (!css(e).perspective || css(e).perspective === 'none'));
      if (!aligned) uncertain.add('非轴对齐变换');
      for (const e of chain) {
        if (!bounds) break;
        const s = css(e), box = fromDOM(e.getBoundingClientRect());
        const clip = s.clipPath;
        if (clip && clip !== 'none') {
          const sx = e.offsetWidth ? (box.x1 - box.x0) / e.offsetWidth : 1;
          const sy = e.offsetHeight ? (box.y1 - box.y0) / e.offsetHeight : 1;
          const inset = aligned ? insetRect(clip, box, sx, sy) : null;
          if (inset) bounds = intersect(bounds, inset);
          else uncertain.add('复杂 clip-path');
        }
        if ((s.maskImage && s.maskImage !== 'none') || (s.webkitMaskImage && s.webkitMaskImage !== 'none')) uncertain.add('CSS mask');
        if (s.clip && s.clip !== 'auto') uncertain.add('旧式 clip 裁切');
        if (e !== el && (clipsAxis(s.overflowX) || clipsAxis(s.overflowY))) {
          if (!aligned) { uncertain.add('变换后的 overflow 裁切'); continue; }
          const sx = e.offsetWidth ? (box.x1 - box.x0) / e.offsetWidth : 1;
          const sy = e.offsetHeight ? (box.y1 - box.y0) / e.offsetHeight : 1;
          const x = box.x0 + e.clientLeft * sx, y = box.y0 + e.clientTop * sy;
          const area = { x0: clipsAxis(s.overflowX) ? x : -Infinity, x1: clipsAxis(s.overflowX) ? x + e.clientWidth * sx : Infinity,
            y0: clipsAxis(s.overflowY) ? y : -Infinity, y1: clipsAxis(s.overflowY) ? y + e.clientHeight * sy : Infinity };
          // overflow-clip-margin 可扩展裁切区；不把它误缩成 client box。
          if (parseFloat(s.overflowClipMargin) > 0 && (s.overflowX === 'clip' || s.overflowY === 'clip')) uncertain.add('overflow-clip-margin');
          else if (bounds) bounds = intersect(bounds, area);
          if ([s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].some(r => parseFloat(r) > 0)) uncertain.add('圆角 overflow 裁切');
        }
      }
      if (!bounds) return null;
      bounds = intersect({ x0: bounds.x0 - pad, y0: bounds.y0 - pad, x1: bounds.x1 + pad, y1: bounds.y1 + pad }, viewport);
      return bounds ? { bounds, uncertain: [...uncertain] } : null;
    };
    const rects = el => {
      if (geometry.has(el)) return geometry.get(el);
      const nodes = visible(el) ? [el] : [...el.querySelectorAll('*')].filter(visible);
      const result = nodes.flatMap(node => [...node.getClientRects()].map(r => clipBox(node, fromDOM(r))).filter(Boolean));
      geometry.set(el, result); return result;
    };
    const label = el => (el.textContent || el.getAttribute('data-name') || el.tagName).trim().slice(0, 32);
    const query = key => (cfg[key] ? [...document.querySelectorAll(cfg[key])] : []).map(e => ({ e, rects: rects(e), name: label(e) })).filter(x => x.rects.length);
    const texts = query('text'), decor = query('decor'), ui = query('ui');
    const sourceSamples = Object.fromEntries(sourceKeys.map(key => [key, 0]));
    sourceSamples.text = texts.length; sourceSamples.decor = decor.length; sourceSamples.ui = ui.length;
    if (cfg.uiRectsHook) {
      const get = p => p.split('.').reduce((o, key) => o == null ? undefined : o[key], window);
      const hook = typeof cfg.uiRectsHook === 'function' ? cfg.uiRectsHook : get(cfg.uiRectsHook);
      const values = typeof hook === 'function' ? hook() : hook;
      if (values != null && !Array.isArray(values)) throw new Error('uiRectsHook 必须返回投影框数组');
      for (const box of values || []) {
        if (!box || box.visible === false) continue;
        if (!['x0', 'y0', 'x1', 'y1'].every(key => Number.isFinite(box[key]))) throw new Error('uiRectsHook 投影框坐标无效');
        const bounds = intersect(box, viewport);
        if (bounds) { ui.push({ name: box.name || 'ui-rect', rects: [{ bounds, uncertain: [] }] }); sourceSamples.uiRectsHook++; }
      }
    }
    const hits = [], unverified = [];
    const compare = (a, b, kind) => {
      const reasons = new Set(); let potential = false;
      for (const ra of a.rects) for (const rb of b.rects) {
        if (!intersect(ra.bounds, rb.bounds)) continue;
        potential = true;
        if (!ra.uncertain.length && !rb.uncertain.length) { hits.push({ kind, what: a.name, on: b.name }); return; }
        for (const why of [...ra.uncertain, ...rb.uncertain]) reasons.add(why);
      }
      if (potential) unverified.push({ kind, what: a.name, on: b.name, reasons: [...reasons] });
    };
    for (const t of texts) for (const u of ui) compare(t, u, 'text×ui');
    for (const d of decor) {
      for (const t of texts) if (d.e !== t.e && !d.e.contains(t.e)) compare(d, t, 'decor×text');
      for (const u of ui) compare(d, u, 'decor×ui');
    }
    return { hits, unverified, nText: texts.length, nUi: ui.length, nDecor: decor.length, sourceSamples };
  };
})();
