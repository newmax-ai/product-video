#!/usr/bin/env node
// HTML + seek(t) 渲染与检查。默认重渲；仅 --resume --revision <源/素材版本> 允许续跑。
// --url <URL> --frames 0:1200 --out frames [--fps 30 --w 1920 --h 1080]
// --overlap overlap.json --corner --handoff 9.6,16.2；--times 1.5,8 仅作抽样。
// 后台分片用 render_bg.sh；--report 是本次运行的独立报告目录。
// --project 指定依赖所在视频工程（默认 cwd）；PW_MODULE 显式覆盖模块，CHROME / CHROME_ARGS 配置 Chromium。
// 退出码：0=渲染与启用的自动检查完成；1=违规；2=执行/覆盖失败。整体验收仍需 check_report.py。
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertNodeVersion, loadPlaywright, resolveChromium } from './runtime.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (key, fallback) => {
  const i = process.argv.indexOf('--' + key);
  return i < 0 ? fallback : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true);
};
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const hash = data => createHash('sha256').update(data).digest('hex');
const atomicJSON = (file, value) => {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value)); fs.renameSync(tmp, file);
};

async function main() {
  let browser, R, save;
  try {
    assertNodeVersion();
    const url = arg('url');
    ensure(typeof url === 'string', '需要 --url');
    const projectArg = arg('project', process.cwd());
    ensure(typeof projectArg === 'string', '--project 缺少视频工程目录');
    const project = path.resolve(projectArg);
    const fps = +arg('fps', 30), width = +arg('w', 1920), height = +arg('h', 1080);
    const shard = String(arg('shard', '0/1'));
    const [k, N] = shard.split('/').map(Number);
    ensure(/^\d+\/\d+$/.test(shard) && N > 0 && k >= 0 && k < N, '--shard 应为有效的 k/N');
    ensure(Number.isFinite(fps) && fps > 0 && [width, height].every(v => Number.isInteger(v) && v > 0), '帧率/画幅无效');
    const runId = arg('run-id', randomUUID()), revision = arg('revision', null);
    ensure(typeof runId === 'string' && /^[A-Za-z0-9_-]+$/.test(runId), '--run-id 只允许字母、数字、下划线和连字符');
    ensure(N === 1 || arg('run-id'), '多分片必须共用 --run-id，请用 render_bg.sh');
    const resume = !!arg('resume', false);
    ensure(!(resume && arg('force', false)), '--resume 与 --force 不能同时使用');
    ensure(!resume || (typeof revision === 'string' && revision.length > 0), '续跑必须提供与前次相同的 --revision；代码或素材变化后重渲');
    const outArg = arg('out'), reportArg = arg('report');
    ensure(!outArg || typeof outArg === 'string', '--out 缺少目录');
    ensure(!reportArg || typeof reportArg === 'string', '--report 缺少目录');
    const out = outArg ? path.resolve(outArg) : null;
    ensure(!resume || out, '续跑需要 --out');
    const rep = path.resolve(reportArg || path.join(out || '.', 'checks', runId));
    let times = null, range = null, list;
    if (arg('times')) {
      ensure(!arg('frames'), '--times 与 --frames 不能同时指定');
      times = String(arg('times')).split(',').map(Number);
      ensure(times.length && times.every(t => Number.isFinite(t) && t >= 0) && new Set(times).size === times.length, '--times 必须是非负且不重复的时间点');
      list = times.map(t => ({ t, id: t })).filter((_, i) => i % N === k);
    } else {
      range = String(arg('frames', '0:1')).split(':').map(Number);
      ensure(range.length === 2 && range.every(v => Number.isSafeInteger(v) && v >= 0) && range[1] > range[0], '--frames 应为非空的 起:止 区间（止不含）');
      list = [];
      for (let i = range[0]; i < range[1]; i++) if (i % N === k) list.push({ t: i / fps, id: i });
    }
    ensure(N <= (times ? times.length : range[1] - range[0]), '分片数不能超过采样数');
    const overlapPath = arg('overlap'), corner = !!arg('corner', false);
    const ovCfg = overlapPath ? JSON.parse(fs.readFileSync(overlapPath, 'utf8')) : null;
    if (overlapPath) ensure(ovCfg && typeof ovCfg === 'object' && !Array.isArray(ovCfg), '重叠配置必须是对象');
    const handoffTimes = String(arg('handoff', '')).split(',').filter(Boolean).map(Number);
    ensure(handoffTimes.every(t => Number.isFinite(t) && t >= 0) && new Set(handoffTimes).size === handoffTimes.length, '交接时间点无效或重复');
    const sourceKeys = ['text', 'ui', 'decor', 'uiRectsHook'];
    const configuredSources = sourceKeys.filter(key => ovCfg && ovCfg[key] != null);
    for (const key of configuredSources) ensure(typeof ovCfg[key] === 'string' && ovCfg[key].trim(), `${key} 必须是非空选择器或钩子路径`);
    const optionalSources = ovCfg?.optionalSources ?? [];
    ensure(Array.isArray(optionalSources) && optionalSources.every(key => configuredSources.includes(key)) && new Set(optionalSources).size === optionalSources.length, 'optionalSources 只能列出已配置的来源，不允许重复或拼错');
    const requiredSources = configuredSources.filter(key => !optionalSources.includes(key));
    const request = { url, project, range, times, fps, width, height, shards: N, capture: !!out,
      checks: { overlap: !!ovCfg, corner, handoff: handoffTimes }, overlapConfigHash: ovCfg ? hash(JSON.stringify(ovCfg)) : null,
      overlapRequiredSources: requiredSources };
    R = { schemaVersion: 3, runId, revision, request, shard, status: 'running', frames: 0, frameIds: [],
      overlapChecks: 0, overlapSubjects: { text: 0, ui: 0, decor: 0 },
      overlapSourceSamples: Object.fromEntries(sourceKeys.map(key => [key, 0])), overlapUnverified: {}, overlap: {}, cornerChecks: 0,
      corner: { samples: 0, cls: { FRONTAL: 0, COLOR: 0, edge: 0 }, flagged: {} }, handoff: {}, outputs: [], errors: [] };
    fs.mkdirSync(rep, { recursive: true }); if (out) fs.mkdirSync(out, { recursive: true });
    const repFile = path.join(rep, `checks_${k}.json`);
    ensure(!fs.existsSync(repFile), '报告目录已有同编号分片，请换新的 --report / --run-id，避免覆盖或混入旧报告');
    save = () => atomicJSON(repFile, R);
    save();
    console.log(`运行 ${runId} · 报告目录 ${rep} · ${resume ? '显式续跑' : '全部重渲'}`);
    // revision 是调用者声明的源与素材版本，不是自动扫描源码。任何修改后必须更新并重渲。
    const signature = hash(JSON.stringify({ revision, request }));
    const cacheFile = out && path.join(out, `.render-cache_${k}.json`);
    let cache = { signature, frames: {} };
    if (resume && fs.existsSync(cacheFile)) {
      cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      ensure(cache.signature === signature && cache.frames && typeof cache.frames === 'object', '续跑版本或参数不匹配；去掉 --resume 重新渲染');
    } else if (resume) {
      ensure(!fs.readdirSync(out).some(name => /^(f_|t_).+\.png$/.test(name)), '缺少可核对的续跑清单，不能复用已有图片；去掉 --resume');
    }
    const { api: pw } = await loadPlaywright({ project });
    const chromium = pw.chromium;
    browser = await chromium.launch({ executablePath: resolveChromium(pw),
      args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', ...(process.env.CHROME_ARGS || '').split(' ').filter(Boolean)] });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on('pageerror', error => R.errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => typeof window.seek === 'function' && window.__ready !== false, null, { timeout: 180000 });
    await page.evaluate(async () => { if (document.fonts) await document.fonts.ready; });
    if (ovCfg) await page.addScriptTag({ path: path.join(here, 'overlap_check.js') });
    if (corner) ensure(await page.evaluate(() => typeof window.cornerCheck === 'function'), '要求圆角检查，但页面没有 window.cornerCheck()');
    if (handoffTimes.length && k === 0) {
      ensure(await page.evaluate(() => typeof window.__noDOM === 'boolean'), '交接检查要求页面显式提供并实现 window.__noDOM 布尔开关');
      for (const t of handoffTimes) {
        const shot = async nd => {
          await page.evaluate(nd => { window.__noDOM = nd; }, nd);
          await page.evaluate(t => window.seek(t), t);
          return 'data:image/png;base64,' + (await page.screenshot()).toString('base64');
        };
        const a = await shot(true), b = await shot(false);
        await page.evaluate(() => { window.__noDOM = false; });
        const result = await page.evaluate(async ([a, b]) => {
          const load = src => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
          const [A, B] = await Promise.all([load(a), load(b)]), canvas = document.createElement('canvas');
          canvas.width = A.width; canvas.height = A.height; const ctx = canvas.getContext('2d');
          ctx.filter = 'blur(1.5px)'; ctx.drawImage(A, 0, 0);
          const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(B, 0, 0);
          const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data, mask = ctx.createImageData(canvas.width, canvas.height);
          let sum = 0, big = 0, n = 0;
          for (let i = 0; i < da.length; i += 4) {
            const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
            if (d) { sum += d; n++; } const v = d > 40 ? 255 : 0; if (v) big++;
            mask.data[i] = mask.data[i + 1] = mask.data[i + 2] = v; mask.data[i + 3] = 255;
          }
          ctx.filter = 'none'; ctx.putImageData(mask, 0, 0);
          return { changedPx: n, meanDiffOfChanged: n ? +(sum / n).toFixed(2) : 0, popPx: big, mask: canvas.toDataURL('image/png') };
        }, [a, b]);
        const file = path.join(rep, `handoff_${t}.png`);
        fs.writeFileSync(file, Buffer.from(result.mask.split(',')[1], 'base64'));
        R.handoff[t] = { ...result, mask: file };
      }
    }
    for (const { t, id } of list) {
      await page.evaluate(t => window.seek(t), t);
      if (ovCfg) {
        const result = await page.evaluate(c => window.__overlapCheck(c), ovCfg);
        ensure(result && Array.isArray(result.hits) && Array.isArray(result.unverified), '重叠检查返回值无效');
        if (result.hits.length) R.overlap[t.toFixed(6)] = result.hits;
        if (result.unverified.length) R.overlapUnverified[t.toFixed(6)] = result.unverified;
        for (const [key, field] of [['text', 'nText'], ['ui', 'nUi'], ['decor', 'nDecor']]) {
          ensure(Number.isInteger(result[field]) && result[field] >= 0, '重叠采样计数无效');
          R.overlapSubjects[key] += result[field];
        }
        for (const key of sourceKeys) {
          const samples = result.sourceSamples?.[key];
          ensure(Number.isInteger(samples) && samples >= 0, `缺少 ${key} 的独立采样计数`);
          R.overlapSourceSamples[key] += samples;
        }
        R.overlapChecks++;
      }
      if (corner) {
        const result = await page.evaluate(() => window.cornerCheck());
        ensure(result && Number.isInteger(result.n) && result.n >= 0 && Array.isArray(result.flags), '圆角检查返回值无效');
        R.corner.samples += result.n;
        for (const flag of result.flags) { ensure(Object.hasOwn(R.corner.cls, flag[7]), '未知圆角检查分类'); R.corner.cls[flag[7]]++; }
        const bad = result.flags.filter(flag => flag[7] !== 'edge');
        if (bad.length) R.corner.flagged[t.toFixed(6)] = bad.slice(0, 8);
        R.cornerChecks++;
      }
      if (out) {
        const file = path.join(out, times ? `t_${id}.png` : `f_${String(id).padStart(5, '0')}.png`);
        const cached = cache.frames[id];
        const reuse = resume && cached && fs.existsSync(file) && hash(fs.readFileSync(file)) === cached;
        if (!reuse) {
          const tmp = `${file}.${process.pid}.tmp.png`;
          await page.screenshot({ path: tmp }); fs.renameSync(tmp, file);
        }
        const digest = hash(fs.readFileSync(file));
        cache.frames[id] = digest;
        R.outputs.push({ id, path: file, sha256: digest });
      }
      R.frames++; R.frameIds.push(id);
      ensure(!R.errors.length, `页面运行错误：${R.errors.join('; ')}`);
      if (R.frames % 50 === 0) { if (cacheFile) atomicJSON(cacheFile, cache); save(); console.log(`分片 ${shard} ${R.frames}/${list.length}`); }
    }
    if (cacheFile) atomicJSON(cacheFile, cache);
    await browser.close(); browser = null;
    ensure(!R.errors.length, `页面运行错误：${R.errors.join('; ')}`);
    R.status = 'complete'; save();
    const bad = Object.keys(R.overlap).length + R.corner.cls.FRONTAL + R.corner.cls.COLOR;
    const unverified = Object.keys(R.overlapUnverified).length;
    console.log(`分片 ${shard} 完成 ${R.frames} 帧；违规 ${bad}；裁切待验证 ${unverified}；请汇总 ${rep}`);
    return unverified ? 2 : bad ? 1 : 0;
  } catch (error) {
    if (R && save) { R.status = 'failed'; R.errors.push(error.message); save(); }
    console.error(`未完成：${error.message}`); return 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
process.exitCode = await main();
