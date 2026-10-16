// 公共运行时：以视频工程为起点按 Node 规则解析依赖，不再从 Skill 脚本目录隐式查找。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export function assertNodeVersion(version = process.versions.node) {
  const [major, minor] = version.split('.').map(Number);
  if (!Number.isInteger(major) || major < 22 || (major === 22 && minor < 12)) {
    throw new Error(`需要 Node.js 22.12+，推荐 Node.js 24 LTS；当前 ${version}`);
  }
}

export function resolveProjectModule(name, project = process.cwd()) {
  const root = path.resolve(project);
  return createRequire(path.join(root, 'package.json')).resolve(name);
}

export async function loadPlaywright({ project = process.cwd(), override = process.env.PW_MODULE } = {}) {
  assertNodeVersion();
  let entry;
  if (override) {
    // 显式配置错误必须报错；不静默切回其他安装。文件路径含空格或 Windows 盘符也转为 file URL。
    if (override.startsWith('file:')) entry = fileURLToPath(override);
    else if (path.isAbsolute(override) || override.startsWith('.')) entry = path.resolve(project, override);
    else entry = resolveProjectModule(override, project);
    if (!fs.existsSync(entry)) throw new Error(`PW_MODULE 不存在：${entry}`);
  } else {
    for (const name of ['playwright', 'playwright-core']) {
      try { entry = resolveProjectModule(name, project); break; }
      catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
    }
    if (!entry) throw new Error(`视频工程 ${path.resolve(project)} 未安装 Playwright。先运行 init_project.mjs --route html --project <新目录> --install，或在现有工程安装 Playwright；不要在 Skill 库安装。`);
  }
  const module = await import(pathToFileURL(entry).href);
  const api = module.chromium ? module : module.default;
  if (!api?.chromium || typeof api.chromium.launch !== 'function') throw new Error(`模块不是可用的 Playwright：${entry}`);
  return { api, entry };
}

export function resolveChromium(api, executable = process.env.CHROME) {
  const file = executable ? path.resolve(executable) : api.chromium.executablePath();
  if (!fs.existsSync(file)) {
    throw new Error(`没有找到 Chromium：${file}。在允许下载的工程终端运行 npx playwright install chromium，或用 CHROME 指向已安装的浏览器可执行文件。预检不会自动下载或启动浏览器。`);
  }
  fs.accessSync(file, fs.constants.X_OK);
  return file;
}
