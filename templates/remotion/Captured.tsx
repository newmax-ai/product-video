// 在 Remotion 里渲染 export_dom.mjs 导出的真实界面，并逐帧修改它的状态。复制到视频工程（如 src/kit/Captured.tsx）。
//
// 前提（一次性）：
//   1. 视频工程引入产品的全局 CSS 和 Tailwind 编译结果，Tailwind 的 content 要包含导出的 .ts 模块所在目录（类名在字符串里）
//   2. 全局加一条：.nm-captured *, .nm-captured *::before, .nm-captured *::after { animation: none !important; transition: none !important; }
//      产品自己的 CSS 动画不跟时间轴走，逐帧渲染会停在第一帧（常见症状：半透明、没展开）
//   3. 运行时注入的样式（export_dom 的 runtimeStyles）用 <style>{css}</style> 放进合成根组件
//   4. 产品主题靠 <html data-theme> 或 CSS 变量时，在 Cap 外层包一个带同样属性 / 变量的容器
//
// 用法：
//   import { html as shell } from '../captured/shell';
//   <Cap html={shell} w={1440} h={900} mutate={(root, f) => {
//     setStyle(root.querySelector('[data-sidebar]'), { width: `${track(f / fps, [[0, 240], [2.1, 0]])}px` });
//   }} />
//
// mutate 的规矩：
//   - 每帧设置「完整的目标状态」，不能依赖上一帧的结果：渲染器可能乱序、并行、跳帧渲染
//   - 属性一律按帧算出绝对值再写；要切换的元素（图标、样式）两种状态都写，用 data-* 记当前状态避免每帧重建节点
//   - 收起 / 展开这类切换先在真实产品里把两端都导出来，用 scripts/diff_dom.py 找出所有联动属性，一起插值
//   - 停住后值必须完全不变：弹簧已在 motion.js 里锁定；缩放和位置按设备像素取整，否则小图标会一直抖
import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useCurrentFrame } from 'remotion';

export const Cap: React.FC<{
  html: string;
  w?: number;
  h?: number;
  mutate?: (root: HTMLElement, frame: number) => void;
  style?: React.CSSProperties;
  attrs?: Record<string, string>;
}> = ({ html, w, h, mutate, style, attrs = {} }) => {
  const ref = useRef<HTMLDivElement>(null);
  const f = useCurrentFrame();
  const inner = useMemo(() => ({ __html: html }), [html]);
  useLayoutEffect(() => {
    if (ref.current && mutate) mutate(ref.current, f);
  });
  // position: relative + transform 祖先会让导出里的 position: fixed 元素相对这个容器定位，和真实窗口一致
  return <div ref={ref} className="nm-captured" {...attrs} style={{ width: w, height: h, position: 'relative', ...style }} dangerouslySetInnerHTML={inner} />;
};

const parse = (html: string) => new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;

/** 从一段导出的 HTML 里取出第 index 个匹配节点的 outerHTML（例如从整页里只取输入框单独放大展示） */
export const pick = (html: string, selector: string, index = 0) => {
  const el = parse(html).querySelectorAll(selector)[index] as HTMLElement | undefined;
  if (!el) throw new Error(`pick: 找不到 ${selector}`);
  return el.outerHTML;
};

/** 导出时记下的位置（data-captured-rect="x,y,w,h"，真实窗口里的 CSS 像素），弹层按它叠到基底界面上 */
export const capturedRect = (html: string) => {
  const m = html.match(/data-captured-rect="([\d,.-]+)"/);
  const [x, y, w, h] = (m ? m[1] : '0,0,0,0').split(',').map(Number);
  return { x, y, w, h };
};

/** 设置内联样式（每帧都调用；要清掉某个属性就传空字符串） */
export const setStyle = (el: Element | null | undefined, style: Record<string, string>) => {
  if (!el) return;
  const s = (el as HTMLElement).style;
  for (const [k, v] of Object.entries(style)) (v === '' ? s.removeProperty(k) : s.setProperty(k, v));
};

/** 按帧写入文本（逐字输入）：只在内容变化时才改，避免每帧重建节点 */
export const setText = (el: Element | null | undefined, text: string) => {
  if (el && el.textContent !== text) el.textContent = text;
};

/** 在两种状态之间切换节点内容（图标、按钮样式），用 data-demo-state 记住当前状态 */
export const swapState = (el: Element | null | undefined, want: string, apply: (el: HTMLElement) => void) => {
  if (!el || el.getAttribute('data-demo-state') === want) return;
  apply(el as HTMLElement);
  el.setAttribute('data-demo-state', want);
};
