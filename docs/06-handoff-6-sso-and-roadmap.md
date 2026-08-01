# 交接提示词 #6 · Studio + 论坛 SSO 打通后的全貌与下一步

> 本文件是开新线程继续工作的交接提示词。读取后你会了解：两个仓库的全貌、已完成的所有工作、当前服务运行状态、已知问题、以及下一步计划。

---

## 0. 工作目录

| 系统 | 路径 | 说明 |
|---|---|---|
| **Studio 主仓库 (advx26)** | `/Users/baihe/Documents/advx26/` | Paperclip fork，ADVX Studio 后端 + `ui-advx/` 前端 |
| **论坛仓库 (teenx-forum)** | `/Users/baihe/Documents/teenx-forum/` | Discourse fork，TeenX 论坛 + `teenx-theme/` 主题 |
| **Paperclip 实例配置** | `~/.paperclip/instances/default/` | Paperclip 的 config.json + .env（含 SSO secret） |
| **Open Design 原型** | `/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95/` | 25 页 HTML 原型 + tokens.css + app.css |

**两个仓库是独立的 git repo，不共享 git 历史。**

---

## 1. 已完成的交接轮次（背景脉络）

| 轮次 | 文档 | 内容 |
|---|---|---|
| #1 | `docs/01-handoff-1-*.md` | Paperclip fork 改造为 ADVX，加 `/api/advx/*` 路由 + mapper + catalog |
| #2 | `docs/02-handoff-2-teenx-forum.md` | Discourse 论坛搭建 + child safety plugin |
| #3 | `docs/03-handoff-3-ui-prototype.md` | Open Design 产出 25 页 HTML 原型 + 七色令牌 |
| #4 | `docs/04-handoff-4-ui-react.md` | Studio 初版 React + Tailwind 前端 |
| #5 | `docs/05-handoff-5-ui-unify.md` + `docs/handoff-5-report.md` | UI 统一：删 Tailwind、引入七色令牌、6 页重写、论坛 Discourse 主题覆盖 |
| **#6（本轮）** | `docs/06-handoff-6-sso-and-roadmap.md`（本文件） | 论坛嵌入 Studio 顶栏 + SSO 单点登录打通 |

---

## 2. 当前服务运行状态

三个服务都在本地运行，**启动命令和端口固定**：

| 服务 | 端口 | 启动命令 | 说明 |
|---|---|---|---|
| Paperclip (Studio 后端) | :3100 | `cd /Users/baihe/Documents/advx26 && pnpm dev` | 需 PATH 含 `~/.nvm/versions/node/v24.16.0/bin` + `/opt/homebrew/bin` |
| Discourse (论坛) | :3000 | `cd /Users/baihe/Documents/teenx-forum && bin/dev` | 需 PATH 含 `/opt/homebrew/opt/ruby@3.4/bin`；`bin/dev` 同时起 Rails + Ember 前端 |
| Vite (Studio 前端) | :5174 | `cd /Users/baihe/Documents/advx26/ui-advx && pnpm dev` | 代理 `/api`→:3100、`/discourse`→:3000、`/sso-connect`→:3100 |

### 启动顺序

```sh
# 1. Paperclip 后端
export PATH="/Users/baihe/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/opt/node/bin:/opt/homebrew/bin:$PATH"
cd /Users/baihe/Documents/advx26 && pnpm dev &

# 2. Discourse 论坛（等 Paperclip 起来后）
export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"
cd /Users/baihe/Documents/teenx-forum && bin/dev &

# 3. Vite 前端
export PATH="/Users/baihe/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/opt/node/bin:$PATH"
cd /Users/baihe/Documents/advx26/ui-advx && pnpm dev &
```

> ⚠️ Paperclip 的 dev-watch 有时会在文件改动时崩（SIGTERM 嵌入式 PGlite），需要重新 `pnpm dev`。Discourse 的 `bin/rails server` 单独跑会缺 Ember 前端构建，必须用 `bin/dev`。

---

## 3. 已完成的工作清单

### 3.1 Studio 前端 (`ui-advx/`) — 七色令牌深色设计体系

**设计令牌（硬约束）：**
- `ui-advx/src/styles/tokens.css` — 唯一允许 hex 的文件，定义 7 色：`#000000`/`#0a0a0a`/`#ffffff`/`#737373`/`#242424`/`#f48529`/`#54a2ff`
- `ui-advx/src/styles/app.css` — 共享组件类（`.card`/`.btn-primary`/`.topnav`/`.seg`/`.tl-item`/`.modal`/`.toast` 等）
- `ui-advx/src/index.css` — 仅 `@import` 上面两个文件，无其他 CSS
- **禁止在 `.tsx`/`.ts` 文件写 hex 字面量**（已验证 `rg` 无匹配）
- **禁止恢复 Tailwind**（已从 package.json 移除）

**共享组件（`ui-advx/src/components/`）：**
- `TopNav.tsx` — 5 项导航（Studio/赛题/排行榜/论坛/我的），sticky 毛玻璃顶栏，橙色下划线高亮。赛题/排行榜仍标 `comingSoon: true`；论坛指向 `/forum`，“我的”指向 `/me`
- `Captain.tsx` — 当前队长资料 Context；统一驱动顶栏和个人中心，并支持刷新、修改昵称
- `PageFoot.tsx` — 固定页脚
- `Feedback.tsx` — `FeedbackProvider` + `useFeedback()`，统一 toast 与命令式 confirm 弹窗（`FeedbackProvider` 在 `main.tsx` 包裹路由）
- `Seg.tsx` — 受控分段筛选条

**页面（`ui-advx/src/pages/`）：**

| 页面 | 路由 | 对应原型 | 功能 |
|---|---|---|---|
| `StudioPage.tsx` | `/studio` | p04 | 队伍信息卡（编辑队名/简介/封存）+ 队员网格 + 试跑入口 |
| `MemberPage.tsx` | `/members/:memberId` | p05 | 队员编辑：名/角色/职责/工具/Skill/汇报线/委托/删除 |
| `AddMemberPage.tsx` | `/members/new` | p06 | 四角色模板 + 自定义，点击 confirm 起名创建 |
| `TestRunLaunchPage.tsx` | `/test-run` | p08 | 任务列表 → 确认态（只读成员）→ 启动态 |
| `TestRunResultPage.tsx` | `/test-run/:runId` | p09 | 活动记录时间流 + 产物区 + 封存/返回/再跑 |
| `VersionsPage.tsx` | `/versions` | p10 | 版本列表、展开快照、当前版本 pill |
| `ActivityPage.tsx` | `/activity` | p11 | 队员筛选 + 类型 Seg + 时间流 + 加载更多 |
| `ForumPage.tsx` | `/forum` | — | iframe 嵌入 Discourse，自动 SSO、深链和失败重试 |
| `MePage.tsx` | `/me` | p24 | 个人资料、队伍统计、论坛活动、私信、收藏和赛题记录空状态 |

**API 层（`ui-advx/src/api.ts`）：**
- 所有 `/api/advx/*` 调用保留不变
- `updateMember` 入参类型已扩展支持 `skills`/`reportsTo`/`canDelegateTo`
- 新增 `me` / `updateProfile` / `forumOverview`，个人中心使用真实 Studio 与 Discourse 数据

**已清理文件：**
- 旧版 Tailwind `TestRunPage.tsx` 已删除，路由使用 `TestRunLaunchPage` + `TestRunResultPage`。

### 3.2 Studio 后端 (Paperclip `server/src/routes/advx.ts`)

**已有路由（交接 #1 建的，本轮未改）：**
- `/api/advx/session` — 获取当前队长 opaque `publicId` 和安全昵称，不返回 raw ID 或模型
- `/api/advx/me` — 当前队长安全资料、我的队伍摘要和总试跑次数（兼容本地 fixture 与真实会话）
- `/api/advx/forum/session` — 仅转发 Discourse `_t` / `_forum_session` Cookie，统一返回论坛会话是否已连接
- `/api/advx/teams` — CRUD 队伍
- `/api/advx/teams/:id/members` — CRUD 队员
- `/api/advx/role-templates` — 四角色模板
- `/api/advx/tools` — 工具列表
- `/api/advx/test-tasks` — 试跑任务
- `/api/advx/teams/:id/versions` — 版本封存/列表
- `/api/advx/teams/:id/activity` — 活动记录
- `/api/advx/teams/:id/test-runs` — 启动试跑
- `/api/advx/test-runs/:runId` — 试跑结果

**本轮新增（SSO 端点）：**
- `GET /api/advx/sso/discourse-connect` — Discourse Connect (SSO) 端点
  - 接收 Discourse 发来的 `sso` + `sig`（base64 query-string payload）
  - 用 `TEENX_DISCOURSE_CONNECT_SECRET`（HMAC-SHA256）验签
  - 解析 `nonce` + `return_sso_url`
  - 注入当前 board 用户（`local-board`，本地开发自动登录）的 `external_id`/`name`/`username`/`email`（兜底 `captain@teenx.local`）/`admin=true`
  - 签名回传 payload，302 重定向到 Discourse `/session/sso_login`
  - **关键**：把 `return_sso_url` 中的 Discourse 原始 URL (`http://localhost:3000`) 改写为 vite 代理同源路径 (`/discourse`)，保证 iframe 内全链路同源

**SSO secret 配置位置：**
- `/Users/baihe/Documents/advx26/.env` — `TEENX_DISCOURSE_CONNECT_SECRET=<configured-secret>`
- `~/.paperclip/instances/default/.env` — 同上（Paperclip 实际读取的 .env）
- 两个文件的 secret 必须与 Discourse 的 `SiteSetting.discourse_connect_secret` 一致

### 3.3 Vite 代理配置 (`ui-advx/vite.config.ts`)

```ts
proxy: {
  "/api": "http://127.0.0.1:3100",
  "/sso-connect": { target: "http://127.0.0.1:3100", rewrite: → "/api/advx/sso/discourse-connect" },
  "/discourse": { target: "http://127.0.0.1:3000", changeOrigin: false, rewrite: 去掉 /discourse 前缀 },
  "/stylesheets": "http://127.0.0.1:3000",   // Discourse CSS
  "/theme-javascripts": "http://127.0.0.1:3000",
  "/uploads": "http://127.0.0.1:3000",
  "/images": "http://127.0.0.1:3000",
  "/user_avatar": "http://127.0.0.1:3000",
  "/letter_avatar": "http://127.0.0.1:3000",
  "/svg-sprite": "http://127.0.0.1:3000",
  "/extra": "http://127.0.0.1:3000",
  "/": { Studio/Vite 路由 bypass，其余请求 → :3000 }, // Discourse 根路径 bundles/API/message-bus
}
```

**关键设计决策：**
- `/discourse` 代理用 `changeOrigin: false`，并把 Discourse 固定生成的 `localhost:5174` 重定向改写成当前 Studio Host
- `/sso-connect` 单独代理到 Paperclip；原始 Studio Host 通过 `x-teenx-studio-host` 传入，保证 `localhost` / `127.0.0.1` / `[::1]` 的 SSO 全程同源
- Discourse 的 Ember bundles、JSON API 和内部路由大量使用根路径；仅代理 `/discourse` 和若干静态目录会导致五点加载动画永久不结束。当前用根代理兜底，同时明确 bypass Studio 与 Vite 自有路由
- 本地开发把 `/letter_avatar_proxy/*` 改写到 Discourse 本地 letter avatar，避免外部头像 CDN 不可达时出现破图

### 3.4 论坛嵌入与 SSO 单点登录（ForumPage.tsx）

**ForumPage 当前加载：**
1. 先请求 `/api/advx/forum/session`：已有 `_t` 会话时直接打开目标页，未登录时才启动 SSO，避免每次点击重复创建论坛登录令牌
2. iframe src = `/discourse/session/sso?return_path=/latest`（触发 SSO 链路，并明确论坛回跳目标）
3. SSO 链路：Discourse → vite `/sso-connect` → Paperclip 签名 → vite `/discourse/session/sso_login` → Discourse 设 cookie
4. SSO 完成后直接回到当前 Studio Host 下的 `/latest`，不再硬编码 `localhost`
5. 页面轮询确认 `.ember-application` 与 `#main-outlet` 已实际启动后才移除遮罩；20 秒未就绪会自动清理旧 Service Worker/Cache 并重试一次
6. `/forum?path=...` 支持从个人中心进入私信、活动、收藏帖子等论坛深链

**单点登录效果：** Studio 在 `local_trusted` 模式下自动登录（无需输入密码），点「论坛」→ iframe 内 SSO 链自动用 Studio 身份登录 Discourse → 论坛页面直接显示，**无需二次登录**。

### 3.5 论坛主题 (`teenx-forum/teenx-theme/`)

- `about.json` — 主题元信息 + `TeenX Dark` color scheme
- `stylesheets/common.scss` — ~270 行深色覆盖（七色令牌 `--teenx-*`）
  - 覆盖：body/html 黑底、header 毛玻璃、topic-list-item 深黑、post-stream 卡片化、cooked 白字行高 1.7、btn-primary 橙、输入框深色、sidebar、用户卡片
  - plugin 徽章增强：`.teenx-ai-authored-badge`（蓝圆角 pill）/ `.teenx-ai-reviewed-badge`（灰描边 pill）
- 已用 `Theme#set_field` 装入 Discourse 主题 id=1 并设为默认

### 3.6 论坛 Discourse 侧改动

| 文件 | 改动 |
|---|---|
| `config/site_settings.yml` | `required.title` = `TeenX`，`required.site_description` = `给孩子一支 AI 队伍` |
| `lib/action_dispatch/session/discourse_cookie_store.rb` | 开发环境移除 session cookie 的 SameSite（`cookie[:same_site] = nil if Rails.env.development?`），让 cookie 在 iframe SSO 重定向链中保持 |
| `AI-AGENTS.md` | 追加 "TeenX theme" 段（主题位置、5 条约束、重载命令） |

**Discourse 当前 SiteSetting 值（开发库）：**
```
enable_discourse_connect = true
discourse_connect_url = http://localhost:5174/sso-connect
login_required = true
invite_only = false
must_approve_users = false
same_site_cookies = Disabled
title = TeenX
site_description = 给孩子一支 AI 队伍
```

### 3.7 AGENTS.md 更新

- `/Users/baihe/Documents/advx26/AGENTS.md` — 追加 "ADVX UI design system (ui-advx/)" 段（token 源、5 条硬约束、DEVX 命令、验证门）
- `/Users/baihe/Documents/teenx-forum/AI-AGENTS.md` — 追加 "TeenX theme" 段（主题位置、5 条约束、重载命令）

---

## 4. 已知问题与限制

### 4.1 需要修复
1. **Paperclip dev-watch 容易崩** — 文件改动时偶尔 SIGTERM 嵌入式 PGlite 后退出，需要手动 `pnpm dev` 重启。不是代码问题，是 dev-watch + PGlite 的稳定性问题。
2. **MemberPage 协作关系 ID/slug 不匹配** — 服务端 `collaboration.reportsTo` 返回 agent ID，但 PATCH 接收 role-template slug。当前 UI 把 agent ID 透传，在角色模板唯一时能工作，多自定义角色时可能匹配不准。建议在 `advx-mapper.ts` 的 `toMemberView` 里把 agent ID 解析回 slug。
3. **VersionsPage "设为当前版本"** 是 mock 提示 — ADVX API 未提供 set-current 端点，只读展示快照。需后端补端点。
4. **MemberPage 工具管理** 仍是只读展示标签，未接工具库选择页（P07 原型未实现）。

### 4.2 架构限制
1. **Studio 无真实登录** — Paperclip `local_trusted` 模式所有请求自动是 `local-board`。SSO 也用这个虚拟身份。生产环境需要接真实 auth（BetterAuth session）。
2. **SSO email 是兜底值** — `local-board` 没有真实 email，SSO 用 `captain@teenx.local`。生产环境需要从 session 取真实 email。
3. **Discourse `same_site_cookies` 设置不生效** — 通过 `SiteSetting.same_site_cookies = "Disabled"` 设置后，运行中的 Rails server 仍输出 `SameSite=Lax`。最终通过直接改 `discourse_cookie_store.rb` 源码解决。生产环境应该用 `None` + HTTPS。
4. **Vite 代理 `changeOrigin: false`** — 只在开发环境可行。生产环境需要反向代理（nginx）把 `/discourse/` 转发到 Discourse，并改写重定向 URL。

### 4.3 未实现功能
1. **赛题页面**（TopNav "赛题"）— 标"敬请期待"，对应原型 p12-p16（赛题列表/详情/结果/排行榜）
2. **排行榜页面**（TopNav "排行榜"）— 标"敬请期待"，对应原型 p15-p16
3. **工具库选择页**（P07）— MemberPage 的工具管理未实现
4. **Studio 真实试跑执行** — 试跑排队和查询已通，但实际 agent 执行需要配置 DeepSeek adapter API key
5. **论坛发帖** — Studio 侧没有"写帖"入口把试跑产物发到论坛

---

## 5. 下一步计划

### 优先级 P0 — 核心体验闭环

1. **赛题模块（p12-p14）**
   - 赛题列表页 `/contests`（p12）：分类筛选 + 赛题卡片网格
   - 赛题详情页 `/contests/:id`（p13）：赛题描述 + 队伍配置 + 提交入口
   - 赛题结果页 `/contests/:id/result`（p14）：评分 + 排名 + 产物展示
   - 后端：`/api/advx/contests` CRUD（可先用 in-code catalog，同 `advx-catalog.ts` 模式）

2. **排行榜模块（p15-p16）**
   - 用户排行榜 `/board`（p15）：按赛题/总分排序
   - 队伍（agent）排行榜（p16）：展示 AI 队伍表现
   - 后端：`/api/advx/leaderboard`

3. **"我的"页面（p24，已完成）**
   - 个人资料编辑 + 我的队伍 + 总试跑统计
   - 论坛活动 + 私信未读 + 收藏（Discourse 会话已连接时实时读取）
   - 参赛记录已提供正式空状态，待赛题模块完成后接入数据

### 优先级 P1 — 增强体验

4. **工具库选择页（P07）**
   - MemberPage 的"管理工具"按钮跳转到这里
   - 工具分类 + 搜索 + 勾选 + 保存

5. **论坛发帖集成**
   - Studio 试跑产物页加"发到论坛"按钮
   - 用 Discourse API key（`.env` 里的 `TEENX_DISCOURSE_API_KEY`）自动创建帖子
   - 帖子自动带 `.teenx-ai-authored-badge`

6. **Studio 真实登录**
   - 接 BetterAuth session（Paperclip 已有 `auth.ts` 的 `/api/auth/get-session`）
   - SSO 端点从 session 取真实 user info 而非 `local-board`
   - 论坛 SSO 用户与 Studio 用户一一对应

### 优先级 P2 — 生产化

7. **部署架构**
   - nginx 反向代理：`/` → Studio、`/discourse/` → Discourse、`/api/` → Paperclip
   - Discourse `same_site_cookies` 用 `None` + HTTPS
   - Paperclip 从 `local_trusted` 切到 `authenticated` 模式

8. **清理**
   - 修复 MemberPage 协作关系 ID/slug 映射
   - 后端补 VersionsPage "设为当前版本"端点

---

## 6. 开发环境快速验证

### 6.1 启动并验证三个服务

```sh
# 启动后验证
curl http://127.0.0.1:3100/api/health        # Paperclip → 200
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/  # Discourse → 302
curl -s -o /dev/null -w '%{http_code}' http://localhost:5174/   # Vite → 200
```

### 6.2 验证 SSO 链路

```sh
# 手动走一遍 SSO（应该 302 → 302 → 302 + set _t cookie）
export PATH="/Users/baihe/.nvm/versions/node/v24.16.0/bin:$PATH"
node --input-type=module -e '
const r1 = await fetch("http://localhost:5174/discourse/session/sso", {redirect:"manual"});
const c1 = (r1.headers.get("set-cookie")||"").split(";")[0];
const r2 = await fetch(r1.headers.get("location"), {redirect:"manual", headers:{Cookie:c1}});
const r3 = await fetch(r2.headers.get("location"), {redirect:"manual", headers:{Cookie:c1}});
console.log("1→", r1.status, "2→", r2.status, "3→", r3.status, "cookie:", (r3.headers.get("set-cookie")||"").slice(0,30));
'
# 预期输出：1→ 302 2→ 302 3→ 302 cookie: _t=...
```

### 6.3 验证 Studio UI

```sh
# typecheck + build + 无 hex 检查
export PATH="/Users/baihe/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/opt/node/bin:$PATH"
cd /Users/baihe/Documents/advx26/ui-advx
pnpm typecheck                                              # 应无错
pnpm build                                                  # 应成功
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' src # 应无匹配
```

### 6.4 浏览器验证

打开 `http://localhost:5174/forum`，应看到：
- 顶栏 TeenX logo + 5 项导航
- 下方深色论坛页面（body=#000、文字=#fff）
- 已登录状态（无需手动登录论坛）

打开 `http://localhost:5174/me`，应看到：
- 当前队长昵称与身份状态
- 我的队伍、版本数、队员数和总试跑次数
- 社区身份、私信、论坛活动与收藏
- “我的”导航项高亮，昵称可编辑并同步顶栏

### 6.5 重载 Discourse 主题（改了 common.scss 后）

```sh
export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"
cd /Users/baihe/Documents/teenx-forum && RAILS_ENV=development bin/rails runner '
  scss = File.read("teenx-theme/stylesheets/common.scss")
  t = Theme.find(1)
  t.set_field(target: :common, name: :scss, value: scss, type_id: 1)
  t.save!
  puts "OK #{t.name} bytes=#{scss.size}"
'
```

---

## 7. 关键约束（不可违反）

1. **七色令牌硬约束** — 只允许 `#000000/#0a0a0a/#ffffff/#737373/#242424/#f48529/#54a2ff` 这 7 个 hex（在 `tokens.css` 和论坛 `common.scss` 的 `:root` 块内），其余一律 `var(--xx)` 或 `color-mix()`
2. **禁止恢复 Tailwind** — `ui-advx/package.json` 不得有 `tailwindcss`/`@tailwindcss/vite`/`postcss`/`autoprefixer`
3. **禁止在 .tsx/.ts 写 hex** — `rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src` 必须无匹配
4. **Studio API 层保留** — `ui-advx/src/api.ts` 的 `/api/advx/*` 调用不变，视觉重写不能破坏 API 对接
5. **论坛不重写 Ember** — 只通过 Discourse 主题 CSS 覆盖，DOM 结构保持 Discourse 原生
6. **不暴露预算/成本/模型参数给儿童用户** — `advx-mapper.ts` 的 `stripBudget` 过滤器不可移除
7. **不修改 Paperclip DB schema** — ADVX 字段只在 JSON `metadata` 列
8. **论坛 child safety** — 不可关闭 `login_required`、不可恢复匿名发帖、不可关闭 PM 安全过滤

---

## 8. 参考文件速查

| 文件 | 位置 | 作用 |
|---|---|---|
| Open Design tokens.css | `<Open Design 路径>/css/tokens.css` | 七色令牌定义 |
| Open Design app.css | `<Open Design 路径>/css/app.css` | 组件类体系 |
| Open Design 原型 p04-p11 | `<Open Design 路径>/p04-studio.html` 等 | Studio 6 页原型 |
| Open Design 原型 p12-p16 | `<Open Design 路径>/p12-contests.html` 等 | 赛题/排行榜原型（未实现） |
| Open Design 原型 p17-p23 | `<Open Design 路径>/p17-forum.html` 等 | 论坛原型 |
| Studio API 层 | `ui-advx/src/api.ts` | `/api/advx/*` 调用（保留不动） |
| Studio 后端路由 | `server/src/routes/advx.ts` | 所有 ADVX API + SSO 端点 |
| Studio mapper | `server/src/services/advx-mapper.ts` | term 映射 + budget strip + model pin |
| 论坛主题 | `teenx-forum/teenx-theme/stylesheets/common.scss` | 深色覆盖 CSS |
| 论坛 cookie store | `teenx-forum/lib/action_dispatch/session/discourse_cookie_store.rb` | SameSite 移除（开发环境） |
| Paperclip .env | `~/.paperclip/instances/default/.env` | SSO secret（Paperclip 实际读取） |
| advx26 .env | `/Users/baihe/Documents/advx26/.env` | SSO secret（备份） |

---

*本交接提示词覆盖了从交接 #1 到 #6 的全部工作。Studio 前端已用七色令牌重写、论坛已主题覆盖并嵌入 Studio 顶栏、SSO 单点登录已打通。下一步重点是赛题/排行榜模块的实现。*
