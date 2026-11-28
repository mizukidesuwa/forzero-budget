# FORZERO 地图制作指南

先用一条短赛道跑通进图、自由骑行、计时和路线码，再扩展地图范围和所需玩法。本文用 `harbor`（港湾）作为新地图的示例 ID，并用深大、UCL、顺峰山的现有实现作为参考。项目开发规则见 [AGENTS.md](../../../AGENTS.md)。

## 1. 规划道路和场景

1. 确定地图 ID、站名、旅行到达点、朝向和地图边界。道路节点使用 `[x, z]`，车辆和场景坐标使用 `[x, y, z]`，单位为米。用短而稳定的 ID，例如 `harbor`，界面名称单独维护。
2. 画出第一条赛道的道路中心线，留好起点前、终点后的通行空间。先标出几个需要实骑的位置，例如临水边缘、桥头、护栏、路面接缝和检查点。俯视图、赛道和工坊尽量使用同一份道路几何。
3. 在 `src/world/maps/harbor.js` 装配地图。可参考现有目录，把道路与地标数据放在 `harbor/layout.js`，把固定赛道放在 `harbor/courses.js`，地形和车流较复杂时放在各自模块。新增玩法参数放在 `src/data/`。 [顺峰山布局](shunde/layout.js) · [顺峰山赛道](shunde/courses.js)

### 查找和接入地图资产

在仓库根目录运行下面的命令，列出当前公开的资产发射器。新资产经 `src/world/assets/index.js` 重导出后，这条命令就会列出它。 [资产导出入口](../assets/index.js)

```powershell
node --input-type=module -e "import * as assets from './src/world/assets/index.js'; console.log(Object.keys(assets).sort().join('\n'))"
```

1. 从导出入口找到对应模块，核对 `spec` 的坐标、尺寸与朝向，并查看 `dependencies` 需要哪些网格或碰撞接收函数。例如公园座椅发射器接收 `scenery`，施工围挡发射器还可以接收 `footprint`。 [公园座椅](../assets/street-furniture.js) · [施工围挡](../assets/barriers.js)
2. 新增可复用资产时，在对应分类实现 `emitXxx(spec, dependencies)`，经 `index.js` 重导出，再由地图调用。地图传入实际使用的网格和碰撞接收函数。对参与阻挡的资产，核对放置后的碰撞范围与可见尺寸。 [资产模块约定](../../../AGENTS.md)
3. 改动共享资产时，按发射器名称查找现有地图调用和验收用例。检查改动后的模型、碰撞与面数预算。在新增资产分类或改变接入方式时，同步更新本节中受影响的用法。 [资产回归](../../../scripts/verify-assets.mjs) · [面数和分块预算](../../../scripts/verify-map-assets-perf.mjs)

## 2. 接入场景和自由骑行

| 接入位置 | 新地图提供的内容 |
| --- | --- |
| 地图注册 | 在创建赛道前调用 `registerCampus(id, provider)`。登记 `buildScene`、`safeToRide(x, z, exploring, skipHazard)` 和 `surfaceAt(x, z, exploring)`，按需提供骑行标高、障碍、坡度和危险区查询。 [注册与查询](../registry.js) · [查询接口](../query.js) |
| 场景与赛道列表 | 登记 `campuses` 和 `coursesByCampus`，并初始化赛道基准成绩。列表首条是默认赛道。`buildRidingScene(id)` 调用注册的 `buildScene`，统一构建场景并索引地形。 [场景构建](../scene-builder.js) |
| 障碍和旅行 | 核对障碍索引取的是新地图的建筑和设施。地图信息提供 `name`、`station`、`arrival`、`heading` 和 `bounds`。旅行选项从地图列表取数，地图标题和标签还有三图分支。骑出站台并切回其他地图，检查场景、碰撞、路线和到达点是否同步切换。 [障碍索引](../collision-index.js) · [旅行与标签](../../ui/medal-travel.js) |
| 俯视地图 | 接入新底图，提供 `project()` 和 `unproject()`。前者定位道路、骑手和检查点，后者将画布点击还原为世界坐标，供路线工坊吸附节点。检查全图和赛道视图的位置一致。 [小地图](../../ui/minimap.js) · [地图控制](../../ui/map-controls.js) |

`safeToRide()` 管可通行性，`surfaceAt()` 返回是否为铺装路面。只要地图允许，草地也可以通行。处理 `skipHazard` 时仍检查地图边界、建筑和栏杆，物理会独立查询水域与落崖。先骑通一段直路和一个弯道，再做危险区。 [物理移动](../../ride/physics.js)

### 实体地形

在 `buildScene` 中用 `emitTerrain()` 绘制地面和山体。引擎在场景构建完成后，从最终绘制的三角形生成索引，车辆碰撞和镜头避让自动使用它。 [地形入口](../geometry.js) · [共用索引](../collision-index.js)

```js
import { emitTerrain } from '../geometry.js';

function buildHarborWorld() {
  emitTerrain(ground => {
    ground.quad([-100, 0, -100], [100, 0, -100], [100, 0, 100], [-100, 0, 100], '#869873');
  });
}
```

把 `buildHarborWorld` 注册为 `buildScene`。如需像顺峰山一样把山体随场景分块渲染，调用 `emitTerrain(draw, scenery)`。普通景物和水面分别写入各自的渲染网格。 [顺峰山山体](shunde.js)

地形查询按 X/Z 取最高的地面三角形。场景加载后，默认用该高度作为车辆支撑面。需要自定义骑行标高，或需要在场景加载前计算高度时，可以提供 `rideElevation(x, z)`。桥面等上下重叠的骑行层使用 `flyoverAt()` 等通行查询。 [世界查询](../query.js) · [深大高架](szu/terrain.js)

## 3. 接入落水、落崖和路面

### 落水和复位

用同一份湖岸数据绘制水面和判断水域。桥面、栈道和湖边铺装路需要在水域判定中明确留出通行范围。物理会先查询水域，再处理普通障碍。希望护栏挡住骑手的位置，应让障碍先接触到车，水域边界从护栏外侧开始。 [顺峰山水域与伏波桥](shunde.js) · [深大文山湖](szu.js)

给地图同时接上 `waterHazardAt(x, z)` 和 `nearestSafeRoad(x, z)`。复位查询返回 `{ p: [x, y, z], heading }`，自由骑行会恢复到该点、沿道路方向摆正并将车速清零。单层道路可复用 `nearestPathSpot(safeRoads, x, z, heightAt)`，先选一组确认可骑的候选道路。上下层重叠时，再核对复位点的实际支撑高度。计时赛已有按当前进度回赛道并加 **2 秒**的逻辑。 [复位实现](../../race/time-trial.js) · [道路采样工具](../geometry.js) · [罚时常量](../../core/clock.js)

用同一处湖边做三项验收。沿桥或栈道骑行可以通过，驶出栈道进水后能在自由骑行复位，同一位置在计时赛触发回赛道与罚时。再从两个方向试过桥头和护栏开口。 [栈道落水回归](../../../scripts/verify-maps.mjs)

### 其他地形和环境能力

| 能力 | 接入和验收 |
| --- | --- |
| 落崖与地形断面 | 用 `cliffHazardAt(x, z, y)` 结合原位置高度和山路可骑带判定落崖。从高处驶出山路应复位。从崖脚向上进入标记悬崖应被挡住，并能倒车退开。沿边滑动按实际落点判定危险区。地形阻挡和镜头避让自动读取 `emitTerrain()` 绘制的地形。 [顺峰山山路](shunde.js) · [地形过渡回归](../../../scripts/verify-terrain-transition.mjs) |
| 碎石、草地与坡度 | 用 `surfaceKindAt()` 表达 `paved`、`gravel`、`grass`，由 `rideElevation()` 和 `riderGrade()` 描述地形。草地连续上坡受地形坡度上限约束，小台阶沿用断面判定。当前碎石的物理、复位和基准配速有顺峰山专用分支。新图支持碎石时，让这些调用读取新图的路面查询，并核对骑行仪表和配速。 [坡度参数](../../data/surfaces.js) · [物理](../../ride/physics.js) · [复位](../../race/time-trial.js) · [基准配速](../../race/records.js) |
| 多层立交 | 同一 `(x, z)` 有上下两层可骑面时，接入 `flyoverAt()` 并检查桥头、桥下净空和上下层碰撞。赛道门架和复位点也要使用对应层高度。当前 `makeCourse()` 和 `courseGround()` 的高架高度仍查询深大提供的升高量。 [赛道高度](../geometry.js) · [赛道坐标](../query.js) |
| 雨天积水与车流 | 积水的位置按地图、赛道 ID 和沿路线距离配置。车流用地图提供的 `buildTraffic()` 接入场景。新增车流时核对道路方向、发车区净空和碰撞设置。 [积水配置](../../data/environment.js) · [UCL 车流](ucl/traffic.js) |

## 4. 制作固定赛道、检查点和成绩键

`street(nodes, halfWidth)` 从节点生成道路中心线，`joinTrack()` 将道路区间接成赛道。以下是 `harbor/courses.js` 的示例，在直路两端留出发车和冲线后的空间。道路半宽为 3.5 米，检查点半宽为 3 米。

```js
import { joinTrack, makeCourse, street } from '../../geometry.js';

const road = street([[0, 0], [120, 0], [240, 0]], 3.5);
const path = joinTrack([{ path: road, start: 20, end: 220 }], []);

export const harborStraight = makeCourse(
  'harbor-straight', '港湾直道', '从码头沿堤岸骑行。',
  path, [[0, '码头', 3], [100, '堤岸中段', 3], [path.length, '防波堤', 3]],
  path.length, { campus: 'harbor', absolute: true },
);
```

`absolute: true` 表示检查点距离以米为单位。按路线顺序写入 `[距离, 名称, 可选过线半宽]`，由 `makeCourse()` 生成起终点、`01` 等编号、发车位置和朝向。把门布置在能沿正确方向穿过的路段，并在实骑中检查漏过一门时的提示。反向与闭环多圈使用现有赛道变体，开放路线按一圈验收。 [赛道构造](../geometry.js) · [检查点计时](../../race/time-trial.js) · [反向与圈数](../../race/course-variants.js)

赛道 ID 用于识别固定赛道，检查点编号用于过线顺序，道路边 ID 用于重建工坊路线。为新图分配独立的成绩键前缀，当前 `recordKey()` 的兜底分支使用深大历史前缀。固定 `R1` 按地图和 ID 查找本机赛道，联机和影子还会比较布局指纹。已发行赛道改线且需要两版并存时，给新布局分配新 ID，并保留旧定义供旧码重建。 [成绩键](../../race/records.js) · [影子布局](../../replay/ghost.js)

## 5. 接入路线码、工坊和联机

### 复制与导入 R1

先将地图 ID 加入客户端的 `routeCampuses` 和 `RouteCampus`，并登记共用的 `CAMPUS_NETWORKS`。本地 `R1` 编解码也会核对地图 ID。 [路线地图配置](../../data/routes.js) · [路线类型与编码](../../race/route-code.js) · [共用地图与修订号](../../data/shared-rules.cjs)

用 `routeRefForCourse(event, event.variant)` 生成路线码，用 `resolveRouteRef()` 导入并重建赛道，然后交给现有选赛道流程。当前粘贴入口在「每周挑战 / 种子」面板，顺峰山隐藏该入口。新地图只开放固定赛道时，可在发车区接入 `R1` 复制和导入，按能力控制种子赛入口。现有面板会核对路线属于当前地图。 [路线重建与编码入口](../route-resolver.js) · [粘贴入口](../../ui/seed-dialog.js)

| 类型 | 现有路线码示例 | 重建所需数据 |
| --- | --- | --- |
| 固定赛道 `f` | `R1.shunde.f.qingyun-lake.forward.1` | 地图 ID、赛道 ID、方向和圈数 |
| 种子赛 `s` | `R1.szu.s.S2-326.forward.1` | 地图对应的种子和确定性生成器 |
| 道路路线 `n` | `R1.szu.n.szu-network-v1.forward.1.e20~1,e21~1,e3~1,e4~1` | 路网修订号、有序道路边和边方向 |

### 路线工坊和种子赛

1. 为实际道路上的路口定义节点 ID，用共享道路中心线和有方向的道路边连成路网。桥上和桥下的路段按真实连接关系设边。链路要能在重建时首尾相接。
2. 将路网接到 `networkForCampus()`。它目前从 `seedNetworks` 取图，已有深大和 UCL 两套。若新图先开工坊，可把工坊与种子赛的可用条件分别接入。工坊上限为 **3000 米、64 段、1024 字符**，最短距离取本地图的路网参数。 [路网和重建](../seed-courses.js) · [边链校验](../../race/route-validation.js) · [共用限制](../../data/shared-rules.cjs)
3. 保持已发行的边 ID 含义稳定。现有 `seedRoadNetwork()` 按道路声明顺序产生 `e0`、`e0r` 等 ID，插入或重排道路可能让后续旧 ID 指向别处。边的身份、连接或重建几何变化时，同步更新客户端与服务端使用的路网修订号。导入时会比对当前修订号。 [边 ID 生成](../seed-courses.js) · [共享修订号](../../data/shared-rules.cjs)
4. 开启种子赛时，接入确定性生成器、种子前缀和相应界面入口。客户端现有前缀为深大 `S2`、UCL `U2`，服务端也有前缀校验。用同一个码反复生成并比对赛道和检查点。 [客户端种子](../../race/seed-code.js) · [服务端路线校验](../../../server/route-rules.cjs)

### 联机地图与版本

在本地能导入路线后，把地图登记到服务端 `CAMPUSES` 和联机地图选择框。服务端核对路线身份、编码和修订号。客户端使用本地地图重建，对比赛道 ID 和布局指纹。验收时，在两个客户端选择或导入同一条路线并发车，再检查版本或布局不同的情形是否给出明确提示。 [联机地图选择](../../index.html) · [服务端验码](../../../server/server.mjs) · [客户端重建](../../online/client.js)

## 6. 验收与基线

从一条短赛道开始记录可重复的验收点。每个点注明地图、坐标或沿赛道距离、进入方向、骑行模式和预期结果。

| 检查项 | 验收结果 |
| --- | --- |
| 进图与旅行 | 正确加载地图。从到达点能骑上第一段道路。切换地图后，场景、小地图、障碍和赛道一致。 |
| 路面与边界 | 双向过桥和过接缝。栏杆、石柱和门洞的碰撞符合可见边界。落水、落崖分别覆盖自由骑行复位和计时赛罚时。 |
| 地形与镜头 | 从坡脚贴近陡坡并倒车退出。沿坡肩骑行时切换 1P、2P、3P，核对视线与山体的位置。切图后，在新图复查地面碰撞和镜头避让。 |
| 固定赛道与成绩 | 按顺序过检查点并结算。核对反向、闭环圈数、独立成绩键和影子布局。 |
| 路线码与联机 | 固定或工坊路线经过复制、导入和本机重建。覆盖错误地图、旧路网版本、断边和超限。开启联机时用不同客户端验证选图、同步路线和发车。 |

改动 2.x 源码后，在仓库根目录运行 `npm run build`、`npm run lint` 和 `npm run typecheck`，再按改动面选择验收脚本。

- 地图和资产用 `node scripts/verify-data.mjs`、`node scripts/verify-assets.mjs` 和 `node scripts/verify-maps.mjs`。为新图补测试入口、道路采样、代表赛道和地图快照。只有地图支持种子赛时才加入种子探针。当前地图回归的地图列表、采样道路和代表赛道有三图专用配置。 [地图快照与探针](../../../scripts/verify-maps.mjs) · [地图基线](../../../scripts/fixtures/map-regression.json)
- 地形和路线用 `node scripts/verify-terrain-transition.mjs`、`node scripts/verify-route-builder-chase.mjs`。再用 `node scripts/verify-browser.mjs` 验收旅行、小地图、落水提示和路线导入。涉及联机则运行 `node server/verify.mjs` 和 `node scripts/verify-four-player.mjs`。 [验证速查](../../../FORZERO-WORK-GUIDE.md)
- 地图资产改动还要运行 `npm run verify:map-assets-perf`，核对已有地图的面数、网格分块和硬件性能基线。为新图记录同口径的几何与浏览器性能数据。性能脚本按历史快照中已有的地图运行，新图需要自己的测量和验收。 [资产性能脚本](../../../scripts/verify-map-assets-perf.mjs) · [浏览器性能脚本](../../../scripts/verify-performance.mjs)
- 验证通过后，在 `CHANGELOG.md` 记下地图功能、关键路径、实际跑过的命令和基线变动原因。 [收尾与基线规则](../../../AGENTS.md)
