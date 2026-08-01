# TeenX Profile System 深度分析

> 分析对象只包含 `wunianze666-netizen/teenX` 的 `feat/profile-system` 分支。未 fetch、查看、比较或合并该仓库的其他分支。

> **范围提示：** 本 #10 只覆盖 Profile 与社区安全联络。当前 `AGENTS.md` 允许现有 forum/captain surface，但明确把 Arena 限定为 private evaluation，并禁止 leaderboard/public submissions。本文不设计或授权跨用户公开 Arena 分数、排名、提交或结果链接。

## 1. 来源与基线

| 项 | 值 |
|---|---|
| 源仓库 | `https://github.com/wunianze666-netizen/teenX` |
| 唯一分析分支 | `feat/profile-system` |
| 本地路径 | `/Users/baihe/Documents/teenx-profile-system` |
| 分析时 HEAD | `b4145d46ce3a0c848c5607527c810e2c6ecd8172` |
| HEAD 说明 | `feat: 完善 Profile 审批隐私与端到端验证` |
| 目标仓库 | `/Users/baihe/Documents/advx26` |
| 论坛仓库 | `/Users/baihe/Documents/teenx-forum` |

源分支同时包含 Arena 旧实现。本分析只评估 Profile、联络、消息、隐私、排行榜挂载和相关 UI，不迁移该分支的 Arena、挑战、上传或模型代码。

## 2. 本地验证结果

本机 Node 不在默认 PATH，使用 `/opt/homebrew/opt/node@24/bin` 后完成：

```bash
pnpm install --frozen-lockfile
pnpm --filter @teenx/server test
pnpm --filter @teenx/shared typecheck
pnpm --filter @teenx/agent-core typecheck
pnpm --filter @teenx/ai typecheck
pnpm --filter @teenx/server typecheck
pnpm --filter @teenx/web build
pnpm typecheck
pnpm exec playwright test --config playwright.profile.config.ts
```

结果：

- Vitest：4 个测试文件、14 个测试全部通过。
- Profile HTTP：6 项通过。
- Profile 数据迁移：1 项通过。
- Web API Client：2 项通过。
- shared、agent-core、ai、server、web 与根项目 TypeScript 检查通过。
- Profile Web 生产构建成功。
- Profile Playwright：桌面和 Pixel 7 共 `7 passed / 1 skipped`，跳过项按设计只在桌面滚动容器执行。
- 本机 `:5174` 已被当前 ADVX UI 占用。验证时临时使用 `:5184`，随后恢复源文件并确认源仓库 `git status` 为 clean。

这说明源实现确实可运行，并非只存在于交接文档中。但“测试全绿”只证明现有契约自洽，不代表其身份、数据所有权和儿童安全模型适合 TeenX 主仓库。

## 3. 源分支实际实现

### 3.1 独立技术栈

源实现是一套独立应用：

- `apps/web`：React 19、Vite、HashRouter、独立 CSS。
- `apps/server`：Express、`better-sqlite3`、开放 CORS。
- `packages/shared`：Profile、关系、会话和消息的共享 TypeScript 类型。
- `x-user-id` + `localStorage`：演示身份切换。
- `apps/server/data/arena.db`：Profile 和 Arena 共用的第二套 SQLite。

因此不能直接并入当前 Paperclip server，也不能把其 `apps/web` 嵌入 `ui-advx`。

### 3.2 Profile 聚合

`apps/server/src/routes/profiles.ts` 提供：

```text
GET   /api/users/:handle
GET   /api/users/:id/card
PATCH /api/users/me
GET   /api/users/:id/agents
GET   /api/users/:id/matches
```

有价值的实现包括：

- `ProfileUser` 明确排除邮箱、封禁时间和内部更新时间。
- 社交链接按 `public / friends_only / enterprise_only` 在服务端过滤。
- 非本人只能看到 `published` Agent。
- 对战按查看者关系过滤。
- Profile Card 和完整 Profile 都返回真实关系状态，不由前端伪造默认值。
- Profile 路由切换使用 generation guard，避免 Alice 页面加载中短暂显示 Bob 的按钮。

### 3.3 三类联络关系

源模型区分：

- `friend`
- `dm`
- `enterprise`

每类具有独立申请、状态和关系记录。申请支持：

```text
pending -> accepted
        -> declined
        -> revoked
        -> expired
```

关系支持：

```text
active -> severed
       -> blocked
```

后端已实现：

- 7 天过期。
- 同一无向用户对、同一类型只允许一条 pending 申请。
- `friendPolicy=open` 自动接受好友申请。
- DM 和企业请求通常先进入审批。
- 条件更新检查 `changes === 1`，减少重复审批覆盖。
- 拉黑把用户对的所有 active 通道改为 blocked，并关闭已有会话。

### 3.4 消息和已读游标

`apps/server/src/routes/conversations.ts` 的消息模型是源分支最成熟的部分之一：

- 会话、成员、消息三表分离。
- 只有具备关系的用户才能创建会话和继续发送。
- 分页使用 `(created_at, id)`，同毫秒消息不会丢失。
- 标记已读必须提交 `lastSeenMessageId`，服务端只单向推进游标。
- 前端串行轮询，按 ID 合并去重。
- 只有最新消息进入滚动容器可见区域且页面在前台时才标记已读。
- 路由切换和慢请求均有 stale-response guard。

### 3.5 排行榜与设置

源实现还包括：

- `rank_snapshots` 保存当前名次与上次变化。
- 排行榜 hover Profile Card。
- Profile、Agents、对战、徽章四个 Tab。
- 设置页保存资料和联系策略。
- 设置表单使用 revision guard，保存响应不会覆盖请求发出后继续输入的内容。

## 4. 值得迁移的工程原则

| 原则 | TeenX 主仓库中的用途 |
|---|---|
| 公开 DTO 与账号 DTO 分离 | 永不把邮箱、内部 ID、封禁、成本、模型信息送到他人 Profile |
| 服务端返回查看者能力 | UI 显示申请中、待回应、可私信、已屏蔽等状态，不自行猜策略 |
| 授权判断以后端为准 | 隐藏按钮不是安全控制，API 必须再次验证 |
| Profile 路由 generation guard | 防止切换用户时出现旧资料和旧操作按钮 |
| 设置 revision guard | 防止慢保存覆盖新输入 |
| 事务 + 条件状态转换 | 避免 accept、decline、revoke 的并发覆盖 |
| 无向用户对唯一约束 | 避免 A 到 B 与 B 到 A 的重复申请 |
| `(createdAt, id)` 稳定游标 | 消息和其他时间流分页不因同毫秒数据丢失 |
| 可见后才标记已读 | 打开页面不等于真的读到消息 |
| 桌面和 390px E2E | Profile、设置和联络流程必须覆盖移动端 |

这些原则应重写到现有 Paperclip、Discourse 和 `ui-advx` 边界中，而不是复制其数据库或路由。

## 5. 源实现中的关键问题

### 5.1 “DM 必须独立审批”在实现中可被绕过

源文档声称 friend、dm、enterprise 是独立通道，DM 必须显式审批。但实际代码：

1. `friendPolicy=open` 会自动建立 friend。
2. `conversations.ts` 允许 active `friend` 或 active `dm` 任一关系创建 DM 会话。
3. `ActionButtons.tsx` 也把 active friend 直接显示为“发私信”。

因此任何人只要向开启 open friend 的用户发好友请求，就能自动成为好友并立即私信，无需对方显式批准 DM。这与交接文档的核心隐私规则冲突，不能迁移。

TeenX 正确规则应是：关注、好友或内容订阅永远不能隐式授予私信权限；私信授权必须单独、明确、可撤销。

### 5.2 演示身份不能进入主仓库

`apps/server/src/middleware/currentUser.ts` 信任任意 `x-user-id`；前端允许在 `localStorage` 切换 Alice、Bob、企业用户。配合开放 CORS，任意客户端都能冒充任意用户。

必须完全删除这一身份方式，复用 Paperclip 的 board actor、真实 session 和 Discourse Connect 映射。测试可用受控 fixture，但生产路由不得保留 demo header 后门。

### 5.3 对 11 至 16 岁用户暴露过多个人信息

源 Profile 支持并可公开返回：

- `location`
- `pronouns`
- 任意 `data` JSON
- 外部网站、GitHub、微信、邮件等社交链接
- 外部 `avatarUrl`、`headerUrl`
- 企业账号直接联系儿童

这些字段会增加身份拼接、站外导流、追踪像素和现实位置泄露风险。尤其 `ProfilePage.socialHref()` 会生成 `mailto:` 链接，与 TeenX 私信中禁止邮箱和外部联系方式的安全目标直接冲突。

P0 不应迁移所在地、任意扩展字段、外部社交链接、企业对接或站外头像。头像只允许受控同源资产。

### 5.4 拉黑模型不完整

源实现虽然能阻断已建立关系，但仍有以下问题：

- 只有先存在 active connection 才能调用 block，无法预先屏蔽陌生人。
- 不记录 `blocked_by`，双方无法知道谁有权解除。
- 没有解除拉黑。
- 拉黑时 pending 请求仍可残留在列表中。
- 没有审计日志和后台处置入口。

对未成年人产品，任何用户都必须能在尚未建立关系前屏蔽另一用户；屏蔽应立即撤销待处理请求并禁止双向新申请和发送。

### 5.5 缺少私信安全闭环

源消息 API 只验证非空和 5000 字符上限，还允许客户端提交 `contentType`。它没有：

- 外链、邮箱、电话、社交账号或附件限制。
- 举报、风控、速率限制和审计。
- 监护人或工作人员升级路径。
- 针对骚扰式批量申请的限制。
- 服务端可信的系统消息与普通用户消息类型隔离。

普通用户不能自行提交 `agent_card`、`match_invite` 或 `contact_request` 冒充系统内容。

### 5.6 其他生产缺口

- SQLite 和同步查询不适合当前 Postgres/PGlite 服务壳。
- direct conversation 缺数据库级唯一键，多实例下会重复创建。
- connections、requests、agents、matches 和 conversations 列表无有界游标分页。
- 排行榜 GET 在读取时写 rank snapshot，违反 GET 只读语义，也不适合高并发。
- 好友关系查询是对称的，但 `followers_count/following_count` 更新是方向性的，语义不一致。
- Profile 任意字符串和 URL 缺少严格格式、协议和内容校验。
- 无活动审计、请求限流、CSRF 生产验证和后台治理。
- 独立 HashRouter、导航、CSS、`window.prompt` 和数据库 badge color 不符合 `ui-advx` 组件与七色令牌规范。

## 6. 当前 advx26 已有能力

### 6.1 已有个人中心

当前 `/me` 已由真实数据驱动：

- `server/src/routes/advx.ts` 的 `GET /api/advx/me` 返回当前队长资料、Team 摘要和试跑次数。
- `server/src/routes/auth.ts` 的 `PATCH /api/auth/profile` 修改昵称和头像。
- `ui-advx/src/components/Captain.tsx` 统一驱动顶栏和个人中心身份。
- `ui-advx/src/pages/MePage.tsx` 展示 Team、社区身份、论坛活动、私信未读和收藏。
- `ui-advx/src/api.ts` 使用当前 Discourse 会话读取论坛数据。

这套实现应保留并渐进增强，不能被源分支的 ProfilePage 替换。

分析期间 Arena #9 已由并行线程完成，见 `docs/09-handoff-9-report.md`。其结果和 run route 全部 owner-scoped，排行榜仍未实现。Profile #10 只能在 `/me` 复用本人的私有 Arena 记录，不能把 Scorecard 扩展为跨用户公开资料。

### 6.2 已有论坛和私信所有者

当前 TeenX 已将论坛、用户社区页和 PM 交给 Discourse：

- Paperclip 通过 Discourse Connect 统一身份。
- `/forum` 嵌入同源代理后的 Discourse。
- 私信内容、未读数、屏蔽、举报、权限和论坛帖子均已有明确系统所有者。

因此在 Paperclip 再建 `users / connections / conversations / messages` 会制造双身份、双未读数、双屏蔽状态和最终一致性问题。

### 6.3 可复用基础设施

| 当前能力 | Profile 补强用途 |
|---|---|
| `assertCaptain()` / board actor | 当前查看者身份，不接受客户端 user ID |
| `authUsers.name/image` | 自己的昵称；现有 image 不能未经投影直接作为跨 Team 公共头像 |
| Company = Team | 本人的 Team 摘要，不直接公开跨 Team 内部对象 |
| Arena owner-only Work Product | `/me` 可读取当前 Captain 自己的私有成绩；不得投影到他人 Profile |
| Activity Log | Team 范围内的资料变更审计 |
| Discourse Connect | Studio 与社区身份映射 |
| Discourse user options/custom fields | 个人可见性偏好，不改 Paperclip schema |
| Discourse Guardian、ignore、flag、PM | 联络授权、屏蔽和消息安全 |
| `CaptainProvider` | `/me`、TopNav 和设置更新后的统一刷新 |
| `FeedbackProvider` | toast、确认和输入，不用 `window.prompt` |
| 七色令牌和 p23/p24/p25 | 新 Profile、个人中心和设置页面视觉基线 |

### 6.4 不能复用 Paperclip 核心用户 Profile API

`server/src/routes/user-profiles.ts` 是 Paperclip 操作员视角的公司内用户生产力页，会返回：

- email
- cost
- token usage
- provider/model
- issue 与 activity 内部数据

它违反 TeenX 的成本隐藏、模型隐藏和儿童隐私边界。不能从 `/api/advx/*` 转发，也不能通过 UI 直接调用。TeenX 必须新建严格白名单 DTO。

更严重的是，当前 child board session 并不只可以调用 `/api/advx/*`。Paperclip 在同一 `/api` 下还挂载成本、治理、secret 和上述生产力 Profile 等核心路由。仅让 `ui-advx` 不调用它们不是安全边界。生产 TeenX 必须增加 deny-by-default 的 child API allowlist，或使用同等强度的独立服务入口；否则儿童仍可直接请求这些核心 API。

当前 ADVX 自身也仍返回不必要的身份和模型字段：

- `/api/advx/me.profile.id` 是 raw auth ID。
- `/api/advx/me.team` 复用 `toTeamView()`，包含 model。
- `/api/advx/captain` 与 `/captain/claim` 返回 raw `captainId`，前者还返回 model。

这些接口不应进入新的 Profile 契约。未发现 UI 生产调用 `/captain`；现有 smoke 仍调用 `/captain/claim`，后续可一并移除或收敛并更新 smoke。

## 7. 当前系统的高风险前置问题

### 7.1 所有 SSO 用户当前都会成为 Discourse admin

`server/src/routes/advx.ts` 的 Discourse Connect payload 当前固定：

```ts
admin: "true",
moderator: "false",
```

真实多用户登录上线后，这会把每个少年队长提升为论坛管理员。任何 Profile、私信或用户目录补强前，必须先改为普通用户。管理身份只能由服务端受控的独立 allowlist 或人工论坛账号赋予，不能从儿童 session 推导。

只把新 payload 改为 `admin=false` 还不够：已经通过 SSO 登录过的用户会保持 admin，直到再次登录并被更新。上线前必须先保留一个独立人工管理员，再一次性清理所有 TeenX SSO child 用户的 admin/moderator 标志并刷新自动 groups。

还要审计错误管理员期间产生的持久权限，包括 API keys、secondary staff accounts、staff memberships、邀请和 session。单纯降级原账号不会自动撤销这些能力。

### 7.2 当前 PM safety plugin 没有形成有效的阻断证明

`/Users/baihe/Documents/teenx-forum/plugins/teenx-pm-safety/plugin.rb` 注册：

```ruby
on(:post_create)
on(:post_edit)
```

当前 Discourse 创建事件实际使用 `post_created`，且事件发生在 `PostCreator` 已保存之后。仓库中没有触发 `post_create` 的代码，也没有该插件的 request/model specs。

所以现有代码不能证明邮箱、电话和外链在写入前被阻止。应改为 Post model validation 或等价的 pre-persist 扩展点，并增加“请求失败且数据库无记录”的创建与编辑测试。

### 7.3 Discourse 当前没有 pairwise PM 授权

`Guardian#can_send_private_message?` 主要保护新建/邀请收件人。已有 PM topic 的回复走 `can_create_post?`，不会因为未来的 TeenX grant 被撤销就自动拒绝。Discourse 默认还允许多个收件人；当前安全脚本使用的 `pm_max_recipients` 不是现版本真实 setting，真实 setting 是 `max_allowed_message_recipients`。

因此 pair grant 必须同时覆盖：

- 新建 PM。
- 向 PM 邀请新成员。
- 已有 PM 的每次 reply/edit pre-persist 授权。
- child PM 只允许一对一，禁止群 PM 绕过两两授权。

### 7.4 Discourse Connect payload 不是加密通道

当前 `external_id=captainId` 位于浏览器可见的 base64 SSO payload 中。HMAC 只保证完整性，不隐藏内容。因此不能一边继续传 raw captainId，一边声称浏览器看不到 external ID。

正确方向是让 versioned HMAC `publicId` 本身成为新的 Discourse `external_id`，并对已有 `SingleSignOnRecord` 做显式迁移。Paperclip 侧通过对内部 auth user ID 做有界扫描并计算 HMAC来反查，不在浏览器或 Discourse 保存 raw Paperclip ID。

迁移还必须重写或清理 `SingleSignOnRecord.last_payload`；Discourse 会保存上次 unsigned SSO payload，只改 external_id 列仍会把旧 raw ID 留在数据库。

切换必须暂停新的 SSO login，在 maintenance lock 内完成 dry-run、record migration、Paperclip payload deployment 和验证后再解锁。否则旧 payload 可在窗口期通过 email match 把 external ID 写回或制造重复身份。

### 7.5 P0 不应提供无实际作用的目录开关

自定义 `teenx_listed=false` 不会自动隐藏 Discourse `/u` directory。当前安全脚本还显式启用了 `enable_user_directory`。P0 应关闭 Discourse 原生目录，并删除没有 consumer 的 listed toggle。未来若真的增加 TeenX 目录，再单独定义 authenticated cursor API、页面和 opt-in 测试；同时文案必须说明这不会删除用户已经发布的帖子，也不能阻止知道链接的已登录用户查看其最小论坛资料。

### 7.6 Discourse Chat 是独立通信旁路

Discourse Chat 当前默认开启，支持多人 direct-message channel、上传和独立 Chat message。它不使用 Post model，因此普通 PM validator 和 `Guardian#can_send_private_message?` 不保护 Chat。

本轮不应再造第二套 Chat grant/content filter。child deployment 应设置 `chat_enabled=false`，并验证直接 Chat API 也不可用；否则用户可以完全绕过 Profile DM 申请和 PM 内容限制。

### 7.7 公共昵称本身也是审批前通信面

当前 nickname 只做普通长度校验。用户可把昵称改成 email、电话、URL、微信号或 `@handle`，然后在 Profile 和申请列表中公开，绕过“审批前不能发送自由文本”。公共 display name 需要 NFKC normalize、联系方式/链接模式过滤、变更 rate limit 和 legacy 安全 fallback。

### 7.8 允许 `/api/advx/*` 也不能等于允许任意 payload

除了路径隔离，现有 ADVX route 还需要字段级审计：

- Team Activity 当前返回原始 activity row、actorId 和任意 details。
- Test Run 当前返回 `resultJson`、完整 activity、agentId 和原始 work product。
- `/me`、`/captain` 仍返回 raw auth ID 或 model。

child allowlist 必须按 method/path 枚举，允许 route 还要使用 TeenX 白名单 mapper。不能把整个 `/api/advx/*` 当作天然安全区域。

### 7.9 原生 Discourse Profile 会绕过 React Profile

即使关闭用户目录，已登录用户仍可直达 `/u/:username` 和 user card。当前 Discourse 允许 bio、location、website、可编辑 username、上传头像和 Gravatar；这些字段会绕过新的 ADVX Profile DTO。

儿童部署必须锁定 username/name 为安全 SSO 值，清空并禁止 bio/location/website，关闭 Gravatar 和 child avatar upload，并从原生 serializers 排除敏感字段。`show_forum_activity=false` 只能承诺“不在 TeenX 聚合”，不能声称论坛帖子本身被隐藏。

### 7.10 board key 也能绕过 session gate

Paperclip board key 当前解析为完整 board actor。只测试 child session 不够。儿童部署应完全拒绝 board key，审计并撤销 child 已创建/持有的 key；operator automation 使用隔离管理面。

### 7.11 所有公开文本都可能成为站外联系方式

不仅 nickname，Team name、申请 counterpart label 和 PM 正文都可能承载 URL、email、电话、微信/QQ/`@handle` 或 Unicode 混淆。应复用一个 public-text safety policy；不安全的公开 Team name 直接省略并提示 owner 修正，不能原样投影。

## 8. 正确的系统边界

```text
Paperclip / advx26
  身份 session、Captain、Team、Team Version、self-only Arena 成绩、Activity

Discourse / teenx-forum
  社区公开资料偏好、DM 请求与授权、屏蔽、举报、PM 内容与未读

ui-advx
  聚合安全 DTO，展示 /me、其他队长 Profile、设置和联络状态
```

关键规则：

1. Paperclip DB 不新增 Profile、Connection、Conversation 或 Message 表。
2. PM 正文永远只存 Discourse，不镜像到 Paperclip。
3. 个人可见性使用 Discourse 现有 `user_custom_fields` / `user_options`，联络审批若需要关系表，只在 Discourse plugin 内迁移。
4. Paperclip 与 Discourse 通过服务端签名接口或现有 SSO external identity 对齐，不信任浏览器传入 actor ID。
5. 论坛离线时 Profile 仍显示 Studio 安全摘要，但联络动作 fail closed。
6. TeenX child deployment 对 Paperclip 核心 API 使用 deny-by-default allowlist，不能只靠前端隐藏入口。
7. child PM 限定一对一，每次创建、邀请和回复都重新校验 active grant。
8. Discourse Chat 在 child deployment 关闭，直接 API 同样不可用。

## 9. 产品取舍

### 9.1 本交接应实现

- 强化现有 `/me`，增加安全设置入口和真实 Arena/论坛空状态。
- 新增登录后可见的其他队长 Profile，只返回匿名昵称、Discourse 同源头像路径、明确公开的 Team/论坛摘要。
- 服务端返回 `viewerActions`，包含 self、closed、available、pending、approved、blocked 等状态。
- 私信申请必须单独审批；关注或好友不能授予 PM。
- 支持陌生人预先屏蔽、撤销授权和安全解除屏蔽。
- 修复 Discourse SSO admin 和 PM pre-persist validation。
- 使用 p23、p24、p25 的信息层级，但覆盖其中不安全的 mock 行为。

### 9.2 本轮明确不实现

- 企业直接联系儿童。
- 地理位置、代词、邮件、微信、GitHub、外部网站等公开字段。
- follower/following 人气计数。
- 任意 Profile JSON 和动态字段设计器。
- 第二套消息列表或消息正文存储。
- 公开互联网可索引的儿童 Profile。
- 用户目录和 listed toggle。
- child 群私信。
- GET 请求刷新排行榜快照。
- badge 自定义颜色。
- 任何跨用户 Arena 分数、排名、提交、结果链接或 Mock 成绩。

### 9.3 安全默认值

建议所有新设置默认：

| 设置 | 默认 |
|---|---|
| 展示 Team 名 | 关闭 |
| 在 Profile 聚合论坛活动 | 关闭 |
| 接受新的私信申请 | 关闭 |
| 允许已批准联系人继续私信 | 开启，直到任一方撤销或屏蔽 |

“关闭 Profile 聚合论坛活动”只控制 Profile 页的聚合展示，不能误导用户认为已发布论坛帖子被删除或变私密。

## 10. 源代码处置表

| 源文件/能力 | 处置 |
|---|---|
| `packages/shared/src/domain.ts` | 参考公开/内部 DTO 分层和状态名，按 TeenX 重写 |
| `packages/shared/src/dto.ts` | 参考稳定分页和结构化错误，不改变现有 ADVX 全部响应包装 |
| `routes/profiles.ts` | 参考字段白名单和 owner/viewer 过滤，路由与存储重写 |
| `routes/connections.ts` | 参考事务、过期和 normalized pair；在 Discourse plugin 重写 |
| `routes/conversations.ts` | 只参考 `(createdAt,id)` 和已读原则；消息继续由 Discourse 管理 |
| `lib/relation.ts` | 改为服务端输出最小 `viewerActions`，不把目标完整策略泄露给客户端 |
| `ActionButtons.tsx` | 参考状态矩阵，使用 `Feedback` 和可访问 modal 重写 |
| `ProfilePage.tsx` | 参考 stale-response guard，不复制布局和 HashRouter |
| `SettingsPage.tsx` | 保留 revision guard，字段集按儿童隐私重做 |
| `MessagesPage.tsx` | 不迁移页面；继续深链 Discourse PM |
| `LeaderboardPage.tsx` | 不迁移；当前 Arena scope 禁止排行榜和跨用户结果公开 |
| `schema.sql` / `db/client.ts` | 不迁移到 Paperclip |
| `currentUser.ts` / `currentUser.ts` 前端 helper | 禁止迁移 |
| 独立 CSS / App.tsx | 禁止迁移 |

## 11. 验收重点

最终实现必须证明：

- 任何用户都不能通过 header 或请求体冒充另一个 Captain。
- TeenX child session 直接请求 Paperclip cost、governance、secret、core user profile 等非 allowlist API 时得到 403/404。
- 普通 SSO 用户不是 Discourse admin/moderator。
- 已经被错误提升的 SSO 用户完成一次性降权，而不只是等待下次登录。
- child 管理员曾创建的 keys、staff accounts、memberships 和 sessions 已审计并撤销。
- Profile 响应不含 email、真实 auth ID、location、外链、budget、cost、credits、spend、token、model 或内部 activity。
- 默认隐私下，他人看不到 Team 名和 Profile 聚合论坛活动。
- 他人 Profile 完全不包含 Arena 分数、排名、提交或结果链接，Mock 永不作为公开成绩。
- friend/follow 状态不能绕过 DM 审批。
- block 可在无历史关系时执行，并阻止双向请求和消息。
- A 屏蔽 B 与 B 屏蔽 A 是两条独立方向记录，任一方解除自己的屏蔽不会删除另一方的屏蔽。
- PM 外链、邮箱、电话和附件在持久化前被拒绝。
- child PM 只有两名参与者；新增收件人和 grant 撤销后的回复均被服务端拒绝。
- Discourse Chat 对 child UI 和直接 API 均关闭。
- 公共昵称不能承载明显 email、电话、URL、社交 handle 或控制字符。
- 公开 Team name、联络摘要和 PM 使用同一站外联系方式安全策略。
- 原生 Discourse Profile/card 不暴露 bio、location、website、可编辑 username、Gravatar 或 child 上传头像。
- child board key 不能绕过 API allowlist。
- 论坛离线或身份不匹配时不显示可私信按钮。
- Profile 快速切换不显示上一用户的资料或按钮。
- 设置保存响应不覆盖保存后继续输入的内容。
- 桌面和 390px 移动端可完成查看、申请、审批、撤销和屏蔽。

## 12. 结论

`feat/profile-system` 的价值不是它的 SQLite 表或独立页面，而是公开字段白名单、关系状态机、稳定游标和前端竞态防护。正确整合方式是：

```text
保留隐私与状态机原则
+ 使用 Paperclip 的真实 Captain、Team 与 self-only Arena
+ 使用 Discourse 的用户、Guardian、屏蔽、举报和 PM
+ 使用 ui-advx 的七色组件与现有 /me
- 删除 SQLite、x-user-id、开放 CORS、独立消息库和 HashRouter
- 删除企业直联、公开所在地、站外联系方式和陌生人自动私信路径
```

在此边界下，Profile 才会增强当前 TeenX，而不是生成第三套身份和第二套社区系统。
