# TeenX Arena Agent v3 深度分析

> 分析对象只包含 `wunianze666-netizen/teenX` 的 `feat/arena-agent-v3` 分支。未读取、比较或合并其他分支。

## 1. 来源与基线

| 项 | 值 |
|---|---|
| 源仓库 | `https://github.com/wunianze666-netizen/teenX` |
| 唯一分析分支 | `feat/arena-agent-v3` |
| 本地路径 | `/Users/baihe/Documents/teenx-arena-agent-v3` |
| 分析时 HEAD | `5562e0e` (`docs: 添加 Arena 工程师任务书`) |
| 核心代码基线 | `2abb59e` (`docs: 同步 Arena 前端类型交接`) |
| 目标仓库 | `/Users/baihe/Documents/advx26` |

用户提到的 `PROFILE_HANDOFF_PROMPT.md` **不在该分支当前树或该分支历史中**。本分支实际存在的交接文档是：

- `ARENA_ENGINEER_KICKOFF.md`
- `ARENA_UI_BACKEND_HANDOFF.md`

两份文档都明确要求 Arena 与 Profile 完全隔离，因此本分析和后续整合不依赖 Profile 文件，也不从其他分支补取同名文件。

## 2. 本地部署与验证结果

### 2.1 安装与静态检查

本机 Node 未在默认 PATH 中，使用 `/opt/homebrew/opt/node@24/bin` 后完成：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

结果：

- 全 workspace TypeScript 检查通过。
- Arena Server Vitest：`13/13` 通过。
- Web 生产构建成功，产物位于 `apps/web/dist`。
- 未运行 `pnpm validate:arena-real`：当前没有受保护的真实模型 Secret，不能以占位配置发起付费真实模型验证。

### 2.2 完整运行闭环

由于本机 `:3001` 被 `/Users/baihe/Documents/advx/forge-app` 占用，未停止或干扰该进程。Arena 使用：

- Arena Server：`http://127.0.0.1:3011`
- Arena Web + API 同源预览：`http://127.0.0.1:5173`
- 模型：Mock provider（仅本地验证，不可作为正式成绩）

实际跑通：

```text
创建挑战
→ 上传包含 index.html + app.js 的 ZIP
→ 发起评审
→ 生成 8 维标准
→ 产出 651/1000 结果
→ 每个维度含 3 个子项
→ 每个正分维度具备 verified evidence refs
→ 维度和 = 总分 651
```

Playwright 浏览器验证：

- 挑战列表、挑战详情、8 维标准、结果页均可打开。
- 所有 API 请求返回 `200`。
- 浏览器控制台 0 error / 0 warning。
- 复现一处当前契约缺陷：挑战详情把已评分提交仍显示为“未评估”，因为挑战详情 API 返回的 submission 未附 score。

## 3. Arena v3 真正有价值的能力

### 3.1 固定评分协议

固定 8 维、1000 分：

| 维度 | 满分 |
|---|---:|
| 需求符合度 | 200 |
| 规则遵循 | 150 |
| 代码/实现质量 | 150 |
| 创新性 | 150 |
| 趣味性/体验感 | 100 |
| 视觉/审美 | 100 |
| 问题解决能力 | 100 |
| 完成度与细节 | 50 |

`apps/server/src/agent/scoring-contract.ts` 服务端强制：

- 必须恰好 8 个固定维度。
- 每维 3–6 个题目专属子检查点。
- 每个子项具有 `zero / partial / full` 锚点。
- 子项分必须等于维度分，维度分必须等于总分。
- 正分必须绑定模型实际看过的文件、行号和引用原文。
- 无法验证的正分自动归零。

### 3.2 多轮审阅

`analyze-submission.ts` 实际执行：

1. 需求与规则专项分析。
2. 工程、性能、安全、可靠性专项分析。
3. 产品、体验、创新专项分析。
4. 对抗性综合。

每个维度再由：

1. 第一评委独立评分。
2. 第二评委在看不到第一答案的情况下独立评分。
3. 第三评委仲裁。

### 3.3 ZIP 与证据安全

`zip-parser.ts` 已实现较强的静态分析边界：

- 50 MB 压缩包上限。
- 1000 个 entry 上限。
- 50 MB 声明解压总量上限。
- 200 个文本文件上限。
- 单文件 1 MB、单文件 50000 字符、总上下文 180000 字符限制。
- 排除依赖目录、构建目录、`.env`、私钥、证书和明显凭据文件。
- 不解压到文件系统，不执行参赛代码。
- 文件带行号进入模型上下文。
- 证据只能引用最终真正进入模型上下文的文件。

### 3.4 服务端权威分数

`compile-score.ts` 不接受客户端或模型传入总分，而是从服务端运行态读取 8 个维度、校验算术后生成结果。这个原则必须原样保留。

## 4. 不能直接带入 TeenX 主仓库的部分

### 4.1 独立 SQLite 和本地路径

Arena 原项目使用：

- `better-sqlite3`
- `apps/server/data/arena.db`
- `apps/server/uploads`
- 绝对 `filePath`

TeenX 主仓库已经由 Paperclip/PGlite/Postgres 管理 Team、Task、附件、产物和活动。整合后不得保留第二套数据库或把绝对路径返回浏览器。

### 4.2 独立认证与全开放 API

当前 Arena API：

- 没有登录校验。
- 没有 Team/用户资源边界。
- CORS 全开放。
- 任意用户可创建/删除挑战、读取全部提交。

整合后必须复用 `/api/advx/*` 的 `assertCaptain()` 和 Team ownership。

### 4.3 原始 AgentEvent SSE

当前 `routes/agent.ts` 直接把原始 `AgentEvent` 写入 SSE。这会暴露：

- prompt/模型消息。
- 工具参数。
- `tool_execution_end.result.details`。
- 内部分析全文。
- 部分提交源码。
- 模型原始错误。

必须改为白名单事件，不能直接复制当前 route。

### 4.4 Mock fail-open

当前缺少模型配置时自动退回 Mock，而且正式 API 不阻止 Mock 分数。TeenX 正式环境必须 fail closed；Mock 仅允许测试环境。

### 4.5 非持久化运行态

当前 `EvaluationState` 只在进程内：

- 无 `runId` 持久化。
- 无同一 submission 幂等锁。
- 无取消接口。
- 无刷新恢复。
- 无断线重连。
- 服务重启后状态丢失。

### 4.6 独立 React 壳

`apps/web` 是独立 HashRouter 和独立 CSS 视觉系统。TeenX 已有 `ui-advx` BrowserRouter、TopNav、Feedback、七色令牌与 P12–P14 Open Design 原型；不得嵌套或复制 Arena 原 Web 壳。

## 5. 当前实现中的明确缺陷

1. `submission.challengeId === challengeId` 只在分析工具内部晚校验，产生模型调用后才拒绝。
2. 评审结束后忽略 `runEvaluation().score`，再查“该 submission 最新 score”，并发时可能取错。
3. `Accept` 只做字符串全等判断，不是合法的媒体类型解析。
4. 客户端断开不调用 `agent.abort()`。
5. 无 SSE heartbeat、整体超时和事件 replay。
6. 普通响应包含 `Submission.filePath`。
7. 普通响应包含完整 `Score.agentRunLog`。
8. 模型错误、SQLite 错误和 ZIP 路径可能进入客户端错误文案。
9. ZIP 上传只检查扩展名，上传阶段不解析内容。
10. ZIP 解析与 SQLite 都同步阻塞 HTTP 进程。
11. 同一 submission 可重复点击并发评审、重复计费。
12. 挑战列表 API 与前端类型不匹配；challenge detail 不附 score。
13. 前端没有 cancel、run 恢复、typed stage、静态推断标签、anchor/confidence/verification 完整展示。
14. 约 42 次模型调用完成一轮首评，缺少服务端隐藏调用上限与并发保护。

## 6. 与当前 advx26 的正确映射

### 6.1 现有可复用能力

| TeenX 主仓库能力 | Arena 用途 |
|---|---|
| `assertCaptain()` | 认证队长 |
| Company = Team | submission 和 run 的 Team scope |
| Issue = Task | Arena submission/entry 的持久化主对象 |
| Issue attachment + asset storage | 不可变 ZIP 提交 |
| `issues.executionState` JSONB | 公共 run 状态、阶段、runId、scoreId |
| Issue work product metadata | 最终公开 Scorecard |
| Activity log | 白名单进度事件、审计与 SSE replay |
| `advxVersionService` | 参赛时绑定 Team Version |
| `ADVX_MODEL = deepseek` | 所有用户统一模型 |
| `stripBudget` / ADVX mapper | 永不向儿童暴露成本字段 |
| `ui-advx` + 七色令牌 | Arena P12/P13/P14 页面 |

### 6.2 数据映射建议（不改 DB schema）

**Challenge**

- 官方题目，不开放儿童创建。
- 首版放在 `server/src/services/advx-arena-catalog.ts` 或 `<instance>/advx-arena/challenges/*.json`。
- 必须有不可变 `challengeVersionId`，正式提交绑定版本而不是可变标题。

**Submission**

- 使用一条 Team-scoped Paperclip Issue：
  - `originKind = "advx_arena_submission"`
  - `originId = challengeVersionId`
  - `originFingerprint = zip sha256`
  - `createdByUserId/responsibleUserId = captainId`
- ZIP 使用 issue attachment + asset storage，不存绝对路径。
- `submissionId = issue.id`。

**Run**

- 服务端生成 `runId`，写入 `issues.executionState.arena`。
- 公共状态放 JSONB：`queued/running/completed/failed/cancelled/interrupted`、当前 stage、已完成维度、时间、公开错误码。
- 大型内部分析和 checkpoint 存 `<instance>/advx-arena/runs/<runId>.json`，原子写入，不放公共 DTO。
- 同一 submission 在 queued/running/completed 时再次 start 必须返回同一 run。

**Scorecard**

- 创建 `issue_work_products`：
  - `type = "artifact"`
  - `provider = "custom"`
  - `status = "ready_for_review"`
  - `isPrimary = true`
  - `metadata.arenaScore` 只存公开、脱敏结果。
- `agentRunLog`、内部分析、模型原文、成本和 provider endpoint 不进入 metadata。

**Events**

- 用 activity log 保存白名单 Arena 事件。
- `entityType = "arena_run"`，`entityId = runId`。
- SSE 从 activity log 转发，可按 cursor 恢复。

## 7. 推荐整合边界

### 必须移植

- `scoring-contract.ts` 的维度与强校验。
- `domain/types.ts` 中 Standard/Score/Evidence 类型（拆成 public/internal 两套）。
- `zip-parser.ts` 的安全限制与 evidence-visible-files 原则。
- `generate-standard.ts` 的锚点标准生成逻辑。
- `analyze-submission.ts` 的四轮分析协议。
- `score-dimension.ts` 的双评委+仲裁与证据校验。
- `compile-score.ts` 的服务端权威汇总。
- Arena contract 和 Mock E2E 测试。

### 必须重写

- SQLite repositories。
- `routes/agent.ts`、`routes/challenges.ts`、`routes/submissions.ts`。
- 本地 disk upload。
- provider 初始化与 Mock 回退策略。
- 原始 SSE 事件。
- 独立 Web App/HashRouter/CSS。

### 不应直接使用

- `contestant-agent.ts` 的硬编码单 Agent 作为正式参赛队伍。它忽略 Studio 中用户自己定义的多 Agent Team。
- 它的 write/read/list/package 工具可作为以后“让我的队伍参战”的受控工作区能力参考，但首轮不能冒充用户自己的队伍。

## 8. 模型与产品约束

1. 正式评审和所有用户必须使用同一个服务端 DeepSeek 模型。
2. UI 不显示 provider、endpoint、temperature、max tokens、调用次数、成本。
3. 内部可以有服务端调用上限、并发限制、总超时和安全 hard stop；这不是儿童预算 UI，不违反“永不显示预算”。
4. Production 无真实 DeepSeek 配置必须返回 `ARENA_MODEL_UNAVAILABLE`，不得产生正式成绩。
5. Mock 结果必须带 `nonOfficial: true`，且只能在 test/development 显式开启。

## 9. UI 整合

`ui-advx` 新增：

- `/arena`：P12 赛题列表。
- `/arena/challenges/:challengeId`：P13 详情、ZIP 上传、发起评审。
- `/arena/runs/:runId`：真实阶段进度、取消、刷新恢复。
- `/arena/runs/:runId/result`：P14 1000 分结果页。

必须复用：

- `TopNav`（把“赛题”从 comingSoon 改为 `/arena`）。
- `PageFoot`。
- `FeedbackProvider`。
- `Seg`。
- `tokens.css` / `app.css` 七色令牌。

不得引入：

- Arena 原 `styles.css`。
- 第二个 Router。
- 任何新 hex。
- 模型参数、成本、原始 run log 或源码全文。

## 10. 总结

Arena v3 的核心价值不是其独立网站壳，而是评分协议与证据校验内核。正确整合方式是：

```text
保留评分内核
+ 使用 Paperclip 的身份、Team scope、Task、Attachment、Work Product、Activity
+ 使用 ADVX 的 DeepSeek pin 和七色 UI
- 删除 SQLite、独立上传目录、独立认证、独立 Web 壳和原始 SSE
```

这样才能同时满足：长期 TeenX 产品一致性、儿童隐私、安全审计、统一模型、公平评测、不可变证据和不修改 Paperclip DB schema。
