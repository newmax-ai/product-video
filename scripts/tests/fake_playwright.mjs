// 仅供脚本生命周期测试的浏览器替身，不渲染图像，不能用于视觉验收。
import fs from 'node:fs';
export const chromium = {
  executablePath() { return process.execPath; }, // 仅测试文件存在性；launch 下方是替身，绝不运行这个文件。
  async launch() {
    return {
      async close() {},
      async newPage() {
        let time = 0;
        return {
          on(event, callback) { if (event === 'pageerror' && process.env.TEST_PAGE_ERROR) callback(new Error('测试页面错误')); },
          async goto() {},
          async waitForFunction() {},
          async addScriptTag() {},
          async evaluate(fn, value) {
            const source = String(fn);
            if (source.includes('typeof window.cornerCheck')) return !process.env.TEST_NO_CORNER;
            if (source.includes('window.cornerCheck()')) return { n: process.env.TEST_ZERO_CORNER ? 0 : 1, flags: [] };
            if (source.includes('window.__overlapCheck')) return { hits: [], unverified: process.env.TEST_COMPLEX_CLIP ? [{ reasons: ['复杂 clip-path'] }] : [], nText: 1, nUi: 1, nDecor: 0,
              sourceSamples: { text: 1, ui: 1, decor: 0, uiRectsHook: 0 } };
            if (source.includes('window.seek(t)')) { time = value; return; }
            if (source.includes('document.fonts')) return;
            throw new Error(`替身不支持的调用：${source}`);
          },
          async screenshot({ path } = {}) {
            const data = Buffer.from(`测试替身帧:${time}:${process.env.TEST_RENDER_VERSION || 'v1'}`);
            if (path) fs.writeFileSync(path, data);
            if (process.env.TEST_SHOT_LOG) fs.appendFileSync(process.env.TEST_SHOT_LOG, `${time}\n`);
            return data;
          },
        };
      },
    };
  },
};
