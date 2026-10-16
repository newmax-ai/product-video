// 从正在运行的产品窗口导出真实界面的 DOM（克隆，不改页面上的真实节点），换成演示数据后存成
// `export const html = "..."` 的 TS 模块，给视频工程里的 Cap 组件（templates/remotion/Captured.tsx）渲染。
//
// 用法：node export_dom.mjs <配置.json> [--only 任务名,任务名]
// 先用 cdp.mjs 把产品操作到要导出的状态（悬停、菜单打开、切页、收起面板），再跑本脚本。
//
// 配置示例（路径相对于配置文件）：
// {
//   "port": 9222, "match": "localhost",          // 连哪个实例、哪个页面（同 cdp.mjs 的 CDP_PORT / CDP_MATCH）
//   "outDir": "../src/captured",
//   "replaceText": [["张三的工作区", "个人"]],     // 全局文本替换：文本节点去掉首尾空白后与左边完全相同才换（避免误伤子串）
//   "replaceSubstring": [["zhangsan@corp.com", "demo@example.com"]], // 子串替换：文本节点和属性值里出现就换
//   "keepImages": ["img.cm-widgetBuffer"],        // 这些 <img> 不当头像处理（生成式图标、编辑器占位图）
//   "forbid": ["张三", "zhangsan", "真实客户名"],  // 导出后在结果里搜，命中就报错并不写文件
//   "jobs": [
//     { "name": "shell", "selector": "[data-app-shell]", "remove": ["[data-debug-panel]"] },
//     { "name": "menu", "selector": "[role=menu]", "all": true, "visibleOnly": true },
//     { "name": "sidebar", "selector": "aside", "transform": "transforms/sidebar.js" }
//   ],
//   "runtimeStyles": { "name": "runtimeStyles", "contains": "cm-" }   // 可选：导出运行时注入的 <style>
// }
//
// 每个任务：
//   selector       要导出的根节点；all=true 时导出全部匹配（包进 <div data-captured-group>），visibleOnly 只要宽度 > 0 的
//   remove         导出前从克隆里删掉的节点（调试面板、和演示无关的侧栏）
//   replaceText    只对这个任务生效的文本替换，写法同全局
//   transform      浏览器里执行的 JS 文件，内容是一个函数表达式 `(root, h) => { ... }`，对克隆做任意修改
//                  （删多余消息、改列表标题、复制行）；h 里有 replaceText(root, pairs) / textNodes(root)
//   rect           默认 true：把根节点在窗口里的位置记到 data-captured-rect="x,y,w,h"（CSS 像素），视频里按它摆放
//
// 导出时自动处理（都是踩过的坑）：
//   - 所有 <img>（keepImages 之外）换成品牌色圆形占位：头像常是 base64 内嵌照片，只替换外链会漏
//   - 根节点和子孙上的 h-screen / w-screen 换成 h-full / w-full：否则在视频里按整个画布算尺寸
//   - 结果里搜邮箱、剩余的 base64 图片和 forbid 列表，有就报出来
import fs from 'node:fs';
import path from 'node:path';
import { assertNodeVersion } from './runtime.mjs';
assertNodeVersion();

const argv = process.argv.slice(2);
const cfgPath = argv[0];
if (!cfgPath) throw new Error('用法：node export_dom.mjs <配置.json> [--only 任务名,...]');
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const cfgDir = path.dirname(path.resolve(cfgPath));
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const outDir = path.resolve(cfgDir, cfg.outDir ?? 'captured');

const targets = await (await fetch(`http://127.0.0.1:${cfg.port ?? 9222}/json`)).json();
const page = targets.find((t) => t.type === 'page' && (!cfg.match || t.url.includes(cfg.match) || t.title.includes(cfg.match)));
if (!page) throw new Error(`端口 ${cfg.port ?? 9222} 上找不到匹配「${cfg.match ?? ''}」的 page`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const evaluate = (expression) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    ws.addEventListener('message', function on(e) {
      const m = JSON.parse(e.data);
      if (m.id !== id) return;
      ws.removeEventListener('message', on);
      const ex = m.result?.exceptionDetails;
      m.error || ex ? reject(new Error(JSON.stringify(m.error ?? ex.exception?.description ?? ex.text))) : resolve(m.result.result.value);
    });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });

// 页面里执行的工具函数
const HELPERS = (keepImages) => `
const h = {
  textNodes(root) {
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const out = [];
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  },
  replaceText(root, pairs) {
    for (const n of h.textNodes(root)) {
      const t = n.textContent;
      for (const [a, b] of pairs) if (t.trim() === a) n.textContent = t.replace(a, b);
    }
  },
  replaceSubstring(root, pairs) {
    if (!pairs.length) return;
    for (const n of h.textNodes(root)) for (const [a, b] of pairs) if (n.textContent.includes(a)) n.textContent = n.textContent.split(a).join(b);
    for (const el of [root, ...root.querySelectorAll('*')])
      for (const at of [...el.attributes]) for (const [a, b] of pairs) if (at.value.includes(a)) el.setAttribute(at.name, at.value.split(a).join(b));
  },
  scrubImages(root) {
    const keep = ${JSON.stringify(keepImages)};
    root.querySelectorAll('img').forEach((img) => {
      if (keep.some((s) => img.matches(s))) return;
      const s = document.createElement('span');
      s.className = img.className;
      s.setAttribute('style', (img.getAttribute('style') || '') + ';display:inline-block;border-radius:9999px;background:currentColor;opacity:.35;');
      s.setAttribute('data-avatar-placeholder', '');
      img.replaceWith(s);
    });
  },
  fixViewportUnits(root) {
    for (const [a, b] of [['h-screen', 'h-full'], ['w-screen', 'w-full']])
      [root, ...root.querySelectorAll('.' + a)].filter((e) => e.classList.contains(a)).forEach((e) => { e.classList.remove(a); e.classList.add(b); });
  },
};
`;

const jobScript = (job) => {
  const transform = job.transform ? fs.readFileSync(path.resolve(cfgDir, job.transform), 'utf8').trim().replace(/;$/, '') : null;
  return `(() => {${HELPERS([...(cfg.keepImages ?? []), ...(job.keepImages ?? [])])}
  let srcs = [...document.querySelectorAll(${JSON.stringify(job.selector)})];
  if (${!!job.visibleOnly}) srcs = srcs.filter((e) => e.getBoundingClientRect().width > 0);
  if (!srcs.length) throw new Error('找不到 ' + ${JSON.stringify(job.selector)});
  if (!${!!job.all}) srcs = [srcs[0]];
  const clones = srcs.map((src) => {
    const c = src.cloneNode(true);
    if (${job.rect !== false}) { const r = src.getBoundingClientRect(); c.setAttribute('data-captured-rect', [r.x, r.y, r.width, r.height].map(Math.round).join(',')); }
    return c;
  });
  let root = clones[0];
  if (${!!job.all}) { root = document.createElement('div'); root.setAttribute('data-captured-group', ''); clones.forEach((c) => root.appendChild(c)); }
  for (const s of ${JSON.stringify(job.remove ?? [])}) root.querySelectorAll(s).forEach((e) => e.remove());
  ${transform ? `(${transform})(root, h);` : ''}
  h.replaceText(root, ${JSON.stringify([...(job.replaceText ?? []), ...(cfg.replaceText ?? [])])});
  h.replaceSubstring(root, ${JSON.stringify(cfg.replaceSubstring ?? [])});
  h.scrubImages(root);
  h.fixViewportUnits(root);
  return root.outerHTML;
})()`;
};

const check = (name, text) => {
  const problems = [];
  for (const f of cfg.forbid ?? []) if (text.includes(f)) problems.push(`含禁用词「${f}」`);
  const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g)?.filter((e) => !/example\.(com|org)$/.test(e));
  if (emails?.length) problems.push(`含邮箱 ${[...new Set(emails)].slice(0, 3).join(', ')}`);
  const b64 = (text.match(/data:image\/(png|jpe?g|webp);base64/g) ?? []).length;
  if (b64) problems.push(`还有 ${b64} 处 base64 位图（可能是照片 / 头像，确认后把选择器加进 keepImages 或在 transform 里处理）`);
  return problems;
};

const write = (name, text, note) => {
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.ts`);
  fs.writeFileSync(file, `// 自动生成：export_dom.mjs 从运行中的产品导出（${note}），不要手改\nexport const html = ${JSON.stringify(text)};\n`);
  console.log(`${name}  ${Math.round(text.length / 1024)}KB  → ${path.relative(process.cwd(), file)}`);
};

let failed = false;
try {
  for (const job of cfg.jobs ?? []) {
    if (only && !only.includes(job.name)) continue;
    const html = await evaluate(jobScript(job));
    const problems = check(job.name, html);
    const hard = problems.filter((p) => p.startsWith('含禁用词') || p.startsWith('含邮箱'));
    problems.forEach((p) => console.warn(`  ⚠ ${job.name}：${p}`));
    if (hard.length) { failed = true; console.error(`  ✗ ${job.name} 未写入：先在 replaceText / replaceSubstring / transform 里处理掉`); continue; }
    write(job.name, html, `选择器 ${job.selector}`);
  }
  // 运行时注入的样式（编辑器、图表库等在运行时插入的 <style>，不在产品 CSS 文件里）
  if (cfg.runtimeStyles && (!only || only.includes(cfg.runtimeStyles.name))) {
    const { name, contains = '' } = cfg.runtimeStyles;
    const css = await evaluate(`[...document.querySelectorAll('style')].map((s) => s.textContent).filter((t) => t.includes(${JSON.stringify(contains)})).join('\\n')`);
    write(name, css, `运行时 <style>，含「${contains}」`);
  }
} finally {
  ws.close();
}
if (failed) process.exit(1);
