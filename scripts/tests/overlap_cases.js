// 在托管浏览器空白页注入 overlap_check.js 后调用 runOverlapCases()。
// 仅构造本地测试 DOM，不访问外网、不启动浏览器、不依赖测试框架。
window.runOverlapCases = function () {
  const cfg = { text: '.title', ui: '.ui', decor: '.decor' };
  const block = (cls, left, top, extra = '') => `<div class="${cls}" style="position:absolute;left:${left}px;top:${top}px;width:100px;height:30px;${extra}">${cls}</div>`;
  const cases = [
    ['正常分离', block('title', 0, 0) + block('ui', 200, 100), {}, r => r.hits.length === 0],
    ['真实遮挡', block('title', 0, 0) + block('ui', 0, 0), {}, r => r.hits.length === 1],
    ['父级 overflow:hidden 完全裁掉', '<div style="position:absolute;left:0;top:0;width:20px;height:20px;overflow:hidden">' + block('title', 100, 0) + '</div>' + block('ui', 100, 0), {}, r => r.nText === 0 && r.hits.length === 0],
    ['父级 overflow:hidden 部分裁掉', '<div style="position:absolute;left:0;top:0;width:50px;height:30px;overflow:hidden">' + block('title', 0, 0) + '</div>' + block('ui', 60, 0), {}, r => r.nText === 1 && r.hits.length === 0],
    ['clip-path inset 裁掉碰撞区域', block('title', 0, 0, 'clip-path:inset(0 60px 0 0)') + block('ui', 50, 0), {}, r => r.hits.length === 0],
    ['clip-path 百分比', block('title', 0, 0, 'clip-path:inset(0 60% 0 0)') + block('ui', 50, 0), {}, r => r.hits.length === 0],
    ['缩放后的 inset 像素单位', block('title', 0, 0, 'clip-path:inset(0 60px 0 0);transform:scale(2);transform-origin:0 0') + block('ui', 100, 0), {}, r => r.hits.length === 0 && r.unverified?.length === 0],
    ['旋转祖先不按矩形误裁掉碰撞', '<div style="position:absolute;left:0;top:0;transform:rotate(10deg);transform-origin:0 0">' + block('title', 0, 0, 'clip-path:inset(0 20px 0 0)') + '</div>' + block('ui', 0, 0), {}, r => r.unverified?.length > 0],
    ['独立 rotate 属性保持待验证', block('title', 0, 0, 'rotate:10deg') + block('ui', 0, 0), {}, r => r.unverified?.length > 0],
    ['完全在视口外', block('title', -500, 0) + block('ui', -500, 0), {}, r => r.nText === 0 && r.nUi === 0 && r.hits.length === 0],
    ['隐藏父级中的可见后代', '<div class="title" style="position:absolute;left:0;top:0;visibility:hidden"><span style="display:block;width:100px;height:30px;visibility:visible">可见文字</span></div>' + block('ui', 0, 0), {}, r => r.nText === 1 && r.hits.length === 1],
    ['opacity 为零不可被后代恢复', '<div class="title" style="opacity:0">' + block('child', 0, 0, 'opacity:1') + '</div>' + block('ui', 0, 0), {}, r => r.nText === 0 && r.hits.length === 0],
    ['display:none 后代不可见', '<div style="display:none">' + block('title', 0, 0) + '</div>' + block('ui', 0, 0), {}, r => r.nText === 0],
    ['未匹配装饰记录零采样', block('title', 0, 0) + block('ui', 200, 100) + block('actual-decor', 0, 0), {}, r => r.sourceSamples?.decor === 0 && r.sourceSamples?.text === 1 && r.sourceSamples?.ui === 1],
    ['正确装饰选择器捕获碰撞', block('title', 0, 0) + block('ui', 200, 100) + block('decor', 0, 0), {}, r => r.hits.some(h => h.kind === 'decor×text')],
    ['不支持的复杂裁切不能自动通过', block('title', 0, 0, 'clip-path:circle(10px at 10px 10px)') + block('ui', 0, 0), {}, r => r.unverified?.length > 0 && r.hits.length === 0],
    ['复杂裁切但矩形完全分离不阻塞', block('title', 0, 0, 'clip-path:circle(10px at 10px 10px)') + block('ui', 200, 100), {}, r => r.unverified?.length === 0 && r.hits.length === 0],
    ['缺少 3D 投影钩子单独记零采样', block('title', 0, 0) + block('ui', 200, 100), { uiRectsHook: '__missingRects' }, r => r.sourceSamples?.ui === 1 && r.sourceSamples?.uiRectsHook === 0],
    ['border-radius 裁切交叠需复核', '<div style="position:absolute;left:0;top:0;width:100px;height:30px;overflow:hidden;border-radius:12px">' + block('title', 0, 0) + '</div>' + block('ui', 0, 0), {}, r => r.unverified?.length > 0],
  ];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:white';
  document.body.appendChild(host);
  const results = [];
  try {
    for (const [name, html, override, check] of cases) {
      host.innerHTML = html;
      try {
        const result = window.__overlapCheck({ ...cfg, ...override });
        results.push({ name, passed: !!check(result), result });
      } catch (error) { results.push({ name, passed: false, error: String(error) }); }
    }
  } finally { host.remove(); }
  return { passed: results.filter(r => r.passed).length, total: results.length, results };
};
