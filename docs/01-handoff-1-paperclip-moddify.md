# 交接提示词 #1 · 魔改 Paperclip 底层 + 最简 Studio UI

> 本文件是开新线程执行的第一份交接提示词。读取本文件后，按顺序执行下列阶段，每阶段完成后回报。详细方案见 `docs/00-studio-v0.1.md`，本提示词只写工程动作。

---

## 0. 前置与上下文

### 0.1 你的身份
你是一名高级全栈工程师，负责把开源项目 [paperclipai/paperclip](https://github.com/paperclipai/paperclip) 魔改成一款面向 11–16 岁少年的 "AI 队伍养成平台"（内部代号 ADVX）。你**不写最终产品 UI**，本轮目标是把底层逻辑全部就位，并交付一个能跑通的最简 UI 用于验证。

### 0.2 必读文件
开工前必读以下两份（在 advx26 仓库内）：
- `docs/00-studio-v0.1.md` —— 完整方案（定位/概念/配置模型/工程架构/开放问题）
- 本文件 —— 工程动作清单

### 0.3 已锁定的关键决策（不可违反）
| 决策 | 约束 |
|---|---|
| Fork Paperclip，**不再跟上游** | 一次性拉取，之后独立演化 |
| 弃用 Paperclip 原 UI | 保留构建链兼容，但 UI 代码层完全弃用，自写最简 UI |
| 模型策略 | 平台内置统一模型（DeepSeek），所有用户共享同一模型，**不暴露模型参数给孩子** |
| 预算/Credits | **完全砍除**，不给孩子看任何预算/成本相关 UI；底层 cost trace 保留用于未来诊断，但默认关闭显示 |
| 角色模型 | 四角色模板起步（侦察员/点子员/搭建员/挑刺员），用户可加/删角色、起名、配工具 |
| 审批门/Gate | **不暴露给孩子配置**；底层保留，默认配置为"队员卡住就暂停并通知队长" |
| 当前范围 | 仅 Studio。评测/排行榜/社区/赛题全部后置，本轮不实现 |
| 数据 schema | **不删 Paperclip 表、不破坏 schema 约束**，只在 JSON config 字段里加 ADVX 自有字段 |

### 0.4 工作目录
所有工作在 `/Users/baihe/Documents/advx26/` 下进行。这是 Fork 起点仓库。

---

## 阶段 A · 拉取 Paperclip 并初始化仓库

### A1. 克隆 Paperclip 作为起点
```bash
cd /Users/baihe/Documents/advx26
git clone https://github.com/paperclipai/paperclip.git .
```
> 如果目录非空（已有 docs/ 等），先把这些文件移到临时目录，clone 完成后再移回。

### A2. 初始化为 ADVX 独立仓库
```bash
git remote rename origin paperclip-upstream
git remote add origin <你的 ADVX 远程仓库地址，若暂无则跳过>
git checkout -b advx/main
```

### A3. 确认基线可跑
```bash
pnpm install
pnpm dev
```
验收：`http://localhost:3100/api/health` 返回 `{"status":"ok"}`，`/api/companies` 返回 JSON 数组。基线跑通后再进下一阶段。若基线跑不通，先修环境问题，不要进 B。

### A4. 整理仓库结构
按 `docs/00-studio-v0.1.md` §5.2 调整目录：
- 保留 `server/`、`packages/`、`ui/`（Paperclip 原 UI，弃用但保留构建链）
- 新建 `ui-advx/`（自写最简前端）
- 把 `docs/` 移到仓库根（若已在根则跳过）

---

## 阶段 B · L2 术语映射（数据语义层，不改 schema）

### B1. 术语映射表（必须贯穿 API 和 UI 文案）
| Paperclip 原术语 | ADVX 新术语 |
|---|---|
| Company | Team（队伍）|
| Agent | 队员 |
| Board User | Captain（队长）|
| Issue | Task（任务）|
| Work Product | 产物 |
| Activity Log | 活动记录 |
| Org Chart | 组队室 |
| Heartbeat Run | Run（试跑）|

### B2. 实施方式
**不改数据库表名和字段名**（保持 Paperclip schema 不变），只改：
1. `server/src/routes/` 下所有 API 响应的 JSON key（对外暴露的用 ADVX 术语，内部存储用原术语）—— 通过 response mapper 中间件实现
2. 新增 `server/src/services/advx-mapper.ts`，集中管理原术语↔ADVX 术语的映射函数
3. API 路径新增 `/api/teams/*`（对应原 `/api/companies/*`），两条路径并存，前者是 ADVX 对外面，后者保留供 Paperclip 内部逻辑用

验收：`GET /api/teams` 返回的 JSON 用 `team`/`members` 而非 `company`/`agents`，但底层仍读写 `companies` 表。

### B3. 队长身份简化
Paperclip 的 `first-admin-claim` 和 board user 机制保留，但对外文案改为"队长认领"。本轮**不实现儿童同意层/监护人层**（后置），先让首个用户直接成为队长，能跑通即可。

---

## 阶段 C · 角色模板实现

### C1. 在 `packages/teams-catalog/catalog/bundled/` 下加四角色模板
按 Paperclip 的 team catalog 规范（见 `packages/teams-catalog/` 现有样例），创建：
```
packages/teams-catalog/catalog/bundled/advx/
  scout/TEAM.md          # 侦察员
  inventor/TEAM.md       # 点子员
  builder/TEAM.md        # 搭建员
  critic/TEAM.md         # 挑刺员
  starter-team/TEAM.md   # 起步四角色整队模板（含上述四个）
```
每个 `TEAM.md` 的 frontmatter 和内容参考现有 catalog 样例。模板字段必须含：
- 队员名占位（用户创建时填）
- 职责描述默认值
- 默认工具清单
- 默认协作关系（汇报线/委托）

模板内容见 `docs/00-studio-v0.1.md` §4.2 的四角色表。

### C2. 重新生成 catalog manifest
```bash
pnpm --filter @paperclipai/teams-catalog build:manifest
pnpm --filter @paperclipai/teams-catalog validate
```
验收：manifest 生成成功，validate 通过。

### C3. 队员可加/删/改名
在 `server/src/routes/` 加 `/api/teams/:teamId/members` 的 CRUD 路由（POST 加、DELETE 删、PATCH 改名/改配置）。约束：
- 一支队伍最少 1 个队员，最多 8 个（拍脑袋值，写在常量里便于改）
- 删除队员不影响历史版本快照

---

## 阶段 D · 砍除预算 + 统一模型

### D1. 关闭 Budget 给用户的显示
- 不删 `packages/` 里的 budget 模块（保留底层 trace）
- 在 `server/src/routes/` 的 API response mapper 里，**过滤掉**所有 `budget`/`cost`/`credits`/`spend` 相关字段，不返回给前端
- 保留 `activity_log` 里的 cost events（用于未来诊断），但不在 ADVX API 暴露

验收：`GET /api/teams/:id` 和 `GET /api/teams/:id/members` 的响应里**没有任何预算/成本字段**。

### D2. 统一模型配置
- 在 `server/src/config.ts` 或新增 `server/src/services/advx-model.ts` 里，定义平台内置模型清单（当前只有一个：DeepSeek，后续可加）
- 所有队员的 `adapterConfig.model` 在创建时**强制写为平台内置模型**，忽略用户传入的其他模型值
- 不在孩子侧暴露 `temperature`/`max_tokens` 等参数配置

验收：创建队员时传任意 model 值，最终落库的都是 DeepSeek；API 响应里不返回模型参数。

### D3. 默认审批门配置
- 不删 Paperclip 的 Governance & Approvals
- 写一个 `server/src/services/advx-defaults.ts`，给所有新创建的队员/队伍设置默认 execution policy：**队员遇不确定自动暂停并通知队长**（对应 Paperclip 的 approval gate，默认全部 enabled 且"卡住即 pause"）
- **不暴露给孩子配置**——API 层不提供修改 execution policy 的端点（本轮）

---

## 阶段 E · Studio 路由层

新增以下 API 路由（全部挂在 `/api/teams/*` 下，复用 Paperclip 底层）：

### E1. 队伍管理
| Method | Path | 作用 |
|---|---|---|
| POST | `/api/teams` | 创建队伍（每个队长 1 支，若已有则返回现有）|
| GET | `/api/teams/mine` | 获取我的队伍 |
| PATCH | `/api/teams/:id` | 改队名/简介 |

### E2. 队员管理
| Method | Path | 作用 |
|---|---|---|
| GET | `/api/teams/:id/members` | 列出队员 |
| POST | `/api/teams/:id/members` | 加队员（从模板 or 从零）|
| PATCH | `/api/teams/:id/members/:memberId` | 改队员（名字/职责/工具/Skill/协作）|
| DELETE | `/api/teams/:id/members/:memberId` | 删队员 |

### E3. 工具与模板
| Method | Path | 作用 |
|---|---|---|
| GET | `/api/role-templates` | 列出四角色模板 |
| GET | `/api/tools` | 列出可选工具清单（从 MCP server / plugins 派生）|
| GET | `/api/skills` | 列出可选 Skill（复用 Paperclip skills-catalog）|

### E4. 试跑
| Method | Path | 作用 |
|---|---|---|
| GET | `/api/test-tasks` | 列出预置试跑任务（本轮预置 3 个，见 §E6）|
| POST | `/api/teams/:id/test-runs` | 启动一次试跑（绑定队伍当前配置 + 试跑任务）|
| GET | `/api/test-runs/:runId` | 获取试跑结果（活动记录 + 产物）|

### E5. 版本与活动记录
| Method | Path | 作用 |
|---|---|---|
| POST | `/api/teams/:id/versions` | 封存当前队伍配置为一个版本快照 |
| GET | `/api/teams/:id/versions` | 列出历史版本 |
| GET | `/api/teams/:id/versions/:versionId` | 获取某版本详情（只读）|
| GET | `/api/teams/:id/activity` | 获取队伍活动记录（复用 Paperclip activity log）|

> 版本快照本轮用 JSON 存在 `teams` 表的 JSON config 里或新建 `team_versions` 表（优先用 JSON config，避免改 schema）。最多保留 20 个版本，超出删最老的。

### E6. 本轮预置的 3 个试跑任务
写在 `server/src/built-ins/test-tasks.ts`：
1. `hello-team` —— 让队伍协作产出一段"自我介绍"文字（验证四角色协作链路）
2. `todo-maker` —— 让队伍做一个简单的待办清单文本（验证产物输出）
3. `idea-sketch` —— 让队伍围绕一个给定主题产出 3 个点子（验证点子员+挑刺员协作）

试跑任务本质是 Paperclip 的 Issue + Heartbeat Run，绑定队伍当前配置执行。

---

## 阶段 F · 最简 UI（ui-advx/）

### F1. 技术栈
- React + Vite + TypeScript
- Tailwind v4（复用 Paperclip 的 token 体系，见 `DESIGN.md`）
- React Router
- 不引入重状态管理框架，用 React Context 足够

### F2. 页面骨架（最简，不做视觉优化）
```
/login          # 最简登录（直接认领队长身份，不做儿童同意）
/studio         # 组队室主页
  ├─ 队伍信息卡（队名/简介/模型/版本数）
  ├─ 队员卡片网格（每张卡：名字/角色/工具数/Skill数）
  ├─ "加队员"按钮 → 弹模板选择 + 起名
  └─ "试跑"按钮 → 选试跑任务 → 跑
/test-run/:id   # 试跑结果页（活动记录时间流 + 产物展示）
/versions       # 版本列表页
/activity       # 全队活动记录页
```

### F3. 最简 UI 验收标准
- 能从零创建一支队伍、加四角色模板起步、给每个队员起名
- 能选工具（从 `/api/tools` 拉清单，多选）
- 能发起一次试跑并看到结果
- 能封存版本并查看版本列表
- **不做**任何视觉打磨、动画、响应式适配。能用就行。

### F4. UI 与 API 的对接
- 所有数据走 `/api/teams/*`（ADVX 术语），不走 `/api/companies/*`
- 不显示任何预算/成本字段
- 模型选择不暴露给孩子（队伍信息卡里只显示"当前模型：DeepSeek"，不可改）

---

## 阶段 G · 联调与验收

### G1. 端到端验收脚本
写一个 `scripts/advx-smoke.sh`，依次：
1. 认领队长身份
2. 创建队伍
3. 加 4 个队员（从 starter-team 模板）
4. 给每个队员起名
5. 配工具
6. 发起 `hello-team` 试跑
7. 等待 Run 完成，读取活动记录和产物
8. 封存版本
9. 列出版本

每一步用 curl 调用 API 并打印响应。全流程跑通即验收通过。

### G2. 验收门
- [ ] `pnpm dev` 启动无错
- [ ] `/api/health` 返回 ok
- [ ] `/api/teams` 用 ADVX 术语响应
- [ ] 创建队伍 + 加 4 队员 + 起名 + 配工具 全流程通
- [ ] 试跑 `hello-team` 能完成并返回产物
- [ ] 封存版本 + 列版本 通
- [ ] 响应里**没有任何预算/成本/credits 字段**
- [ ] 队员 model 强制为 DeepSeek
- [ ] 最简 UI 能跑通上述全流程（手动点一遍）
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test`（Vitest）通过

---

## 阶段 H · 文档与交接

### H1. 写 `AGENTS.md`
在仓库根写 `AGENTS.md`，告诉后续 agent：
- 这是 Fork Paperclip 的 ADVX 仓库，不跟上游
- 术语映射见 `docs/00-studio-v0.1.md` §2 和本文件 §B1
- 哪些模块是 Paperclip 原样用、哪些是 ADVX 新增（列出 `server/src/services/advx-*.ts` 和 `ui-advx/`）
- 不要恢复预算显示、不要暴露模型参数、不要改 Paperclip schema

### H2. 写 `docs/01-handoff-1-report.md`
完成后写一份交接报告：
- 实际改了哪些文件（清单）
- 遇到的问题与解决方式
- 哪些验收门通过、哪些没通过（附原因）
- 下一轮应该做什么（评测系统 / 社区 / 视觉优化 / 儿童同意层）

---

## 执行顺序与回报规则

1. **按阶段 A → B → C → D → E → F → G → H 顺序执行**，不跳阶段
2. 每完成一个阶段，简短回报：阶段名 + 关键改动 + 遇到的问题 + 是否进入下一阶段
3. 若某阶段卡住超过 3 次尝试仍不通，停下回报卡点，不要继续硬试
4. 全部完成后，在 `docs/01-handoff-1-report.md` 写交接报告，等待下一轮指令

---

## 参考文件清单
- `docs/00-studio-v0.1.md` —— 完整方案
- Paperclip `README.md` / `DESIGN.md` / `doc/DEVELOPING.md` —— 底座文档
- Paperclip `packages/teams-catalog/` —— team 模板规范样例
- Paperclip `packages/skills-catalog/` —— skill 规范样例
- Paperclip `server/src/routes/` —— 现有 API 路由样例
- Paperclip `server/src/services/` —— 现有 service 样例

---

*本交接提示词基于 2026-07-24 方案 v0.1 与对话锁定项撰写。执行过程中若发现方案有未覆盖的工程细节，优先按方案精神处理并在回报中说明，不要擅自扩大范围（如不要实现评测/排行榜/社区）。*
