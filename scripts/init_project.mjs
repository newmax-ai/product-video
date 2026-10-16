#!/usr/bin/env node
// 在空目录创建视频工程。默认不联网；--install 才安装 npm 依赖，不安装或启动浏览器。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { assertNodeVersion } from './runtime.mjs';

try {
  assertNodeVersion();
  const { values } = parseArgs({ options: {
    project: { type: 'string' }, route: { type: 'string', default: 'html' },
    install: { type: 'boolean', default: false }, help: { type: 'boolean' },
  } });
  if (values.help) {
    console.log('node init_project.mjs --project <新目录> --route html|three [--install]');
  } else {
    if (!values.project || !['html', 'three'].includes(values.route)) throw new Error('需要 --project <新目录>，--route 只能是 html 或 three');
    const target = path.resolve(values.project);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    // 防止把工程写入 Skill 自己或经符号链接回到 Skill 库。
    let existing = target;
    while (!fs.existsSync(existing)) existing = path.dirname(existing);
    const resolved = path.resolve(fs.realpathSync(existing), path.relative(existing, target));
    if (resolved === root || resolved.startsWith(root + path.sep)) throw new Error('工程不能创建在 Skill 库内');
    if (fs.existsSync(target) && (!fs.statSync(target).isDirectory() || fs.readdirSync(target).length)) throw new Error('目标必须是新目录或空目录；不会覆盖已有工程');
    fs.mkdirSync(target, { recursive: true });
    const template = path.join(root, 'templates', values.route);
    for (const name of fs.readdirSync(template)) {
      fs.cpSync(path.join(template, name), path.join(target, name), { recursive: true, errorOnExist: true, force: false });
    }
    for (const file of ['LICENSE', 'NOTICE']) fs.copyFileSync(path.join(root, file), path.join(target, file), fs.constants.COPYFILE_EXCL);
    console.log(`已创建 ${values.route} 工程：${target}`);
    if (values.install) {
      const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      const command = fs.existsSync(path.join(target, 'package-lock.json')) ? 'ci' : 'install';
      const result = spawnSync(npm, [command, '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: target, stdio: 'inherit', shell: false });
      if (result.error || result.status !== 0) throw new Error(`依赖安装未完成，工程已保留：${result.error?.message || result.status}。请检查网络/证书，不关闭 TLS 校验；在该目录重新运行 npm ${command} --ignore-scripts。`);
    }
    console.log('下一步：在该工程运行 preflight.mjs。Chromium 需显式安装或使用 CHROME；受限宿主使用托管浏览器，勿通过脚本绕过。');
  }
} catch (error) {
  console.error(`初始化失败：${error.message}`);
  process.exitCode = 2;
}
