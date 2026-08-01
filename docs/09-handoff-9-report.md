# 交接报告 #9 · Arena Agent v3 整合进 TeenX

> 对应 `docs/09-handoff-9-arena-integration.md`。完成日期：2026-07-25。

## 1. 结果

Arena v3 已按 anti-corruption layer 整合进现有 Paperclip-based TeenX，而不是并入源项目的 SQLite、独立 Express 服务、认证或 Web 壳。

已跑通的闭环：

```text
官方赛题列表与详情
→ 选择/自动封存 Team Version
→ 安全校验并上传 ZIP 到 Paperclip Storage
→ 创建 Team-scoped Issue Submission
→ 幂等创建 Evaluation Run
→ 确定性阶段 + 8 维双评委/仲裁
→ SSE 重放、刷新恢复与取消
→ 8 维 1000 分证据成绩
→ Paperclip Work Product Scorecard
→ Team Activity 脱敏审计
```

未实现排行榜、赛季积分、儿童创建挑战、论坛联动，也没有把源项目的硬编码单 Agent 冒充 Studio 队伍。

## 2. 实际移植与重写

### 2.1 从 Arena v3 保留的内核

- `scoring-contract.ts`：固定 8 维、1000 分、3–6 子项、锚点和算术强校验。
- `zip-parser.ts`：文本优先级、敏感文件排除、上下文预算和 model-visible evidence 边界；读取层改为 `yauzl` lazy-entry 流式校验。
- `standard-generator.ts`：题目专属评分标准、一次修复和 `arena-rubric-v3`。
- `submission-analyzer.ts`：需求/规则、工程/性能/安全、产品/体验三轮独立分析和一轮对抗综合。
- `dimension-scorer.ts`：第一评委、不可见第一答案的独立评委、仲裁员，以及路径/行号/quote 验证。
- `score-compiler.ts`：只从服务端已验证维度计算总分并生成总评。
- 源 `arena-contract` / Mock E2E 的核心断言已适配到 TeenX 测试。

### 2.2 新写的 TeenX 整合层

```text
server/src/services/advx-arena/
  types.ts
  public-types.ts
  scoring-contract.ts
  zip-parser.ts
  standard-generator.ts
  submission-analyzer.ts
  dimension-scorer.ts
  score-compiler.ts
  evaluator.ts
  event-projector.ts
  model-provider.ts
  repository.ts
  run-repository.ts
  checkpoint-store.ts
  scorecard-store.ts
  submission-selection.ts
  public-projector.ts
  public-score-validator.ts
  sse-stream.ts
  run-service.ts
```

另新增：

- `server/src/services/advx-arena-catalog.ts`
- `server/src/built-ins/advx-arena/challenges/todo-web-v1.json`
- `server/src/routes/advx-arena.ts`
- `server/src/routes/advx-auth.ts`
- `server/src/__tests__/advx-arena-*.test.ts`（按 contract/evaluator/repository/routes/run-service/scorecard/versions 拆分）
- `scripts/advx-arena-smoke.sh`
- `ui-advx/src/pages/Arena{Challenges,Challenge,Run,Result}Page.tsx`
- `ui-advx/src/components/Arena{StageList,Scorecard,Evidence}.tsx`

源项目以下部分没有迁移：SQLite repositories、`uploads/`、独立认证/CORS、原始 AgentEvent SSE、HashRouter Web 壳、任意模型选择、自动 Mock 正式分和 contestant-agent 工作区。

## 3. 数据映射

### Challenge

- 官方 immutable JSON，主键为 `challengeVersionId = <id>:v<version>`。
- 当前内置 `todo-web:v1`，状态由 `opensAt/closesAt` 动态计算。
- Standard 原子写入 `<instance>/advx-arena/standards/<challengeVersionId>.json`。

### Submission

- Paperclip `issues` 是 Submission 主对象，`submissionId = issue.id`。
- `originKind = advx_arena_submission`，`originId = challengeVersionId`，`originFingerprint = ZIP SHA-256`。
- `createdByUserId/responsibleUserId` 绑定 Captain，`companyId` 绑定 Team。
- `issues.executionState.arena` 仅保存 challenge/team version、attachment、hash 和公共 run 状态。
- ZIP 经现有 `StorageService + assets + issue_attachments` 保存；Arena 响应不返回 object key 或路径。
- 通用 Issue/Attachment 路由拒绝修改、删除或下载 Arena Submission；通用 Issue 更新也保留 `executionState.arena`。

### Run

- 公共轻状态写回 `issues.executionState.arena.run`。
- 大型内部 checkpoint 原子写入 `<instance>/advx-arena/runs/<runId>.json`，权限为实例目录私有文件。
- 同一 Submission 永远只有一个正式 Run；失败/取消后再评需要创建新 Submission。
- 同一 Captain 同时最多一个 queued/running Run。
- 进程内 keyed lock + PostgreSQL advisory lock + Issue row `FOR UPDATE` 保证幂等；health 明示 P0 单 Server。

### Scorecard

- `workProductService.createForIssue()` 创建 `artifact/custom/ready_for_review` 主产物。
- `metadata.arenaScore` 只包含公开 8 维分数、子项、服务端 canonical quote、总评、hash、rubric 和 official 标记。
- Arena Scorecard 通过通用 Work Product API不可修改或删除。

## 4. 安全边界

上传前同时检查：

- 50 MB 压缩包、1000 entries、50 MB 实际/声明解压总量。
- ZIP magic、加密 flag、绝对路径、盘符路径、`..`、控制字符、超长路径。
- Unicode/斜杠规范化后的重复路径（大小写不敏感）。
- symlink/特殊文件、单文件 1 MB、文本文件 200、单文件/总字符预算。
- `.env/.npmrc/credentials/secrets/私钥/依赖目录/构建目录` 不进入模型。
- 上传在 Multer 内存缓冲前执行 Captain 级与全局并发/频率限制；普通源码中的高置信凭据行会按原行号替换为占位符，且不能成为证据。
- Arena Submission 即使从通用 Issue/Work Product 读取面进入，也只允许记录的 Captain 读取并移除 Arena execution/score metadata，不依赖 child-mode 开关。

证据只允许引用最终进入模型上下文的文件。模型 quote 仅用于定位，公开 quote 由服务端从已验证源码行重新截取，最长 20 行/2000 字符。

ADVX API 与 SSE 不返回：prompt、完整源码、raw analysis、checkpoint/file path、object key、`agentRunLog`、provider/model endpoint、原始错误、stack、token、成本或预算字段。

## 5. DeepSeek 与运行状态机

环境变量：

```env
ADVX_ARENA_MODEL_BASE_URL=
ADVX_ARENA_MODEL_API_KEY=
ADVX_ARENA_MODEL_NAME=deepseek
ADVX_ARENA_ALLOW_MOCK=false
```

- model name 必须等于 `ADVX_MODEL`。
- production 缺 key/base URL 时 start 返回 `503 ARENA_MODEL_UNAVAILABLE`，不创建 Run。
- Mock 仅 `NODE_ENV=test` 或非 production 显式 `ADVX_ARENA_ALLOW_MOCK=true`；成绩固定 `official: false`。
- 单模型调用 180 秒、整场 20 分钟、隐藏调用上限 64；这些内部限制不进入儿童 UI。
- 固定状态机：challenge → standard → analysis → scoring ×8 → summary。
- 每阶段和每维完成立即 checkpoint。重启把 running/queued 标为 interrupted，再以同一 `runId` 从缺失阶段恢复。
- 分数、Scorecard、completed 状态和 terminal event 分步幂等收口；任一落盘窗口崩溃后都可继续完成。终态 Run 的幂等读取不依赖当前模型可用性。
- Standard 同时绑定 challenge 内容摘要与 Mock/official 模型策略来源；Mock 缓存不能进入 official 评审。生产模型 URL 必须为 HTTPS，且禁止 redirect/query/fragment。
- cancel 先写 `cancelRequestedAt`，再 abort 当前 provider signal，最终写 cancelled。

## 6. API 与 SSE

```http
GET  /api/advx/arena/challenges
GET  /api/advx/arena/challenges/:challengeVersionId
POST /api/advx/arena/challenges/:challengeVersionId/submissions
POST /api/advx/arena/submissions/:submissionId/runs
GET  /api/advx/arena/runs/:runId
GET  /api/advx/arena/runs/:runId/events
POST /api/advx/arena/runs/:runId/cancel
GET  /api/advx/arena/runs/:runId/result
```

全部路由要求 Captain，并对 Team ownership 返回无资源差异的 404。SSE：

- 正确协商 `Accept: text/event-stream`。
- `no-cache/no-transform`、`X-Accel-Buffering: no`。
- 15 秒 comment heartbeat。
- 单调数字 `id`，支持 `Last-Event-ID` 和 query cursor。
- 只投影 handoff 定义的 6 类白名单事件，不转发 AgentEvent 或模型内容。

## 7. UI

- `/arena`：P12 列表与 upcoming/open/closed 筛选，无发布挑战。
- `/arena/challenges/:challengeVersionId`：P13 Goal/Rules/Submit、八维权重、Team Version、ZIP 拖放/重试、上传后启动。
- `/arena/runs/:runId`：真实阶段、八维 started/completed、带 cursor 的 SSE 重连、EOF/超时后的权威状态核对、取消、刷新同 Run；健康 SSE 不做周期轮询。
- `/arena/runs/:runId/result`：P14 1000 分、八维全部子项、双评差值/仲裁、anchor/confidence/verification 和纯文本证据。
- `static_inference` 固定显示“静态推断，未运行验证”；`not_verifiable` 固定显示“当前材料无法验证”。
- `TopNav` 的“赛题”已启用；排行榜仍为 coming soon。
- 复用七色 token、TopNav、PageFoot、Feedback、Seg；无 Tailwind、无 TS/TSX hex、无 `dangerouslySetInnerHTML`。

## 8. 验证结果

已通过：

```text
pnpm --filter @paperclipai/server typecheck
pnpm --filter @paperclipai/server build
pnpm --filter @paperclipai/server test -- arena
  8 files / 81 tests passed
pnpm --filter @advx/ui typecheck
pnpm --filter @advx/ui build
rg hex gate: no matches
```

隔离实例真实 HTTP smoke 通过：

- 独立 Paperclip Home / embedded PostgreSQL / port 3197。
- 显式 Mock，health 断言 `singleServerOnly=true`, `mockEnabled=true`。
- Team/Version、ZIP Storage/Attachment、Submission、重复 start 同 runId、轮询、结果、证据、脱敏和 Activity 全通过。
- Smoke 断言 `official=false`。
- Production build + Playwright 网络夹具在 375/768/1280 三档验证 `/arena`、赛题详情、运行与结果共 12 个状态；真实 Server 维度 DTO 不含 `weight`，UI 由 `maxScore / 1000` 推导百分比且不出现 `NaN`。
- SSE 夹具覆盖 interrupted 同 run 自动转 running、terminal 权威核对、无 terminal EOF 与 inactivity 核对；健康连接不做周期 GET。

未运行 official 真实模型验证：受保护网关已证明认证和 Chat Completions 可用，但其模型目录只有 `hy3`，精确 `deepseek` 返回 `model_not_found`。生产策略要求模型名匹配 `ADVX_MODEL=deepseek`，因此保持 fail closed；未将任何 Secret 写入仓库，也不能用 `hy3` 冒充 official。

## 9. 已知限制

1. P0 只支持单 Server。DB 锁保证 start 幂等，但 active controller、SSE subscriber 和 checkpoint 调度是进程内状态。
2. 评审是严格静态分析，不构建、不运行、不渲染提交代码；verification 文案明确该边界。
3. “让我的队伍自动产出 ZIP”未完成。当前 Paperclip Agent runtime 的 Work Product 不保证一定产生受大小/路径策略约束的 immutable ZIP，也没有把多 Agent Team Version 直接映射为一个可审计打包 Run。为避免 Mock 冒充参战，本轮保留手动 ZIP 上传。
4. 官方真实模型 smoke 仍需在受保护环境配置 DeepSeek 后执行，并断言 `official=true`。
