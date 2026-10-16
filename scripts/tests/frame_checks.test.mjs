import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, '../frame_checks.mjs');
const reportScript = path.resolve(here, '../check_report.py');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'product-video-tests-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const out = path.join(root, 'frames');
  const cfg = path.join(root, 'overlap.json');
  fs.writeFileSync(cfg, JSON.stringify({ text: '.title', ui: '.ui' }));
  const env = { ...process.env, PW_MODULE: path.join(here, 'fake_playwright.mjs'), TEST_SHOT_LOG: path.join(root, 'shots.log') };
  let run = 0;
  function render(extra = [], extraEnv = {}) {
    const rep = path.join(root, `report-${++run}`);
    const result = spawnSync(process.execPath, [script, '--url', 'http://localhost/film.html', '--frames', '0:4', '--out', out,
      '--overlap', cfg, ...(extra.includes('--revision') ? [] : ['--revision', 'v1']), '--report', rep, ...extra], { env: { ...env, ...extraEnv }, encoding: 'utf8' });
    return { ...result, rep };
  }
  return { root, out, cfg, env, render };
}
const load = rep => JSON.parse(fs.readFileSync(path.join(rep, 'checks_0.json'), 'utf8'));
const summarize = (rep, extra = []) => spawnSync('python3', ['-I', reportScript, rep, ...extra], { encoding: 'utf8' });

// 本组使用替身检查脚本、缓存、状态与分片契约，不证明 Chromium 视觉渲染正确。
test('默认重渲旧图片，报告绑定新输出', t => {
  const f = fixture(t);
  assert.equal(f.render().status, 0);
  const before = fs.readFileSync(path.join(f.out, 'f_00000.png'), 'utf8');
  const result = f.render([], { TEST_RENDER_VERSION: 'v2' });
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(fs.readFileSync(path.join(f.out, 'f_00000.png'), 'utf8'), before);
  assert.equal(summarize(result.rep, ['--expect-frames', '0:4']).status, 0);
});

test('匹配版本和参数的显式续跑复用图片，但重新检查', t => {
  const f = fixture(t);
  assert.equal(f.render().status, 0);
  const before = fs.readFileSync(f.env.TEST_SHOT_LOG, 'utf8');
  const result = f.render(['--resume']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(f.env.TEST_SHOT_LOG, 'utf8'), before);
  assert.equal(load(result.rep).overlapChecks, 4);
});

test('损坏缓存图片会在续跑时重新生成', t => {
  const f = fixture(t);
  assert.equal(f.render().status, 0);
  fs.writeFileSync(path.join(f.out, 'f_00000.png'), '损坏帧');
  const result = f.render(['--resume']);
  assert.equal(result.status, 0, result.stderr);
  assert.notEqual(fs.readFileSync(path.join(f.out, 'f_00000.png'), 'utf8'), '损坏帧');
  assert.equal(summarize(result.rep).status, 0);
});

test('源版本或参数变化拒绝复用', t => {
  const f = fixture(t);
  assert.equal(f.render().status, 0);
  const result = f.render(['--resume', '--w', '1280']);
  assert.equal(result.status, 2);
  assert.equal(load(result.rep).status, 'failed');
  assert.equal(summarize(result.rep).status, 2);
});

test('显式源版本变化必须重渲，不能续用旧帧', t => {
  const f = fixture(t);
  assert.equal(f.render().status, 0);
  const result = f.render(['--resume', '--revision', 'v2']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /版本或参数不匹配/);
});

test('没有清单的旧图片不能静默复用', t => {
  const f = fixture(t);
  fs.mkdirSync(f.out); fs.writeFileSync(path.join(f.out, 'f_00000.png'), '旧图片');
  const result = f.render(['--resume']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /缺少可核对/);
});

test('要求圆角检查却缺钩子时失败，不生成零错误通过报告', t => {
  const f = fixture(t);
  const result = f.render(['--corner'], { TEST_NO_CORNER: '1' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /没有 window.cornerCheck/);
  assert.equal(load(result.rep).status, 'failed');
  assert.equal(summarize(result.rep).status, 2);
});

test('圆角零采样由最终汇总判未完成', t => {
  const f = fixture(t);
  const result = f.render(['--corner'], { TEST_ZERO_CORNER: '1' });
  assert.equal(result.status, 0);
  assert.equal(summarize(result.rep).status, 2);
});

test('页面运行异常保留失败报告', t => {
  const f = fixture(t);
  const result = f.render([], { TEST_PAGE_ERROR: '1' });
  assert.equal(result.status, 2);
  assert.equal(load(result.rep).status, 'failed');
});

test('无效范围或分片在启动浏览器前拒绝', t => {
  const f = fixture(t);
  const result = f.render(['--shard', '0/0']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /shard/);
});

test('后台启动器为每次运行隔离报告并完整汇总分片', t => {
  const f = fixture(t);
  const wrapper = path.resolve(here, '../render_bg.sh');
  const reportRoot = path.join(f.root, 'reports');
  const args = [wrapper, '2', path.join(f.root, 'logs'), '--', '--wait', '--url', 'http://localhost/film.html',
    '--frames', '0:4', '--out', f.out, '--report', reportRoot, '--overlap', f.cfg];
  for (let i = 0; i < 2; i++) {
    const result = spawnSync('bash', args, { env: f.env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
  const runs = fs.readdirSync(reportRoot);
  assert.equal(runs.length, 2);
  for (const run of runs) {
    const result = summarize(path.join(reportRoot, run), ['--expect-frames', '0:4']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  }
});

test('单个已配置来源零采样不能由其他来源补足', t => {
  const f = fixture(t);
  fs.writeFileSync(f.cfg, JSON.stringify({ text: '.title', ui: '.ui', decor: '.missing-decor' }));
  const result = f.render();
  assert.equal(result.status, 0, result.stderr);
  const summary = summarize(result.rep);
  assert.equal(summary.status, 2, summary.stdout + summary.stderr);
  assert.match(summary.stdout, /decor/);
});

test('显式可缺省来源允许局部诊断', t => {
  const f = fixture(t);
  fs.writeFileSync(f.cfg, JSON.stringify({ text: '.title', ui: '.ui', decor: '.decor', optionalSources: ['decor'] }));
  const result = f.render();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(summarize(result.rep).status, 0);
});

test('缺失投影钩子不被 DOM UI 的采样抵消', t => {
  const f = fixture(t);
  fs.writeFileSync(f.cfg, JSON.stringify({ text: '.title', ui: '.ui', uiRectsHook: '__missing' }));
  const result = f.render();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(summarize(result.rep).status, 2);
});

test('未知可缺省来源在配置阶段拒绝', t => {
  const f = fixture(t);
  fs.writeFileSync(f.cfg, JSON.stringify({ text: '.title', ui: '.ui', optionalSources: ['decorr'] }));
  const result = f.render();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /optionalSources/);
});

test('复杂裁切保持未验证，不会汇总成通过', t => {
  const f = fixture(t);
  const result = f.render([], { TEST_COMPLEX_CLIP: '1' });
  assert.equal(result.status, 2);
  assert.equal(summarize(result.rep).status, 2);
});

test('后台分片失败不汇总成成功', t => {
  const f = fixture(t);
  const reportRoot = path.join(f.root, 'reports');
  const result = spawnSync('bash', [path.resolve(here, '../render_bg.sh'), '2', path.join(f.root, 'logs'), '--', '--wait',
    '--url', 'http://localhost/film.html', '--frames', '0:4', '--out', f.out, '--report', reportRoot, '--corner'],
  { env: { ...f.env, TEST_NO_CORNER: '1' }, encoding: 'utf8' });
  assert.equal(result.status, 2, result.stdout + result.stderr);
  const run = fs.readdirSync(reportRoot)[0];
  assert.equal(summarize(path.join(reportRoot, run)).status, 2);
});
