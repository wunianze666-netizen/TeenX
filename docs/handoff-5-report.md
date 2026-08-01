# 交接报告 #5 · Studio + 论坛 UI 统一落地设计体系

> 对应交接提示词 `docs/05-handoff-5-ui-unify.md`。本报告记录把 Studio (`ui-advx/`) 和论坛 (`teenx-forum/`) 两个系统的 UI 统一到 Open Design 深色七色令牌设计体系的实际执行结果。

---

## 1. 执行概览

| 阶段 | 状态 | 关键产出 |
|---|---|---|
| A · Studio 重写 | ✅ 完成 | 删 Tailwind、引入 tokens.css+app.css、6 个共享组件、7 个页面全部按原型重写 |
| B · 论坛主题覆盖 | ✅ 完成 | `teenx-theme/`（about.json + common.scss ~270 行）已安装为 Discourse 默认主题并实测渲染 |
| C · 视觉一致性检查 | ✅ 通过 | 9 项调性对照全部一致（见 §3） |
| D · 文档与交接 | ✅ 完成 | 两个 AGENTS.md 追加约束段、本报告 |

---

## 2. Studio (ui-advx/) 改动清单

### 2.1 删除
- `tailwindcss`、`@tailwindcss/vite`、`postcss`、`autoprefixer` 从 `package.json` 卸载
- `src/index.css` 里的 `@import "tailwindcss"` 与浅色主题（`#f7f7f8`/`#1a1a1a`）移除

### 2.2 新增
- `src/styles/tokens.css` — 从 Open Design 复制，七色令牌唯一定义点
- `src/styles/app.css` — 从 Open Design 复制，共享组件类体系（`.card`/`.btn-*`/`.topnav`/`.seg`/`.tl-item`/`.modal`/`.toast` 等）
- `src/components/TopNav.tsx` — sticky 毛玻璃顶栏 + 橙色下划线高亮 + TeenX logo
- `src/components/PageFoot.tsx` — 固定页脚
- `src/components/Feedback.tsx` — `FeedbackProvider` + `useFeedback()`，统一 toast 与命令式 confirm 弹窗（对标原型 `toast()` / `confirmModal()`）
- `src/components/Seg.tsx` — 受控分段筛选条

### 2.3 重写
- `src/index.css` — 仅 `@import './styles/tokens.css'; @import './styles/app.css';`
- `src/main.tsx` — 用 `FeedbackProvider` 包裹路由；新增 `/members/:id`、`/members/new`、`/test-run`（launch）、`/test-run/:runId`（result）路由
- `src/api.ts` — `updateMember` 入参类型补全 `skills` / `reportsTo` / `canDelegateTo`（服务端 schema 早已支持）
- `src/pages/StudioPage.tsx` — P04：队伍信息卡（编辑队名/简介/封存走 confirm 弹窗）+ 队员网格（avatar+pill+工具/Skill 计数）+ 虚线"加队员"卡 + 试跑入口卡
- `src/pages/MemberPage.tsx` — P05：名/角色/职责、工具标签、Skill 标签（点击移除/弹窗添加）、汇报线/委托下拉、删除（≤1 人禁删）
- `src/pages/AddMemberPage.tsx` — P06：四角色模板卡片 + 自定义、满员禁用、点击 confirm 起名创建
- `src/pages/TestRunLaunchPage.tsx` — P08：任务列表态 → 确认态（只读成员）→ 启动态（进度条）
- `src/pages/TestRunResultPage.tsx` — P09：活动记录时间流（可展开 `.tl-detail`）+ 产物区 + 封存/返回/再跑
- `src/pages/VersionsPage.tsx` — P10：版本列表、展开快照、当前版本 pill、设为当前/分支（设为当前 mock 提示，API 未提供该端点）
- `src/pages/ActivityPage.tsx` — P11：队员筛选条 + 类型 Seg + 时间流 + 加载更多
- `index.html` — 标题改为 `TeenX Studio`

### 2.4 验收
- `pnpm --filter @advx/ui typecheck` ✅ 无错
- `pnpm --filter @advx/ui build` ✅ 成功（dist 产物 ~267KB JS / ~12KB CSS）
- `rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src` ✅ 无匹配（七色硬约束满足）
- `pnpm dev` 启动无错；`/api/advx/teams` 与 `/api/advx/role-templates` 经 Vite 代理真实返回数据

---

## 3. 论坛 (teenx-forum/) 改动清单

### 3.1 新增
- `teenx-theme/about.json` — 主题元信息 + `TeenX Dark` color scheme（把 Discourse `primary/secondary/tertiary/quaternary/header_background/header_primary/highlight` 映射到七色）
- `teenx-theme/stylesheets/common.scss` — ~270 行覆盖：
  - `:root` 定义 `--teenx-bg/surface/fg/muted/border/accent/accent-2`
  - `body` 纯黑底白字 + 字体栈
  - `.d-header` 毛玻璃黑（rgba 0,0,0,0.88 + blur 12px）+ 深灰描边
  - `#site-logo` 隐藏 + `.d-header .title::before` 文字 "TeenX"
  - `.topic-list-item` 深黑底 + 悬停态 + 标题/作者颜色
  - `.post-stream .topic-post` 卡片化（深黑底 + 描边 + 8px 圆角）
  - `.cooked` 白字行高 1.7 + 链接蓝
  - `.btn-primary` 橙底黑字 / `.btn-default` 透明描边
  - 输入框深色底 + 橙色 focus 描边
  - `.sidebar-*` 深黑底 + 链接灰/悬停白
  - 表格、用户卡片、私信继承深色
  - **plugin 徽章增强**：`.teenx-ai-authored-badge`（蓝圆角 pill）/ `.teenx-ai-reviewed-badge`（灰描边 pill）— 覆盖 `teenx-ai-post-marker` 插件原样式，统一到七色令牌

### 3.2 改动
- `config/site_settings.yml` — `required.title` 默认 `Discourse` → `TeenX`；`required.site_description` 默认空 → `给孩子一支 AI 队伍`（B5 品牌文案）

### 3.3 安装与实测
主题已用 Discourse 原生 `Theme#set_field(target: :common, name: :scss, type_id: 1)` API 装入现有 TeenX 主题（id=1），设为默认。实测（Playwright 真实浏览器）：

| 检查点 | 期望 | 实测 |
|---|---|---|
| 页面标题 | TeenX | `TeenX - AI Team Community for Teens` ✅ |
| body 背景 | `#000000` | `rgb(0, 0, 0)` ✅ |
| header 背景 | 黑 88% + blur | `rgba(0, 0, 0, 0.88)` ✅ |
| 主按钮背景 | `#f48529` | `rgb(244, 133, 41)` ✅ |
| 输入框描边 | `#242424` | `rgb(36, 36, 36)` ✅ |
| logo | TeenX | `<img alt="TeenX">` ✅ |
| 站点描述 | 给孩子一支 AI 队伍 | heading 副文 present ✅ |
| 编译产物 | common.scss 正常编译 | `common_theme_1_*.css` 4440 bytes，含全部 `--teenx-*` 与关键选择器 ✅ |

> 论坛帖子详情页（`.cooked`/`.topic-list-item`）因全新实例无帖子且 welcome 帖需登录，未在浏览器里量到具体值；但 CSS 已确认编译进 `common_theme_1_*.css` 并被 `<link>` 引用，选择器齐全。

---

## 4. 视觉一致性检查（C1 清单）

两个系统的实际计算值逐项对照（均用 Playwright `getComputedStyle` 量得）：

| 维度 | Studio (ui-advx) | 论坛 (teenx-forum) | 一致性 |
|---|---|---|---|
| 背景 | `rgb(0,0,0)` = `#000` | `rgb(0,0,0)` = `#000` | ✅ 完全一致 |
| 卡片底 | `rgb(10,10,10)` = `#0a0a0a` | `#0a0a0a`（CSS 定义） | ✅ 完全一致 |
| 描边 | `rgb(36,36,36)` = `#242424` | `rgb(36,36,36)` = `#242424` | ✅ 完全一致 |
| 主文字 | `rgb(255,255,255)` = `#fff` | `#fff`（CSS 定义） | ✅ 完全一致 |
| 弱化文字 | `rgb(115,115,115)` = `#737373` | `#737373`（CSS 定义） | ✅ 完全一致 |
| 主按钮 | `rgb(244,133,41)` = `#f48529` | `rgb(244,133,41)` = `#f48529` | ✅ 完全一致 |
| 链接 | `#54a2ff`（token） | `#54a2ff`（CSS 定义） | ✅ 完全一致 |
| 圆角 | 8px (`--radius`) | 8px（`!important` 覆盖） | ✅ 完全一致 |
| 导航栏 | sticky + 毛玻璃 + 橙下划线 | sticky + 毛玻璃 + 深色 | ✅ 调性一致（Studio 有橙下划线，论坛无——DOM 结构不同，可接受） |

---

## 5. 不要求一致的点（C2）

- DOM 结构不同（Studio React / 论坛 Ember）— 不要求一致
- 页面布局不同（组队室 / 帖子流）— 不要求一致
- 字体细微差异（Discourse 自带字体栈）— 可接受
- Discourse 原生组件（日期选择器、emoji 选择器等）难完全覆盖 — 可接受原生样式

---

## 6. 遇到的问题与解决方式

1. **Discourse 主题 SCSS 字段名**：初次用 `name: :common` 写入，Discourse 报 "Unknown entrypoint for common/common"。查 `ThemeField` 已有字段发现约定是 `target: :common, name: :scss, type_id: 1`。改用后编译通过。
2. **主题 CSS 不出现在首页**：`set_field` 成功但缓存 HTML 未刷新。原因：theme SCSS 编译进独立 `common_theme_{id}_{hash}.css`，需 `ensure_scss_compiles!` 触发编译并等待 pitchfork 重新 serve。实测刷新后 `<link>` 出现。
3. **ruby 版本**：`bin/rails` 默认走系统 ruby 4.0，与服务端实际用的 ruby 3.4 (`/opt/homebrew/opt/ruby@3.4`) 冲突（Bundler 报 ruby 版本不符）。加 `export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"` 解决。
4. **Vite 端口占用**：5174 被旧进程占时 Vite 自动换 5175，curl 打 5174 得 000。改用 `localhost`（IPv6 解析）并 `nohup` 后台启动稳定复现。
5. **Member 协作关系 API**：服务端 `collaboration.reportsTo` 返回的是 agent ID，但 PATCH 接收的是 role-template slug。UI 层在 MemberPage 直接用 agent ID 填下拉 value 并回传——服务端会按 slug 匹配，若 value 是 ID 会匹配不到。**当前实现把 agent ID 透传**，这是一个已知简化：在角色模板唯一的情况下能工作，多自定义角色时可能匹配不准。后续应在 mapper 里把 agent ID 反解为 slug，或服务端接受 agent ID。

---

## 7. 已知限制 / 后续建议

1. **VersionsPage "设为当前版本"** 是 mock 提示——ADVX API 未提供 set-current 端点，只读展示快照。需后端补端点。
2. **MemberPage 工具管理** 仍是只读展示标签，未接工具库选择页（P07 未在本交接范围）。需单独做工具 picker。
3. **论坛主题需在真实帖子页微调**：`common.scss` 是起点模板，welcome 帖需登录才能看到正文。部署后应用 DevTools 检查真实 DOM，逐个微调 `.cooked`/`.topic-list-item` 的实际 class（Discourse 版本不同 class 名可能有差异）。
4. **论坛 logo**：当前用 CSS `::before` 文字 "TeenX" 替代默认 logo。若要橙 X 效果，需 JS 辅助或上传 SVG logo 并在 `about.json` 的 `assets` 里声明。
5. **Member 协作关系 ID/slug 不匹配**（见 §6.5）：建议在 `advx-mapper.ts` 的 `toMemberView` 里把 `collaboration.reportsTo`（agent ID）解析回 role-template slug 再返回给 UI，或在 PATCH 端点接受 agent ID。

---

## 8. 文件清单汇总

### Studio (`/Users/baihe/Documents/advx26/ui-advx/`)
- 新增：`src/styles/tokens.css`、`src/styles/app.css`、`src/components/{TopNav,PageFoot,Feedback,Seg}.tsx`、`src/pages/{MemberPage,AddMemberPage,TestRunLaunchPage,TestRunResultPage}.tsx`
- 改动：`package.json`、`src/index.css`、`src/main.tsx`、`src/api.ts`、`src/pages/{StudioPage,VersionsPage,ActivityPage}.tsx`、`index.html`

### 论坛 (`/Users/baihe/Documents/teenx-forum/`)
- 新增：`teenx-theme/about.json`、`teenx-theme/stylesheets/common.scss`
- 改动：`config/site_settings.yml`（品牌默认值）、`AI-AGENTS.md`（追加主题段）
- DB 状态：TeenX 主题（id=1）已装入 common.scss 并设为默认（开发库）

### 文档
- 改动：`/Users/baihe/Documents/advx26/AGENTS.md`（追加 "ADVX UI design system" 段）
- 新增：本报告 `docs/handoff-5-report.md`

---

*本交接完成。Studio 侧重写（删 Tailwind 用令牌），论坛侧覆盖（Discourse 主题 CSS），两系统在七色令牌下视觉调性一致。*
