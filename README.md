# 机场地面保障调度管理系统

面向航班机位分配、廊桥调度、行李转运、货物装卸、航空加油、航食配餐与客舱清洁全流程的机场地面保障调度管理平台。

这是一个**纯前端**管理平台：Vue 3 + Vite + TypeScript，仓库里没有后端服务。业务数据由
`frontend/src/data/` 下的本地数据层提供：首次打开用示例数据播种，之后的登记、筛选与状态流转
结果都持久化在浏览器 `localStorage` 里，刷新或重开浏览器都还在。dev server 已关掉自动打开页面，
启动后按终端打印的地址手工打开。

### 本地数据库初始化（版本化、幂等、可断点续做）

- 数据键 `airport-ground-handling:entries`，版本键 `airport-ground-handling:meta`（记录 schema 版本）。
- 初始化逻辑集中在 `src/data/migration.ts`：启动时按版本号顺序执行迁移，每个迁移幂等；
  先落数据再落版本号，中途失败下次自动从断点版本续做，重复初始化**不产生重复记录**。
- 合并种子按 `id` 对齐：只补缺字段、补齐新示例，用户改过的字段与自增记录保留；
  装卸设备的历史「维保记录」属于用户资产，任何升级/重置都不会被示例覆盖。
- 装卸设备的「设备状态」（可用/不可用）统一由当前状态派生：待机、运行中为可用，维保中、已报修为不可用。
  设备详情页与货物装卸页的「装卸设备可用台账」读的是同一份结论，状态流转后各入口同步生效。
- 本地数据损坏时不静默吞掉：旧内容备份为 `entries.corrupt-<时间戳>` 后重新播种。
- 想回到初始数据：调用 `resetModule(模块)`（保留历史维保），或清掉浏览器里的数据键完全重置。

## 环境配置

- `frontend/.env`：所有环境共享的默认值（入库）。
- `frontend/.env.development` / `frontend/.env.production`：dev / build 各自覆盖（入库）。
- `frontend/.env.local`：个人覆盖，不入库（参考根目录 `.env.example`）。
- 变量：`VITE_APP_NAME`（应用名/页面标题）、`VITE_APP_ENV`（环境标识）、`VITE_API_BASE`（预留，切回后端时使用）。

## 构建校验

`npm run build` 会先执行 `scripts/prebuild-check.cjs`：校验 Node ≥ 18、依赖完整性、
rollup 平台原生包（跨平台拷贝 `node_modules` 时常见的 `Cannot find module
@rollup/rollup-linux-*` 缺失）。缺依赖时会明确打印缺了什么并自动 `npm install`，
修复后重跑即可从断点续做。初始化逻辑的断点校验：`npm test`。

## 目录结构

```text
.
├── frontend/                 Vue 3 + Vite + TypeScript 前端（唯一运行单元）
│   ├── src/views/            每个业务模块一个页面
│   ├── src/api/local-service.ts   本地数据服务：列表、筛选、动作流转、导出
│   ├── src/data/             模块元数据 / 示例数据 / localStorage 持久化
│   ├── src/stores/           会话与筛选状态
│   └── vite.config.ts        dev server 配置（open: false，无 /api 代理）
├── .gitignore
└── docker-compose.yml
```

## 启动

```bash
cd frontend
npm install
npm run dev
```

前端默认监听 `http://127.0.0.1:5173/`，dev server 不会自动打开浏览器，需要自己访问。

生产构建：

```bash
cd frontend
npm run build
```

容器化部署（多阶段构建，nginx 托管静态产物，history 路由刷新不 404）：

```bash
make deploy        # 等价于 docker compose up --build -d
# 访问 http://localhost:8080/
```

## 业务模块

| 模块 | 目录 | 业务对象 | 主要字段 |
| --- | --- | --- | --- |
| 机位分配 | `stand` | 机位分配 | 机位编号、机位类型、所属航站楼 |
| 廊桥调度 | `bridge` | 廊桥 | 廊桥编号、所属机位、对接机型 |
| 地面电源 | `ground_power` | 地面电源 | 设备编号、设备类型、所属机位 |
| 行李转运 | `baggage` | 行李转运 | 转运编号、关联航班、行李件数 |
| 货物装卸 | `cargo` | 货物装卸 | 装卸编号、关联航班、货物品类 |
| 航空加油 | `fueling` | 加油记录 | 加油编号、关联航班、燃油型号 |
| 航食配餐 | `catering` | 配餐任务 | 配餐编号、关联航班、餐食类型 |
| 客舱清洁 | `cabin_clean` | 清洁任务 | 清洁编号、关联航班、清洁类型 |
| 排污服务 | `lavatory` | 排污记录 | 排污编号、关联航班、服务车型 |
| 除冰作业 | `deicing` | 除冰记录 | 除冰编号、关联航班、除冰液类型 |
| 牵引车调度 | `pushback` | 牵引任务 | 牵引编号、关联航班、牵引车型 |
| 地勤排班 | `crew_schedule` | 地勤人员 | 人员编号、姓名、岗位类别 |
| 特种车辆 | `special_vehicle` | 特种车辆 | 车辆编号、车辆类型、品牌型号 |
| 航班保障 | `flight_ops` | 航班保障 | 航班号、机尾号、计划到港 |
| 过站监控 | `turnaround` | 过站记录 | 过站编号、关联航班、计划到港 |
| 机坪安全 | `apron_safety` | 机坪安全 | 巡查编号、巡查区域、巡查人员 |
| 装卸设备 | `load_equip` | 装卸设备 | 设备编号、设备类型、适用机型 |
| 应急保障 | `air_emergency` | 应急保障 | 应急编号、事件类型、涉及航班 |

## 约定

- 每个模块的页面在 `frontend/src/views/<模块>/index.vue`，页面只负责渲染，读写统一走
  `frontend/src/api/local-service.ts`。
- 字段、状态、动作与流转目标集中在 `frontend/src/data/modules.ts`；示例数据在
  `frontend/src/data/seed.ts`。
- 状态流转只允许在 `local-service.ts` 里改，页面组件不做业务判断。
- 想回到初始数据：清掉浏览器里 `airport-ground-handling:entries` 这一项，或调用 `resetModule(模块)`。
