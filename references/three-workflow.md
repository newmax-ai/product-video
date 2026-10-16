# 真实 3D 制作：空间镜头与可复现渲染

## 1. 先选维度，不先堆依赖

- 读细字、演示真实操作、比较结果：保留 DOM / React 2D。
- 轻透视、平面分层、少量视差：用 CSS 2.5D。
- 需要厚度、真实遮挡、材质反射、光照或空间相机：使用本文件与 `templates/three/`。
- 不把 Three.js 当全片默认选项；至少说明这个镜头为什么需要空间。镜头配方见 `scene-library.md` G1–G4，美术方向见 `creative-direction.md`。品牌 / 发布片在美术方向阶段默认考虑真实 3D 镜头（亮相、转场、落版），不必等用户提出。
- 纯 HTML + `seek(t)` 也能用 Three.js：importmap 加载、`preserveDrawingBuffer: true`，无 GPU 机器用 Chrome `--use-angle=swiftshader --enable-unsafe-swiftshader`；所有状态由 t 的纯函数给出。

## 2. 从可运行模板起步

`templates/three/` 是实验性的独立 Remotion 工程模板；当前没有完整发布验收，不因 HTML 参考工程通过就称此路线可稳定交付。不要在 Skill 库内运行 npm install 或渲染；可用 `scripts/init_project.mjs --route three --project <新目录> --install` 创建并复制许可。它要求 Node.js 22.12+，推荐 24 LTS；直接依赖版本见 package.json，安装后保留生成的 lock。所有 Remotion 包必须同版本。模板无需额外图片、HDR 或模型，内置三种材质方向和固定程序化灯光。独立 CLI 只能在允许启动浏览器的环境运行。

```bash
# 仅在允许独立浏览器启动的工程终端执行；PROJECT 选择新目录。
SKILL_DIR="$HOME/.newmax/skills/product-video"
PROJECT="$HOME/Videos/product-spatial"
node "$SKILL_DIR/scripts/init_project.mjs" --project "$PROJECT" --route three --install
cd "$PROJECT"
node "$SKILL_DIR/scripts/preflight.mjs" --project "$PROJECT" --mode three
npm run typecheck
npm run test:coverage
npm run studio
npm run still
npm run render
npm run render:portrait
```

- `SpatialDemo`：1280×720，30fps，12 秒。
- `SpatialPortrait`：720×1280，同一时间轴重新布局，不是横版裁切。
- `SpatialDemo` 接受 `theme`：warm-studio / dark-metal / paper-object。CLI 可用 `--props='{"theme":"dark-metal"}'`。
- 本模板默认仅演示体积、分层、空间陈列与相机正视落定；面板、陈列件均是标注的程序化示意内容，不代表真实产品、用户量或产出。不能直接换 logo 就交付成片。

## 3. 模板职责

| 文件 | 用途 |
|------|------|
| ProductStage.tsx | ThreeCanvas、几何分层、物理材质、固定灯光 / 环境反射、示意陈列 |
| CameraRig.tsx | 从绝对时间采样相机位置、观察点与视角，在捕帧前更新矩阵 |
| timeline.ts | 有界缓动、相机关键帧、稳定散布、镜头阶段，纯函数且支持跳帧 |
| presets.ts | 暖摄影棚 / 深色金属 / 纸质主体的材质配色角色与示例相机路径 |
| SpatialDemo.tsx | 独立 DOM 排版层、横竖版布局与示意标记 |
| Root.tsx / index.tsx | 示例合成注册与入口 |
| tests/timeline.test.ts | 时间边界、非法参数、跳帧倒序、固定随机、风格预设测试 |

复制模板后重做构图、材质与几何。位置 / 大小、灯光与相机不能因为已经给出预设就跳过静帧审核；替换真实 UI、logo、模型、纹理时需要重新测。

## 4. 资产、材质与灯光

- 主体先用清晰轮廓和厚度；材质至少区分主体外壳、内容表面和强调件，避免全玻璃或全金属。
- 先调几何、粗糙度、主光、补光、轮廓光与环境反射，再考虑景深、折射、辉光和后期。模板不默认开景深、Bloom 或折射，避免降低 UI 清晰度与增大渲染成本。
- 模板的环境来自固定 Lightformer，一次捕获，不依赖 CDN preset。若改 HDR，保存经授权的本地文件，记录授权、尺寸、色彩空间与来源；产品色彩不要因色调映射失真。
- glTF、纹理、字体、视频与 HDR 的解码 / 加载要纳入 Remotion 的等待机制；完成之后才允许捕帧。资源失败显式报错，不能静默出空白。
- 加载真实屏幕纹理时标注正确色彩空间；在手机投放尺寸检查文字和图标。动态视频用官方逐帧视频纹理方案，不用普通 video.play()。

## 5. 时间与确定性

以 `t = useCurrentFrame() / fps` 为唯一叙事时钟。UI 弹簧可用现有 motion.js；相机按目标与路径使用确定性曲线。

**禁止作为动画时钟**：requestAnimationFrame、Date.now、performance.now、实时 clock.elapsedTime、累加 delta、无种子的 Math.random、事件触发的累积变换。不要原样搬入使用实时 useFrame 的漂浮、相机摇晃或物理示例。

- 从 t 直接算位置、旋转、Shader uniform、粒子位置与相机矩阵；Shader 可设 `uTime = t`，不是禁用 Shader。
- 物理模拟需固定时间步并烘焙，或在给定时间从初始条件可复现计算，不依赖上一次定位。
- Drei 工具逐个检查：RoundedBox 等静态几何可用；实时 Float、随机或累积阴影不可默认照搬。测试一次截图不等于整个时间轴都确定。
- 环境 / 阴影采用固定配置；跨 GPU 不承诺逐像素相同。首先在同一环境核验同帧一致，容差如有必要必须明示。
- 生产渲染先使用 WebGL，CLI 指定 `--gl=angle`；程序化渲染 API 显式设置 chromiumOptions.gl。不要把不同 GPU 选项在同一次比较中混用。

## 5.5 面板（窗口 / 卡片）几何铁律

UI 面板做成「正面 + 机身」的厚板时：

- **一个轮廓**：正面、机身正面、投影共用同一个圆弧圆角矩形（`scripts/corner_check.mjs` 的 `rrShape`），半径 = DOM 的 border-radius ÷ 每单位像素。不用二次贝塞尔近似圆角；不用半径受厚度限制的 RoundedBox（r > d/2 时圆角会变小，四角露机身）。
- **机身内缩**：机身背面按精确圆角内缩（`insetBodyGeometry`），侧壁向内收；正视时透视无论偏到哪一侧，机身都不会投影到正面轮廓外。
- **侧壁按材质角色选择**：不出现意外的蓝紫 / 橙色漏边。中性、不受光的 MeshBasic 侧壁是修色边的一种方案，不是所有空间镜头的强制材质；有设计依据的受光材质可保留，但不能伪装几何漏边，需单独看圆角裁切。自动 COLOR 对有意材质色的提示不得静默忽略，应调整检查适用范围并记录人工证据。
- **贴图四角**：正面贴图四角填面板自己的底色，不留透明或黑色；裁切由几何负责。
- **检查按渲染路线分开**：HTML seek 页面可挂载 `cornerCheck()`，用 `frame_checks.mjs --corner` 逐帧检查，要求有效采样且 FRONTAL / COLOR 为 0，再看 200–400% 圆角裁切。Remotion 用原生逐帧输出，在相同时间点检查面板四角、投影与颜色；本 Skill 尚未提供 Remotion 的自动圆角适配器，人工检查记录与自动检查状态必须分开，不能直接调用 HTML 脚本或把未接入项称为通过。

## 6. 3D 回到真实 UI（G4）

空间模板不是 DOM 自动转 3D 的转换器，尚不包含特定产品的 G4 衔接；作者必须用实际 UI 实现并验收。

1. 用 cdp / export_dom 导出真实界面状态；保留 Cap 和 Pointer 作为正视阅读 / 操作层。
2. 将该状态的高分辨率静帧或逐帧纹理放入空间屏幕，或用 ProductStage 的 face 参数传入自定义 R3F 几何 / 纹理表面。face 必须是 R3F 节点，不能直接塞 DOM div。
3. 相机落定到正视，逐帧测屏幕四角投影、内容区域、圆角、色彩和可见状态；不是凭估计写个相同宽度。
4. 用投影结果定位 DOM 层，在二者完全匹配的一帧替换。不要长时间叠加两张含文字 / 阴影的画面。
   - 正视落点用公式算，不靠调：距离 D = H / (2·tan(fov/2)·ppu)，相机 x = X − (cx − W/2)/ppu，y = Y + (cy − H/2)/ppu，相机正对 −z；贴图按落点缩放渲染，让纹素与屏幕像素 1:1。
   - DOM 层在产品原生视口里挂载（例如 1440×900 的 iframe 再 CSS zoom），否则 vh / 断点会错；裁切容器圆角 = r·ppu，与 3D 正面同一个圆角。
   - HTML seek 路线用 `frame_checks.mjs --handoff <t>` 输出差分；Remotion 在同一绝对帧、同一画幅下分别输出受控的 3D-only 与 DOM 两个版本，再比较原图和差分。不要对 Remotion 预览页直接调用 `window.seek` 检查器。本 Skill 尚无 Remotion 自动交接适配器，记录实际输出与人工结论，未接入的自动项保持未验证。只有确认差异限于文字抗锯齿且没有位置 / 圆角 / 状态跳变，才能接受；不能仅凭像素数判通过。
5. 随后用真实 DOM 完成点击、输入、菜单与结果。禁止以示意面板冒充能力演示。

## 7. 最小渲染验收

先跑单元测试和 typecheck，再渲染入场、分层最大、正视落定、陈列和结束的静帧；横竖版至少各一张，所有材质方向至少各一张。检查遮挡、主次、文字、阴影和真实 UI 状态。

- 同帧从新进程渲染两次；在批量捕帧中按乱序定位后再渲染同一帧，比对输出。
- 长片先实测目标环境的单帧耗时。HTML seek 路线可用 `scripts/render_bg.sh` 后台分片，按 `render-validation.md` 显式续跑并校验本次完整报告；Remotion 模板使用其原生渲染入口与日志，不能把 HTML 启动器当通用替代。
- 渲染一段含相机 / 分层变化的短片；正常速度有声（有音乐时）和静音观看，不能仅看海报帧。
- 记录帧率、分辨率、时间、渲染耗时和 GPU 配置；预览通过不代表新素材和正式成片通过。
- 无意义遮挡、难读 UI、材质发黑、空纹理、阴影抖动或衔接跳变没有解决时，不把空间镜头标为验收通过。

官方接口核查入口（升级依赖时重新核对）：
- Remotion Three 集成：`https://www.remotion.dev/docs/three`
- ThreeCanvas 与绝对帧：`https://www.remotion.dev/docs/three-canvas`
- Drei Environment：`https://drei.docs.pmnd.rs/staging/environment`
