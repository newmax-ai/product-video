---
name: product-video
description: "制作混合 2D / 2.5D / 真实 3D 的产品视频：从产品信息、官网或参考片出发，用真实 UI 与素材完成美术方向、分镜、确定性动画、自评和 MP4 交付。适用于宣传片、发布会视频、功能演示、社交短片与官网首屏循环。"
---

# 产品视频（Product Video）

用代码制作产品视频：真实界面、排版、作品与空间场景由确定性渲染器逐帧导出。不做实拍，也不把视频模型生成的片段当主体。**设计不是换色或加特效**：先确定视觉母题、构图、密度、空间、材质、光影和镜头语言，再选 2D / 2.5D / 3D；真实 UI 与结果始终是能力证据。

## 发布定位与首次使用

这是**面向可配置本地制作环境的用户与 AI 助手的产品视频工作流 Skill**，提供制作方法、工程模板和检查工具，不是独立视频编辑器，也不承诺安装即出片。先读 `references/first-run.md`，完成初始化与预检，并按各路线的已验证范围安排制作；实验性入口和未验证平台单独标注，不扩大稳定性承诺。自有脚本 / 模板 / 文档采用 **Apache-2.0**，完整许可与署名见根目录 `LICENSE` / `NOTICE`，不替代第三方依赖和素材授权。

## 环境要求

| 必需 | 用途 |
|------|------|
| Node.js 22.12+，推荐 24 LTS | 脚本及渲染工程；CDP 依赖全局 WebSocket，不支持 Node 18 |
| Python 3.10+ | 检查报告、参考服务器及部分素材处理；不是可选项 |
| ffmpeg / ffprobe | 编码、抽帧、联系表、响度归一 |
| 获准使用的浏览器 | 独立终端需显式安装 Playwright 浏览器或设置 CHROME；受限宿主用托管浏览器 |
| 能看图片的 agent | 逐张查看渲染帧并自评；无法实际试听 / 看视频的项如实标未验证 |

按需扩展：`librosa`（配乐分析，带 numpy；没有 aubio 替代实现）、`fontTools`（中文字体子集）、`Pillow`（静止差分和圆角裁切）。用 `scripts/preflight.mjs` 的 `--audio` / `--fonts` / `--images` 校验对应功能；预检不下载或启动浏览器，不等于渲染验收。HTML 工程用 `scripts/init_project.mjs --route html` 创建，依赖解析基于视频工程而不是 Skill 库；3D / Remotion 路线见 `references/three-workflow.md`，当前完整发布验收仍未完成。

导出真实界面需获准连接产品的调试接口；只有环境允许时才使用独立 CDP。NewMax 等限制外部浏览器的宿主必须走托管入口，不能为采集擅自启动 Chrome 或独立调试端口。

**Remotion 授权**：个人、3 人以内的营利公司和非营利组织可以免费商用；规模更大的营利公司需要购买公司授权（以 remotion.dev/license 为准）。不方便买授权时走纯 HTML + `window.seek(t)` 路线。

## 第 0 步：定片型

先回答：给谁看、在哪里播、多长、有没有配音。定不下来就问用户。

| 片型 | 时长 | 声音与用途 | 片型文件 |
|------|------|-----------|---------|
| 宣传片 | 30–60s | 纯音乐，文字当旁白；官网、投放、获客 | `formats/promo-30-60s.md` |
| 发布会长片 | 90–180s | 音乐为主，可有产品自身音频；多功能、大版本发布 | `formats/launch-film-90-180s.md` |
| 社交竖屏短片 | 15–30s | 音乐或配音；9:16，1 秒内给 hook，按实际投放版位避开平台 UI | `formats/social-vertical-15-30s.md` |
| 功能讲解 | 30–180s | 配音 + 字幕；先定讲解与阅读量，再排音乐和交互 | `formats/explainer-30-180s.md` |
| 首屏循环 | 6–15s | 无声；闭环衔接，不默认落版、CTA 停留或淡黑 | `formats/hero-loop-6-15s.md` |

**规则分层**：真实性、授权、隐私、确定性与如实验收是必须满足的底线；其余默认值按「用户明确约定 → 片型专属规则 → 通用推荐」适用。目录滚轮、惊喜章节、手绘圈注、光扫与特定材质是可选方案，不是验收条件。新片型在分镜注明基于哪种片型及偏离点。

## 工作流（5 步，3 道制作关卡，2 个确认点）

### 1. 收集素材

先读工程里的 `brand-profile.md`：logo、配色、字体、配乐做法和历史否决项；没有就用 `templates/brand-profile.md` 新建。一次问清缺项，不逐条追问：

- 产品名、一句话定位、官网、CTA，目标受众与画幅（默认 1920×1080）。
- 3–4 个能力（长片 3–6 个章节），各用一个动词或短主张概括。
- 官方 logo + 字标（优先仓库 SVG）、品牌字体和配色、产品源码或截图、真实用户作品。
- 可引用数字、证言及出处；没有就不用，不编造。品牌愿景与原则标为主张，不假冒使用效果、测评或用户证据。
- 配乐、素材授权与参考。有官网先抓真实资产；有参考按 `references/reference-intake.md` 拆逐镜头表，明确借鉴与不借鉴项。没有参考就主动问有没有喜欢的片子或画面。

缺项与可用假设列入下面的确认点 1，不新增单独的美术或配乐确认关。

### 2. 美术方向 + 分镜 → **确认点 1**

1. 按 `references/creative-direction.md` 先做 **2–3 个美术方向及各自代表性静帧**，用同一条真实主张 / UI 作对照。每个方向明确视觉母题、构图与密度、空间、材质光影、镜头和节奏；不能只换颜色。可从 `style-presets.md` 起步，不把预设当成片设计。**品牌 / 发布片默认至少一个方向含真实 3D（Three.js）镜头**，不等用户提；不用时写明理由。
2. 分析配乐：`scripts/analyze_music.py` 给 BPM、节拍网格、drop 候选；人工核听首拍与高潮，无法核实时把试听问题并入确认点 1。节拍服务叙事，关键揭示可对齐，阅读停顿与自然 UI 操作不强制吸拍。
3. 用 `templates/storyboard.md` 写主推方向的分镜，镜头从 `scene-library.md`、文字从 `type-motion.md` 挑；逐镜注明 2D / 2.5D / 3D 及其必要性、证据、阅读停留和时间。
4. 每个 UI 交互镜头附状态清单；空间镜头附相机、深度、材质与回到真实 UI 的衔接说明。
5. 将方向静帧、推荐方向、分镜和未定素材 / 配乐一起交给用户，**在既有确认点 1 选择方向并确认方案**。确认后才做整片代码；选中的方向有分镜差异时在同一确认点说明。

### 3. 搭建（按关卡推进）

每道关卡都跑第 4 步的自评再推进：

1. **关键静帧关**：每镜头做代表性一帧，先验构图、密度、可读性、UI 和空间质感。
2. **全片动画关**：补交互、相机、排版与转场；按动作目的选确定性曲线，不为了维持运动而让背景漂移。
3. **配乐与导出关**：核关键节拍、混音，导出各画幅和海报帧。

- **渲染**：Remotion（装了官方 agent skills 就先读；未装可查 remotion.dev 文档），或纯 HTML + `window.seek(t)` + Playwright。禁止实时 CSS transition / setTimeout 驱动；同一帧必须可复现。
- **空间技术**：2D 用于阅读与操作，2.5D 用于轻视差 / 分层，真实 3D 用于需要几何、遮挡、相机与光照的镜头。不是全片 3D，也不是仅旋转平面卡片；具体流程读 `three-workflow.md`。技术模板不代表该镜头已验收。
- **动效**：UI 响应可用 `templates/motion.js` 的闭式弹簧 / `track()`；相机、排版、路径与揭示按目的用确定性缓动、速度曲线或关键帧。细则见 `motion-and-type.md`。
- **视频素材**：Remotion 用 `<OffthreadVideo>`；HTML 先抽 JPEG 序列，`seek(t)` 等图片解码完成再返回。快速运动按需加运动模糊，不能牺牲 UI 清晰度。
- **产品 UI**（详见 `html-ui-rebuild.md`）：能运行就用 `scripts/cdp.mjs` 操作、`export_dom.mjs` 导出真实 DOM 换演示数据，用 `templates/remotion/Captured.tsx` 的 `Cap` 逐帧驱动；只有源码就按 className / token 重建；两者都没有则用 `real-ui-capture.md` 驱动真实产品截状态。
- 有状态切换时导出两端，用 `diff_dom.py` 找所有联动属性一起插值；光标用 `Pointer.tsx`，到位停稳再按下，按下帧即界面反应帧。
- **功能演示**：优先放大要讲的真实组件；整体窗口可交代上下文，但不能让缩小的细字承担阅读。分别检查成片字号（1080p 正文 18px 可作起点）、素材分辨率与实际投放尺寸下的阅读结果，不能用原生 1× 或高分辨率贴图代替可读性验收（量法见 `qa-checklist.md`）。输入、悬停、点击、进度、结果需与状态清单一致；空间段之后回正视 UI 承载细字和关键操作。
- **产品主题**：使用产品自带且符合选定方向的主题；DOM 路线可保留壁纸，截图拆组件时可为干净边缘使用产品纯色主题，记录采集处理。用灰度联系表核对主次，投影可辅助空间接触，不能独自承担分离。
- **长渲染**：HTML seek 路线用 `scripts/render_bg.sh` 后台分片；默认重渲已有帧，每次报告和日志使用独立运行目录。仅同一源/素材版本及参数可显式 `--resume --revision <版本>` 续跑；版本由调用者声明，不是自动源码指纹。改动后更新版本并去掉 `--resume`；局部迭代只渲受影响段，最终完整重渲。具体命令与状态判定见 `references/render-validation.md`；Remotion 使用其原生渲染入口，不能直接套用 HTML 脚本。
- **多画幅**：布局是画布宽高的函数，同时间轴重新排版而不是裁切。同品牌下一支片可在旧工程加新合成，复用资产与渲染器。

### 4. 渲染 + 自评循环

必须真的打开渲染帧。按 `references/qa-checklist.md`：每镜头抽 3 帧及切点帧；看黑白缩略图、整片联系表、参考并排；动画关以正常速度有声和静音各看一遍。按可读、证据、还原、构图、空间材质、节奏衔接六项打分，写最差 3 个具体问题，改后重渲。全部适用项 ≥ 8 才交付；连续两轮不升则如实交出剩余问题，不宣称通过。每轮追加工程 `CRITIQUE.md`。

以下命令在**视频工程目录**执行；`SKILL_DIR` 指向实际 Skill 安装目录，不要为找脚本切进 Skill 库。HTML CLI 渲染仅用于允许启动浏览器的独立工程环境；若宿主限制浏览器生命周期，先按 `render-validation.md` 使用托管入口，能力不足时报告阻塞，不绕过限制。

```bash
SKILL_DIR="$HOME/.newmax/skills/product-video"
bash "$SKILL_DIR/scripts/contact_sheet.sh" out/video.mp4
bash "$SKILL_DIR/scripts/scene_cuts.sh" out/video.mp4
python3 "$SKILL_DIR/scripts/still_diff.py" out/video.mp4 --from 12.5 --to 13.5
# HTML seek 路线（独立工程终端）：按完整帧范围运行已配置的检查。
bash "$SKILL_DIR/scripts/render_bg.sh" 3 logs -- --url http://localhost:4321/film.html --frames 0:1200 --out frames --revision film-v1 --overlap overlap.json --corner
# 启动不等于完成；只汇总本次运行目录。新版本报告增加逐来源校验，旧报告需重跑。
python3 "$SKILL_DIR/scripts/check_report.py" "frames/checks/<本次运行标识>" --expect-frames 0:1200
# 无空间面板时不加 --corner 并记录不适用；交接差分和复杂裁切的待验证项不能自动通过。
```

最后过通用清单与片型专属项；3D 还要验空间关系、材质光影、镜头意图、清晰度和回 UI 衔接。

### 5. 交付 → **确认点 2**

交付约定画幅 MP4、海报帧、联系表、分镜和 `CRITIQUE.md`；工程留 README（改文案、重渲、字体子集），新增否决项写回 `brand-profile.md`。反馈聚焦镜头、字、节奏与画面，通常 1–3 轮收敛。

## 通用铁律

1. **确定性**：同帧两次一致，资源、字体、随机种子与空间状态受控。
2. **真实素材与证据**：官方 logo 不重画；数字、证言、客户 logo、作品有出处；品牌主张不是证据。作品数量不能凭重复摆放伪造。
3. **真实 UI**：用 DOM / 源码重建或真实状态捕获，不凭印象画、不用截图淡变叠重影。
4. **开场有内容**：首帧非空，前 3 秒有明确钩子，4–8 秒内认出产品；不强迫首帧运动。
5. **能力给证据**：能力镜头展示真实 UI / 结果 / 有来源图表；纯文字用于开场、导航、品牌原则与结尾，不冒充效果证明。
6. **有意节奏**：展示、变化、阅读停顿有分工；关键切点可吸拍，操作因果和可读性优先。
7. **统一视觉系统**：共享母题、字体、颜色和材质角色，允许有理由的明暗与密度变化；不重复同一种构图。
8. **选择维度**：2D / 2.5D / 3D 为镜头目的服务，不全片强上 3D、不只做卡片转动、不加无意义特效。
9. **看过再交付**：静帧和正常速度自评都有记录；问题未解决必须标注。
10. **授权与克制**：默认用授权成品配乐（也可用许可范围内的 GarageBand Apple Loops 编排）；非明确要求不程序合成音乐。字体、图片、音效、模型与纹理都核授权。避免默认渐变居中字、装饰性霓虹 / 粒子爆炸 / RGB 分离 / 镜头抖动；标题不打字机、不炫技翻转。必要的材质反射与灯光不能以“禁特效”为由省掉。
11. **线不压字**：非内容性的装饰不得遮挡文字或 UI；区分舞台标题、UI 容器和 UI 内部合法文字。HTML 路线配置 `--overlap` 并覆盖完整帧范围，零违规且检查有效才通过；空报告、零有效采样、缺检查不能通过。其他渲染路线实现等价检查或如实标未验证。
12. **转场有内容关系**：不用无信息的卡片滑动 / 淡变充当全片唯一转场。按叙事选硬切、匹配剪辑、相机运动或光揭示；复杂不等于高级，不能为避开简单转场而强上 3D。
13. **主次与停留有目的**：阅读时保持清晰焦点；亮主体、短暗场、剪影按方向选择，不把“每时每刻最亮”作为硬门槛。宣传片落版完整停 3–4 秒可作起点；循环片无默认落版或淡黑，时长服从约定。

## 文件索引

| 文件 | 何时读 |
|------|--------|
| `references/first-run.md` | 首次初始化、预检、浏览器路线、许可及发布边界 |
| `scripts/init_project.mjs` / `preflight.mjs` / `runtime.mjs` | 新工程创建、只读预检、工程级依赖解析 |
| `templates/html/` / `scripts/serve_reference.py` | 锁定依赖的 12 秒程序化参考工程、托管浏览器帧接收 |
| `LICENSE` / `NOTICE` | Apache-2.0 正文、版权署名与第三方边界 |
| `formats/*.md` | 片型骨架、时长与专属检查 |
| `references/creative-direction.md` | 2–3 个方向、代表静帧、视觉母题与设计诊断 |
| `references/style-presets.md` | 视觉系统起点，不只取配色 |
| `references/scene-library.md` | 2D / 2.5D / 空间镜头配方 |
| `references/three-workflow.md` / `templates/three/` | 真实 3D 工程入口、资产、相机、确定性与渲染验证 |
| `references/type-motion.md` / `motion-and-type.md` | 文字、排版、目的驱动的曲线、配乐与模糊 |
| `references/reference-intake.md` / `case-studies.md` | 参考拆解、逐秒案例 |
| `references/html-ui-rebuild.md` / `real-ui-capture.md` | 真实 UI 导出、重建、状态捕获与配乐选材 |
| `references/qa-checklist.md` | 静帧、联系表、正常速度和空间验收 |
| `references/render-validation.md` | 新渲染 / 续跑、独立报告、完整覆盖、退出码与交接人工验收 |
| `templates/storyboard.md` / `brand-profile.md` | 方向与分镜、状态表、品牌与否决项 |
| `templates/motion.js` | `spring` / `track` / 可选 `snapToBeat` |
| `templates/remotion/Captured.tsx` / `Pointer.tsx` | 真实 UI 与跟手光标 |
| `templates/export/` | DOM 导出配置示例 |
| `templates/checks/overlap.example.json` | 重叠检查配置（文字 / UI / 装饰选择器，3D 面板投影框钩子） |
| `scripts/contact_sheet.sh` / `scene_cuts.sh` | 联系表与切点 |
| `scripts/analyze_music.py` | BPM、节拍与高潮候选、音效峰值 |
| `scripts/cdp.mjs` / `export_dom.mjs` / `diff_dom.py` | 产品操作、真实 DOM 与状态差异 |
| `scripts/still_diff.py` | 停留抖动与同帧确定性 |
| `scripts/frame_checks.mjs` / `render_bg.sh` / `check_report.py` | seek 逐帧渲染（nohup 分片续跑）+ 重叠 / 圆角 / 交接检查与汇总 |
| `scripts/overlap_check.js` / `corner_check.mjs` / `corner_crops.py` | 重叠检查（页内）、3D 圆角漏边检查与共用圆角几何、圆角 200–400% 裁切表 |
