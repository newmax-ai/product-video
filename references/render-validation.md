# HTML 渲染、续跑与报告验收

适用于 `window.seek(t)` + Playwright。Remotion 使用原生渲染器，不能直接调用这些 HTML 脚本冒充其验收。示例在视频工程执行，`SKILL_DIR` 指向实际 Skill 目录；源码、输出、日志都留在视频工程，不在 Skill 库制作视频。

**宿主权限优先**：若 NewMax 禁止 Bash 启动外部浏览器，先通过能力目录使用托管浏览器；有多个身份时由用户选择。本节 CLI 是允许启动浏览器的独立工程终端入口，不是绕过宿主限制的脚本。托管能力不能满足所需逐帧渲染时，如实报告阻塞，不能换壳启动 Playwright，也不能把局部 DOM 测试称为整片渲染通过。

先完成 `first-run.md` 的初始化与依赖预检。`frame_checks.mjs` 从当前视频工程解析 Playwright，也支持 `--project <工程目录>`；`PW_MODULE` 仅作显式覆盖。浏览器二进制需单独准备，不能依赖首次运行自动下载。只读预检与托管参考导出都不替代本节 CLI 路线的实际运行。

## 1. 新渲染 / 修改后重渲

```bash
SKILL_DIR="$HOME/.newmax/skills/product-video"
bash "$SKILL_DIR/scripts/render_bg.sh" 3 logs -- \
  --url http://localhost:4321/film.html --frames 0:1200 --fps 30 \
  --out frames --revision film-v1 --overlap overlap.json --corner
```

- `[0,1200)` 表示 1200 帧；按分镜和最终编码帧数填写，不照抄示例长度。
- 默认覆盖已有目标帧；`--force` 仍可使用，但已不是必要参数。
- 每次启动输出独立的报告目录 `frames/checks/<运行标识>` 和日志目录 `logs/<运行标识>`。若指定 `--report checks`，实际目录为 `checks/<运行标识>`。
- 启动器返回只表示进程已启动；后台可能尚未生成报告或失败。不要立即宣称通过，也不要换用旧目录的报告。
- `--corner` 只用于有空间面板且页面提供 `cornerCheck()` 的项目；否则不启用并记录不适用。请求检查却缺少函数会失败，零采样不能通过。
- `--overlap` 的 text 选舞台文字，不包含 UI 内部合法文字；ui 选内容区域，decor 选装饰。每个已配置来源默认都必须在本次完整范围内至少有一次可见采样；DOM ui 与 `uiRectsHook` 独立计数，不能相互抵消缺失。
- 只配置当前作品真实使用的来源；3D 项目才按实际钩子加入 `uiRectsHook`，示例不预填一个不存在的函数。来源只在某些镜头出现时不要求每帧都有，但全程为零会标未完成。局部诊断确需允许缺省时在 JSON 写 `"optionalSources": ["decor"]` 等精确名称，并在 CRITIQUE.md 说明理由；不能用豁免掩盖选择器拼错。
- 检查器处理视口、矩形 overflow 裁切、无圆角的 `clip-path: inset()` 与隐藏父级中的可见后代。非矩形 clip-path、圆角 overflow、CSS mask 或非轴对齐变换若出现潜在交叠，报告保留 `overlapUnverified`，不能把保守矩形推测当真碰撞或当自动通过。需补精确检查，或单独记录人工验收及其替代范围；自动项仍标未验证，不借 `--handoff-reviewed` 跳过它。
- `seek(t)` 必须等待该帧的纹理、图片与异步状态完成，不能只是设置时间后立即返回。页面加载异常会留下失败报告。

## 2. 同版本中断续跑

```bash
bash "$SKILL_DIR/scripts/render_bg.sh" 3 logs -- \
  --url http://localhost:4321/film.html --frames 0:1200 --fps 30 \
  --out frames --revision film-v1 --overlap overlap.json --corner --resume
```

续跑要求原目录内有渲染清单，源 / 素材版本、URL、画幅、帧率、分片数、范围和检查配置一致，且图片哈希匹配。图片缺失或内容变化会重渲；清单缺失或参数不一致则拒绝复用，去掉 `--resume` 重渲。

**`--revision` 是调用者明确声明的源与素材版本，不是自动扫描出的源码指纹。** 初次渲染就记录它；修改代码、字体、素材或服务端内容后必须更新并重渲，不能只换参数名却沿用缓存。无法确认内容未变时，不续跑。首次检查点前中断可能尚无可用清单，此时重渲；不静默信任已有 PNG。

不要同时向同一帧目录启动不同版本。局部迭代可改 `--frames`，但只对该区间有效，不能把局部报告当成全片报告。

## 3. 完整性与图片绑定

```bash
# 使用启动器本次打印的精确路径；所有分片结束后再作为最终验收依据。
python3 "$SKILL_DIR/scripts/check_report.py" "frames/checks/<本次运行标识>" --expect-frames 0:1200
```

汇总校验运行标识、声明版本、相同参数、全部分片、帧覆盖、启用检查的执行次数及输出 PNG 哈希。报告中途按检查点原子写入，状态为 running；完整结束才变成 complete，错误为 failed。旧版报告不再接受，需重跑。

| 退出码 | 含义 | 能否称验收通过 |
|--------|------|----------------|
| 0 | 声明范围和启用项目通过 | 仅这些项目，不替代视觉 / 真实性 / 声音 |
| 1 | 检查发现违规 | 否 |
| 2 | 未完成、缺报告、失败、混用、缺帧、图片变更或仍待人工交接检查 | 否 |
| 3 | 只渲染，未启用任何质量检查 | 不适用，不算质量通过 |

`--times` 是抽样，只能称抽样检查，不能与全片 `--expect-frames` 混用。最终编码显式限定已验收帧数，防止旧输出目录的额外尾帧被读入；ffprobe 核对编码后成片，并重新正常速度观看。PNG 哈希绑定不是对 MP4 的自动验收。

## 4. 3D → DOM 交接

页面显式定义 `window.__noDOM = false`，并在 seek 中按该开关切换 3D-only / DOM 表现；使用 `--handoff 9.6,16.2`。由第 0 分片生成差分与掩膜，其他分片不重复。

自动差分不证明开关真的改变了画面，也不能判断哪些差异只是抗锯齿。打开每张掩膜与两侧实际帧，记录时间、观察和结论到 CRITIQUE.md。确认后汇总可加 `--handoff-reviewed`；这个参数只是人工检查声明，工具不会自动验证该声明。没看过就保持“未完成”。

## 5. 脚本回归测试

```bash
# 下面两组不启动真实浏览器，渲染器生命周期测试使用明确的替身。
python3 -I -B -m unittest discover -s "$SKILL_DIR/scripts/tests" -p 'test_check_report.py'
node --test "$SKILL_DIR/scripts/tests/frame_checks.test.mjs"
```

真实 DOM 回归页为 `scripts/tests/overlap_browser.html`：通过仅绑定本机的静态服务提供 scripts 目录，在托管浏览器打开该页并读取 `window.testResult`；脚本变动后更新资源版本参数，确认不是缓存旧代码。测试页不访问外网、没有截图或真实账号操作，不把关闭快捷键发给不确定的窗口。

`test_browser_smoke.py` 只用于允许启动 Chromium 的独立终端，不在禁止外部浏览器的宿主中调用。脚本测试不能替代真实视频的画面验收；替身输出、托管 DOM 测试、完整渲染三者分别记录，不混称通过。
