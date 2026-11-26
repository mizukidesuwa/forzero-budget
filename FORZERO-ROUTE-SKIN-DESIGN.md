# FORZERO 路线代码与骑手皮肤设计方案

## 文档状态

- 状态：2.3.1 已实现并持续验收
- 目标版本：2.3.1
- 本文范围：路线代码、标准骑手皮肤、图片识别导入、联机兼容和验证边界
- 当前动作：本文作为已实现模块的契约、创作规范和验证留痕，代码入口见下文

## 1. 设计结论

路线代码和骑手皮肤可以加入当前架构，前提是保持三个层次彼此独立。

```text
路线代码  -> 标准 RouteRef -> 现有 Course Event -> 各种比赛模式
皮肤 ID   -> 标准 SkinSpec -> RiderSkinRig  -> 玩家 / Ghost / 联机骑手
模式规则  -> ModeSpec     -> 追捕 / 盲区导航 / 路权争夺
```

路线代码只回答路线如何重建，皮肤只回答骑手如何显示，模式只回答比赛如何运行。三者不互相复制字段，也不进入对方的物理和成绩规则。

图片识别适合作为离线创作工具。玩家把参考图和本文件的强约束提示词交给外部 AI，AI 输出受约束的 `SkinModelSpec` JSON/ModelFile。运行时只加载通过校验的声明式图元规格，原图、图像识别模型、外部 URL 和 AI 生成脚本都不进入游戏。

## 2. AGENTS.md 约束映射

| 约束 | 设计落实 |
|---|---|
| 参数和规则进入 `src/data/` | 路线上限、网络版本、皮肤枚举、比例范围和面数预算进入数据模块 |
| 纯函数和依赖注入 | 路线编码、解析、重建、皮肤发射器均使用纯接口，地图查询通过参数传入 |
| 避免膨胀 `src/ui/app.js` | UI 只负责选择和显示，路线与皮肤逻辑留在 `src/race/`、`src/world/`、`src/ride/` |
| 程序化资产独立 | 骑手皮肤使用 `src/ride/` 下的独立发射器，地图资产仍遵循 `src/world/assets/` 规范 |
| 客户端与服务端一致 | 路线身份、皮肤白名单和版本字段在客户端与 `szu-litchi-dev/online/` 同步校验 |
| 不增加一级菜单 | 皮肤入口复用车库，路线入口复用现有种子、友人对战或联机发车区 |
| 变更后必须验证和留痕 | 实现时运行定向验证，并更新 `FORZERO-WORK-GUIDE.md` 和 `CHANGELOG.md` |

## 3. 路线代码模块拆分

### 3.1 已实现模块

```text
src/data/routes.js
src/race/route-code.js
src/race/route-key.js
src/world/route-resolver.js
src/world/route-validation.js
szu-litchi-dev/online/route-rules.cjs
```

### 3.2 模块职责

| 模块 | 责任 | 依赖边界 |
|---|---|---|
| `src/data/routes.js` | 路线版本、网络版本、边数和长度上限、代码长度上限 | 静态数据，不读运行时状态 |
| `src/race/route-code.js` | 编码、解码、校验、规范化 | 纯函数，不读地图和 DOM |
| `src/race/route-key.js` | 生成标准 `layout`、环境键和 Ghost 兼容键 | 只接收规范化路线和事件 |
| `src/world/route-resolver.js` | 从路线描述重建现有 `Course Event` | 通过参数接收道路网络和课程数据 |
| `src/world/route-validation.js` | 检查道路连接、方向、长度、路面和安全性 | 通过参数接收地图查询，不修改地图 |
| `online/route-rules.cjs` | 服务端路线白名单、版本和房间输入校验 | 不生成客户端模型，不操作 DOM |

### 3.3 标准 `RouteRef`

路线代码解码后先转换为一个规范对象。UI、Ghost 和联机模块只消费这个对象。

```js
{
  schemaVersion: 1,
  campus: 'szu',
  source: 'fixed' | 'seed' | 'network',
  id: 'seed-S2-ABC123',
  seed: 'S2-ABC123',
  networkRevision: 'szu-network-v1',
  edges: [
    { id: 'north-spine', direction: 1 },
    { id: 'library-east', direction: 1 }
  ],
  variant: {
    direction: 'forward',
    laps: 1
  },
  layout: 'a1b2c3d4'
}
```

`fixed` 和 `seed` 路线保留当前 `campus / id / seed / layout` 兼容形式。`network` 路线只保存道路图边 ID、方向和网络版本，不保存原始顶点、自由坐标或运行时网格。

### 3.4 接口草案

```js
parseRouteCode(text, context) -> RouteSpec | null
encodeRouteCode(routeSpec) -> string
normalizeRouteSpec(input) -> CanonicalRouteRef | null
resolveRoute(routeRef, dependencies) -> CourseEvent | null
validateRoute(routeRef, dependencies) -> ValidationResult
routeLayoutKey(event) -> string
routeEnvironmentKey(event, modifiers) -> string
```

`resolveRoute()` 必须返回当前竞速系统可以直接使用的 `Course Event`。这样 `TimeTrial`、Ghost、AI、车流和地图装饰不需要分别理解路线代码。

### 3.5 路线代码版本

| 级别 | 支持内容 | 复杂度边界 |
|---|---|---|
| R1 | 固定赛道、现有种子、方向和圈数 | 低，复用现有系统 |
| R2 | 道路图边序列和方向 | 中，复杂度随边数线性增长 |
| R3 | 任意自由绘制坐标和越野路径 | 高，暂不纳入首版 |

R1 可以直接支持新的联机模式。

- 影子追捕使用固定赛道、种子赛道和 Ghost。
- 盲区导航使用现有检查点和路线标记。
- 路权争夺使用地图网格和地图版本，路线代码可以后置。

R2 的建议初始边界如下。

- 路线代码最大长度建议 256 个 ASCII 字符。
- 道路边数量沿用 `seed-courses.js` 的搜索上限，首版建议不超过 32 条。
- 路线总长度沿用对应地图道路网络的 `minimum` 和 `maximum`。
- 只允许已登记道路边 ID。
- 只允许已登记方向和网络版本。
- 不允许把模式、天气、车型限制或皮肤 ID写进路线代码。

R3 同时增加自由路径安全检查、碰撞判定、服务端重建、Ghost 兼容和更大的网络输入，属于独立项目，不作为路线代码首版目标。

### 3.6 联机路线流程

```text
房主选择路线
  ↓
客户端生成规范 RouteRef
  ↓
服务端校验 schema、campus、networkRevision、layout
  ↓
房间只保存规范路线身份
  ↓
每个客户端本地 resolveRoute()
  ↓
客户端对比 layout
  ↓
通过后进入发车阶段
```

服务端房间状态传输规范路线身份和版本，不传完整几何。客户端无法解析未来版本时，在发车前拒绝进入房间并显示版本提示。

路线代码只在房间配置或赛前同步一次，不进入每帧骑手姿态包。网络负担主要取决于路线字符串长度，R2 的 256 字符上限足以控制输入规模。

## 4. 骑手皮肤模块拆分

### 4.1 已实现模块

```text
src/data/rider-skins.js
src/ride/rider-skin.js
src/ride/models.js
src/ui/app.js
src/replay/ghost.js
src/online/client.js
szu-litchi-dev/online/server.mjs
```

`rider-skin.js` 负责规范化、范围校验、custom registry 和 hash。`models.js` 只接收已校验的声明式图元并发射身体网格。UI 只处理提示词复制、JSON/文件导入和 profile 写入，Ghost 与联机复用同一 SkinSpec。

### 4.2 `SkinModelSpec` 标准字段

```js
{
  schemaVersion: 1,
  id: 'yellow-creature',
  label: '黄色圆腹骑手',
  class: 'model',
  rig: 'shared-rider-v1',
  palette: {
    body: '#e6b84f',
    belly: '#f2dfaa',
    eye: '#172719',
    accent: '#6e7b39'
  },
  proportions: {
    heightScale: 1.00,
    bodyWidthScale: 1.14,
    bodyDepthScale: 1.12,
    headWidthScale: 1.06,
    headHeightScale: 1.04,
    limbRadiusScale: 0.92,
    handScale: 0.96,
    footScale: 0.90,
    neckWidthScale: 1.08,
    neckLengthScale: 0.08
  },
  model: {
    version: 1,
    parts: [
      { id: 'body', primitive: 'ellipsoid', center: [0, 1.15, 0], size: [.22, .30, .20], material: 'body' },
      { id: 'head', primitive: 'ellipsoid', center: [0, 1.55, 0], size: [.18, .20, .16], material: 'body' }
    ]
  },
  headMode: 'separate' | 'integrated',
  limbMode: 'full' | 'simplified' | 'hidden',
  animationProfile: 'seated' | 'seated-soft' | 'upright',
  accessories: [],
  allowedVehicles: ['bike', 'ebike', 'chair', 'trail'],
  bounds: {
    width: 1.10,
    height: 1.82,
    depth: 0.86
  },
  triangleBudget: 2400,
  unlock: null
}
```

### 4.3 标准骑手坐标和挂点

所有皮肤遵循同一个局部坐标约定。

- 原点位于座位或髋部挂点。
- `+X` 指向车辆前方。
- `+Y` 指向上方。
- `+Z` 表示左右方向。
- 声明式 parts 必须存在 `body` 和 `head`，需要表达的部位使用唯一 id 和局部坐标。可选挂点使用 `body`、`head`、`neck`、`back`、`leftHand`、`rightHand`、`leftFoot`、`rightFoot`。
- 车辆模型负责车架、轮组、方向和车辆姿态。
- 皮肤模型负责身体轮廓、配色和可见配饰。

非人类角色可以使用共享动作，不要求具备完整人类骨骼。没有明显脖子的生物使用 `headMode: 'integrated'`，头部和躯干通过重叠体积连接，避免出现硬切缝。

### 4.4 建议比例范围

这些范围是首版 `SkinSpec` 的硬校验边界，用于控制公平性、可读性和联机同步成本。比例字段是相对标准骑手的倍率，不是米数，默认值为 `1.00`。声明式图元先按比例缩放，再参与最终外包络校验。

| 参数 | 建议范围 | 目的 |
|---|---:|---|
| `heightScale` | 0.94–1.06 | 控制相对髋部的整体高度 |
| `bodyWidthScale` | 0.88–1.14 | 控制身体左右宽度，避免横向遮挡 |
| `bodyDepthScale` | 0.88–1.14 | 控制身体前后深度，避免穿入车架 |
| `headWidthScale` | 0.90–1.12 | 只额外影响 head/eye 图元的横向尺寸 |
| `headHeightScale` | 0.90–1.12 | 只额外影响 head/eye 图元的高度 |
| `limbRadiusScale` | 0.85–1.12 | 只影响 tube 的半径 |
| `handScale` | 0.85–1.15 | 标准身体路径的手部倍率 |
| `footScale` | 0.85–1.15 | 标准身体路径的脚部倍率 |
| `neckWidthScale` | 0.88–1.14 | 标准身体路径的颈部宽度倍率 |
| `neckLengthScale` | 0.04–0.22 | 标准身体路径的颈部长度倍率 |
| `bounds.width` | 0.76–1.10 米 | 限制最终横向外包络 |
| `bounds.height` | 1.42–1.92 米 | 限制最终高度外包络 |
| `bounds.depth` | 0.60–0.96 米 | 限制最终前后外包络 |

坐标单位是米，原点是座位髋部 `[-0.222, 0.990, 0]`，`x` 正方向朝车把，`y` 向上，`z` 表示左右方向。`ellipsoid` 的 `size` 是三个半径，`box` 的 `size` 是完整长宽高，`tube` 的 `from`、`to` 是端点而 `radius` 是实际半径。`body` 中心必须位于 `x=-0.35–0.15、y=1.05–1.30、z=-0.10–0.10`，`head` 中心必须位于 `x=-0.05–0.20、y=1.45–1.72、z=-0.10–0.10`。body/head 只能使用 ellipsoid 或 box，且分别遵守提示词中的每轴尺寸范围。缩放后的所有图元合并外包络还必须满足 `depth 0.45–0.96`、`height 1.08–1.90`、`width 0.40–1.10`，body 最大跨度为 `0.26–0.78`，head 最大跨度为 `0.18–0.56`，并且完全落在 `bounds` 内。客户端导入和联机服务端都会重新计算这些值，不能通过把 `bounds` 填大来绕过限制。`handScale`、`footScale`、`neckWidthScale`、`neckLengthScale` 对声明式 `model.parts` 不会自动改变图元，必须直接填写对应部位的坐标和尺寸。
生成器还必须模拟客户端导入和联机服务端的同一套髋部偏移检查。缩放后合并外包络相对 hip 的 x 最大绝对偏移不得超过 `max(bounds.depth × 0.72, 0.76)` 米，y 最大绝对偏移不得超过 `bounds.height × 0.75` 米，z 最大绝对值不得超过 `bounds.width × 0.72` 米。手部可以到达车把参考点 `[0.43, 1.052, ±0.238]`，但不能因此突破这组三轴偏移限制。任意一项失败都应重新生成 JSON。客户端和服务端使用同一数值规则，任一端失败都会拒绝模型。

### 4.5 皮肤类型和复杂度

| 类型 | 内容 | 复杂度边界 |
|---|---|---|
| `palette` | 身体、服装和配色 | 低，主要增加数据和缓存项 |
| `accessory` | 腹部、围巾、反光背心、尾部或触须 | 低到中，使用标准挂点 |
| `model` | 非人类完整身体轮廓、头躯干连接和部位图元，共享动作挂点 | 中，限制图元、坐标和面数 |
| `custom-rig` | 独立骨骼、动作和车型适配 | 高，暂不进入首版 |

当前自行车身体由共享 `makeRider().body` 生成，声明式 model 通过同一 emitter 接入。动力车型继续使用现有车体模型和 profile 规则，独立骨骼仍保持在复杂度边界之外。

```text
VehicleRig
  ├─ frame
  ├─ wheels
  └─ steering

RiderBodyRig
  ├─ body
  ├─ accessories
  └─ pose adapter
```

皮肤缓存键包含 `skinId`、规范 `skinSpecHash`、`schemaVersion` 和渲染质量档位。车辆缓存继续处理车型和车辆外观，避免出现皮肤 × 车型 × 车辆配件的组合缓存。

首版建议使用 8 个皮肤缓存槽和 LRU 淘汰。桌面端和移动端共享同一规则，性能验证关注缓存峰值、动态网格数量和地图切换后的释放情况。

## 5. 图片识别到 `SkinSpec` 的标准流程

### 5.1 离线创作流程

```text
参考图片 + 强约束提示词
  ↓
AI 识别完整轮廓、颜色、比例、部位连接和配饰
  ↓
AI 输出 SkinModelSpec JSON/ModelFile
  ↓
`normalizeSkinProposal` 或 `normalizeSkinSpec` Schema 校验
  ↓
图元、比例、挂点、面数、包围盒和车型适配校验
  ↓
车库 JSON/`.json` 导入、声明式模型发射和预览
  ↓
写入本地 custom registry、profile、Ghost 或联机 profile
```

AI 只输出声明式 JSON，不输出 JavaScript、HTML、Shader、外部链接或任意网格脚本。

### 5.2 给其他 AI 使用的提示词模板

```text
你是 FORZERO: BUDGET 的离线图片识别器和 SkinModelSpec 编译器。
你只能执行一件事：读取用户提供的单张参考图，识别其中一个角色的可见外形，然后把识别结果编译成 shared-rider-v1 的声明式 JSON。你不是建模脚本生成器，不是纹理生成器，也不是游戏代码生成器。

输出纪律，违反任意一条都必须重新生成，不能解释原因：
1. 只能输出一个合法 JSON 对象。禁止 Markdown 代码围栏、标题、解释、注释、自然语言前后缀、JavaScript、Python、HTML、CSS、Shader、SVG、Base64、图片、文件路径和 URL。
2. 顶层只能有四个字段：spec、confidence、unresolved、previewNotes。禁止添加 sourceImage、prompt、mesh、texture、script、physics、collision、vehicle、route 或任何自定义字段。
3. spec 只能包含 schemaVersion、id、label、class、rig、palette、proportions、headMode、limbMode、animationProfile、accessories、allowedVehicles、bounds、triangleBudget、model、unlock。不要输出其它 spec 字段。

固定身份字段：
- schemaVersion 必须是数字 1。
- class 必须是字符串 "model"。
- rig 必须是字符串 "shared-rider-v1"。
- id 必须匹配 /^[a-z0-9][a-z0-9_-]{0,47}$/，只能使用小写英数字、下划线和连字符。
- label 必须是长度不超过 64 的短名称。
- unlock 必须是 null，不能编造解锁条件。

角色建模目标：
- 必须表达完整、可辨认的角色本体。主体轮廓、头部、躯干连接，以及图中可见的四肢和主要附属轮廓必须写入 model.parts。眼睛等小细节可以写入 model.parts，也可以使用白名单 accessory。
- 不能用换色、衣服、头盔、背包、单个配饰或人类默认骑手代替角色本体。
- 非人类角色或头躯干相连角色必须使用 headMode="integrated"。有可见颈部时用 neck 部件和 neckWidthScale、neckLengthScale 表达，不得新增骨骼。
- limbMode 默认使用 "full"。只有参考图确实无法判断四肢时才使用 "simplified"，不要使用 "hidden" 隐藏应当存在的部位。
- animationProfile 必须是 "seated-soft"，不得改成其它动作配置。
- 不得自动添加安全帽或背包。accessories 中禁止 helmet 和 backpack，model.parts 的 id 也禁止包含 helmet 或 backpack。

palette 规则：
- palette 必须是对象，最多 8 个键。
- 键只能匹配 /^[a-z][a-zA-Z0-9_-]{0,23}$/。
- 值必须全部是小写或大写均可的 #RRGGBB，不得使用渐变、透明度、纹理、材质脚本或图片。
- model.parts 的每个 material 必须精确引用 palette 中已有的键。

proportions 必须一次性提供以下全部 10 个字段。它们是相对标准骑手的倍率，不是米数：前 9 项默认使用 1.00，**唯独 neckLengthScale 必须写在 0.04–0.22（默认 0.08，绝对不能填 1.00）**。声明式 model 会先按这些倍率缩放，再绘制图元。为避免重复放大，除非有明确理由，前 9 项不要偏离 1.00：
- heightScale 0.94–1.06，影响相对髋部的 y 坐标
- bodyWidthScale 0.88–1.14，影响 z 方向身体宽度
- bodyDepthScale 0.88–1.14，影响相对髋部的 x 方向前后深度
- headWidthScale 0.90–1.12，只额外影响 id 含 head 或 eye 的图元 z 尺寸
- headHeightScale 0.90–1.12，只额外影响 id 含 head 或 eye 的图元 y 尺寸
- limbRadiusScale 0.85–1.12，只影响 tube 的 radius 和 radius2
- handScale、footScale 0.85–1.15，只用于兼容标准身体路径，对声明式 model.parts 不自动改变尺寸
- neckWidthScale 0.88–1.14、neckLengthScale 0.04–0.22（默认 0.08，禁止填 1.00），只用于兼容标准身体路径。声明式 model 的颈部必须直接写入图元坐标和尺寸

bounds 必须一次性提供 width、height、depth，单位是米，分别限制在 0.76–1.10、1.42–1.92、0.60–0.96，且必须大于等于所有图元合并后的实际尺寸。为避免在写 model.parts 前估小导致报错，**建议直接填写安全上限值 `{"width": 1.04, "height": 1.80, "depth": 0.96}`**（绝不要猜 `0.72` 或低于 `1.42` 的紧凑值）。allowedVehicles 必须精确写成 ["bike","ebike","chair","trail"]，不得删减、添加或改名。

坐标和尺寸的唯一含义：
- 全部数值单位都是米。原点是座位髋部 hip=[-0.222,0.990,0]。
- x 正方向朝车把，y 正方向向上，z 正方向朝骑手一侧，左右使用 ±z。车把参考点约为 [0.43,1.052,±0.238]。
- center 是图元中心。ellipsoid 的 size 是三个半径，不是直径；box 的 size 是完整长宽高，不是半尺寸；tube 的 from/to 是两端点，radius 和 radius2 是实际半径。
- body 中心必须落在 x=-0.35–0.15、y=1.05–1.30、z=-0.10–0.10。body 使用 ellipsoid 时每轴半径必须为 x=0.15–0.27、y=0.21–0.35、z=0.14–0.29，使用 box 时每轴完整尺寸必须为 x=0.30–0.54、y=0.42–0.70、z=0.28–0.58。
- head 中心必须落在 x=-0.05–0.20、y=1.45–1.72、z=-0.10–0.10。head 使用 ellipsoid 时每轴半径必须为 0.11–0.22，使用 box 时每轴完整尺寸必须为 0.22–0.44。
- 四肢和颈部 tube 的 radius、radius2 推荐 0.025–0.11，手脚图元的实际尺寸推荐 0.04–0.20。不要使用接近全局上限的尺寸。
- 所有图元缩放后必须严格满足以下**安全坐标盒**（含每个图元自身的半径或半尺寸），即可一次性通过外包络和 hip 偏移校验：
  - **`x` 总包络必须在 `[-0.44, +0.45]`**：特别注意尾巴或背部部件的端点 `x` **不得小于 `-0.38`**（半径 ≤ `0.06`），手部可伸至车把 `x ≈ 0.40–0.42`（半尺寸 ≤ `0.03`），这样 `maxX - minX ≤ 0.89 ≤ 0.96` 且相对 `hip=[-0.222,0.990,0]` 的 x 偏移 ≤ `0.68 ≤ 0.76`。
  - **`y` 总包络必须在 `[0.48, 1.84]`**：脚部底面 ≤ `0.62`、头顶/耳朵顶面 ≥ `1.74`，确保总高度在 `1.12–1.36` 米（稳落 `1.08–1.90` 米内，且相对 hip 的 y 偏移 ≤ `0.85 ≤ 1.80×0.75`）。
  - **`z` 总包络必须在 `[-0.45, +0.45]`**：手臂或躯干左右至少伸到 `±0.22`，确保总宽度在 `0.44–0.90` 米（稳落 `0.40–1.10` 米内，且 |z| ≤ `0.45 ≤ 1.04×0.72`）。
- 若未直接采用上面的安全 `bounds` 推荐值，则在输出前必须计算全部图元极值，确保 `actualDepth ∈ [0.45, 0.96]`、`actualHeight ∈ [1.08, 1.90]`、`actualWidth ∈ [0.40, 1.10]`，且 `bounds` 三轴均 ≥ `actual` 并落在 `[0.76–1.10, 1.42–1.92, 0.60–0.96]` 内；同时相对 hip 偏移满足 x ≤ `max(bounds.depth×0.72, 0.76)`、y ≤ `bounds.height×0.75`、|z| ≤ `bounds.width×0.72`。

model 规则：
- model.version 必须是数字 1。
- model.parts 必须是 2–32 个对象，必须有且只能有一个 id="body" 和一个 id="head"。body 表示主体质量，head 表示头部质量，不能把它们省略或改名。
- primitive 只能是 ellipsoid、tube、box。
- 每个图元必须有唯一小写 id、primitive、material。id 必须匹配 /^[a-z][a-z0-9_-]{0,31}$/，不得重复，且不得包含 helmet 或 backpack。
- ellipsoid 和 box 只能使用 center、size、可选 anchor、yaw、roll。tube 只能使用 from、to、radius、可选 radius2、anchor、yaw、roll。禁止使用其它字段。
- center、size、from、to 都必须是恰好三个数字的数组。所有局部坐标每轴必须在 -2.5–2.5，ellipsoid 半径和 box 尺寸每轴必须在 0.004–1.2，radius 和 radius2 必须在 0.004–0.45。实际生成尺寸还必须满足上面的部位推荐范围和最终外包络范围。
- yaw、roll 必须是有限数字，绝对值不能超过 4π。不得使用 NaN、Infinity、字符串数字或数学表达式。
- anchor 只能是 body、head、neck、back、leftHand、rightHand、leftFoot、rightFoot。身体部件应挂到合理挂点，不能发明新挂点。
- 身体原点接近座位髋部，车辆把手参考位置约为 [0.43, 1.052, ±0.238]。手臂和手部可以合法延伸到该把手参考点，不要为了贴近髋部而截断手臂。不要生成车架、车轮、道路、碰撞盒或场景。

面数和配饰：
- 每个 ellipsoid 按 288 个三角面、tube 按 40 个、box 按 12 个计算，总三角面硬上限为 **2400**。
- **直接按以下图元配额编写（无需心算即可稳保 ≤ 2400）**：
  - `ellipsoid` 最多 **6 个**（仅用于 `body`、`head` 等核心圆润主体）
  - `tube` 最多 **8 个**（用于四肢、尾巴等）
  - `box` 最多 **14 个**（用于手、脚、耳朵、口鼻、眼睛等小部位）
  （上限 `6×288 + 8×40 + 14×12 = 2216 ≤ 2400`，绝不会超面）。
- **`triangleBudget` 请直接固定填写 `2400`**（不要自己猜 `800`、`1200`、`1800` 等偏小数字导致低于实际图元面数）。
- accessories 最多 6 个，只能是 eye、belly、scarf、vest、tail、antenna。anchor 只能是 body、head、back、leftHand、rightHand，scale 只能是 0.5–1.5，color 只能是 #RRGGBB。

固定生成步骤，只按此顺序执行：
A. 只识别参考图中的一个角色，不猜测图片外内容。
B. 标出主体、头部、连接部位和所有可见四肢或附属轮廓。
C. 按上面的图元配额（`ellipsoid ≤ 6`、`tube ≤ 8`、`box ≤ 14`）和安全坐标盒（`x ∈ [-0.44, +0.45]`、`y ∈ [0.48, 1.84]`、`z ∈ [-0.45, +0.45]`）编写每个部位。
D. 填满全部固定字段：`neckLengthScale` 填 `0.08`、`triangleBudget` 填 `2400`、`bounds` 填 `{"width": 1.04, "height": 1.80, "depth": 0.96}`（或经核验覆盖全部图元的更大合规值），逐项检查范围、挂点、材质引用和唯一 id。
E. 检查没有 helmet、backpack、车辆、碰撞、路线、脚本、纹理和未知字段。
F. 只输出最终 JSON，不输出草稿，不输出自检过程。

图片无法确认的背面、关节或动作必须写入 unresolved 字符串数组，最多 12 项。previewNotes 最多 12 项且只能是简短预览备注。confidence 必须是 0–1 的数字。任何检查失败都必须修正 JSON 后再输出，不能用解释代替字段。
```

### 5.3 非人类骑手的处理标准

图中的黄色圆腹生物应归类为 `model`，因为它需要完整身体轮廓和头躯干一体模型。

推荐映射为：

- 圆腹和躯干使用椭球或胶囊图元，并在 `model.parts` 中分别声明。
- 浅色腹部使用独立 overlay。
- 大眼睛使用标准 `eye` 配饰挂点。
- 手臂使用简化胶囊，手部挂到车辆把手。
- 腿部使用 `hidden` 或 `simplified`。
- 头部和躯干使用 `integrated` 模式。
- 使用 `seated-soft`，保持车辆驾驶动作稳定。

AI 无法从一张图片可靠推断背面、关节和完整动作。缺失部分必须回退到共享骨架，不允许通过生成任意新骨骼解决。

### 5.4 规格校验器

当前客户端和联机服务端校验器检查：

- `schemaVersion` 和 `rig` 是否受支持。
- `id` 是否符合白名单格式。
- 比例是否在范围内。
- `headMode`、`limbMode` 和 `animationProfile` 是否受支持。
- body/head 图元、标准挂点和共享动作骨架是否完整。
- 配饰数量、颜色数量和图元数量是否超限。
- 三角面预算是否超限。
- 声明式图元按 emitter 固定成本计算预计三角面，预计值不得超过 `triangleBudget`。
- 包围盒是否超出骑手边界。
- 四种车型是否能找到有效挂点。
- 是否包含外部 URL、脚本字段或未登记的发射器，服务端还校验规范哈希。

## 6. 联机协议可行性

### 6.1 路线传输

路线身份只在房间创建、换图或赛前同步时传输。每帧骑手姿态包保持原结构，不加入路线几何。

服务端房间状态保存：

```js
{
  route: {
    schemaVersion: 1,
    campus: 'ucl',
    id: 'seed-U2-ABC123',
    seed: 'U2-ABC123',
    layout: 'a1b2c3d4',
    networkRevision: 'ucl-network-v1'
  }
}
```

### 6.2 皮肤传输

皮肤属于低频 profile 数据，不进入姿态包。

```js
{
  name: 'player',
  vehicle: 'bike',
  paint: 'bay',
  look: { ... },
  skinId: 'yellow-creature',
  skinVersion: 1,
  skinSpec: { ...SkinModelSpec... },
  skinSpecHash: 'fnv1a-xxxxxxxx'
}
```

服务器只广播通过结构、范围和规范哈希校验的 `skinSpec`。未知或无效皮肤回退 `default`。旧存档、旧 Ghost 和旧客户端缺少字段时也回退默认皮肤。

建议把 `skinVersion` 作为 profile schema 字段，与房间协议版本分开管理。

- 皮肤字段是可选字段时，可以保持协议 v3 的兼容性。
- 服务器对未知皮肤进行规范化，不把原始客户端输入广播给其他玩家。
- 如果未来出现无法降级的皮肤骨架，再单独提升 profile schema 版本。
- P2P 姿态包不增加字节数。

因此，联机代码会增加 profile 校验和远程模型选择，但不会按皮肤数量复制联机状态机，也不会明显增加持续带宽。

### 6.3 旧 Ghost 兼容

Ghost 的 `rider` 对象增加可选字段：

```js
rider: {
  name: 'player',
  vehicle: 'bike',
  paint: 'bay',
  skinId: 'yellow-creature',
  skinVersion: 1
}
```

旧 Ghost 没有 `skinId` 时使用默认皮肤。皮肤只影响外观，不进入 Ghost 的路线键、成绩键和环境键。

## 7. 分阶段实施顺序

### 2.3.1 已交付

- fixed、seed、network RouteRef 已完成解析、canonicalize、方向/圈数变体和客户端/服务端重建。
- `SkinModelSpec` 已接入车库 JSON/`.json` 导入、提示词复制、本地 registry、profile、Ghost 和联机低频 profile。
- model emitter 使用共享骑手骨架和白名单图元，支持完整非人类轮廓与头躯干一体，不支持独立骨骼和任意运行时代码。

## 8. 复杂度边界

| 功能 | 复杂度 | 控制方式 |
|---|---:|---|
| 固定路线和种子路线代码 | 低 | 复用现有路线身份和 `layout` |
| 道路图边序列 | 中 | 限制边数、网络版本和代码长度 |
| 自由坐标路线 | 高 | 后置，不进入首版 |
| 配色皮肤 | 低 | 数据表和独立缓存 |
| 标准配饰 | 低到中 | 白名单挂点和图元 |
| 非人类完整 model 皮肤 | 中 | 共享骨架、图元/坐标范围和面数预算 |
| 每车型独立骨骼 | 高 | 暂不支持 |
| 图片直接作为运行时纹理 | 高 | 仅作为离线参考，运行时使用 SkinModelSpec |

## 9. 验证计划

### 路线代码

```powershell
npm run build
node scripts/verify-data.mjs
node scripts/verify-esm-parity.mjs
node scripts/verify-runtime-parity.mjs
node scripts/verify-210.mjs
node scripts/verify-212.mjs
node scripts/verify-browser.mjs
node szu-litchi-dev/online/verify.mjs
node scripts/verify-four-player.mjs
```

重点验证编码解码往返、同码同布局、客户端服务端一致、旧路线兼容和未来版本拒绝策略。

### 骑手皮肤

```powershell
npm run build
node scripts/verify-data.mjs
node scripts/verify-browser.mjs
node scripts/verify-save.mjs
node scripts/verify-four-player.mjs
node szu-litchi-dev/online/verify.mjs
node scripts/verify-performance.mjs --repeat-maps --route --memory
```

重点验证默认回退、四人独立皮肤、Ghost 外观、缓存释放、移动端构建和姿态包不变。

如果新增独立验证脚本或源码目录，需要同步更新 `FORZERO-WORK-GUIDE.md`。完成实际代码并通过验证后，在 `CHANGELOG.md` 顶部记录改动、核心路径和验证命令。

## 10. 验收标准

- 路线代码不包含原始顶点和自由坐标。
- 路线、玩法和皮肤使用独立 schema。
- 新增皮肤不改变物理、预算、成绩、碰撞和路线键。
- 皮肤缓存不按车型和车辆配件复制。
- 外部 AI 图片识别输出为 SkinModelSpec 文件，并经过 Schema、图元、比例、挂点和面数校验。
- AI 不输出运行时代码和任意网格脚本。
- 旧 Ghost、旧存档和旧客户端可以回退默认路线或默认皮肤。
- 联机持续姿态包保持现有结构。
- 新增特殊皮肤的成本主要是 `SkinSpec` 数据和预览校验，不要求玩家编写 `src/` 代码。

## 11. 性能优化并行线

性能优化纳入同一版本规划，但与路线代码、皮肤数据保持模块边界。第一阶段优先处理不改变画质和物理结果的重复计算，第二阶段在 profiling 证明收益后再调整 GPU 和可见性策略，第三阶段才增加远景细节分级。

### 第一阶段  几乎不影响画质

| 优先级 | 做法 | 主要位置 | 边界 |
|---|---|---|---|
| 1 | 为车流建立按物理 tick 的姿态缓存。渲染和碰撞读取同一批 `trafficPosition` 结果，渲染端再做插值 | `src/world/traffic.js`、`src/render/traffic.js`、`src/ride/physics.js` | 缓存键必须包含车辆身份和物理 tick。碰撞仍使用精确姿态，渲染插值只影响显示 |
| 2 | 为雨水、建筑遮风和碰撞查询建立空间网格 | `src/world/environment.js`、`src/world/query.js` | 空间网格只减少候选集合，最终距离和碰撞判断保持原逻辑 |
| 3 | 动态骑手网格预分配 GPU 缓冲，姿态长度不变时使用 `bufferSubData` | `src/render/webgl-renderer.js` | 顶点布局或容量变化时重新分配，固定长度更新不能改变索引和材质语义 |
| 4 | 静态网格可见性缓存和粗粒度相机分区 | `src/render/bounds.js` | 复用现有 32 米 mesh cell，先增加相机区域索引，不改变地图几何 |
| 5 | 水面反射约 30 Hz 更新 | `src/render/webgl-renderer.js` | 相机超过阈值、天气变化、地图切换或分辨率变化时立即刷新。主画面、近景阴影和水面着色保持完整 |

2.3.1 已完成第 1 项的精确姿态共享、第 2 项的雨水候选空间网格、第 3 项的动态骑手缓冲复用和第 5 项的反射节流。静态可见性继续复用现有 32 米 mesh cell，建筑与碰撞查询继续复用 `collision-index` 网格。没有增加会改变物理确定性的渲染 accumulator 插值。

### 第二阶段  按 GPU 负载优化

- 在支持 `EXT_disjoint_timer_query_webgl2` 时读取 GPU 时间。只有 GPU 持续超预算才调整分辨率或抗锯齿。
- 保留现有 `graphicsScale()` 和自动档位，并增加滞后时间，避免临界帧率附近来回切换。
- 静态不透明物体按 VAO、材质和纹理排序。透明幽灵、贴花和尾流保持独立绘制。
- 片元着色器拆出少量材质变体。只有 GPU profiling 证明收益后才调整材质分支、地面噪声和阴影判断。

### 第三阶段  远景细节分级

新增可复用资产时，在 `src/world/assets/` 的纯函数 emitter 中同时输出近景和远景两档模型。近景保留树冠、灯具、栏杆和建筑窗细节，远景保留轮廓、色块和阴影形状。地标、赛道边界和碰撞模型保持独立，参数写入 `src/data/map-assets.js`。

地图或资产几何变化必须运行 `node scripts/verify-assets.mjs`、`node scripts/verify-maps.mjs` 和 `npm run verify:map-assets-perf`，并按改动范围补跑浏览器、存档、联机和硬件性能验证。性能优化不应修改路线代码的 canonical key、SkinSpec 的联机白名单或现有姿态包结构。

### 版本收口

路线代码、SkinModelSpec 和第一阶段性能优化已通过定向验证，开发版本已收口为 `2.3.1`。后续改动继续按本文件的模块边界和基线纪律维护。
