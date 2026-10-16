import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assertNodeVersion, loadPlaywright, resolveChromium } from '../runtime.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const init = path.resolve(here, '../init_project.mjs');
function temp(t) { const p = fs.mkdtempSync(path.join(os.tmpdir(), 'video-runtime-')); t.after(() => fs.rmSync(p, { recursive: true, force: true })); return p; }
function fake(root) {
  const dir = path.join(root, 'node_modules/playwright'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'playwright', type: 'module', exports: './index.mjs' }));
  const entry = path.join(dir, 'index.mjs');
  fs.writeFileSync(entry, 'export const chromium={launch(){throw new Error("测试不得启动浏览器")},executablePath(){return process.execPath}};');
  return entry;
}

test('环境下限拒绝 Node 18 与旧 Node 22', () => {
  for (const v of ['18.20.0', '20.19.0', '22.11.0']) assert.throws(() => assertNodeVersion(v), /22.12/);
  for (const v of ['22.12.0', '24.22.0']) assert.doesNotThrow(() => assertNodeVersion(v));
});
test('依赖从工程解析而非 Skill 目录', async t => {
  const root = temp(t), entry = fake(root);
  const result = await loadPlaywright({ project: root, override: '' });
  assert.equal(fs.realpathSync(result.entry), fs.realpathSync(entry)); assert.equal(typeof result.api.chromium.launch, 'function');
});
test('工程未安装时给出可执行的初始化提示', async t => {
  await assert.rejects(loadPlaywright({ project: temp(t), override: '' }), /init_project.mjs/);
});
test('显式 PW_MODULE 错误不能回退', async t => {
  const root = temp(t); fake(root);
  await assert.rejects(loadPlaywright({ project: root, override: './missing.mjs' }), /不存在/);
});
test('带空格的文件路径和 file URL 均可使用', async t => {
  const root = temp(t), dir = path.join(root, 'with space'); fs.mkdirSync(dir);
  const entry = fake(dir);
  assert.equal((await loadPlaywright({ project: root, override: entry })).entry, entry);
  assert.equal((await loadPlaywright({ project: root, override: pathToFileURL(entry).href })).entry, entry);
});
test('预检只检查浏览器文件，不调用 launch', async t => {
  const root = temp(t); fake(root);
  const { api } = await loadPlaywright({ project: root, override: '' });
  assert.equal(resolveChromium(api, process.execPath), process.execPath);
  assert.throws(() => resolveChromium(api, path.join(root, 'missing-browser')), /playwright install chromium/);
});
test('初始化创建独立 HTML 工程，不复制 node_modules', t => {
  const root = temp(t), project = path.join(root, 'film');
  const r = spawnSync(process.execPath, [init, '--project', project], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  for (const file of ['film.html', 'film.mjs', 'package.json', 'LICENSE', 'NOTICE']) assert.ok(fs.existsSync(path.join(project, file)));
  assert.equal(fs.existsSync(path.join(project, 'node_modules')), false);
});
test('初始化不覆盖非空目录', t => {
  const root = temp(t); fs.writeFileSync(path.join(root, 'keep.txt'), '保留');
  const r = spawnSync(process.execPath, [init, '--project', root], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.equal(fs.readFileSync(path.join(root, 'keep.txt'), 'utf8'), '保留');
});
test('初始化拒绝写入 Skill 库', () => {
  const r = spawnSync(process.execPath, [init, '--project', path.resolve(here, '../../should-not-exist')], { encoding: 'utf8' });
  assert.equal(r.status, 2); assert.match(r.stderr, /Skill 库/);
});
