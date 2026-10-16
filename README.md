# Product Video

**用真实界面、明确的美术方向和可重复的动画，制作产品视频。**

Product Video 是供 AI 助手使用的 Skill，包含制作方法、工程模板与检查工具。从产品定位、真实 UI 和参考片出发，先选方向、定分镜，再完成 2D / 2.5D / 按需真实 3D 动画、渲染、自评及 MP4 交付。

它不是独立视频编辑器，也不是安装即自动出片的在线服务。适合能够配置本地制作环境的产品团队、独立开发者和创作者。

## 能做什么

- **先设计再制作**：用 2–3 个方向及代表性静帧比较构图、密度、空间、材质和镜头，不只是换配色。
- **用真实界面讲能力**：从 DOM、源码或真实状态捕获出发，交互、结果和主张一一对应，不把模拟成功当产品证据。
- **按镜头选择维度**：2D 承担阅读与操作，2.5D / 3D 表达确有必要的层次与空间，不强迫全片使用同一种拍法。
- **可重复渲染与检查**：按绝对时间驱动画面，提供逐帧输出、显式续跑、逐类重叠检查、报告完整性和输出哈希校验。
- **保留可修改工程**：按约定交付 MP4、海报帧、联系表、分镜及自评记录，方便后续改文案与重渲。

## 五种片型

| 片型 | 建议时长 | 用途 |
| --- | --- | --- |
| 宣传片 | 30–60 秒 | 官网、获客、投放 |
| 发布会长片 | 90–180 秒 | 新版本、多功能发布 |
| 社交竖屏短片 | 15–30 秒 | 9:16 社交传播 |
| 功能讲解 | 30–180 秒 | 配音、字幕与操作演示 |
| 首屏循环 | 6–15 秒 | 无声、首尾闭环的官网展示 |

## 安装

仓库根目录即 Skill 根目录，入口为 `SKILL.md`。

### NewMax

向助手发送：

```text
安装这个 Skill：https://github.com/newmax-ai/product-video
```

通过 Skill 安装器完成安装，不要把视频工程或依赖写进 Skill 库。

### 其他支持 Skill 的 AI 助手

使用宿主提供的 Git 仓库安装功能，来源填写本仓库地址；若宿主支持 `.skill` 文件，可下载 [Releases](https://github.com/newmax-ai/product-video/releases) 中的 `product-video.skill`。具体安装目录和启用方式以宿主说明为准。

需要浏览源码或参与开发时：

```bash
git clone https://github.com/newmax-ai/product-video.git
cd product-video
```

克隆仓库不等于已在 AI 助手中启用 Skill。

## 开始制作

安装后可对助手说：

```text
用 product-video 为我的产品制作一支 30 秒宣传片。
目标受众是独立开发者，画幅 16:9。
我会提供官网、真实界面和品牌素材。
请先给出美术方向和代表性静帧，确认后再做整片。
```

流程：收集素材 → 美术方向与分镜确认 → 关键静帧 → 全片动画 → 配乐与导出 → 自评与交付确认。

首次使用请阅读 [首次运行与支持范围](references/first-run.md)。完整工作流见 [SKILL.md](SKILL.md)。

### 必需环境

- Node.js **22.12+**，推荐 24 LTS。
- Python **3.10+**。
- FFmpeg / ffprobe。
- 宿主允许使用的浏览器；独立终端的 Playwright 浏览器需显式准备，受限宿主使用获准的托管浏览器。
- 能查看渲染图片的 AI 助手；无法实际试听或观看的项目必须如实标为未验证。

Pillow、librosa、fontTools 为按功能安装的扩展，见首次运行文档。

以下是 macOS / Linux 的初始化示例。`SKILL_DIR` 应改为实际安装目录，`PROJECT` 必须是新目录或空目录：

```bash
SKILL_DIR="$HOME/.newmax/skills/product-video"
PROJECT="$HOME/Videos/product-film"
node "$SKILL_DIR/scripts/init_project.mjs" --project "$PROJECT" --route html --install
node "$SKILL_DIR/scripts/preflight.mjs" --project "$PROJECT" --mode managed
```

`--install` 会安装工程依赖；预检不会下载或启动浏览器。`managed` 模式只检查本地后处理环境，不证明托管浏览器可用。独立终端的浏览器准备步骤及参考工程导出方式见 [首次运行文档](references/first-run.md)。

## 已验证范围与边界

截至 2026-10-16：

| 项目 | 状态 |
| --- | --- |
| macOS HTML 程序化参考流程 | 已完成初始化、依赖安装、托管浏览器帧导出和本地编码验证 |
| 参考视频 | 12 秒、640×360、30fps、360 帧；是程序化验收夹具，不是真实产品案例 |
| 报告、渲染控制、初始化、参考服务器 | 已有脚本回归测试 |
| 独立终端 Playwright | 依赖解析与渲染控制已有测试；不将托管参考导出等同于此路线完整验收 |
| Three.js / Remotion 模板 | 实验性；自动圆角 / DOM 交接适配器未接入 |
| Linux / Windows | 尚未完成全流程验收；部分命令使用 Bash，不能直接等同于 Windows 原生 shell |
| 任意真实产品 DOM 全流程 | 不由程序化 Canvas 参考工程证明，需按项目验证 |

自动检查不代替美术验收。复杂裁切、真实 UI 还原、阅读节奏、素材授权及最终视觉效果仍需人工确认；缺检查、无有效采样或未验证项不能冒充通过。

## 仓库结构

```text
SKILL.md       工作流入口
formats/       五种片型的节奏与验收规则
references/    美术方向、真实 UI、动效、空间与验收指南
scripts/       初始化、预检、采集、渲染及报告工具
scripts/tests/ 脚本回归与浏览器测试夹具
templates/     品牌、分镜、HTML、Remotion 和 Three.js 模板
LICENSE        Apache-2.0 许可正文
NOTICE         署名与第三方许可边界
```

## 开发与验证

以下命令在仓库根目录执行。它们运行不启动真实浏览器的脚本回归测试；渲染控制测试使用测试替身，不代表完整浏览器或成片验收。

```bash
node --test scripts/tests/runtime.test.mjs scripts/tests/frame_checks.test.mjs
python3 -I -B -m unittest discover -s scripts/tests -p 'test_check_report.py'
python3 -I -B -m unittest discover -s scripts/tests -p 'test_reference_server.py'
```

真实浏览器检查和完整渲染遵循 [渲染与验收指南](references/render-validation.md) 及宿主权限。请勿为了通过测试绕过浏览器限制。

反馈问题时请附系统、Node / Python 版本、渲染路线、复现步骤和已脱敏日志，不要上传令牌、客户数据或无权再分发的素材。

## 许可

自有脚本、模板和文档采用 **Apache-2.0**，Copyright 2026 Jay。详见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。

第三方依赖、商标、参考案例、音乐、字体、图像、模型及用户资产遵循各自许可。此仓库的许可不替代 Remotion 等依赖的授权；采用相关路线前应核对其官方许可。
