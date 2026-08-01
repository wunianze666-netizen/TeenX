# 交接提示词 #9 · 把 Arena Agent v3 完整整合进 TeenX

> 本提示词供新线程直接执行。目标是把伙伴完成的 Arena v3 评分内核整合到当前 Paperclip-based TeenX 主仓库，而不是把两个独立应用简单拼接。

---

## 0. 你的任务

你是一名高级 TypeScript/Node.js/React 工程师。请把以下唯一来源分支的 Arena 能力整合到 TeenX 主仓库：

```text
源仓库：/Users/baihe/Documents/teenx-arena-agent-v3
源分支：feat/arena-agent-v3
源 HEAD：5562e0e

目标仓库：/Users/baihe/Documents/advx26
目标分支：当前 advx/main 工作树
```

只读取源仓库当前已克隆的 `feat/arena-agent-v3`。**不要 fetch、查看、merge、cherry-pick 或比较任何其他分支。**

不要直接 `git merge` 两个仓库。它们有不同历史、服务壳、认证、数据库和 UI。请按本文定义的 anti-corruption layer 选择性移植并重构。

## 1. 开工前必读

### 1.1 目标仓库

- `AGENTS.md`
- `docs/00-studio-v0.1.md`
- `docs/01-handoff-1-report.md`
- `docs/handoff-5-report.md`
- `docs/09-arena-agent-v3-analysis.md`
- `server/src/routes/advx.ts`
- `server/src/services/advx-mapper.ts`
- `server/src/services/advx-versions.ts`
- `ui-advx/src/api.ts`
- `ui-advx/src/main.tsx`
- `ui-advx/src/components/TopNav.tsx`
- `ui-advx/src/styles/tokens.css`
- Open Design P12/P13/P14：
  - `/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95/p12-contests.html`
  - 同目录 `p13-contest-detail.html`
  - 同目录 `p14-contest-result.html`

### 1.2 Arena 源仓库

- `README.md`
- `ARENA_ENGINEER_KICKOFF.md`
- `ARENA_UI_BACKEND_HANDOFF.md`
- `apps/server/src/agent/**`
- `apps/server/src/domain/**`
- `apps/server/src/__tests__/arena-contract.test.ts`
- `apps/server/src/__tests__/arena-e2e.test.ts`
- `packages/ai/**`
- `packages/agent-core/**`

用户曾提到 `PROFILE_HANDOFF_PROMPT.md`，但它不在该分支树或历史中。不要去其他分支寻找，也不要混入 Profile/Connections/Messages 代码。

## 2. 不可违反的 TeenX 约束

1. **不修改 Paperclip DB schema。** 不新增 Arena 表、不生成 migration。使用现有 JSONB metadata/executionState、附件、产物、activity 和实例目录文件。
2. **不恢复预算显示。** `/api/advx/*` 永远不能返回 budget/cost/credits/spend/token usage 字段。
3. **所有人使用同一个 DeepSeek。** 正式 Arena 不允许用户选择模型，不允许前端传 model/provider/temperature/max_tokens。
4. **不向儿童暴露治理/审批配置。** Arena 不能新增 approval/execution-policy UI。
5. **挑战只由官方发布。** 儿童 UI 不提供“创建挑战”；源项目的 `CreateChallengePage` 不迁移。
6. **保留现有 Studio 和论坛。** 不改坏 `/studio`、`/forum`、SSO 和已有 API。
7. **使用现有七色令牌。** `.tsx/.ts` 禁止 hex；不引入 Tailwind；不新建另一套设计系统。
8. **正式环境 fail closed。** 缺 DeepSeek Secret 时拒绝评审，不得自动给 Mock 正式分。
9. **不公开敏感内部信息。** 不返回 prompt、源码全文、绝对路径、agentRunLog、内部分析全文、provider URL、模型原始错误、stack。

## 3. 目标业务闭环

本交接必须完成：

```text
查看官方赛题
→ 打开赛题详情（Goal / Rules / Submit）
→ 绑定当前 Team Version
→ 上传 ZIP
→ 创建 Team-scoped Submission
→ 发起或复用 Evaluation Run
→ 展示真实阶段和 8 个维度进度
→ 支持取消、刷新恢复、断线重连
→ 展示 8 维、1000 分、证据可定位的结果
→ 把 Scorecard 作为 Paperclip Work Product 保存
→ 在 Team Activity 中留下脱敏记录
```

本交接不实现排行榜、赛季积分、用户总榜或论坛发帖联动。

## 4. 移植原则

### 4.1 保留并重构的内核

从 Arena 源仓库移植到 `server/src/services/advx-arena/`：

```text
types.ts                 Standard / Score / Evidence 内部类型
public-types.ts          浏览器可见 DTO（新建，严格脱敏）
scoring-contract.ts      8 维、1000 分和算术强校验
zip-parser.ts            ZIP 安全解析
standard-generator.ts    题目专属锚点标准
submission-analyzer.ts   四轮专项分析
dimension-scorer.ts      双评委 + 仲裁 + 证据验证
score-compiler.ts        服务端权威汇总
evaluator.ts             确定性评审状态机（新建）
run-service.ts           持久化、幂等、取消、恢复（新建）
event-projector.ts       白名单进度事件（新建）
model-provider.ts        DeepSeek-only gateway（重写）
repository.ts            Paperclip + file-backed anti-corruption layer（新建）
```

不要机械复制原 `routes/*.ts`、SQLite repositories、独立 Express app 或原 Web。

### 4.2 用确定性状态机替代模型编排

原 Agent 用模型决定调用下一工具，会额外产生约 12 次 orchestration calls，且难以 checkpoint。整合时把固定流程改为服务端确定性状态机：

```text
queued
→ validating_submission
→ preparing_standard
→ analyzing
→ scoring_dimension（1..8）
→ summarizing
→ completed
```

终止状态：

```text
failed
cancelled
interrupted
```

每完成一个阶段立即保存 checkpoint。每个维度的 key 为：

```text
(runId, dimensionName, rubricVersion)
```

服务重启后只运行缺失阶段，不重复已完成维度。

## 5. 官方挑战存储

新增：

```text
server/src/services/advx-arena-catalog.ts
server/src/built-ins/advx-arena/challenges/*.json
```

每个 challenge 必须有：

```ts
interface ArenaChallenge {
  id: string;
  version: number;
  challengeVersionId: string; // `${id}:v${version}`
  title: string;
  description: string;
  goal: string;
  rules: string;
  submitType: "zip";
  opensAt: string;
  closesAt: string;
  status: "upcoming" | "open" | "closed";
}
```

要求：

- Challenge Version 发布后不可修改；修改必须新建 version。
- 首版可内置 1 个示例官方赛题，沿用 Arena 的 Goal/Rules/Submit 三要素。
- 不提供儿童创建/删除挑战 API。
- 生成的 Standard 缓存到 `<instance>/advx-arena/standards/<challengeVersionId>.json`，使用临时文件 + rename 原子写。

## 6. Submission 数据映射（不改 schema）

### 6.1 Paperclip Issue 作为 Submission 主对象

上传 ZIP 时创建 Team-scoped issue：

```ts
{
  companyId: teamId,
  title: `[Arena] ${challenge.title}`,
  description: `Official Arena submission for ${challenge.challengeVersionId}`,
  status: "todo",
  originKind: "advx_arena_submission",
  originId: challenge.challengeVersionId,
  originFingerprint: zipSha256,
  createdByUserId: captainId,
  responsibleUserId: captainId,
  executionState: {
    arena: {
      schemaVersion: 1,
      challengeVersionId,
      teamVersionId,
      attachmentId,
      artifactSha256,
      run: null
    }
  }
}
```

定义：

- `submissionId = issue.id`
- ZIP 不保存绝对路径。
- ZIP 通过 Paperclip `storageService + assets + issueAttachments` 保存。
- 在落库前验证 ZIP magic、大小、entry 数、解压总量、重复规范化路径和加密 ZIP。
- 计算 SHA-256，Scorecard 必须绑定该 hash。

### 6.2 Team Version 绑定

- 上传前必须存在版本快照。
- 若当前没有 snapshot，调用 `advxVersionService.create()` 自动封存一版并明确告知 UI。
- Submission 永久绑定该 `teamVersionId`，后续改队伍不能污染旧成绩。

## 7. Evaluation Run

### 7.1 持久化结构

`issues.executionState.arena.run` 只保存公共轻量状态：

```ts
interface PublicArenaRunState {
  runId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
  stage: "challenge" | "standard" | "analysis" | "scoring" | "summary" | null;
  completedDimensions: string[];
  startedAt: string | null;
  finishedAt: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  scoreWorkProductId: string | null;
}
```

大型内部 checkpoint 存：

```text
<instance>/advx-arena/runs/<runId>.json
```

文件权限和 API 边界必须保证普通用户不能直接下载。

### 7.2 幂等

- `POST start` 在同 submission 已有 queued/running/completed run 时必须返回现有 run：

```json
{ "runId": "...", "status": "running", "reused": true }
```

- 进程内使用 keyed mutex；持久化更新使用事务/条件更新。
- P0 明确只允许单 Server 实例；若无法实现跨进程锁，在文档和 health 中声明，不得假装支持水平扩容。

### 7.3 取消与恢复

- active run registry 保存 `AbortController`。
- `POST cancel` 先持久化 `cancel_requested` 意图，再 abort 当前模型调用，最终写 `cancelled`。
- 浏览器断开 SSE **不自动创建新 run**；观察流可重新连接。
- 服务启动时扫描 `running` checkpoint，标为 `interrupted` 后从缺失阶段恢复同一 `runId`。

### 7.4 超时与隐藏安全限制

- 单模型调用 180 秒。
- 整体 run 最长 20 分钟。
- 每个 captain 同时最多 1 个 Arena run。
- 每个 submission 最多 1 个正式 run。
- 内部允许 model call count/token hard stop，但绝不能通过 ADVX API/UI显示成本、credits 或 token 用量。

## 8. DeepSeek-only 模型网关

新增 server-only 环境变量：

```env
ADVX_ARENA_MODEL_BASE_URL=
ADVX_ARENA_MODEL_API_KEY=
ADVX_ARENA_MODEL_NAME=deepseek
ADVX_ARENA_ALLOW_MOCK=false
```

规则：

- `ADVX_ARENA_MODEL_NAME` 必须和 `ADVX_MODEL` 策略一致。
- UI 只显示 `DeepSeek`，不返回内部 model id/provider/base URL。
- production 缺 key/base URL 时：`503 ARENA_MODEL_UNAVAILABLE`。
- Mock 只允许 `NODE_ENV=test` 或开发环境显式 `ADVX_ARENA_ALLOW_MOCK=true`。
- Mock 结果必须带 `official: false`，不能进入未来排行榜。
- 日志不得打印 key、Authorization、完整 provider error body。

## 9. 公开 API（挂载在 `/api/advx/arena`）

新增独立路由文件：

```text
server/src/routes/advx-arena.ts
```

在 `server/src/app.ts`：

```ts
api.use("/advx/arena", advxArenaRoutes(db, opts.storageService));
```

### 9.1 Challenge

```http
GET /api/advx/arena/challenges
GET /api/advx/arena/challenges/:challengeVersionId
```

### 9.2 Submission

```http
POST /api/advx/arena/challenges/:challengeVersionId/submissions
Content-Type: multipart/form-data

file=<zip>
teamVersionId=<optional; omitted means snapshot current version>
```

响应不得含：绝对路径、object key、源码、模型信息、成本。

### 9.3 Run

```http
POST /api/advx/arena/submissions/:submissionId/runs
GET  /api/advx/arena/runs/:runId
GET  /api/advx/arena/runs/:runId/events
POST /api/advx/arena/runs/:runId/cancel
GET  /api/advx/arena/runs/:runId/result
```

所有 route：

- `assertCaptain(req)`。
- 校验 submission 所属 Team 的 `defaultResponsibleUserId === captainId`。
- 校验 submission.challengeVersionId 与请求一致，必须在模型调用前拒绝跨挑战。
- 使用 Zod 校验输入。
- 返回安全错误码，不返回内部异常文本。

## 10. SSE 白名单协议

浏览器只允许收到：

```ts
type ArenaProgressEvent =
  | { type: "run_started"; runId: string; startedAt: string }
  | { type: "stage"; stage: "challenge" | "standard" | "analysis" | "scoring" | "summary"; status: "started" | "completed" }
  | { type: "dimension"; name: string; index: number; total: 8; status: "started" | "completed" }
  | { type: "run_completed"; runId: string; scoreWorkProductId: string }
  | { type: "run_failed"; runId: string; code: string; message: string }
  | { type: "run_cancelled"; runId: string };
```

要求：

- 正确解析 `Accept`，不得字符串全等。
- `Content-Type: text/event-stream`、`Cache-Control: no-cache`、`X-Accel-Buffering: no`。
- 每 15 秒发送 SSE comment heartbeat。
- 每个事件有 `id:` cursor；重连支持 `Last-Event-ID` 或 query cursor。
- 原始 AgentEvent、tool details、prompt、源码、模型响应、agentRunLog 永远不得进入 SSE。

## 11. Scorecard

评审完成后用 `workProductService.createForIssue()` 保存：

```ts
{
  type: "artifact",
  provider: "custom",
  externalId: score.id,
  title: `${challenge.title} · Arena Scorecard`,
  status: "ready_for_review",
  reviewState: "none",
  isPrimary: true,
  healthStatus: "healthy",
  summary: score.summary,
  metadata: {
    arenaScore: publicScore,
    challengeVersionId,
    teamVersionId,
    submissionSha256,
    rubricVersion: "arena-rubric-v3",
    official: true
  }
}
```

`publicScore` 可以包含：

- 8 维分数和子项。
- totalScore / summary / strengths / weaknesses。
- anchor / confidence / verification。
- 有长度上限的 path / lineStart / lineEnd / canonical quote。
- 产品化 evidence warning。

绝不能包含：

- `agentRunLog`
- analysisPasses/internal analysis
- rawContent
- modelCalls/tokens/cost
- provider/model endpoint
- prompt/full source

所有 quote 由服务端从已验证源文件重新截取，不能原样信任模型生成的 quote。

## 12. UI 整合（ui-advx）

### 12.1 路由

在 `ui-advx/src/main.tsx` 添加：

```text
/arena
/arena/challenges/:challengeVersionId
/arena/runs/:runId
/arena/runs/:runId/result
```

新增：

```text
ui-advx/src/pages/ArenaChallengesPage.tsx
ui-advx/src/pages/ArenaChallengePage.tsx
ui-advx/src/pages/ArenaRunPage.tsx
ui-advx/src/pages/ArenaResultPage.tsx
ui-advx/src/components/ArenaStageList.tsx
ui-advx/src/components/ArenaScorecard.tsx
ui-advx/src/components/ArenaEvidence.tsx
```

### 12.2 TopNav

`TopNav.tsx`：

- “赛题”去掉 `comingSoon`。
- 指向 `/arena`。
- `/arena/**` 时保持 active。
- 排行榜继续 comingSoon，不在本交接实现。

### 12.3 页面要求

**P12 赛题列表**

- 对照 Open Design `p12-contests.html`。
- 显示 upcoming/open/closed 筛选。
- 不显示“发布挑战”。

**P13 赛题详情**

- 显示 title/Goal/Rules/Submit、截止时间、8 维权重。
- 显示当前 Team Version；无版本时说明上传会自动封存。
- ZIP 拖拽 + 文件选择。
- 明示 `.zip`、50 MB、只做静态分析、不执行提交代码。
- 上传中/上传失败/重新上传状态完整。
- 上传后再发起 run。

**Arena Run 进度**

- 展示真实 stage，不使用虚假百分比。
- 显示 8 个维度 started/completed。
- 支持取消。
- `runId` 在 URL，刷新后 GET 状态并重连同一 run。
- 区分：上传错误、模型不可用、模型超时、用户取消、契约失败、服务中断。

**P14 结果**

- 总分 `0–1000`。
- 显示 8 维和全部子项。
- 展示 anchor/confidence/verification/review delta。
- `static_inference` 固定文案：“静态推断，未运行验证”。
- `not_verifiable` 固定文案：“当前材料无法验证”。
- 展示证据 path、行号、纯文本 quote、评语。
- quote 只用 React text node/`<pre>`，禁止 `dangerouslySetInnerHTML`。

### 12.4 API client

在 `ui-advx/src/api.ts` 增加独立 `arenaApi` 命名空间和 public DTO。删除浏览器类型中的：

- `filePath`
- `agentRunLog`
- raw analysis
- model/provider/internal errors

`fetch` SSE 使用 `AbortController`，支持严格帧解析和 terminal-event 校验。

### 12.5 设计系统

- 使用现有 `TopNav`、`PageFoot`、`Feedback`、`Seg`。
- 使用现有 `.card/.btn-*/.pill/.notice/.tl-item/.progress-*`。
- 所有视觉值来自 `tokens.css` / `app.css`。
- `.tsx/.ts` 无 hex。
- 不新增 Tailwind、第二个 router 或全局 CSS reset。

## 13. “让我的队伍参战”边界

源仓库的 `contestant-agent.ts` 是硬编码的单 Agent，不代表用户在 Studio 自己定义的 Team，因此**不能直接把它当正式参赛队伍**。

本交接必须至少完成“绑定 Team Version + 上传该队伍产出的 ZIP + 评审”的完整闭环。

可选增强（仅在基础闭环全绿后）：

- 创建 Team Task，把 challenge Goal/Rules 交给当前队伍 leader。
- 复用 Paperclip heartbeat 和 work product 让队伍生成 ZIP。
- ZIP 产物进入同一个 Submission API。

如果现有 Agent runtime 尚不能可靠地产生 ZIP，不得用 mock 冒充“队伍已参战”；保留手动上传，记录为下一阶段阻塞。

## 14. Activity

每个 mutation 写 activity：

```text
arena.submission_created
arena.run_started
arena.stage_completed
arena.dimension_completed
arena.run_cancelled
arena.run_failed
arena.scorecard_created
```

`details` 只包含安全字段：challengeVersionId、submissionId、runId、stage、dimension、scoreId、status。不得写源码、prompt、路径、模型错误或成本。

## 15. 测试

从 Arena 源仓库迁移并适配：

- scoring contract tests。
- ZIP 安全/上下文边界 tests。
- Mock 强作品/空壳作品 E2E。

新增：

1. 未认证/跨 Team 访问拒绝。
2. cross-challenge 在任何模型调用前拒绝。
3. 同 submission 并发 start 只得到一个 runId。
4. production 缺模型拒绝，Mock 不产生 official score。
5. API/SSE 不包含 `filePath/agentRunLog/prompt/rawContent/cost`。
6. cancel 会 abort active provider call。
7. 刷新/重连复用同 runId。
8. run 中断后从 checkpoint 恢复。
9. exactly 8 dimensions，维度和 = totalScore。
10. 正分 evidence 可定位；重复路径/恶意 ZIP 被拒绝。
11. Challenge detail 对已评分 submission 显示正确状态，修复源项目“未评估”契约缺陷。
12. UI Arena 路由浏览器 smoke。

## 16. 验证命令

按最小相关范围先跑：

```bash
pnpm --filter @paperclipai/server typecheck
pnpm --filter @advx/ui typecheck
pnpm --filter @advx/ui build
pnpm --filter @paperclipai/server test -- arena
bash scripts/advx-arena-smoke.sh
```

UI 令牌门：

```bash
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src
```

必须无输出。

合并前再运行：

```bash
pnpm -r typecheck
pnpm test
pnpm build
```

真实模型验证只在受保护环境有 DeepSeek Secret 时运行；禁止把 Secret 写入仓库或命令历史。

## 17. 冒烟脚本

新增 `scripts/advx-arena-smoke.sh`：

1. 获取我的 Team。
2. 获取官方 challenge。
3. 创建/确认 Team Version。
4. 上传测试 ZIP。
5. 启动 run，重复启动验证 `reused=true`。
6. 轮询到 terminal 状态。
7. 读取结果。
8. 校验 8 维、1000 上限、算术一致、正分证据。
9. 校验响应不含预算、成本、模型参数、filePath、agentRunLog、rawContent。
10. 校验 activity 含 submission/run/scorecard 事件。

日常 smoke 默认显式 Mock 且必须断言 `official=false`；真实环境 smoke 必须断言 model available 和 `official=true`。

## 18. 文档与交接报告

完成后：

1. 更新根 `AGENTS.md` 的 ADVX 模块清单和硬约束。
2. 新增 `docs/09-handoff-9-report.md`，记录：
   - 实际复制/重写文件。
   - 数据映射。
   - 安全边界。
   - API 契约。
   - 测试结果。
   - Mock/真实模型验证情况。
   - 已知限制。
3. 若“让我的队伍自动产出 ZIP”仍被当前 Agent runtime 阻塞，必须精确说明原因，不得声称完成。

## 19. 最终验收门

- [ ] 未查看或混入其他源分支/Profile 文件。
- [ ] 没有直接 merge 两个仓库历史。
- [ ] Paperclip DB schema 零改动。
- [ ] Arena 没有 SQLite 和独立 uploads 目录。
- [ ] 挑战仅官方发布，儿童无创建挑战入口。
- [ ] Submission Team-scoped，绑定 Challenge Version、Team Version、ZIP hash。
- [ ] Run 持久化、幂等、可取消、可刷新恢复。
- [ ] SSE 只发送白名单事件并有 heartbeat/replay。
- [ ] production 缺 DeepSeek 时拒绝评审；Mock 不产生官方成绩。
- [ ] 分数固定 8 维、1000 分、服务端权威、正分有可定位证据。
- [ ] 浏览器拿不到 prompt、源码全文、路径、agentRunLog、内部分析、模型 endpoint、错误堆栈或成本。
- [ ] Scorecard 保存为 Paperclip Work Product。
- [ ] Activity 留下脱敏审计记录。
- [ ] `ui-advx` Arena 页面符合 P12/P13/P14 和七色令牌系统。
- [ ] Studio 与论坛原有流程不回归。
- [ ] typecheck、targeted tests、smoke、UI build 全绿。

---

执行过程中如果发现源 Arena 代码与本提示词冲突，以 TeenX 主仓库 `AGENTS.md` 的硬约束和本文的安全/数据边界为准。不要为了“少改代码”保留第二套数据库、独立认证、原始 SSE 或 Mock 正式评分。
