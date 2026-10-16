#!/usr/bin/env node
// 只读环境预检：不安装依赖、不下载、不连接 CDP、不启动浏览器。
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { assertNodeVersion, loadPlaywright, resolveChromium, resolveProjectModule } from './runtime.mjs';

const checks = [], warnings = [];
const add = (name, ok, detail) => checks.push({ name, status: ok ? 'pass' : 'blocked', detail });
const command = (exe, args) => spawnSync(exe, args, { encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024 });
try {
  const { values } = parseArgs({ options: {
    project: { type: 'string', default: process.cwd() }, mode: { type: 'string', default: 'html' },
    json: { type: 'boolean', default: false }, images: { type: 'boolean', default: false },
    audio: { type: 'boolean', default: false }, fonts: { type: 'boolean', default: false },
  } });
  if (!['html', 'three', 'managed'].includes(values.mode)) throw new Error('--mode 只能是 html、three 或 managed');
  const project = path.resolve(values.project);
  try { assertNodeVersion(); add('node', true, process.version); }
  catch (error) { add('node', false, error.message); }
  add('project', fs.existsSync(project) && fs.statSync(project).isDirectory(), project);
  if (![22, 24, 26].includes(Number(process.versions.node.split('.')[0]))) warnings.push('未验证此 Node 主版本；优先使用 Node.js 24 LTS。');
  const pythonNames = process.env.PYTHON ? [process.env.PYTHON] : ['python3', 'python'];
  let python;
  for (const exe of pythonNames) {
    const r = command(exe, ['-I', '-c', 'import sys; print(sys.version.split()[0]); sys.exit(0 if sys.version_info >= (3,10) else 2)']);
    if (!r.error && r.status === 0) { python = exe; add('python', true, `${exe} ${(r.stdout || '').trim()}`); break; }
  }
  if (!python) add('python', false, '需要 Python 3.10+；可用 PYTHON 指定可执行文件绝对路径，不包含命令参数。');
  for (const exe of ['ffmpeg', 'ffprobe']) {
    const r = command(exe, ['-version']);
    add(exe, !r.error && r.status === 0, r.error?.message || (r.stdout || r.stderr).split('\n')[0]);
  }
  if (values.mode !== 'managed') {
    const bash = command('bash', ['--version']);
    add('bash', !bash.error && bash.status === 0, bash.error?.message || (bash.stdout || '').split('\n')[0]);
  }
  if (python) {
    const packages = [...(values.images ? [['PIL', 'pillow']] : []), ...(values.audio ? [['numpy', 'numpy'], ['librosa', 'librosa']] : []), ...(values.fonts ? [['fontTools', 'fonttools']] : [])];
    for (const [module, distribution] of packages) {
      const result = command(python, ['-I', '-c', `import importlib, importlib.metadata; importlib.import_module(${JSON.stringify(module)}); print(importlib.metadata.version(${JSON.stringify(distribution)}))`]);
      add(distribution, !result.error && result.status === 0, result.status === 0 ? result.stdout.trim() : `缺少或无法导入 ${distribution}；在工程虚拟环境执行 python -m pip install ${distribution}，设置 PYTHON 为该虚拟环境的解释器。`);
    }
  }
  if (values.mode === 'html') {
    try {
      const { api, entry } = await loadPlaywright({ project });
      add('playwright', true, entry);
      try { add('chromium-binary', true, resolveChromium(api)); }
      catch (error) { add('chromium-binary', false, error.message); }
    } catch (error) { add('playwright', false, error.message); }
    warnings.push('只验证依赖和浏览器文件存在，没有启动 Chromium；宿主是否允许启动仍须单独确认。');
  } else if (values.mode === 'three') {
    for (const name of ['remotion', '@remotion/cli', '@remotion/three', 'three', 'typescript', 'vitest']) {
      try { add(name, true, resolveProjectModule(name + '/package.json', project)); }
      catch (error) { add(name, false, `工程依赖未就绪：${error.message}`); }
    }
    warnings.push('未验证 Remotion 浏览器下载、GPU、字体或完整视频渲染；必须按三维流程另行执行。');
  } else {
    warnings.push('managed 仅验证本地后处理工具；托管浏览器能力、身份和逐帧导出权限由宿主实际验证，本脚本不会探测或启动它。');
  }
  if (process.platform !== 'darwin') warnings.push('当前发布基线仅在 macOS 验证；Linux/Windows 尚无完整发布验收，不声明跨平台稳定。');
  const ok = checks.every(c => c.status === 'pass');
  const result = { scope: 'local-dependencies-only', mode: values.mode, project, status: ok ? 'pass' : 'blocked', checks, warnings };
  if (values.json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const c of checks) console.log(`${c.status === 'pass' ? '通过' : '阻塞'} ${c.name}：${c.detail}`);
    for (const w of warnings) console.log(`边界：${w}`);
    console.log(ok ? '预检通过，仅代表本地依赖就绪，不等于渲染验收通过。' : '预检未通过，请先处理上述阻塞。');
  }
  process.exitCode = ok ? 0 : 2;
} catch (error) { console.error(`预检失败：${error.message}`); process.exitCode = 2; }
