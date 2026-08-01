# 交接提示词 #5 · Studio + 论坛 UI 统一落地设计体系

> 本文件是开新线程做 UI 统一美化的交接提示词。读取后，把已完成的 Studio 前端和 TeenX 论坛前端，都统一到 Open Design 回传的那套设计体系里。

---

## 0. 前置与上下文

### 0.1 现状（两个交接已完成）

| 系统 | 位置 | 当前 UI 状态 | 问题 |
|---|---|---|---|
| Studio | `/Users/baihe/Documents/advx26/ui-advx/` | React + TS + Tailwind v4，浅色主题（`#f7f7f8` 背景、蓝色按钮、Tailwind 类名） | **完全没用** Open Design 的深色七色令牌体系，视觉与产品原型不一致 |
| 论坛 | `/Users/baihe/Documents/teenx-forum/` | Discourse 原生 Ember.js UI，默认主题 | 是 Discourse 默认外观，没有 TeenX 品牌感和深色令牌体系 |

### 0.2 目标设计体系（已由 Open Design 产出，位于）
```
/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95
```
内含 25 页 HTML 原型 + `css/tokens.css` + `css/app.css` + `js/app.js` + `js/mock.js`。**开工前必须逐个读取 `css/tokens.css` 和 `css/app.css`**，理解设计令牌和组件类体系。

### 0.3 设计体系核心（七色令牌，不可违反）
```css
--bg:      #000000;   /* 纯黑背景 */
--surface: #0a0a0a;   /* 深黑表面/卡片 */
--fg:      #ffffff;   /* 白色前景/文字 */
--muted:   #737373;   /* 灰色弱化文字 */
--border:  #242424;   /* 深灰描边 */
--accent:  #f48529;   /* 主 accent（橙）*/
--accent-2:#54a2ff;   /* 次 accent（蓝）*/
```
派生色用 `color-mix(in oklch, ...)`。**整个工程只允许这 7 个 hex 出现**（在令牌文件里），其余一律 `var(--xx)` 或 `color-mix()`。禁止在组件里写任何 hex 字面量。

### 0.4 两个系统的改法不同（重要）

| 系统 | 改法 |
|---|---|
| **Studio (ui-advx)** | 是自写 React 前端，**重写**：删掉 Tailwind，引入 tokens.css + app.css，所有页面用七色令牌和组件类重做 |
| **论坛 (teenx-forum)** | 是 Discourse 原生 Ember UI，不能重写 Ember，**通过 Discourse 主题覆盖**：创建一个 TeenX 主题，用 CSS 覆盖把 Discourse 默认外观改成深色七色令牌风格 |

---

## 阶段 A · Studio (ui-advx) 重写为设计体系

### A1. 读源文件
开工前必读：
1. Open Design 的 `css/tokens.css` 和 `css/app.css`——设计令牌和组件类
2. Open Design 的 `p04-studio.html`、`p05-member.html`、`p08-run.html`、`p09-run-result.html`、`p10-versions.html`、`p11-activity.html`——Studio 6 个页面的 HTML 结构和交互
3. 当前 `/Users/baihe/Documents/advx26/ui-advx/src/` 下所有文件——现有 React 代码和 API 对接逻辑

### A2. 移除 Tailwind，引入设计体系
```bash
cd /Users/baihe/Documents/advx26/ui-advx
# 1. 把 Open Design 的 tokens.css 和 app.css 复制到 src/styles/
cp '<Open Design 路径>/css/tokens.css' src/styles/tokens.css
cp '<Open Design 路径>/css/app.css' src/styles/app.css

# 2. 修改 src/index.css：删掉 @import "tailwindcss"，改为：
#    @import './styles/tokens.css';
#    @import './styles/app.css';

# 3. 卸载 tailwind（如果 package.json 里有）
pnpm remove tailwindcss @tailwindcss/vite  # 或 npm uninstall
```

### A3. 实现共享组件
参照 Open Design 的 `js/app.js`，迁移为 React 组件（放到 `src/components/`）：

| 组件 | 对应原型 | 说明 |
|---|---|---|
| `<TopNav active="studio" />` | `renderNav()` | 5 项导航 + logo + 用户信息，sticky 顶栏，橙色下划线高亮 |
| `<PageFoot />` | `renderFoot()` | 固定页脚 |
| `<Toast />` + `useToast()` | `toast()` | Context + Hook，`.toast-wrap` / `.toast` 类 |
| `<ConfirmModal />` + `useConfirm()` | `confirmModal()` | 命令式调用，支持 title/body/input/okText/danger |
| `<Seg />` | `segInit()` | 分段筛选条，受控组件 |
| `<CatBar />` | `catbarInit()` | 分类条，受控组件 |

### A4. 重写 Studio 6 个页面

对照 Open Design 的 HTML 原型，把当前 ui-advx 的页面**重写**为设计体系版本。**保留现有 API 对接逻辑**（api.ts 里的调用不变），只改视觉层和 JSX 结构。

#### P04 组队室主页 → `StudioPage.tsx`
对照 `p04-studio.html`：
- 顶部 `<TopNav active="studio" />`
- 队伍信息卡：`.card` 内 `.row-between`，左队伍名+简介（可编辑），右模型/版本数/封存按钮
- 队员网格：`.grid-4`，每张卡 `.card.card-hover.card-link`，含 `.avatar` + 名字 + `.pill` 角色 + 工具/Skill 计数
- 末尾"+ 加队员"卡：虚线边框 `.card` `border-style: dashed`
- 底部试跑入口卡：`.card.row-between`
- 编辑队名/简介/封存版本 → `useConfirm()` 弹窗

#### P05 队员详情 → `MemberPage.tsx`
对照 `p05-member.html`：
- 队员名（`.input` 可编辑）+ 角色 `.pill`
- 职责描述 `.textarea`
- 工具清单：`.tag.tag-x` 标签组 + "管理工具"按钮
- Skill 清单：`.tag` 标签组 + 添加按钮
- 协作关系：汇报线/委托 `.select`
- 删除按钮（`.btn.btn-secondary`，≤1 人禁删）

#### P06 加队员 → 弹窗或独立页
对照 `p06-add-member.html`：
- 四角色模板卡片网格 `.grid-3`，每张 `.card.card-hover`
- 选中后弹起名 `.input`
- 8 人上限提示

#### P08 试跑 → `TestRunPage.tsx`（改前是 TestRunPage，对齐 p08）
对照 `p08-run.html`：
- 3 个试跑任务卡 `.grid-3`
- 点击后确认区（展示当前队伍成员只读）+ 启动按钮

#### P09 试跑结果 → `TestRunResultPage.tsx`
对照 `p09-run-result.html`：
- 活动记录时间流：`.tl-item`（可展开 `.tl-detail`）
- 产物展示区 `.card`
- 底部操作：封存版本/返回/再跑

#### P10 版本历史 → `VersionsPage.tsx`
对照 `p10-versions.html`：
- 版本列表 `.log-row`，每条展开快照
- 当前版本 `.pill` 标记
- 设为当前 / fork 按钮

#### P11 活动记录 → `ActivityPage.tsx`
对照 `p11-activity.html`：
- 筛选条（按队员 `.avatar` 筛选 + 按类型 `.seg`）
- 活动流 `.tl-item`，分页

### A5. 验收门（Studio）
- [ ] `pnpm dev`（或 `npm run dev`）启动无错
- [ ] Studio 页面背景是纯黑 `#000`，文字是白色
- [ ] 主按钮是橙色 `#f48529`，次按钮透明描边
- [ ] 卡片是 `#0a0a0a` 深黑底 + `#242424` 描边
- [ ] 导航栏 sticky + 毛玻璃 + 橙色下划线高亮
- [ ] 所有 6 个页面视觉与 Open Design 原型对比一致
- [ ] API 对接逻辑保留（能真实创建队伍/加队员/试跑/封存）
- [ ] 工程里没有任何 hex 字面量出现在 `.tsx` 文件（只允许在 tokens.css）
- [ ] `tsc --noEmit` 无类型错误
- [ ] `npm run build` 成功

---

## 阶段 B · 论坛 (teenx-forum) 主题覆盖

Discourse 原生是 Ember.js，不能重写前端。通过**创建 Discourse 主题**用 CSS 覆盖默认外观。

### B1. 读源文件
开工前必读：
1. Open Design 的 `css/tokens.css` 和 `css/app.css`——目标设计令牌
2. Open Design 的 `p17-forum.html`、`p18-forum-cat.html`、`p19-post.html`、`p20-compose.html`、`p21-messages.html`、`p22-message-thread.html`、`p23-user.html`——论坛 7 个页面的 HTML
3. Discourse 主题开发文档：https://meta.discourse.org/t/how-to-use-custom-themes/98032

### B2. 创建 TeenX 主题

Discourse 主题有两种方式，选**方式 1**（本地文件，便于版本管理）：

#### 方式 1：本地主题文件（推荐）
在 teenx-forum 仓库里创建：
```
teenx-forum/
└── teenx-theme/
    ├── about.json          # 主题元信息
    └── stylesheets/
        └── common.scss     # 主样式覆盖
```

`about.json`：
```json
{
  "name": "TeenX Theme",
  "about_url": "https://teenx.app",
  "version": "1.0.0",
  "minimum_discourse_version": "3.1.0",
  "assets": {},
  "color_schemes": {
    "TeenX Dark": {
      "primary": "ffffff",
      "secondary": "0a0a0a",
      "tertiary": "f48529",
      "quaternary": "54a2ff",
      "header_background": "000000",
      "header_primary": "ffffff",
      "highlight": "242424",
      "danger": "e45735",
      "success": "4caf50",
      "love": "e45735"
    }
  }
}
```

### B3. 编写主题 CSS 覆盖 (`common.scss`)

把 Discourse 默认外观覆盖为 TeenX 深色七色令牌风格。**不追求像素级一致**（Ember 的 DOM 结构和原型不同），追求**视觉调性一致**：深色背景、橙蓝 accent、无圆角过大、字体层级清晰。

```scss
// ============================================
// TeenX Theme · Discourse 深色覆盖
// 目标调性：黑底 / 白字 / 橙蓝 accent / 深灰描边
// 对齐 Open Design tokens.css 的七色令牌
// ============================================

:root {
  --teenx-bg:       #000000;
  --teenx-surface:  #0a0a0a;
  --teenx-fg:       #ffffff;
  --teenx-muted:    #737373;
  --teenx-border:   #242424;
  --teenx-accent:   #f48529;
  --teenx-accent-2: #54a2ff;
}

// ─── 全局背景与文字 ───
body {
  background: var(--teenx-bg) !important;
  color: var(--teenx-fg) !important;
  font-family: system-ui, -apple-system, "PingFang SC", sans-serif;
}

// ─── 头部导航 ───
.d-header {
  background: rgba(0, 0, 0, 0.88) !important;
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--teenx-border) !important;
  box-shadow: none !important;
}
.d-header .title a, .d-header .header-buttons button {
  color: var(--teenx-fg) !important;
}
.d-header .d-icon { color: var(--teenx-muted) !important; }

// ─── logo ───
#site-logo { display: none; }
.d-header .title::before {
  content: "TeenX";
  font-weight: 700;
  font-size: 19px;
  letter-spacing: -0.01em;
  color: var(--teenx-fg);
}
// 让 X 变橙色（需要 JS 辅助，或用 ::after 拼）
// 简化版：整体白色，可接受

// ─── 帖子列表页 ───
.topic-list-item {
  background: var(--teenx-surface) !important;
  border-bottom: 1px solid var(--teenx-border) !important;
}
.topic-list-item:hover {
  background: color-mix(in oklch, var(--teenx-surface) 80%, var(--teenx-fg) 5%) !important;
}
.topic-list-item .title a {
  color: var(--teenx-fg) !important;
}
.topic-list-item .title a:visited {
  color: var(--teenx-muted) !important;
}
.topic-list-item .posters a, .topic-list-item .num a {
  color: var(--teenx-muted) !important;
}

// ─── 帖子详情页 ───
.post-stream .topic-post {
  background: var(--teenx-surface) !important;
  border: 1px solid var(--teenx-border) !important;
  border-radius: 8px !important;
  margin-bottom: 16px;
}
.cooked {  // Discourse 帖子正文容器
  color: var(--teenx-fg) !important;
  line-height: 1.7;
}
.cooked a { color: var(--teenx-accent-2) !important; }
.cooked h1, .cooked h2, .cooked h3 { color: var(--teenx-fg) !important; }

// ─── 分类标签 ───
.badge-wrapper, .category-name {
  color: var(--teenx-accent) !important;
}

// ─── 按钮 ───
.btn, .btn-default, .btn-primary {
  border-radius: 8px !important;
  font-weight: 500 !important;
}
.btn-primary {
  background: var(--teenx-accent) !important;
  color: var(--teenx-bg) !important;
  border: 1px solid var(--teenx-accent) !important;
  font-weight: 700 !important;
}
.btn-primary:hover {
  background: color-mix(in oklch, var(--teenx-accent) 88%, var(--teenx-fg)) !important;
}
.btn-default {
  background: transparent !important;
  color: var(--teenx-fg) !important;
  border: 1px solid var(--teenx-border) !important;
}
.btn-default:hover {
  border-color: var(--teenx-muted) !important;
}

// ─── 输入框 ───
.d-editor-input, input[type="text"], input[type="password"], textarea {
  background: var(--teenx-bg) !important;
  color: var(--teenx-fg) !important;
  border: 1px solid var(--teenx-border) !important;
  border-radius: 8px !important;
}
.d-editor-input:focus, input:focus, textarea:focus {
  border-color: var(--teenx-accent) !important;
  outline: 2px solid color-mix(in oklch, var(--teenx-accent) 14%, transparent) !important;
}

// ─── 侧边栏 ───
.sidebar-container, .navigation-container {
  background: var(--teenx-surface) !important;
  border-right: 1px solid var(--teenx-border) !important;
}
.sidebar-section-link a {
  color: var(--teenx-muted) !important;
}
.sidebar-section-link a:hover, .sidebar-section-link.active a {
  color: var(--teenx-fg) !important;
}

// ─── 用户头像/卡片 ───
.user-card, .user-main {
  background: var(--teenx-surface) !important;
  border: 1px solid var(--teenx-border) !important;
}

// ─── 私信 ───
.user-messages .topic-list-item {
  background: var(--teenx-surface) !important;
}

// ─── 链接 ───
a, a:link { color: var(--teenx-accent-2); }
a:hover { color: var(--teenx-fg); }
a:visited { color: color-mix(in oklch, var(--teenx-accent-2) 60%, var(--teenx-muted)); }

// ─── 表格 ───
table th {
  color: var(--teenx-muted) !important;
  border-bottom: 1px solid var(--teenx-border) !important;
}
table td { border-bottom: 1px solid var(--teenx-border) !important; }

// ─── TeenX 自有 plugin 样式增强 ───
// "AI 协助撰写" 徽章
.ai-authored-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  background: color-mix(in oklch, var(--teenx-accent-2) 14%, transparent);
  color: var(--teenx-accent-2) !important;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-left: 8px;
}

// "AI 已审" 标牌
.ai-reviewed-badge {
  display: inline-block;
  padding: 2px 8px;
  color: var(--teenx-muted) !important;
  font-size: 12px;
  margin-top: 8px;
}
```

> 以上是**起点模板**，不是最终版。执行时需要实际启动 Discourse，用浏览器 DevTools 检查真实 DOM 结构，逐个覆盖到视觉调性一致。Discourse 的 class 名可能与上面列的不同，以实际 DOM 为准。

### B4. 安装主题到本地 Discourse
1. 启动 Discourse（`rails s`）
2. 管理后台 → Customize → Themes → Import
3. 选"From a folder on your server"，路径填 `teenx-forum/teenx-theme/`
4. 设为默认主题
5. 或用 `rails c`：`Theme.where(name: "TeenX Theme").update_all(user_selectable: true, default: true)`

### B5. 品牌文案
在 `config/site_settings.yml` 或管理后台确认：
- `site_name` = "TeenX"
- `title` = "TeenX"
- `site_description` = "给孩子一支 AI 队伍"

### B6. 验收门（论坛）
- [ ] Discourse 启动后首页是深色背景（纯黑 `#000`）
- [ ] 帖子列表项是深黑底 `#0a0a0a` + 深灰描边
- [ ] 主按钮是橙色 `#f48529`
- [ ] 导航栏 sticky + 毛玻璃 + 深色
- [ ] 帖子正文白字、行高 1.7、链接蓝色
- [ ] "AI 协助撰写"徽章是蓝色圆角 pill
- [ ] "AI 已审"标牌显示在帖子底部
- [ ] 输入框深色底 + 橙色 focus 描边
- [ ] logo 区域显示 "TeenX" 文字
- [ ] 主题已设为默认

---

## 阶段 C · 视觉一致性检查

两个系统都改完后，做跨系统视觉对照：

### C1. 调性对照清单
| 维度 | Studio (ui-advx) | 论坛 (teenx-forum) | 一致性要求 |
|---|---|---|---|
| 背景 | 纯黑 `#000` | 纯黑 `#000` | 完全一致 |
| 卡片底 | `#0a0a0a` | `#0a0a0a` | 完全一致 |
| 描边 | `#242424` | `#242424` | 完全一致 |
| 主文字 | 白 `#fff` | 白 `#fff` | 完全一致 |
| 弱化文字 | `#737373` 灰 | `#737373` 灰 | 完全一致 |
| 主按钮 | 橙 `#f48529` | 橙 `#f48529` | 完全一致 |
| 链接 | 蓝 `#54a2ff` | 蓝 `#54a2ff` | 完全一致 |
| 圆角 | 8px | 8px | 完全一致 |
| 导航栏 | sticky + 毛玻璃 + 橙色下划线 | sticky + 毛玻璃 + 深色 | 调性一致 |

### C2. 不要求一致的点
- DOM 结构不同（Studio 是 React，论坛是 Ember）——不要求一致
- 页面布局不同（Studio 是组队室，论坛是帖子流）——不要求一致
- 字体可能有细微差异（Discourse 有自己的字体栈）——可接受
- Discourse 某些原生组件（如日期选择器、emoji 选择器）难完全覆盖——可接受原生样式

---

## 阶段 D · 文档与交接

### D1. 更新 Studio 的 AGENTS.md
在 `/Users/baihe/Documents/advx26/AGENTS.md` 追加：
- Studio UI 已迁移到 Open Design 七色令牌体系
- tokens.css + app.css 是唯一视觉令牌源
- 禁止在 .tsx 文件写 hex 字面量
- 禁止恢复 Tailwind

### D2. 更新论坛的 AGENTS.md
在 `/Users/baihe/Documents/teenx-forum/AGENTS.md` 追加：
- TeenX 主题位于 `teenx-theme/`
- 主题用 CSS 覆盖 Discourse 默认外观
- 七色令牌定义在 `teenx-theme/stylesheets/common.scss` 顶部
- 禁止在主题之外另写散装 CSS

### D3. 写交接报告 `docs/handoff-5-report.md`
在 `/Users/baihe/Documents/advx26/docs/` 下写：
- Studio 改了哪些文件（清单）
- 论坛改了哪些文件（清单）
- 视觉对照结果（C1 清单逐项确认）
- 遇到的问题与解决方式
- 已知不一致点（C2 列出的）
- 后续建议

---

## 执行顺序与回报规则

1. **按阶段 A → B → C → D 顺序执行**
2. A 阶段先做 Studio（自写前端，可控性高）；B 阶段再做论坛（CSS 覆盖，需要实际启动 Discourse 调试）
3. 每完成一个阶段，简短回报：阶段名 + 关键改动 + 遇到的问题 + 是否进入下一阶段
4. 若 Discourse 无法本地启动，B 阶段可只产出主题文件 + 文档说明"需在实际部署时安装验证"，但 CSS 必须写完
5. 全部完成后写交接报告

---

## 关键约束

- **Studio 侧是重写**：删 Tailwind，用 tokens.css + app.css + 组件类，保留 API 对接逻辑
- **论坛侧是覆盖**：不重写 Ember，用 Discourse 主题 CSS 覆盖到调性一致
- **七色令牌是硬约束**：只允许 `#000/#0a0a0a/#fff/#737373/#242424/#f48529/#54a2ff` 这 7 个 hex
- **不追求像素级一致**：两个系统的 DOM 不同，追求调性一致即可
- **不接真实 API**：Studio 侧保留现有 API 对接，论坛侧不接 Studio
- **不做响应式**：桌面单尺寸
- **不做动画**：除已有 transition 外不新增

---

## 参考文件清单

| 文件 | 位置 | 作用 |
|---|---|---|
| Open Design tokens.css | `<Open Design 路径>/css/tokens.css` | 七色令牌定义 |
| Open Design app.css | `<Open Design 路径>/css/app.css` | 组件类体系 |
| Open Design p04-p11 | `<Open Design 路径>/p04-studio.html` 等 | Studio 6 页 HTML 原型 |
| Open Design p17-p23 | `<Open Design 路径>/p17-forum.html` 等 | 论坛 7 页 HTML 原型 |
| Studio 现有代码 | `/Users/baihe/Documents/advx26/ui-advx/src/` | 现有 React + API 对接 |
| Studio API 层 | `/Users/baihe/Documents/advx26/ui-advx/src/api.ts` | 保留不动 |
| 论坛 plugin | `/Users/baihe/Documents/teenx-forum/plugins/teenx-*/` | 已有的 AI 标记/私信安全 plugin |
| Discourse 主题文档 | https://meta.discourse.org/t/how-to-use-custom-themes/98032 | 主题开发参考 |

---

*本交接提示词要求把已完成的 Studio 和论坛两个系统的 UI，统一到 Open Design 回传的深色七色令牌设计体系。Studio 侧重写（删 Tailwind 用令牌），论坛侧覆盖（Discourse 主题 CSS）。*
