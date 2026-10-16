# 文字动效库

文字是产品视频里出现最多的元素，入场方式决定了片子的气质。一支片子选 2–3 种轮换用，不要全片只有一种（全部淡入 = 「默认脸」）。

位置变化按排版目的用确定性曲线；连续多次改目标时可用 `templates/motion.js` 的 `track()`，稳重标题也可用无过冲关键帧。不要强制所有位移弹簧，文字落定要读稳；详见 `motion-and-type.md`。文字宽度要**测量**，不要按字数估算：

- Remotion：`@remotion/layout-utils` 的 `measureText({ text, fontFamily, fontSize, fontWeight })`，字体用 `delayRender` 等加载完再测。
- 纯 HTML：`document.fonts.ready` 之后用 canvas `measureText`，或渲染隐藏 span 读 `getBoundingClientRect`。
- 同一句里每个词单独成块（中文按 2–4 字一组），词间距取空格宽度（中文取 0.15em）。

## T1 逐词模糊淡入（通用主力）

- 每个词：opacity 0→1，blur 12px→0，translateY 12px→0；400–500ms；词间错开 60–90ms。
- 适合：标题、slogan、说明文字。整句位置固定，不重排。

## T2 句子长大（整句始终居中）

「See → See what's → See what's new」「Unlock → Unlock more → Unlock more with Manus Studio」。句子像被说出来，而不是被贴上去。

- 每个新词从**基线下方偏右**、较小较淡的位置出现（translateY +0.35em、scale 0.8、opacity 0、可带强调色），用无过冲曲线或 `heavy` 到基线并恢复原大小；标题不套用按钮回弹。
- 每加一个词，整句按新宽度重新居中：已出现的词的 x 坐标用 `track()` 叠加，每次加词就追加一个关键帧，向左平移让位。
- 节奏：词间隔 0.25–0.4s 是起点，重点词可落半拍，但不强迫所有词吸拍；最后一个词可晚一点出现，完整句子要留阅读停顿。
- 适合：开场宣告、章节卡、「One More Thing」。

```js
// words[i] = { text, at }；layouts[k] = 前 k+1 个词出现后每个词的居中 x（预先测量算好）
const x = (i, t) => track(t, words.slice(i).map((w, k) => [w.at, layouts[i + k][i]]), SPRINGS.heavy);
```

## T3 句子原地改写

「Remote control → Watch Manus use control → Watch Manus use your computer」「Higher quality → Fewer tokens」。同一个位置连续说出几个卖点，不需要切镜头。

- 前后两句做**词级 diff**（最长公共子序列）：保留的词用 `track()` 滑到新位置；删掉的词 180ms 内上移 + 模糊淡出；新增的词按 T2 的方式长出来。
- 整句按新宽度重新居中，和 T2 一样。
- 改写不超过 3 次；每一版都要是一句完整、能单独成立的话。
- 适合：同一主题的递进（「云端电脑 → 给它一台云端电脑 → 在云端」），两个卖点的对照（「质量更高 → Token 更少」）。

## T4 章节目录滚轮

发布会长片的导航骨架（Manus 2.0）：深色底，左侧固定一个强调色词（「New」/「新」），右侧一列竖排章节名。

- 当前项白色 100%，上下相邻项 45%，再外一层 20%，更远的被上下渐隐遮罩吃掉；行距约 1.25em，字号 64–80px。
- 每次出现滚一格（`default` 弹簧，约 0.4s），停 1–1.5s 后淡出或硬切进章节。
- 左侧固定词和当前项基线对齐；整组在画面中偏左，留出右侧呼吸空间。
- 第一次出现可以停在第一章；最后一次（One More Thing）滚到最后一项。

## T5 手绘圈注 / 下划线

结尾「**You** decide what's worth building」里「You」被手绘圆圈圈住，「power」下面一道闪电形下划线。

- 用 SVG path 画一个略不规整的椭圆（起止点交叠 10–15°，线宽 2–3px，强调色），`stroke-dashoffset` 从全长到 0，350–500ms，ease-out。
- 被圈的词同时换成强调色；下划线变体用一条带一两个折角的手绘线。
- **全片只用一次**，放在最有力的那句话上（通常是结尾价值观句）。用多了就变成装饰。

## T6 问答双行

「Pickup at 7? / **Done.**」：第一行是用户的需求（深色），停一拍后第二行给出结果（强调色）。

- 第二行晚一拍出现，用 T1 或直接硬出；配合画面里同步完成的 UI 结果。
- 适合：展示「一句话就办成」的场景，左字右 UI 的版式。

## 选用建议

| 片子里的位置 | 首选 | 备选 |
|-------------|------|------|
| 开场宣告 | T2 | T1 |
| 章节卡 / 功能名 | T2 | T1 |
| 同一主题连续卖点 | T3 | 连续换镜头 |
| 长片导航 | T4 | HUD 章节标签（小互式） |
| 结尾价值观 | T3 + T5 | T1 |
| hook 里的词接产品 UI | X1 词变成 UI（`scene-library.md`） | 硬切到 UI |
| 需求 → 结果 | T6 | F1 输入 → 输出 |
| 正文说明、slogan | T1 | — |
