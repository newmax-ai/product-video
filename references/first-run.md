# 首次运行与支持范围

## 发布定位

本 Skill 面向能够配置本地制作环境的用户与 AI 助手，提供产品视频的制作流程、工程模板与验收工具。发布范围以以下路线说明为准：已验证的流程可以使用，实验性路线和未验证平台明确区分；不承诺安装即出片、所有平台稳定或全自动美术验收。Skill 的发布不等于每条渲染路线都完成生产验证。本 Skill 自有代码与文档采用 Apache-2.0，见根目录 LICENSE / NOTICE；依赖、品牌素材和用户资产各自保留原许可。

| 路线 | 当前边界 |
|------|----------|
| HTML + 本地工具链 | 提供锁定依赖的初始化模板、只读预检和程序化参考工程；参考工程通过托管浏览器导出帧，再本地编码 |
| 独立终端 Playwright | 依赖解析和渲染控制已有回归测试；只能在允许启动浏览器的终端运行，不把托管 Canvas 参考工程验证等同于这条路线完整验证 |
| Three.js / Remotion | 提供独立模板，当前仍为实验性；自动圆角 / DOM 交接适配器未接入，不能冒称通过 |
| NewMax 托管浏览器 | 遵守宿主能力与身份选择；不通过 Bash 或换壳脚本启动外部浏览器。Canvas 参考导出不代表任意 DOM 页面都能批量截图 |
| 系统 | 本轮参考基线在 macOS 验证；Linux、Windows 尚未做完整验收。Windows 原生 shell 不等同于 Bash |

## 1. 环境

- Node.js 最低 22.12，推荐已验证的 Node.js 24 LTS。CDP 使用此版本提供的全局 WebSocket，不支持 Node 18。
- Python 3.10+ 为报告、参考服务器及部分检查所必需；FFmpeg / ffprobe 必需。
- Playwright 依赖与浏览器二进制是两件事。不会在第一次 launch 时自动安装 Chromium。
- Pillow 用于 still_diff / 圆角裁切，librosa（及 numpy）用于音频分析，fontTools 用于字体子集；按所需功能安装。现有音频脚本没有 aubio 替代实现。

## 2. 创建工程

设置 SKILL_DIR 为当前安装的实际绝对路径；PROJECT 选择新目录或空目录，不在 Skill 库内制作视频。

```bash
SKILL_DIR="$HOME/.newmax/skills/product-video"
PROJECT="$HOME/Videos/product-film"
node "$SKILL_DIR/scripts/init_project.mjs" --project "$PROJECT" --route html --install
node "$SKILL_DIR/scripts/preflight.mjs" --project "$PROJECT" --mode managed
```

初始化默认只复制，不联网；加 `--install` 才用 npm 安装。HTML 模板包含 package-lock.json，使用 `npm ci --ignore-scripts`；没有 lock 的实验性模板使用 npm install，安装后把生成的 lock 留在工程中。不覆盖非空目录，不自动升级、安装系统软件、下载或启动浏览器。

已有工程只缺依赖时，在该工程按实际需求安装，不再运行初始化覆盖它。渲染器默认从当前视频工程解析 Playwright，也可显式 `--project "$PROJECT"`。`PW_MODULE` 是高级覆盖项；指定错误会报错，不静默改用另一套安装。

## 3. 选择浏览器路线

**独立终端，且环境允许启动浏览器：**

```bash
npm --prefix "$PROJECT" run install:browser
node "$SKILL_DIR/scripts/preflight.mjs" --project "$PROJECT" --mode html
```

或用 `CHROME` 指向已有浏览器的可执行文件。`preflight` 只检查文件与依赖，不启动浏览器，也不证明 GPU、页面和字体已验证。浏览器下载或证书失败应修复网络 / 证书，不关闭 TLS 校验。存在私有代理时按本机授权配置处理，不把凭据写进工程。

**NewMax 等受限宿主：**

先运行 `--mode managed`，再使用能力目录中的托管浏览器。预检的 pass 只代表本地后处理依赖就绪；托管能力、身份与导出能力仍须实际验证。不能因为预检通过而尝试被宿主禁止的启动方式。

## 4. 可选 Python 扩展

在工程虚拟环境中按需安装，不修改系统 Python：

```bash
python3 -m venv "$PROJECT/.venv"
"$PROJECT/.venv/bin/python" -m pip install Pillow
PYTHON="$PROJECT/.venv/bin/python" node "$SKILL_DIR/scripts/preflight.mjs" --project "$PROJECT" --mode managed --images
```

音频分析安装 librosa（带 numpy），字体处理安装 fonttools，然后分别使用 `--audio` / `--fonts` 预检。上例为 macOS / Linux 路径；Windows 的虚拟环境解释器位置不同，尚未做发布验收。调用 Python 脚本时使用同一虚拟环境解释器，不能检查一套却运行另一套。

## 5. 参考工程全链路检查

HTML 模板是无外部素材、无配乐的 12 秒程序化测试夹具，含输入 / 进度 / 完成状态、真实 Three.js 几何和 3D→2D Canvas 合成。它不是实际产品 UI，也不验证产品 DOM 导出或客户素材许可。

```bash
python3 "$SKILL_DIR/scripts/serve_reference.py" --project "$PROJECT" --out "$PROJECT/capture" --port 4321
```

这条命令只启动本机 HTTP / 帧接收服务，不启动浏览器。通过获准的浏览器打开该服务的 `/film.html`，点击导出按钮；通过 `/selftest.html` 的按钮执行状态和乱序定位自检，不用只读 browser_eval 执行修改动作。`capture.json` 必须为 complete，覆盖 360 帧且源文件 / PNG 哈希匹配后才编码。

```bash
ffmpeg -framerate 30 -i "$PROJECT/capture/f_%05d.png" -frames:v 360 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart "$PROJECT/reference.mp4"
ffprobe -v error -count_frames -show_entries stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames:format=duration -of json "$PROJECT/reference.mp4"
```

预期：H.264、640×360、yuv420p、30fps、360 帧、12 秒，无音轨。再做全片解码、联系表、同帧一致性和视觉检查。不要把参考工程的导出成功包装成任意产品视频的质量保证；把尚未验证的路线写入 CRITIQUE.md。已有导出目录不会覆盖，重跑用新目录并先停止旧服务。
