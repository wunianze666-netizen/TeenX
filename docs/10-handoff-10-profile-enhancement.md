# 交接提示词 #10 · 用 Profile System 补强 TeenX 个人中心与安全联络

> 本提示词供新线程执行。目标是吸收 Profile 分支中已经验证的隐私、审批和竞态处理原则，补强当前 Paperclip-based TeenX，而不是把独立 Profile 网站合并进来。

---

## 0. 你的任务

你是一名高级 TypeScript、React、Node.js 和 Discourse 工程师。请基于以下唯一来源分支完成 TeenX Profile 补强：

```text
Profile 源仓库：/Users/baihe/Documents/teenx-profile-system
Profile 源分支：feat/profile-system
Profile 源 HEAD：b4145d46ce3a0c848c5607527c810e2c6ecd8172

TeenX 主仓库：/Users/baihe/Documents/advx26
目标分支：当前 advx/main 工作树

TeenX 论坛仓库：/Users/baihe/Documents/teenx-forum
论坛分支：当前 teenx/main 工作树
```

只读取已经克隆的 `feat/profile-system` 当前树。**不要 fetch、查看、merge、cherry-pick 或比较 `wunianze666-netizen/teenX` 的任何其他分支。**

不要直接合并两个应用。源分支使用 SQLite、`x-user-id`、HashRouter 和独立消息库，与当前 Paperclip 身份、Postgres/PGlite、Discourse 和 `ui-advx` 不兼容。

两个目标工作树都可能已有用户未提交修改。开工先看 `git status`，只修改本任务需要的文件，禁止 reset、checkout 或覆盖其他人的改动。

Arena #9 已完成并产出 `docs/09-handoff-9-report.md`，Landing 也可能仍由并行线程修改。不要覆盖 `server/src/services/advx-arena/**`、Arena 页面或并发修改的 `ui-advx/src/api.ts/main.tsx/styles`。先读取当前工作树，再以现状做最小增量。

## 1. 开工前必读

### 1.1 TeenX 主仓库

- `AGENTS.md`
- `docs/00-studio-v0.1.md`
- `docs/01-handoff-1-report.md`
- `docs/06-handoff-6-sso-and-roadmap.md`
- `docs/09-arena-agent-v3-analysis.md`
- `docs/09-handoff-9-arena-integration.md`
- `docs/09-handoff-9-report.md`
- `docs/10-profile-system-analysis.md`
- `server/src/routes/advx.ts`
- `server/src/routes/auth.ts`
- `server/src/routes/user-profiles.ts`
- `server/src/middleware/auth.ts`
- `server/src/services/advx-mapper.ts`
- `ui-advx/src/api.ts`
- `ui-advx/src/main.tsx`
- `ui-advx/src/components/Captain.tsx`
- `ui-advx/src/components/Feedback.tsx`
- `ui-advx/src/pages/MePage.tsx`
- `ui-advx/src/styles/tokens.css`
- `ui-advx/src/styles/app.css`

### 1.2 Profile 唯一来源分支

- `PROFILE_HANDOFF_PROMPT.md`
- `PROFILE_REVIEW.md`
- `packages/shared/src/domain.ts`
- `packages/shared/src/dto.ts`
- `apps/server/src/routes/profiles.ts`
- `apps/server/src/routes/connections.ts`
- `apps/server/src/routes/conversations.ts`
- `apps/server/src/lib/relation.ts`
- `apps/server/src/__tests__/profile-http.test.ts`
- `apps/web/src/components/ActionButtons.tsx`
- `apps/web/src/pages/ProfilePage.tsx`
- `apps/web/src/pages/SettingsPage.tsx`
- `apps/web/src/pages/MessagesPage.tsx`
- `e2e-profile/profile-smoke.spec.ts`

源仓库同时包含 Arena 文件。本任务不迁移其中的挑战、评分、上传、模型或 Arena Web 壳。

### 1.3 Discourse 论坛

- `/Users/baihe/Documents/teenx-forum/AI-AGENTS.md`
- `plugins/teenx-pm-safety/plugin.rb`
- `plugins/teenx-pm-safety/config/settings.yml`
- `lib/guardian.rb` 中 `can_send_private_message?`
- `app/models/discourse_connect.rb`
- `lib/discourse_connect_base.rb`
- Discourse plugin migration、model、service 和 request spec 规范

### 1.4 Open Design 原型

目录：

```text
/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95
```

读取：

- `p23-user.html`
- `p24-me.html`
- `p25-settings.html`

原型只作为信息层级和视觉参考。不要照搬其中“关注后直接私信”“允许陌生人私信”或 mock 数据行为。

## 2. 不可违反的约束

本 #10 只扩展 Profile 与社区安全联络，不扩展 Arena publication scope。当前 `AGENTS.md` 仍明确禁止 leaderboard、public submissions 和跨用户公开 Arena 结果；其他 Captain Profile 不得显示 Arena 分数、排名、结果链接或提交。`/me` 可以继续显示当前 Captain 自己的私有 Arena 记录。

1. **不修改 Paperclip DB schema。** 不新增 Profile、Connection、Conversation、Message 或 Rank 表，不生成 Paperclip migration。
2. **不建立第二套消息系统。** PM 正文、会话、未读、屏蔽和举报继续由 Discourse 管理。
3. **不恢复预算或成本。** `/api/advx/*` 不得返回 budget、cost、credits、spend、token usage。
4. **不暴露模型。** Profile 不返回 model、provider、endpoint、temperature、max tokens 或内部 run log。
5. **不暴露审批治理模块。** 本任务的“私信申请”是社区安全授权，不是 Paperclip execution approval，不得打开治理 UI。
6. **不允许客户端指定身份。** 禁止迁移 `x-user-id`、demo 用户切换器或请求体 `actorId`。
7. **不允许企业直接联系儿童。** 不迁移 `enterprise` 用户角色、企业申请、open-to-work 或企业会话。
8. **不公开敏感 Profile 字段。** 不提供所在地、邮箱、电话、代词、微信、GitHub、外部网站、任意 JSON 或站外头像。
9. **儿童 Profile 只对已登录 TeenX 用户可见。** 不做匿名互联网 Profile，不允许搜索引擎索引。
10. **默认私密。** Team、Profile 聚合论坛活动和新 DM 申请默认关闭；P0 不提供用户目录。
11. **关注或好友不得授予 PM。** 私信授权必须独立、明确、可撤销。
12. **使用现有视觉系统。** 不引入 Tailwind、第二个 Router、独立 CSS 或源 Web 导航；TS/TSX 禁止 hex。
13. **保留现有 Studio 和论坛。** `/studio`、`/forum`、Discourse Connect、`/me` 和已有 `/api/advx/*` 不能回归。
14. **外部依赖 fail closed。** Discourse 离线、身份不匹配或 bridge 验签失败时，隐藏他人的私密聚合并禁用联络动作。
15. **child API deny by default。** TeenX child session 不能直接调用 Paperclip cost、governance、secret、adapter、core productivity Profile 等操作员 API。
16. **child PM 只允许一对一。** 禁止通过群 PM、邀请新参与者或已有 topic reply 绕过 pair grant。
17. **关闭 Discourse Chat。** 本轮不为 Chat 重做第二套 grant/content safety；child deployment 必须 `chat_enabled=false`，直接 Chat API 也不可用。

## 3. 先修复安全前置项

在增加 Profile 页面前完成并测试本节。

### 3.0 建立 child-facing API 边界

当前 Paperclip 把 ADVX 和操作员 API 挂在同一个 `/api` router。child board session 可以绕过 `ui-advx` 直接请求核心 cost、governance、secret、adapter 和 `server/src/routes/user-profiles.ts`。前端不显示入口不能构成安全控制。

在 TeenX authenticated/public deployment 增加 server-side deny-by-default allowlist，例如由明确的 `TEENX_CHILD_MODE` 部署模式启用。中间件必须紧跟 `actorMiddleware`，位于 `/api/auth`、root `/llms/*`、主 `/api` router、MCP 和 plugin route 之前，不能只挂在后创建的 `api` Router 上。要求：

- 按 HTTP method + 精确 path pattern 逐项放行经过审计的 ADVX route，不能简单通配整个 `/api/advx/*`。
- 不把整个 `/api/auth/*`、`/api/assets/*` 或 `/api/companies/*` 通配放行。
- Better Auth 只放行登录、回调、登出等实际需要的方法和路径；新增脱敏 `/api/advx/session`，不要直接放行会返回 raw session/user ID 的 `/api/auth/get-session`。
- 显式拒绝 root `/llms/*`、MCP、plugin static/API 和所有未枚举 route。
- operator 管理面使用独立实例或不可由儿童到达的独立受信入口，不能靠可伪造 Host/header 绕过。
- agent API key、board key 和普通浏览器 session 的能力分开；Profile/SSO 只接受 interactive `session`，本地开发可显式允许 `local_implicit`。
- child deployment 完全拒绝 `board_key` actor，不给它 ADVX allowlist 旁路；审计并撤销已由 child 用户创建/持有的 Paperclip board keys。operator automation 只能走隔离管理面。
- 对 cost、budget、approval、execution policy、secret、adapter config、core productivity profile 等代表性路由增加 child-session 403/404 测试。
- `TEENX_CHILD_MODE` 要求开启却未正确安装 gate 时，server fail startup，不以 warning 继续。
- 在 allowlist 完成前，不得称当前站点为儿童安全边界。

路径 gate 之后仍要审计每个允许响应。当前至少需要重写：

- `/api/advx/teams/:teamId/activity`：不能返回原始 Activity row、raw `actorId` 或任意 details；使用 action-specific 白名单摘要。
- `/api/advx/test-runs/:runId`：不能返回 raw `resultJson`、完整 activity、内部 work product metadata/URL 或 agent ID；使用 TeenX TestRun DTO。
- `/api/advx/arena/*`：按 Arena #9 public DTO 逐字段确认，不因 path 已允许就跳过内容审计。

为所有 child-allowed ADVX route 做契约测试，深度检查 cost、token、model/provider、raw user ID、prompt/log、内部 URL 和未知 metadata。

### 3.1 普通 SSO 用户不得成为 Discourse admin

当前 `server/src/routes/advx.ts` 的 Connect payload 固定发送：

```ts
admin: "true",
moderator: "false",
```

改为普通用户：

```ts
admin: "false",
moderator: "false",
```

要求：

- 不根据昵称、email、Team owner 或客户端参数授予 staff。
- 本轮不实现自动管理员同步。论坛管理员使用独立人工控制账号。
- 先创建并验证一个不属于 child SSO 的独立人工管理员，避免清理后失去管理入口。
- 增加一次性 Rails runner/task，把已有 TeenX SSO 用户的 `admin`、`moderator` 清零并刷新 admins/moderators/staff automatic groups。不能只等待用户下次 SSO。
- 把既有错误提升按安全事件处置：建立唯一 staff allowlist，审计并撤销 child 创建的 API keys、staff memberships、secondary admin accounts、邀请和其他持久授权；失效相关 sessions，必要时轮换可能已暴露的 credential。
- 清理后枚举所有 admin/moderator/API principal，证明没有未授权管理主体残留。
- 增加 route/service 测试，解码返回 SSO payload 后断言普通 Captain 的 `admin=false`、`moderator=false`。
- 浏览器走一遍 SSO，确认少年用户不能打开 Discourse admin 页面。
- SSO endpoint 只接受 interactive board session；拒绝 `board_key`、agent 和浏览器传入的替代 actor。

### 3.2 PM 内容必须在持久化前拒绝

当前 `teenx-pm-safety` 使用 `on(:post_create)` / `on(:post_edit)`；仓库没有对应触发事件，且 post-created 事件晚于持久化。

将其改为 Discourse 支持的 Post validation 或等价 pre-persist 扩展点，例如遵循官方插件使用的 `validate(:post, ...)` 模式。要求：

- 普通用户 PM 禁止外部 URL、email、电话号码、微信/QQ/`@handle` 等站外社交账号和上传附件标记；先做 Unicode NFKC/空白归一化再检测常见混淆。
- 创建和编辑都验证。
- 每次新建和回复 PM 都检查该 topic 恰好包含两个 child 用户且双方 active grant 仍有效。
- 把真实 setting `max_allowed_message_recipients` 设为 `1`，并在 plugin 层禁止 child 向既有 PM 邀请第三人；不能继续使用不存在的 `pm_max_recipients`。
- staff/system 的必要安全通知可以有受控例外。
- 错误使用本地化文案，不泄露内部正则。
- 不只做前端禁用。
- 增加 plugin specs，断言 URL、email、电话、站外社交账号、常见混淆写法和 upload marker 的非法创建/编辑请求失败且数据库没有保存非法正文。
- 增加 specs，断言群 PM、邀请第三人、grant 撤销后的 reply 都失败。
- 保留举报、ignore 和 Discourse 原生 rate limit，不以插件替换这些能力。

不要声称简单正则能覆盖全部儿童安全风险。它只是基础防线，仍需举报和工作人员处置。

### 3.3 关闭未纳入授权模型的通信旁路

Discourse Chat 默认开启，支持群组 DM、上传和独立 Chat message 存储，不经过 Post validation 或普通 PM Guardian。本轮不同时维护第二套 Chat 安全实现，因此：

- child deployment 设置 `chat_enabled=false`。
- 验证 Chat 导航、channel creation、direct-message 和 message API 对 child 均不可用。
- 检查现有 Chat channels；保留审计/备份，但不能让 child 继续访问历史未授权 channel。
- 不只把 Chat 从 UI 隐藏。

在 pair grant 尚未完整上线前，把 `personal_message_enabled_groups` 限制为 admins/moderators，暂停 child PM。grant 上线后由窄范围 Guardian modifier只对 active pair 开放；`max_allowed_message_recipients=1` 继续保留。

### 3.4 收敛原生 Discourse Profile

关闭目录并不会阻止已登录用户直达 `/u/:username`。当前原生 Profile 仍可能暴露或允许编辑 bio、location、website、username、上传头像和 Gravatar，不能只保护新的 React Profile。

child deployment 必须：

- 设置 `auth_overrides_username=true`、`auth_overrides_name=true`，username 固定为 SSO 生成的非识别值，name 使用经过公共昵称安全校验的值。
- 设置 Discourse Connect 覆盖 bio/location/website，并在 SSO payload 中持续发送空值；迁移时清理既有 child user profile 中这些字段。
- `gravatar_enabled=false`、`automatically_download_gravatars=false`，`uploaded_avatars_allowed_groups` 只保留 staff；清理 child 既有自定义/Gravatar avatar，回退为 Discourse 本地 letter avatar 或审核过的受控 avatar。
- 在 child user/profile/card serializers 中明确排除 bio、location、website、unsafe custom fields 和 raw external identity，不能只靠前端 CSS。
- 原生 Profile 的“发消息”入口仍由 pair Guardian 控制；未授权时直接 PM API 失败。
- 增加 direct `/u/:username`、user card、profile update、username update、avatar upload/Gravatar refresh API 测试。

`show_forum_activity=false` 只控制 TeenX 聚合页，不会隐藏用户已在论坛发布的帖子。设置页必须明确说明，不能制造虚假隐私承诺。

## 4. 目标业务闭环

本交接应跑通：

```text
当前 Captain 打开 /me
-> 查看自己的身份、Team、论坛和真实 Arena 空状态/成绩
-> 打开 /me/settings
-> 修改昵称
-> 设置 Team、论坛活动和 DM 申请可见性
-> 保存过程中继续输入不会被旧响应覆盖

登录用户从论坛或未来排行榜打开 /captains/:publicId
-> 只看到目标明确公开的字段
-> 服务端返回当前查看者可执行动作
-> 发起无自由文本的 DM 申请
-> 对方在 /me/contacts 接受、拒绝或屏蔽
-> 接受后才能深链到 Discourse PM
-> 任一方撤销或屏蔽后，Discourse Guardian 立即禁止继续发送
```

Arena #9 已实施；`/me` 读取当前 Captain 的 owner-scoped 真实参赛记录，并只在该 Captain 没有记录时显示明确空状态。禁止复制源分支 seed 分数、Agent、排名或徽章。

## 5. 系统所有权

### 5.1 Paperclip / advx26 拥有

- 当前 board session 和仅服务端可见的 Paperclip Captain ID。
- 昵称和加入时间；公开头像先由 Discourse 同源 avatar path 负责。
- Team、成员数、版本数和试跑数。
- Arena Submission、Run 和 owner-only Scorecard；本 #10 不公开给其他 Captain。
- Team 范围内的资料变更 Activity。
- 浏览器可见的严格白名单聚合 DTO。

### 5.2 Discourse / teenx-forum 拥有

- 论坛用户及其 SSO external identity。
- Profile 可见性偏好。
- DM 申请、DM 授权、撤销和屏蔽。
- PM topic、post、未读、ignore、举报和工作人员处置。
- 查看者对论坛帖子和用户的 Guardian 权限。

### 5.3 ui-advx 负责

- 展示聚合结果和 partial/unavailable 状态。
- 使用服务端 `viewerActions` 渲染按钮。
- 通过 `/forum?path=...` 打开已授权的 Discourse PM。
- 不在客户端组合权限、不隐藏后仍保留敏感响应、不持久化第二份关系状态。

## 6. 公共身份与跨系统映射

### 6.1 不暴露 Paperclip auth ID

为每个 Captain 生成 versioned、不可逆 `publicId`：

```ts
const digest = createHmac("sha256", secret)
  .update(captainId)
  .digest("base64url");
const publicId = `captain_v1_${digest}`;
const forumUsername = `tx_${digest.slice(0, 16)}`;
```

要求：

- Secret 使用新的 `TEENX_PROFILE_PUBLIC_ID_SECRET`。
- authenticated/public 部署缺 secret 时启动或 Profile 功能 fail closed，不能退回 raw ID。
- `publicId` 稳定但不可反推出 `captainId`。
- 使用完整 HMAC digest，不为短 URL 任意截断主 public ID；论坛 username 单独截断并在迁移时检测碰撞。
- API、URL、DOM 和 Activity 对外摘要不出现 raw auth ID。
- local demo 也走同一 helper，不在组件里特判拼字符串。
- public Captain Profile 的资格明确限定为“拥有 active Team 的已批准 child 身份”。无 Team 用户仍可使用 `/me`，但不显示“公开主页”入口，`/captains/:publicId` 返回 404。
- `local_implicit` 只使用测试/开发 fixture 和持久配置的本地 secret；不得在 production public profile cohort 中出现。
- 该 secret 是持久身份材料，不能普通轮换。确需轮换时必须先设计 `v2`、旧链接映射和 Discourse SSO migration，不能直接改环境变量。
- Paperclip 反查 `/captains/:publicId` 时，只查询 active Team 的 distinct `defaultResponsibleUserId` 并关联已批准 child identity，在服务端一次构建完整 HMAC map，使用短 TTL cache和 miss rate limit；零匹配和多匹配都返回同一个 404。为扫描设置明确上限，超过上限 fail closed 并要求进入后续索引方案，不能静默只扫前 N 个。不得为每个随机 miss 重复全表扫描，也不得把 raw ID 映射发到客户端。

### 6.2 让 publicId 成为 Discourse external identity

Discourse Connect payload 是签名的 base64，不是加密。当前 raw `captainId` 位于浏览器可解码的 `external_id` 中，必须迁移为：

```text
external_id=<publicId>
username=<forumUsername>
```

要求：

- 浏览器看到 publicId 是允许的；永远不再把 raw Paperclip ID 放进 SSO payload。
- cutover 全程持有 SSO maintenance lock：先拒绝新的 Connect login，再 dry-run，迁移记录，部署只发送 publicId 的 Paperclip payload，验证后才恢复 SSO。回滚也必须在同一 lock 下执行。
- 在 maintenance lock 内运行一次性、可回滚的迁移，把本论坛已有 TeenX `SingleSignOnRecord.external_id` 从旧 raw ID 改为对应 publicId，并处理 username。
- 迁移先做 duplicate/collision dry run，发现冲突即停止，不自动合并用户。
- 同时重写或清空 `SingleSignOnRecord.last_payload` 中包含的旧 raw external ID；扫描 live SSO records 和允许访问的当前数据，确保旧 ID 不再残留。备份和历史日志的保留/销毁另写运维说明，不在迁移时静默篡改审计介质。
- 对每个旧用户验证 posts、PM、badges 和 user ID 均保持不变，只改变 SSO record external ID/username/last_payload。
- cutover 测试必须证明旧 raw-ID payload 在解锁后被拒绝，不能通过 email matching 把已迁移 record 写回旧 external ID 或创建重复身份。
- 不再需要 `custom.teenx_public_id` 这一份重复映射；Profile plugin 直接按唯一的 `SingleSignOnRecord.external_id=publicId` 查找。

不要把用户昵称当主键。昵称可改、可重复；URL 和关系必须使用 `publicId`。

### 6.3 Profile bridge

Paperclip 不直连 Discourse 数据库，也不让浏览器携带 raw Paperclip ID。浏览器可见的 external ID 只能是 publicId。新增窄范围服务端 bridge：

```text
Paperclip server -> Discourse plugin internal endpoint
```

使用独立 `TEENX_PROFILE_BRIDGE_SECRET`，签名至少覆盖：

```text
HTTP method
path + canonical query
timestamp
body sha256
```

要求：

- 五分钟内时钟窗口。
- constant-time HMAC 比较。
- mutation 请求增加 nonce/replay 防护。
- endpoint 只返回 Profile 所需字段，不做通用 admin API。
- 目标和当前查看者都只以各自计算出的 publicId 传递，并通过 `SingleSignOnRecord.external_id` 解析。
- 不在 bridge query、body、日志或错误中传 raw Paperclip actor ID。
- bridge 不可用时他人 Team visibility 按 false 处理，contact 为 unavailable；Arena 对他人始终不返回。

## 7. Discourse Profile 与 DM 授权插件

可以扩展 `teenx-pm-safety`，也可以新建职责清晰的 `teenx-profile-safety` plugin。不要把大量关系逻辑继续堆在单个 `plugin.rb`；使用 plugin model、service、controller、serializer 和 specs。

### 7.1 可见性偏好

使用现有 `UserCustomField`，不需要为偏好新增表：

```text
teenx_show_team                default false
teenx_show_forum_activity      default false
teenx_accept_dm_requests       default false
```

规则：

- 只允许当前用户修改自己的三个布尔偏好。
- 未设置、非法值和 bridge 错误全部解释为 false。
- 迁移先归并这三个 field 的旧重复值，再为它们增加 `(user_id, name)` partial unique index；注册为 boolean type，但不注册为 generic public/self-editable field。
- privacy PATCH 在 user row lock/transaction 内做 atomic upsert。并发相反更新只能产生一个标量最终值，不能生成 `UserCustomField` 数组。
- `show_forum_activity=false` 只是不在 TeenX Profile 聚合，不改变已发布帖子的类别可见性。
- 这些字段只能经过本 plugin 的 allowlisted endpoint 修改。
- 把 Discourse `enable_user_directory` 设为 false。P0 不展示一个没有实际 consumer 的“允许出现在目录”开关；未来若新增目录，必须另行定义 authenticated cursor API、页面和 opt-in 测试。
- 不新增 location、website、social links、open-to-work 或 enterprise 设置。
- 增加并发 privacy save spec，断言每个 user/field 始终只有一行。

### 7.2 DM 请求表

在 Discourse plugin 中新增持久化模型，不在 Paperclip 新增表。建议最小字段：

```text
teenx_dm_requests
  id
  public_id UUID unique
  requester_id
  target_id
  status: pending|accepted|declined|revoked|expired
  created_at
  decided_at
  expires_at
```

请求**不允许自由文本附言**。这样可以避免用户在获准私信前先通过申请消息骚扰或发送联系方式。

浏览器和 Paperclip BFF 只使用随机 `public_id`，不公开 Discourse 自增主键。

约束：

- requester != target。
- 7 天过期。
- normalized user pair 同时最多一条 pending。
- reciprocal pending 返回明确状态，让接收方处理已有申请。
- 请求方和目标都必须 active、approved、非 staged、非 suspended。
- target 的 `teenx_accept_dm_requests` 必须为 true。
- 创建操作加按用户和目标的 rate limit。
- accept、decline、revoke 使用 transaction、row lock 和条件状态更新。
- 只有 target 可 accept/decline，只有 requester 可 revoke；第三方用猜测 request ID 调用时返回与不存在一致的 404。

### 7.3 DM grant 与方向性 block

新增：

```text
teenx_dm_grants
  id
  user_low_id
  user_high_id
  status: active|severed
  established_at
  updated_at

teenx_dm_blocks
  id
  blocker_id
  blocked_id
  created_at
```

要求：

- normalized pair 唯一。
- accept 原子创建或恢复 active grant。
- 任一方可 sever。
- 任意登录用户都可在从未建立关系前 block 目标。
- block 不要求存在 grant。它原子新增当前 actor 的方向 block、撤销该 pair 双方向所有 pending，并把已有 active grant 改为 severed，立即禁止双向新申请和发送。
- block 是方向记录，`UNIQUE(blocker_id, blocked_id)`。A block B 与 B block A 可以同时存在。
- 用户只能删除自己作为 blocker 的记录；A unblock B 不能删除 B 对 A 的 block。
- 被屏蔽方只看到“暂不可联络”，不暴露是谁屏蔽了谁。
- block/unblock/sever/accept/decline 写 Discourse StaffActionLogger 或等价审计。
- 已有 PM 可以保留历史可读性，但 Guardian 必须阻止 grant 失效后的新 post。
- 只有 grant 两端参与者可 sever；任何 actor 只能以“自己是 blocker、目标 publicId 是 blocked”的方向创建 block。第三方对泄露的 grant/request ID 一律得到 indistinguishable 404。

### 7.4 Guardian 是最终权限源

扩展 Discourse 的 PM Guardian：

- 普通 child-to-child PM 仅在 active `teenx_dm_grant` 时允许。
- `friend`、follow、同 Team、同类别或知道 username 均不能绕过。
- 双方必须 active、approved、非 staged、非 suspended，且任一方向都没有 `teenx_dm_block`。
- child PM topic 必须恰好是双方两名用户，禁止 group recipient 和后续 invite。
- staff/system 的通知与安全处置使用明确例外。
- 直接调用 Discourse PM endpoint 也必须被拦截，不能只保护 `ui-advx`。
- 不只扩展 `can_send_private_message?`：每次 reply/edit 的 pre-persist validation 都重新读取 grant/block，因为已有 PM reply 主要走 `can_create_post?`。
- target ignore、suspended、`allow_private_messages` 等原生限制继续生效。

不要在 Paperclip 保存 `canMessage=true` 快照。每次创建或回复 PM 时由 Discourse 重新判断。

## 8. ADVX API

保持现有 ADVX 成功响应风格，不要为了源分支的 `{ data: T }` 一次性重写全部 API。错误可以兼容性增加稳定 code：

```json
{ "error": "申请已在等待处理", "code": "CONTACT_REQUEST_PENDING" }
```

现有 `ui-advx/src/api.ts` 的 `j()` 必须继续能读取错误文案。

Profile 补强需要收敛三个现有 ADVX 契约：

- 把 `/api/advx/me.profile.id` 改为 `publicId`，不返回 raw auth ID。
- `/api/advx/me.team` 使用专门的 self-summary mapper，不复用含 model 的 `toTeamView()`。
- `/api/advx/captain` 和 `/captain/claim` 当前没有 UI 生产调用，只被旧 smoke 使用。移除或改成不返回 raw captainId/model 的内部 bootstrap，并同步 `ui-advx/src/api.ts`、`scripts/advx-smoke.sh` 和旧文档。

这是一项有意的安全契约变更，不要添加长期兼容字段把 raw ID/model 再送回儿童浏览器。

### 8.1 当前用户资料

新增或拆分为：

```text
GET   /api/advx/me
PATCH /api/advx/me/identity
GET   /api/advx/me/privacy
PATCH /api/advx/me/privacy
```

`identity` 只允许：

- `nickname`：NFKC normalize + trim 后 1 至 24 个可显示字符，拒绝控制字符、URL/domain、email、长数字电话模式、`@handle` 和明显微信/QQ/站外联系方式。

公共昵称本身是审批前可见的通信面，不能只做长度检查。要求：

- nickname 修改 rate limit，并记录不含原文的安全审计。
- 对 Unicode 空白、全角符号和常见混淆写测试；正则不是完美风控，但不能让明显联系方式直出。
- 既有非法昵称在公共 mapper 中使用稳定安全 fallback，例如 `小队长-${publicId.slice(-4)}`，同时提示本人修改；不把 legacy 原文发送给他人。
- SSO 设置并测试 `auth_overrides_name=true`，使通过安全校验的 display name 在下次 Connect 更新。若不启用该 setting，则改用签名 bridge 显式同步，不能声称 SSO 会自动更新。
- 抽出同一套 public-text validator 给 public nickname、公开 Team name 和联络 counterpart label 使用。Team 名包含联系方式、URL、控制字符或 bidi override 时，即使 `show_team=true` 也省略 Team section并提示 owner 修正；不要把不安全原文换个接口公开。

P0 不在 ADVX 增加头像编辑。Paperclip `/api/assets/:id/content` 是 company-private，不能直接作为跨 Team 头像；外部 `http(s)` 头像又有追踪风险。其他队长 Profile 如展示头像，只能使用 bridge 返回并严格验证的 Discourse 同源相对 `avatarPath`，由浏览器通过 `/discourse` 加载。现有 `/api/auth/profile` 可保留给隔离的 Paperclip operator UI，但 child API allowlist 不开放它。

资料更新成功后：

- 刷新 `CaptainProvider`。
- Team 已存在时写脱敏 Activity，只记录变更字段名，不记录旧/新自由文本全文。
- 下次 Discourse Connect 同步 display name，不同步 Paperclip 外部 image URL。

identity 和 privacy 是两个独立写操作，不伪装成跨 Paperclip/Discourse 的原子事务。UI 分区显示各自保存结果。

### 8.2 他人 Profile

新增：

```text
GET /api/advx/captains/:publicId/profile
```

必须要求登录。建议 DTO：

```ts
interface AdvxCaptainProfile {
  profile: {
    publicId: string;
    nickname: string;
    avatarPath: string | null;
    joinedAt: string | null;
  };
  team?: {
    name: string;
    memberCount: number;
    versionCount: number;
  };
  forum?: {
    username: string;
    topicCount: number;
    recentTopics: Array<{
      id: string;
      title: string;
      createdAt: string;
      path: string;
    }>;
  };
  viewerActions: {
    isSelf: boolean;
    contactState:
      | "self"
      | "unavailable"
      | "closed"
      | "available"
      | "outgoing_pending"
      | "incoming_pending"
      | "approved"
      | "blocked";
    canRequestDm: boolean;
    canRespond: boolean;
    canMessage: boolean;
    canBlock: boolean;
    canUnblock: boolean;
    requestId: string | null;
    forumMessagePath: string | null;
  };
}
```

规则：

- `team` 仅在 `show_team=true` 或 `isSelf=true` 时出现；隐藏时字段完全省略。
- `forum` 仅在 `show_forum_activity=true` 或 self 时出现，且用当前 viewer 的 Discourse Guardian 过滤；隐藏时字段完全省略。
- bridge 不可用时，非 self 的 team/forum 字段全部省略，联络 unavailable。
- 他人 Profile 不返回任何 Arena 字段。跨用户 Scorecard publication 需要新的明确 handoff，并且只能考虑 `official: true` 的完成结果；Mock 永远不能公开为成绩。
- `avatarPath` 只能是 allowlisted Discourse 同源相对路径，禁止 scheme、host、`..` 和协议相对 URL。
- `forumMessagePath` 必须是服务端生成的同源 Discourse 相对路径，不能接受目标提供的 URL。
- 不复用 `toTeamView()`，因为它包含 model。为 Profile 建立更小的白名单 mapper。
- 不调用或转发 `server/src/routes/user-profiles.ts`，该核心路由包含 email、cost、token 和 provider 数据。
- 对所有层级做 budget/model denylist 回归测试，但安全基础应是 allowlist DTO，而不是只依赖字符串删除。

### 8.3 联络 API

Paperclip route 作为 BFF，通过签名 bridge 调用 Discourse plugin：

```text
GET    /api/advx/me/contact-requests?box=inbox|sent&cursor=...
POST   /api/advx/contact-requests
PATCH  /api/advx/contact-requests/:requestId
DELETE /api/advx/contact-requests/:requestId
DELETE /api/advx/contacts/:publicId?action=sever|block
POST   /api/advx/contacts/:publicId/unblock
```

请求体：

```ts
POST  { targetPublicId: string }
PATCH { decision: "accept" | "decline" }
```

禁止 message、note、actorId、targetUserId、role 或 policy 字段。

列表使用有界 cursor 分页，建议默认 20、最大 50。浏览器把 cursor 当不透明字符串。

浏览器可见 DTO 必须单独定义，不能转发 plugin ActiveRecord/serializer row：

```ts
interface ContactCounterpart {
  publicId: string;
  nickname: string;       // 已经过 public-text safety mapper
  avatarPath: string | null;
}

interface ContactRequestSummary {
  requestId: string;      // teenx_dm_requests.public_id，不是 DB id
  direction: "incoming" | "outgoing";
  state: "pending" | "accepted" | "declined" | "revoked" | "expired";
  counterpart: ContactCounterpart;
  createdAt: string;
  expiresAt: string;
}

interface ContactGrantSummary {
  counterpart: ContactCounterpart;
  state: "approved" | "blocked";
  establishedAt: string | null;
  canMessage: boolean;
  canSever: boolean;
  canBlock: boolean;
  canUnblock: boolean;
}

interface ContactPage<T> {
  items: T[];
  nextCursor: string | null;
}
```

Mutation response 只返回更新后的 `viewerActions` 或对应 summary，加 `ok` 即可。禁止返回 requester/target Discourse IDs、raw external IDs、blocker ID、内部 status row、staff note 或自由 metadata。

每个 mutation 都必须在 Discourse 重新鉴权：

- 只有 target 可 accept/decline。
- 只有 requester 可 revoke。
- 只有 grant 两端可 sever。
- 当前 actor 只能创建/删除自己方向的 block。
- unrelated actor 请求已存在 ID 时也返回与不存在一致的 404，防止 IDOR 与资源存在性枚举。

## 9. ui-advx 页面

### 9.1 路由

保留并增加：

```text
/me                         现有个人中心，增强
/me/settings                设置
/me/contacts                收到、发出和已授权 DM
/captains/:publicId         其他队长 Profile
```

不要新增 MessagesPage。实际消息仍在：

```text
/forum?path=<encoded Discourse PM path>
```

### 9.2 `/me`

保留当前 `MePage` 的真实 Team、论坛活动、私信未读和收藏。补充：

- 昵称身份区；已有 self image 可保留显示，但不把它升级为跨 Team 公共资源。
- “查看我的公开主页”。
- 设置和联络申请入口及待处理数。
- 读取 Arena #9 中当前 Captain 的 owner-scoped 真实参赛记录；仅在该 Captain 没有记录时显示明确空状态。
- 论坛不可用时保留 Studio 内容，不把整个页面判为失败。

不要重新实现现有 ForumOverview，也不要把 Discourse PM 内容拉进 Paperclip。

### 9.3 `/captains/:publicId`

参考 p23 的层级，但使用 TeenX 安全 DTO：

- 匿名昵称、Discourse 同源头像或首字母占位、加入时间。
- 目标主动公开时才显示 Team。
- 不显示对方 Arena 分数、排名、提交或结果链接。
- 目标主动公开时显示当前 viewer 有权看到的论坛主题。
- 不显示 follower/following、location、social links、enterprise、draft Agent 或内部 activity。
- 联系按钮完全由 `viewerActions` 驱动。
- 快速切换 publicId 时立即清空旧 Profile 和旧按钮，使用 AbortController 或 generation guard。

联系状态文案至少覆盖：

| 状态 | 主按钮 |
|---|---|
| self | 隐藏 |
| unavailable | 社区暂不可用，禁用 |
| closed | 暂不接收私信申请，禁用 |
| available | 申请私信 |
| outgoing_pending | 申请中，可进入联络页撤回 |
| incoming_pending | 待你回应，进入联络页 |
| approved | 发私信 |
| blocked | 暂不可联络；仅 `canUnblock` 时显示解除屏蔽 |

不要向被屏蔽方显示“对方屏蔽了你”之类可用于骚扰升级的细节。

### 9.4 `/me/settings`

分成两个独立保存区：

1. 身份：昵称。
2. 隐私：show team、aggregate forum、accept DM requests。

要求：

- 使用 `FeedbackProvider`，不用 `window.prompt`、`alert`、原生 confirm。
- 每个控件有 label、说明和键盘焦点。
- 默认 false 的含义写清楚。
- 保存请求发出后用户继续输入时，旧响应不得覆盖新输入。迁移源 `SettingsPage` 的 revision guard 原则。
- 离开有未保存更改的页面前提示。
- Forum privacy 保存失败不影响已经成功的 nickname 保存，反之亦然。

### 9.5 `/me/contacts`

使用 `Seg` 展示：

- 收到的申请。
- 发出的申请。
- 已授权联系人。

支持：

- accept / decline。
- revoke。
- sever。
- block。
- 仅 blocker 可见的 unblock。
- cursor 分页和明确空状态。

请求不显示或输入自由文本附言。

### 9.6 Profile Card

只有真实 Arena 排行榜或论坛入口需要时才实现轻量 Profile Card。必须：

- 使用键盘可聚焦 button/link 作为 trigger。
- 使用 dialog/popover 语义，不用 `role=tooltip` 包含可点击按钮。
- Escape 关闭，焦点返回 trigger。
- 路由或用户变化时取消旧请求。
- 不单独返回比完整 Profile 更多字段。

如果本轮没有真实排行榜入口，先不实现 hover card，不为展示源功能而造无入口组件。

## 10. 源分支迁移指引

### 保留原则并重写

- `ProfileUser` 的公开字段白名单。
- `ViewerRelation` / `ViewerCapabilities` 的服务端权威思想，收敛成更小的 `viewerActions`。
- normalized pair、request expiry 和事务状态转换。
- Profile route generation guard。
- Settings revision guard。
- `(createdAt,id)` cursor 设计，供联络列表和未来时间流使用。
- 桌面与 Pixel 7 E2E 场景。

### 不复制

- `apps/server/src/db/schema.sql`
- `apps/server/src/db/client.ts`
- `apps/server/src/middleware/currentUser.ts`
- `apps/web/src/lib/currentUser.ts`
- `apps/web/src/App.tsx`
- 源 `styles.css`
- `MessagesPage.tsx`
- `LeaderboardPage.tsx` 的 seed 数据与 GET 写快照逻辑
- `enterprise`、social links、location、pronouns、profile.data
- `friendPolicy=open`
- friend 自动获得 DM 的 `hasRequiredConnection()` 逻辑

## 11. 并发与一致性

必须测试以下竞态：

1. A 和 B 同时向对方申请，只产生一条 normalized pair pending。
2. 两次 accept 只有一次成功转换，另一请求返回稳定 conflict。
3. accept 与 revoke/decline 并发不会同时成功。
4. block 与 accept 并发时 block 获得最终优先级，不能留下 active grant。
5. request 过期后不能 accept，也不计入待处理数。
6. sever 或 block 后，已有 Discourse PM 不能继续发新 post。
7. 用户只能解除自己方向的 block，不能删除对方方向的 block；unblock 不自动恢复 active grant，双方需重新申请。
8. grant 有效时也不能创建三人 PM；撤销后对已有一对一 PM 的 reply 立即失败。
9. Profile A 的慢响应不能覆盖已经切换到 Profile B 的页面。
10. privacy 保存响应不能覆盖保存后继续修改的表单值。

不要依赖单进程内 Map 作为唯一锁。Discourse Postgres 使用唯一索引、transaction 和 row lock。

## 12. 安全与隐私测试矩阵

至少覆盖：

### 身份

- 无 session 调用 Profile/联络 API 返回 401。
- 请求体/header 伪造 actor 无效。
- child session 直连 cost、governance、secret、adapter config 和 core user productivity Profile 等非 allowlist API 返回 403/404。
- child deployment 的 valid `board_key` 也不能访问 ADVX 或 operator API，既有 child board keys 已撤销。
- SSO 普通用户始终 `admin=false`、`moderator=false`。
- 一次性迁移后，旧 child SSO 账号已降权，`SingleSignOnRecord.external_id` 是 publicId，posts/PM/user ID 未改变。
- board key 和 agent actor 不能调用浏览器 SSO/Profile mutation。
- Discourse session 与当前 Captain external identity 不一致时强制重连或 fail closed。
- 原生 Discourse username/name 由 SSO override；child 不能通过 profile update 改 username、bio、location、website 或 avatar。

### Profile 字段

- response 深度搜索不含 `email|budget|cost|credit|spend|token|model|provider|externalId|captainId`。
- 未公开 Team、Arena、forum 均不出现在响应，不是只用 CSS 隐藏。
- 非 allowlisted Discourse 相对 avatar path 不进入他人 Profile。
- public nickname 和 Team name 中的 email、电话、URL、社交 handle、控制字符和 bidi override 不会进入他人响应。
- core `user-profiles.ts` 的生产力数据从未被 ADVX Profile 转发。
- contact list/mutation 深度检查不含 Discourse user/request DB IDs、raw external IDs、blocker ID、staff notes 或未知 metadata。
- 并发 privacy saves 后三个 TeenX field 各自恰好一行且为标量 boolean。

### DM 授权

- 未批准时，直接调用 Discourse PM create/reply 也失败。
- follow/friend 不授予 PM。
- target 关闭 request 时不能创建申请。
- reciprocal pending、过期、重复 accept、revoke 均有稳定结果。
- requester/target 任一方未 approved、staged 或 suspended 时不能申请、授权或进入 public Profile cohort。
- 第三名 Captain 即使猜到 request/grant ID 也不能 accept、decline、revoke、sever 或 unblock。
- 无关系也能 block。
- block 后双向申请和发送都失败。
- 双方各自 block 后，一方 unblock 不影响另一方向。
- child 群 PM、邀请第三人和 grant 撤销后的已有-topic reply 都失败。

### PM 内容

- URL、email、手机号码、微信/QQ/`@handle`、常见 Unicode/空白混淆和 upload markdown 创建失败且不落库。
- 编辑正常 PM 为非法正文失败，旧正文保持不变。
- UI 的提示与服务端拒绝一致，但移除 UI 检查后服务端仍安全。
- `chat_enabled=false`，child 直接调用 Chat channel、DM、message 和 upload API 均失败。

### 跨 Team

- 用户不能通过 publicId 读取目标 Team 的任务、队员配置、版本 JSON、原始产物或内部 Activity。
- 只返回目标明确发布的聚合摘要。

## 13. UI 和可访问性要求

- 复用 `TopNav`、`PageFoot`、`Feedback`、`Seg`、`.card`、`.btn-*`。
- 新样式只写 `ui-advx/src/styles/app.css`，token 只写 `tokens.css`。
- TS/TSX 无 hex；不新增 Tailwind/PostCSS。
- 不在组件内写 raw badge color 或数据库颜色。
- 390px 下导航、设置开关、联络操作和 Profile 主按钮均可触达。
- 状态不仅靠颜色区分，必须有文字。
- loading、partial、empty、offline、403、404 和 conflict 都有明确反馈。
- Profile Card 若有交互内容必须是可访问 popover/dialog，不是 hover-only tooltip。

## 14. 实施顺序

1. 记录两个目标仓库 `git status`，运行现有最小基线；保留并发进行中的 Arena/Landing 改动。
2. 建立 child-facing API deny-by-default allowlist，拒绝 board key，并收敛每个已允许 ADVX DTO。
3. provision 独立论坛 admin，完成 credential incident audit，在 SSO maintenance lock 下修复 payload并迁移旧 external ID/admin。
4. 锁定原生 Discourse Profile，清理 bio/location/website/avatar，启用安全 username/name override，并关闭 Chat。
5. 修复 `teenx-pm-safety` pre-persist validation、一对一限制和 existing-topic reply authorization；grant 未上线前暂停 child PM。
6. 实现 Discourse 可见性字段唯一约束、DM request/grant/directional-block 模型、Guardian 和 bridge。
7. 在 ADVX server 复用 public ID helper，增加反查 cache、bridge client、白名单 mapper 和 route tests。
8. 收敛 `/me`、`/captain` 契约，更新 API client 与 smoke。
9. 扩展 `ui-advx/src/api.ts`，再实现 `/me/settings`、`/me/contacts`、`/captains/:publicId`。
10. 增强现有 `/me`，不重写其已工作的 Team/Forum 区块。
11. 增加桌面与移动端 E2E，验证两用户审批和屏蔽闭环。
12. 运行全部验收命令并检查两个工作树 diff，只保留本任务文件。

每一阶段先完成后端授权和测试，再开放前端按钮。禁止先做一个看似可用但后端未拦截的 mock 流程。

## 15. 验证命令

本机如找不到 Node，使用：

```bash
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
```

### 15.1 ADVX

```bash
pnpm --filter @paperclipai/server typecheck
pnpm --filter @advx/ui typecheck
pnpm --filter @advx/ui build
pnpm check:token-gates
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src
```

最后一条必须无输出。

运行新增的 server Profile route tests 和现有相关 auth/SSO tests。服务启动后再运行：

```bash
bash scripts/advx-smoke.sh
```

本任务修改中央 auth/routing boundary，targeted checks 通过后还必须运行 PR-ready 全量门：

```bash
pnpm -r typecheck
pnpm test:run
pnpm build
```

若并发工作树中的未完成 Arena/Landing 改动导致失败，不能回滚他人改动；记录准确失败项并与对应线程协调后再宣称完成。

### 15.2 Discourse plugin

运行新增 plugin model/service/request specs，至少覆盖 PM validation、request state machine、Guardian、directional block、bridge HMAC 和 Chat disabled。按论坛仓库版本使用：

```bash
RAILS_ENV=test bin/rspec plugins/teenx-pm-safety/spec
```

如果新建 plugin，则同时运行其 spec 目录。运行相关 RuboCop/JS lint，不要求为本任务运行整个 Discourse 套件。

### 15.3 浏览器

至少验证桌面 1440x900 和移动 390x844：

- `/me`
- `/me/settings`
- `/me/contacts`
- 两个不同 Captain 的 `/captains/:publicId`
- 请求、接受、打开 PM、撤销、屏蔽和解除屏蔽。
- Forum 离线和 session identity mismatch。
- 快速切换 Profile 无 stale action。

当前 `:5174` 可能已有 ADVX UI 进程。不要杀掉不属于本任务的进程；使用可配置替代端口运行隔离 E2E。

## 16. 交付物

完成后提供：

- 两个仓库各自的改动摘要。
- Profile 字段可见性矩阵。
- `viewerActions` 状态矩阵。
- Discourse DM request/grant/block 状态机说明。
- bridge 签名和 secret 配置说明，不包含 secret 值。
- child API allowlist、SSO 降权/publicId migration 与 Discourse plugin migration/部署顺序。
- 所有验证命令和真实结果。
- 桌面/移动关键页面截图。
- 尚未解决的儿童安全和运营风险。

如果本轮产生用户可查看的截图或报告，按仓库 `AGENTS.md` 的 artifact/work product 流程挂载，不只给本地绝对路径。

## 17. 完成检查表

- [ ] 只读取 `feat/profile-system`，未查看源仓库其他分支。
- [ ] 未 merge/cherry-pick 源应用。
- [ ] 未修改 Paperclip DB schema。
- [ ] 未引入第二套 users/messages/conversations。
- [ ] 未迁移 `x-user-id` 或 demo 用户切换。
- [ ] child session 无法调用非 allowlist Paperclip operator API。
- [ ] child deployment 拒绝 board key，既有 child board keys 已审计撤销。
- [ ] 普通 Captain 的 Discourse SSO 不再是 admin/moderator。
- [ ] 已有 child SSO 用户完成降权和 publicId external ID migration，未等待下次登录。
- [ ] SSO cutover 在 maintenance lock 下完成，解锁后旧 raw-ID payload 无法回写或创建重复身份。
- [ ] PM 非法内容在持久化前被拒绝并有测试。
- [ ] child 群 PM、邀请第三人和 grant 撤销后的 reply 均被拒绝。
- [ ] Discourse Chat 对 child UI 和直接 API 均关闭。
- [ ] 原生 Discourse Profile/card/update/avatar 不能暴露或写入 bio、location、website、可编辑 username、Gravatar 或 child 上传头像。
- [ ] 企业直联、location、social links、Paperclip/外部公共 avatar 未进入产品。
- [ ] public nickname、Team name 和 PM 均执行联系方式/社交 handle 安全校验。
- [ ] public Profile 不含 raw auth ID、email、成本、token 或模型字段。
- [ ] 默认 Team/forum/DM requests 全部关闭，Discourse 原生用户目录关闭。
- [ ] 他人 Profile 没有 Arena 分数、排名、提交或结果链接，Mock 结果从不公开。
- [ ] friend/follow 不能绕过 DM 审批。
- [ ] 无历史关系也可 block，block 后双方不能申请或发送。
- [ ] block 为方向记录，一方 unblock 不会删除对方 block。
- [ ] contact DTO 不含任何 Discourse/Paperclip内部 user ID、DB request ID 或 block owner。
- [ ] 三个 privacy custom field 有唯一约束与并发 upsert 测试。
- [ ] 实际消息仍由 Discourse 存储和鉴权。
- [ ] Profile 路由和设置保存竞态有回归测试。
- [ ] `ui-advx` 复用现有组件和七色令牌。
- [ ] desktop 和 390px 移动流程通过。
- [ ] Studio、Forum、SSO 和 ADVX smoke 无回归。

---

本轮最重要的判断标准不是“源 Profile 页面搬了多少”，而是：儿童身份只保留一份、私信只保留一份、权限只由服务端决定、默认不公开、任何关注关系都不能绕过私信同意。
