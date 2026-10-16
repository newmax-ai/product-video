// 极简 CDP 客户端：连上正在运行的产品窗口，截图、执行 JS、派发鼠标和键盘事件（Node 22.12+，无第三方依赖）。
// 用来把产品操作到要导出的状态（悬停、打开菜单、切页），导出见 export_dom.mjs。
//
// 产品要开远程调试端口：Electron 加启动参数 --remote-debugging-port=9222；Chrome 同理。
// 用法：
//   node cdp.mjs targets                      列出可连的页面（先确认连的是哪个窗口）
//   node cdp.mjs shot <out.png>               截整窗（窗口被遮挡或最小化时可能拿不到帧，10 秒超时）
//   node cdp.mjs eval '<js 表达式>'            执行并打印结果（JSON）
//   node cdp.mjs move <x> <y>                 鼠标移到坐标（CSS 像素），产生悬停态
//   node cdp.mjs click <x> <y>                点击
//   node cdp.mjs key <Key>                    按键（Escape / Enter / Tab / ArrowDown ...）
//   node cdp.mjs rect '<css 选择器>'           打印元素中心点和矩形，给 click 用
// 环境变量：CDP_PORT（默认 9222）、CDP_MATCH（页面 URL 或标题包含的文字，默认取第一个 page）
//
// 注意：这是在操作一个真实运行的实例。用户指定了哪个实例就只连那个端口；操作前记下当前页面，导完切回原处。

import { assertNodeVersion } from './runtime.mjs';
assertNodeVersion();

const PORT = process.env.CDP_PORT ?? '9222';
const MATCH = process.env.CDP_MATCH ?? '';
const [cmd, ...args] = process.argv.slice(2);

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
if (cmd === 'targets') {
  for (const t of targets) console.log(`${t.type.padEnd(8)} ${t.title.slice(0, 40).padEnd(40)} ${t.url.slice(0, 90)}`);
  process.exit(0);
}
const page = targets.find((t) => t.type === 'page' && (!MATCH || t.url.includes(MATCH) || t.title.includes(MATCH)));
if (!page) throw new Error(`端口 ${PORT} 上找不到匹配「${MATCH}」的 page，先跑 node cdp.mjs targets 看看`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}, timeoutMs = 30000) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    const timer = setTimeout(() => reject(new Error(`${method} 超时（${timeoutMs}ms）`)), timeoutMs);
    pending.set(i, (m) => {
      clearTimeout(timer);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const mouse = (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', ...extra });
const KEYCODES = { Escape: 27, Enter: 13, Tab: 9, Backspace: 8, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32 };

try {
  if (cmd === 'shot') {
    const fs = await import('node:fs');
    const r = await send('Page.captureScreenshot', { format: 'png' }, 10000).catch((e) => {
      throw new Error(`${e.message}：窗口可能被遮挡或最小化，渲染进程没有出帧。可改用 export_dom.mjs 导出 DOM 后在渲染器里看`);
    });
    fs.writeFileSync(args[0], Buffer.from(r.data, 'base64'));
    console.log('saved', args[0]);
  } else if (cmd === 'eval') {
    console.log(JSON.stringify(await evaluate(args[0]), null, 1));
  } else if (cmd === 'move' || cmd === 'click') {
    const [x, y] = args.map(Number);
    await mouse('mouseMoved', x, y, { button: 'none' });
    if (cmd === 'click') {
      await sleep(60);
      await mouse('mousePressed', x, y, { clickCount: 1 });
      await sleep(40);
      await mouse('mouseReleased', x, y, { clickCount: 1 });
    }
    await sleep(400); // 等悬停延迟、菜单弹出动画走完
    console.log(cmd, x, y);
  } else if (cmd === 'key') {
    const key = args[0];
    const code = KEYCODES[key] ?? 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: code });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: code });
    await sleep(300);
    console.log('key', key);
  } else if (cmd === 'rect') {
    const sel = JSON.stringify(args[0]);
    console.log(
      JSON.stringify(
        await evaluate(`(() => [...document.querySelectorAll(${sel})].slice(0, 8).map((e) => {
          const r = e.getBoundingClientRect();
          return { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: (e.textContent || '').trim().slice(0, 30) };
        }))()`),
      ),
    );
  } else {
    console.log('用法见文件头注释：targets | shot | eval | move | click | key | rect');
  }
} finally {
  ws.close();
}
