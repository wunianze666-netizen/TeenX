# 交接提示词 #7 · TeenX Forum 深色视觉深度打磨

> 把本文件完整交给新线程。新线程的唯一主任务是：修复 TeenX 论坛中突兀的浅色/白色界面，并在不破坏 Discourse、SSO 和儿童安全约束的前提下，把所有核心论坛页面统一到 ADVX 七色深色视觉系统。

---

## 0. 给新线程的直接指令

你现在接手 TeenX Forum 的视觉深度打磨。用户的原始反馈是：

> “论坛里面现在还有很多突兀的白色，需要深度美化视觉。”

请直接检查现有代码和真实浏览器 DOM，完成代码修改、主题重载、桌面与移动端验证，不要只输出方案。需求已经明确，不需要先让用户选择风格；现有 Open Design 原型、七色令牌和用户截图就是设计方向。

工作顺序必须是：

1. 读取本交接与列出的权威文件。
2. 启动/确认三个服务，保存当前桌面和移动端基线截图。
3. 先修正 Discourse ColorScheme 与 CSS 变量的颜色语义层。
4. 再逐组件、逐页面做视觉精修。
5. 用真实交互回归 SSO、主题列表、帖子、发帖、搜索、菜单、用户页和私信。
6. 给出修改摘要、验证结果和仍存在的真实限制。

不要把工作停在“建议这样改”。除非发现与本交接直接冲突的新改动，否则自主完成。

---

## 1. 本轮目标

### 1.1 核心目标

- 消除所有用户可见的白色或浅灰色容器背景。
- 让论坛视觉与 Studio 一致：黑底、深黑表面、白字、克制灰线、橙色主动作、蓝色链接/信息状态。
- 保留 Discourse 原生信息架构与交互能力，不重写 Ember 页面。
- 从颜色系统根部解决问题，而不是继续靠零散高特异性选择器补洞。
- 完成桌面、窄屏和移动端的核心页面视觉回归。

### 1.2 目标气质

TeenX 应该像一个面向青少年的严肃创作实验室，而不是：

- 默认 Discourse 换了黑色背景；
- 游戏化儿童站；
- 霓虹赛博或紫色渐变 AI 产品；
- 到处都是圆角卡片和装饰图标的模板站。

目标关键词：**克制、清晰、可信、年轻、创作感、中等信息密度**。

### 1.3 不是本轮目标

- 不实现赛题、排行榜或写帖 Agent。
- 不改 Studio 登录模型。
- 不重写 Discourse Connect。
- 不重写 Ember 组件或复制一套假论坛到 React。
- 不深度美化 `/admin`、`/review` 等工作人员页面；只需保证全局颜色不出现大片白底。
- 不改变论坛内容、分类数据和儿童安全策略。

---

## 2. 工作目录与 Git 状态

### 2.1 两个独立仓库

| 系统 | 路径 | 分支 | 作用 |
|---|---|---|---|
| Studio 主仓库 | `/Users/baihe/Documents/advx26/` | `advx/main` | Paperclip 后端、ADVX React UI、论坛 iframe 与 SSO 代理 |
| TeenX Forum | `/Users/baihe/Documents/teenx-forum/` | `teenx/main` | Discourse、TeenX 插件和本地主题 |

两个目录是独立 Git 仓库，不共享提交历史。论坛视觉代码主要改在 `teenx-forum`，不要把论坛主题文件复制到 `advx26`。

### 2.2 Studio 当前状态

本交接创建前，`advx26` 工作树干净，最近四个 ADVX 提交是：

```text
1b6722f6b feat(ui-advx): add Studio and forum experience
2ec5eaf2c feat(server): add ADVX Studio API
e82c6a1f9 feat(teams-catalog): add ADVX starter roles
1767bdffe docs(advx): add product specs and handoff history
```

### 2.3 Forum 当前状态

`teenx-forum` 当前已有未提交改动：

```text
 M AI-AGENTS.md
 M config/site_settings.yml
 M lib/action_dispatch/session/discourse_cookie_store.rb
?? teenx-theme/
```

这些都是前序工作，不是垃圾文件。**不可 reset、checkout、删除或覆盖。** 在其上继续修改，并在最终总结中区分本轮修改。

论坛仓库最近提交：

```text
eeffe7d1 Phase H: AGENTS.md + handoff report
ff85fca3 Phase G: E2E smoke test script
6ca09144 Phase F: Color theme + feature flags
57a20d84 Phase E: Comments + PM safety plugin
4e88496e Phase D: TeenX AI post marker plugin
3e70377a Phase C: SSO + API Key + 5 categories
92474aea Phase B: Child safety baseline configuration
25e636b5 Phase A: Clone Discourse, brand as TeenX
```

两个仓库目前都没有项目自己的 `origin`；只有上游参考 remote。除非用户明确要求，不要创建 remote、push 或提交。

---

## 3. 开工前必读

按以下顺序读取：

1. 本文件：`/Users/baihe/Documents/advx26/docs/07-handoff-7-forum-visual-polish.md`
2. 架构与 SSO 全貌：`/Users/baihe/Documents/advx26/docs/06-handoff-6-sso-and-roadmap.md`
3. 用户问题截图：`/Users/baihe/Documents/截屏/截屏2026-07-25 11.55.24.png`
4. Forum 仓库规则：`/Users/baihe/Documents/teenx-forum/AI-AGENTS.md`
5. 当前主题：`/Users/baihe/Documents/teenx-forum/teenx-theme/stylesheets/common.scss`
6. 主题清单：`/Users/baihe/Documents/teenx-forum/teenx-theme/about.json`
7. 旧主题脚本：`/Users/baihe/Documents/teenx-forum/script/teenx_phase_f_theme.rb`
8. Studio 论坛容器：`/Users/baihe/Documents/advx26/ui-advx/src/pages/ForumPage.tsx`
9. Vite 代理：`/Users/baihe/Documents/advx26/ui-advx/vite.config.ts`
10. Studio 视觉令牌：`/Users/baihe/Documents/advx26/ui-advx/src/styles/tokens.css`
11. Studio 组件语言：`/Users/baihe/Documents/advx26/ui-advx/src/styles/app.css`

### 3.1 Open Design 论坛原型

原型根目录：

```text
/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95/
```

| 原型 | 用途 |
|---|---|
| `p17-forum.html` | 社区首页、分类条、帖子行、主发帖按钮 |
| `p18-forum-cat.html` | 分类页、排序 Seg、分类发帖入口 |
| `p19-post.html` | 帖子详情、回复、操作区、AI 标记 |
| `p20-compose.html` | 发帖/编辑器视觉参考 |
| `p21-messages.html` | 私信列表 |
| `p22-message-thread.html` | 私信会话与安全提示 |
| `p23-user.html` | 用户主页 |
| `css/tokens.css` | 七色令牌 |
| `css/app.css` | 原型共享组件语言 |

原型是**调性与层级参考**，不是要求把 Discourse 像素级改造成原型。优先保留 Discourse 的可访问性、原生交互和升级友好性。

### 3.2 已知文档陈旧点

`teenx-forum/AI-AGENTS.md` 的 SSO Integration 小节仍写着旧地址 `/api/auth/sso` 和“Studio 尚未实现”。这已经过时。

当前权威实现是：

- Studio：`GET /api/advx/sso/discourse-connect`
- Vite 同源入口：`/sso-connect`
- 论坛 iframe 会话预检：`GET /api/advx/forum/session`
- SSO 已完成并经过多 Host 浏览器验证

不要因为旧文档重新实现 SSO。视觉任务若修改了主题重载说明，可顺便最小修正文档；不要扩大到认证重构。

---

## 4. 当前稳定基线，不可破坏

### 4.1 三个服务

| 服务 | 端口 | 启动命令 |
|---|---|---|
| Paperclip 后端 | `3100` | `cd /Users/baihe/Documents/advx26 && pnpm dev` |
| Discourse | `3000` | `cd /Users/baihe/Documents/teenx-forum && bin/dev` |
| ADVX Vite | `5174` | `cd /Users/baihe/Documents/advx26/ui-advx && pnpm dev` |

PATH：

```sh
export PATH="/Users/baihe/.nvm/versions/node/v24.16.0/bin:/opt/homebrew/opt/node/bin:/opt/homebrew/bin:$PATH"
export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"
```

Discourse 必须使用 Ruby 3.4。系统默认 Ruby 4.0 会报 `Bundler::RubyVersionMismatch`。

### 4.2 当前嵌入链路

`ForumPage.tsx` 当前行为：

1. 请求 `/api/advx/forum/session` 检查论坛 Cookie。
2. 已有会话则 iframe 直接打开 `/latest` 或深链。
3. 无会话才进入 `/discourse/session/sso`。
4. Vite `/sso-connect` 转给 Paperclip 签名。
5. Discourse 设置 `_t` 后回到当前 Studio Host 的根路径论坛页面。
6. ForumPage 检测 `.ember-application` 和 `#main-outlet` 后才移除加载遮罩。

已经验证：

- `http://localhost:5174/forum`
- `http://127.0.0.1:5174/forum`
- `http://[::1]:5174/forum`
- Chromium 与 WebKit/Safari 模式

主题修改不应触碰以上流程。只有发现明确的 iframe 尺寸或视觉接缝问题时，才允许最小修改 `app.css`；不要修改认证代码。

### 4.3 当前健康检查

本交接编写时：

```text
http://127.0.0.1:3100/api/health -> 200
http://127.0.0.1:3000/           -> 302
http://localhost:5174/forum      -> 200
```

---

## 5. 已验证的根因，不要再猜

### 5.1 用户截图中的主要问题

截图路径：

```text
/Users/baihe/Documents/截屏/截屏2026-07-25 11.55.24.png
```

肉眼可见的突兀浅色区域包括：

- 左侧 `Topics` 激活项为浅灰白底。
- 侧边栏底部操作区是整块白色。
- Welcome Banner 搜索框外层是白色。
- `categories` 和 `tags` 筛选控件是白色按钮。
- 页面顶部有浅色加载细线。
- 部分图标、边框、选择态仍带旧版灰蓝/紫色语义。
- 欢迎区垂直空间过大，主题列表首屏信息效率低。
- Studio 顶栏与 Discourse 内层导航的层级、间距和文字气质尚未完全统一。

### 5.2 浏览器实测颜色变量

2026-07-25 在真实 iframe 中读取到：

```text
--primary:                       #2c3e50
--secondary:                     #ffffff
--primary-very-low:              rgb(247.529..., 249.21, 250.89...)
--primary-low:                   rgb(230.096..., 235.7, 241.30...)
--primary-low-mid:               rgb(180.29..., 197.1, 213.90...)
--d-selected:                    #e6ecf1
--token-color-surface:           #ffffff
--token-color-surface-selected:  #e6ecf1
--d-sidebar-background:          #ffffff
--d-sidebar-active-background:   #e6ecf1
```

实测浅色元素：

| 元素 | 真实选择器/类 | 实测背景 |
|---|---|---|
| 侧边栏外层 | `.sidebar-wrapper` | `rgb(255,255,255)` |
| 当前 Topics | `.sidebar-section-link.active` | `rgb(240,243,247)` |
| 侧边栏 footer | `.sidebar-footer-wrapper` | `rgb(255,255,255)` |
| Welcome 搜索 | `.search-input--welcome-banner` | `rgb(255,255,255)` |
| 分类筛选 | `.category-drop-header` | `rgb(255,255,255)` |
| 标签筛选 | `.tag-drop-header` | `rgb(255,255,255)` |

### 5.3 系统性原因

当前 Theme `id=1` 的数据库状态是：

```text
theme: TeenX Theme
default_theme_id: 1
color_scheme_id: 19
color_scheme: TeenX
```

但 ColorScheme 仍是交接 Phase F 的旧浅色紫色方案：

```text
primary            2c3e50
secondary          ffffff
tertiary           6c5ce7
quaternary         6c5ce7
header_background  6c5ce7
header_primary     ffffff
highlight          f0eef7
danger             e74c3c
success            27ae60
love               e91e63
```

`common.scss` 虽然把 `body` 强制成黑色，并在 `html` 上尝试设置 `--primary`/`--secondary`，但 Discourse 的颜色定义写在 `:root`。`:root` 的特异性高于 `html`，因此这些变量覆盖实际上没有生效；大量派生变量和新版 Design Tokens 继续来自旧浅色 ColorScheme。

这是白块的根因。**先修 ColorScheme 和根变量，再精修组件。** 如果只继续给每个白块加 `background: black !important`，后续菜单、Composer、搜索结果和移动端仍会不断漏白。

### 5.4 当前主题数据源不一致

需要统一以下三处：

1. `teenx-theme/about.json` 声称提供 `TeenX Dark`，但当前手工主题重载只写入 SCSS，不会自动导入 `about.json` ColorScheme。
2. `script/teenx_phase_f_theme.rb` 仍写旧紫色浅色方案，而且 `find_or_create_by!` 的 block 只在首次创建时执行，不能可靠更新已存在颜色。
3. `common.scss` 仅覆盖少量旧变量，未覆盖 Discourse 2026.7 使用的 `--token-color-*` 与 `--d-*` 语义变量。

必须把本地主题包、可重复执行的同步方式和 live DB 状态统一，避免“文件看起来正确、浏览器仍是旧色”。

### 5.5 截图中的开发工具不是产品 UI

截图左侧窄灰色图标条是 Discourse Ember Dev Tools，右上紫色 `396.4ms ×4` 是 Rack Mini Profiler。

不要给它们写产品主题 CSS。视觉验收时应关闭：

```sh
# 启动 Discourse 时关闭 Rack Mini Profiler
DISABLE_MINI_PROFILER=1 bin/dev
```

Ember Dev Tools 可点击工具条的 `Disable dev tools`，或在论坛 frame 控制台执行：

```js
disableDevTools()
```

开发工具关闭后再截最终图，避免把调试 chrome 当成论坛设计。

---

## 6. 七色令牌与视觉规则

### 6.1 唯一基础色

| 角色 | Hex | 用途 |
|---|---|---|
| Background | `#000000` | 页面底色、输入框内底 |
| Surface | `#0a0a0a` | 卡片、侧栏、菜单、Composer |
| Foreground | `#ffffff` | 主文字、高对比图标 |
| Muted | `#737373` | 元数据、次级文字、禁用态 |
| Border | `#242424` | 线框、分隔、默认选择态 |
| Accent | `#f48529` | 主 CTA、当前导航、重要动作 |
| Accent 2 | `#54a2ff` | 链接、信息态、AI authored 标记 |

所有派生色用 `var(--teenx-*)` 或 `color-mix(in oklch, ...)`。不要新增紫、绿、红、暖白、深蓝等字面颜色。

Discourse 强制需要 `danger`、`success`、`love` 等基础槽位时，也只能映射到现有七色或其派生色。例如危险动作可使用橙色并通过文案/图标/边框共同表达，成功/信息可使用蓝色。不要为了“语义正确”偷偷引入第八种颜色。

### 6.2 `about.json` 的现实例外

Discourse 主题清单需要不带 `#` 的 hex 字符串，不能引用 CSS 变量。`about.json` 可以声明颜色，但每个值必须来自上述七色；当前 `e45735`、`4caf50` 等不在七色内，需纠正。

### 6.3 组件语言

- 页面背景黑色，内容表面只比背景亮一级。
- 主要依靠排版、留白和细线分层，不靠阴影和渐变。
- 圆角保持约 8px；pill 只用于标签/状态，不把所有按钮做胶囊。
- Primary 按钮为橙底黑字；Secondary 为透明/深底加灰色描边。
- 蓝色用于链接、信息态和 AI 标记，不与橙色争夺主动作层级。
- Topic 列表采用高质量行式布局和分隔线，避免“每行一张浮卡”的模板感。
- hover/focus/active 必须可区分，但不出现浅色填充。
- 不增加装饰性 emoji、无意义统计、霓虹 glow 或渐变。
- 分类原有 emoji 属于内容数据，可保留；不要继续扩散 emoji 装饰。

### 6.4 可访问性

- 不能靠颜色单独表达危险、成功或选中。
- 保留清晰 `:focus-visible`，使用橙色或蓝色描边/外轮廓。
- 正文白字与背景必须保持可读对比；Muted 不用于主要正文。
- 控件触达尺寸与移动端点击区域不得因视觉压缩而下降。
- 尊重 `prefers-reduced-motion`，不增加无必要动画。

---

## 7. 推荐实现策略

### Phase A：建立真实视觉基线

1. 确认三个服务健康。
2. 用 Playwright 打开 `http://localhost:5174/forum`，等待 iframe `#main-outlet` 就绪。
3. 关闭 Mini Profiler 和 Ember Dev Tools。
4. 保存至少两个基线：桌面 `1440×1000`、移动 `390×844`。
5. 记录 console/page errors；当前可能存在 Studio `/favicon.ico` 404，不要把它误判成主题故障，但不能引入新错误。
6. 在 iframe 内读取 `getComputedStyle(document.documentElement)`，保存关键变量值。
7. 扫描可见元素中接近白色的 `background-color`，不要只凭截图肉眼找。

### Phase B：修正颜色源与同步流程

这是 P0，必须先完成。

1. 把 live ColorScheme 改为真正的深色七色映射。
2. 更新 `teenx-theme/about.json`，只使用七色。
3. 更新 `script/teenx_phase_f_theme.rb` 或提供同等可靠的主题同步方式：
   - 能更新已存在的 ColorScheme，而不是只在 create block 中赋值；
   - 使用实际 Theme 名称 `TeenX Theme`，不要意外创建另一个 `TeenX`；
   - 不依赖脆弱的硬编码 ID，优先按名称查找并显式失败；
   - 同步 SCSS、ColorScheme、Theme 绑定和 default theme；
   - 可重复运行，第二次运行结果不变；
   - 不顺带破坏本地 HTTP、SSO 或儿童安全设置。
4. 不要盲目直接运行旧 `script/teenx_phase_f_theme.rb`：它还会设置旧颜色和 `force_https` 等 feature flags。
5. 修正 `common.scss` 的根变量覆盖：使用能真正覆盖 `:root` 的选择器/顺序，并优先让正确 ColorScheme 生成派生变量。
6. 重新读取以下变量，确认不再是白色/旧紫色：
   - `--primary` / `--secondary`
   - `--primary-very-low` / `--primary-low` / `--primary-low-mid`
   - `--d-selected` / `--d-hover`
   - `--token-color-surface*`
   - `--token-color-background*`
   - `--token-color-text*`
   - `--token-color-border*`
   - `--d-sidebar-*`
7. 只有正确 ColorScheme 仍无法覆盖的新式 token，才在 `common.scss` 中补语义变量。不要先手写几十个组件背景。

### Phase C：全局论坛 Shell

统一：

- `html`、`body`、`#main-outlet`、主内容容器；
- Discourse header、菜单入口、logo/品牌文字、图标；
- sidebar、active/hover、section divider、footer；
- welcome/search 区；
- 顶部加载条；
- tooltip、toast、浮层、菜单、modal、select-kit；
- scrollbar、selection、focus ring；
- iframe 内边缘与 Studio 顶栏之间的视觉接缝。

避免给所有元素加边框。先解决整体层级，再添加必要分隔。

### Phase D：核心组件精修

#### 7.4.1 导航与侧栏

- active 不再白底；使用深色 selected surface、白字和可选的橙色细标记。
- hover 只比 surface 提亮一级。
- sidebar footer 与 sidebar 连成同一深色表面。
- section heading、图标、计数 badge 建立清晰层级。
- admin/review/invite 是当前本地管理员身份产生的内容，不要用 CSS 隐藏权限功能。

#### 7.4.2 Welcome 与搜索

- 把大面积空白欢迎区压缩成更紧凑的社区入口。
- 搜索容器、输入框、图标和高级筛选全部深色。
- 搜索结果浮层、无结果、quick tip、关键词高亮同步主题。
- 不用 CSS 伪造/替换用户名称或欢迎文案。

#### 7.4.3 分类、标签与顶部导航

- `categories` / `tags` select header 变为透明或深色描边控件。
- 下拉 body、row hover、selected、search input 均完整覆盖。
- Latest/New/Hot/Categories 使用克制的文字 tab；当前项用橙或白字+橙线。
- `New Topic` 保持橙色主 CTA。

#### 7.4.4 Topic 列表

- 列表 header、row、hover、visited、pinned、unread、selected 状态全部可读。
- 标题白色，已读标题 muted，类别/标签与元数据有明确层级。
- 回复/浏览/活动数字使用 tabular/mono 感但不要过度放大。
- 空状态、加载骨架、批量选择态不能漏白。

#### 7.4.5 帖子详情

- 帖子正文最大阅读宽度合理，段落、标题、列表、引用、代码块、链接可读。
- avatar 列、post body、操作条和 topic timeline 协调，不要每条回复都变成笨重浮卡。
- like/bookmark/reply/share/flag 的 default、hover、active、disabled 完整。
- AI badge 继续由主题控制：
  - `.teenx-ai-authored-badge` 蓝色信息 pill；
  - `.teenx-ai-reviewed-badge` 灰色描边 pill。
- onebox、图片、表格、引用、代码块、编辑历史和提示条不得漏白。

#### 7.4.6 Composer

- Composer 是高风险漏白区，必须真实打开验证。
- 覆盖标题、分类、标签、正文编辑器、toolbar、preview、底部动作、草稿提示、上传/链接菜单。
- docked、全屏、移动端 Composer 都要检查。
- 保留原生编辑能力，不用 CSS 隐藏不美观但必要的控件。

#### 7.4.7 菜单、弹窗与账户

- header user menu、notifications、search panel、hamburger/sidebar drawer；
- `.menu-panel`、`.select-kit-body`、`.d-modal__container` 等浮层；
- user card、user profile、activity、bookmarks、preferences；
- messages list、message thread、私信编辑器；
- confirmation、flag/report、invite 等 modal。

#### 7.4.8 Chat

侧边栏已经显示 Chat。Chat 不是本轮最优先，但至少验证：

- channel list、thread、message bubble、composer；
- hover/selected/unread；
- 不出现整块白底。

### Phase E：响应式与嵌入体验

至少验证：

- `1440×1000` 桌面；
- `1024×768` 窄桌面/平板；
- `390×844` 移动；
- 可选 `375×667` 小屏压力测试。

检查：

- Studio TopNav 换行后 iframe 高度仍正确；
- Discourse sidebar 变抽屉后背景与遮罩完整；
- header 按钮不挤出；
- topic list 移动布局不横向溢出；
- Composer、modal、select-kit 不超出 viewport；
- iOS safe area/footer 不出现白条；
- 键盘 focus 和滚动位置正常。

### Phase F：整理和回归

- 把 `common.scss` 按 token/global/header/sidebar/search/navigation/topic-list/topic/composer/overlay/user/chat/mobile 分区。
- 删除被正确变量层取代的重复覆盖，避免继续堆叠 `!important`。
- 上游自身使用 `!important` 或级联层导致无法覆盖时，才使用最小范围 `!important`。
- 不使用通配选择器强行给所有元素设背景。
- 不使用基于 Ember 临时生成 ID 的选择器，如 `#ember113`。
- 不依赖页面当前英文文本选择器。

---

## 8. 选择器线索

以下是当前 Discourse 2026.7 DOM 的调查入口，不是要求盲目全部覆盖。每次以真实 computed style 为准。

### 8.1 Sidebar

```text
.sidebar-wrapper
.sidebar-container
.sidebar-footer-wrapper
.sidebar-footer-container
.sidebar-section-link
.sidebar-section-link.active
.sidebar-section-link--active
.sidebar-section-link.exact-url-match
.sidebar-section-header
```

重点变量：

```text
--d-sidebar-background
--d-sidebar-footer-fade
--d-sidebar-link-color
--d-sidebar-link-icon-color
--d-sidebar-highlight-background
--d-sidebar-highlight-color
--d-sidebar-active-background
--d-sidebar-active-color
--d-sidebar-section-border-color
```

### 8.2 Welcome/Search

```text
.welcome-banner
.welcome-banner__wrap
.welcome-banner__title
.welcome-banner__search-menu
.search-input--welcome-banner
.search-menu-container
.search-menu .results
.search-menu-panel
```

### 8.3 Filters/Nav

```text
.navigation-container
.category-breadcrumb
.category-drop-header
.tag-drop-header
.select-kit-header
.select-kit-body
.select-kit-row
.nav-pills
.navigation-controls
```

### 8.4 Topics/Posts

```text
.topic-list
.topic-list-header
.topic-list-item
.main-link
.topic-excerpt
.topic-post
.topic-body
.topic-avatar
.cooked
.post-menu-area
.timeline-container
.topic-map
```

### 8.5 Composer/Overlay

```text
.composer-container
.composer-fields
.d-editor
.d-editor-input
.d-editor-button-bar
.d-editor-preview
.reply-area
.menu-panel
.user-menu
.d-modal
.d-modal__container
.dialog-holder
.fk-d-menu
.tooltip
```

### 8.6 新版颜色令牌

Discourse 2026.7 大量组件已从 `--primary-low` 转向：

```text
--token-color-surface*
--token-color-background*
--token-color-text*
--token-color-icon*
--token-color-border*
--d-selected
--d-selected-hover
--d-hover
```

先通过正确 ColorScheme 观察它们的生成结果，再决定哪些需要 TeenX 明确映射。

---

## 9. 允许修改与禁止修改

### 9.1 主要允许修改

```text
/Users/baihe/Documents/teenx-forum/teenx-theme/stylesheets/common.scss
/Users/baihe/Documents/teenx-forum/teenx-theme/about.json
/Users/baihe/Documents/teenx-forum/script/teenx_phase_f_theme.rb
/Users/baihe/Documents/teenx-forum/AI-AGENTS.md
```

如果为了可靠同步主题需要一个很小的专用脚本，也可以新增到 `teenx-forum/script/`，但优先修正现有脚本，不要制造两套来源。

### 9.2 仅在有明确必要时修改

```text
/Users/baihe/Documents/advx26/ui-advx/src/styles/app.css
/Users/baihe/Documents/advx26/ui-advx/src/pages/ForumPage.tsx
```

只允许处理 iframe 尺寸、背景接缝或加载遮罩视觉。不要碰 SSO 状态机。

### 9.3 禁止修改

- 不改 `server/src/routes/advx.ts` 的 SSO 逻辑。
- 不改 `ui-advx/vite.config.ts` 的论坛代理，除非先证明视觉问题由资源代理错误导致。
- 不改 `lib/action_dispatch/session/discourse_cookie_store.rb` 的现有开发环境 SameSite 修复。
- 不关闭 `plugins/teenx-pm-safety` 或 `plugins/teenx-ai-post-marker`。
- 不删除 `stripBudget`、模型 pin 或 ADVX 其他儿童保护边界。
- 不修改 Paperclip DB schema。
- 不在 Discourse 插件里散落视觉 CSS。
- 不增加 Tailwind。

---

## 10. 儿童安全硬约束

TeenX 面向 11–16 岁用户。视觉工作不得改变以下产品边界：

- `login_required` 不得关闭。
- 不恢复匿名浏览或匿名发帖。
- 不绕过邀请/审批的生产策略。
- 不关闭 PM 外链、邮箱、手机号过滤。
- 不移除公开帖子 AI authored/reviewed 标记。
- 不在 UI 中暴露预算、成本、credits、模型参数、temperature、max tokens 或治理审批入口。
- 不用视觉 CSS 隐藏安全提示或举报入口。

当前本地开发为了 SSO 演示可能与生产审批设置不同。不要在纯视觉任务中运行会批量重写安全配置的脚本；保持现有可工作的本地状态。

---

## 11. 主题重载与诊断命令

### 11.1 健康检查

```sh
curl http://127.0.0.1:3100/api/health
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/
curl -s -o /dev/null -w '%{http_code}' http://localhost:5174/forum
```

### 11.2 查看 live Theme/ColorScheme

```sh
export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"
cd /Users/baihe/Documents/teenx-forum
RAILS_ENV=development bin/rails runner '
  t = Theme.find_by(id: SiteSetting.default_theme_id)
  puts({
    theme: t&.name,
    default_theme_id: SiteSetting.default_theme_id,
    color_scheme_id: t&.color_scheme_id,
    color_scheme: t&.color_scheme&.name,
    colors: t&.color_scheme&.colors&.map { |c| [c.name, c.hex] }
  }.inspect)
'
```

### 11.3 当前仅重载 SCSS 的旧命令

```sh
export PATH="/opt/homebrew/opt/ruby@3.4/bin:$PATH"
cd /Users/baihe/Documents/teenx-forum
RAILS_ENV=development bin/rails runner '
  scss = File.read("teenx-theme/stylesheets/common.scss")
  t = Theme.find(1)
  t.set_field(target: :common, name: :scss, value: scss, type_id: 1)
  t.set_default!
  t.save!
  puts "OK #{t.name} default=#{t.default?} bytes=#{scss.bytesize}"
'
```

这个命令只同步 SCSS，**不会修 ColorScheme**。本轮应把同步流程改得可靠，并在文档中留下新的权威命令。

### 11.4 颜色字面量检查

```sh
cd /Users/baihe/Documents/teenx-forum
rg -n '#[0-9a-fA-F]{3,8}\b' teenx-theme
rg -n '"[0-9a-fA-F]{6}"' teenx-theme/about.json script/teenx_phase_f_theme.rb
```

人工确认输出只包含七色，不要仅检查 `common.scss` 而漏掉 `about.json` 和 Ruby 脚本。

### 11.5 Studio 回归

如果没有修改 `advx26`，不必重复整个 Paperclip 测试集；仍应确认 iframe 真实可用。如果改了 Studio UI：

```sh
cd /Users/baihe/Documents/advx26
pnpm --filter @advx/ui typecheck
pnpm --filter @advx/ui build
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src
```

最后一条应无匹配。

---

## 12. 浏览器验收矩阵

所有路径优先通过 Studio iframe 验证，以覆盖真实嵌入环境：

```text
http://localhost:5174/forum?path=<encoded Discourse path>
```

### 12.1 P0 页面

| 场景 | Discourse 路径示例 | 必查内容 |
|---|---|---|
| 最新主题 | `/latest` | Welcome、搜索、sidebar、filters、topic list |
| 分类列表 | `/categories` | category cards/rows、统计、hover |
| 分类页 | `/c/showcase/5` 或真实分类 | category header、sort/filter、topic list |
| 帖子详情 | `/t/<slug>/<id>` | 正文、回复、操作、timeline、AI badge |
| Composer | 点击 `New Topic` | 所有字段、编辑器、preview、菜单、草稿 |
| 全局搜索 | `/search?expanded=true` | 搜索字段、结果、filter、空状态 |

### 12.2 P1 页面

| 场景 | 路径/入口 |
|---|---|
| 用户主页 | 点击 avatar/username 或 `/u/local_board` |
| 用户活动 | `/u/local_board/activity` |
| 私信列表 | `/u/local_board/messages` |
| 收藏 | `/u/local_board/activity/bookmarks` |
| Header user menu | 点击右上头像 |
| Notifications | 点击通知入口 |
| Chat | `/chat` 与一个真实 channel |

### 12.3 P2 页面

- `/review`
- `/admin`
- Invite modal

只检查全局色不出现不可读白底，不要求做产品级重设计。

### 12.4 每页交互检查

- hover、focus-visible、active、selected、disabled；
- 打开和关闭下拉菜单；
- 搜索输入与结果；
- 打开 Composer、切换 preview、取消；
- 打开用户菜单、通知和 modal；
- sidebar 展开/收起；
- 移动端抽屉与返回；
- 页面滚动时 header/sidebar/footer 行为；
- 刷新深链后仍能通过 SSO 正常加载。

---

## 13. 视觉完成标准

以下全部满足才算完成：

### 13.1 颜色系统

- live Theme 绑定真实 TeenX 深色 ColorScheme。
- `--secondary`、surface、selected、sidebar 等变量不再是白色。
- 主题包、同步脚本和 live DB 不再互相矛盾。
- 基础颜色只来自七色。
- 页面无旧紫色、旧灰蓝色或额外红绿状态色。

### 13.2 用户可见界面

- 截图中已知白块全部消失。
- P0/P1 页面没有新的整块白色容器。
- 菜单、下拉、modal、Composer、搜索结果不会在交互后突然漏白。
- 主次文字、边框、selected、hover 和 focus 层级清晰。
- Topic 列表、帖子详情和 Composer 与 Studio 调性一致，但仍像成熟论坛。
- 桌面和移动端都没有横向溢出、底部白条或遮挡。

### 13.3 工程质量

- 视觉主要集中在 `teenx-theme/stylesheets/common.scss`。
- 没有重写 Ember。
- 没有基于临时 Ember ID 的脆弱 CSS。
- 没有用大量新增 `!important` 掩盖错误 ColorScheme。
- 主题同步可重复执行。
- 不破坏 SSO、论坛会话、深链或 child safety。
- 浏览器没有新增 JS/page errors。

### 13.4 最终证据

至少保留：

- 桌面 latest 前后对比；
- 移动 latest 前后对比；
- 帖子详情 after；
- Composer after；
- 一个菜单/modal after；
- 关键 computed variables 的修复前后值；
- 实际执行过的命令和结果。

浏览器产物放在 `advx26/output/playwright/`，不要新建顶层截图目录，也不要默认提交生成图。

---

## 14. 建议的最终交付内容

完成后向用户报告：

1. 根因：旧 ColorScheme 与新版 token 派生导致系统性浅色，不是简单漏写几个背景。
2. 修复：颜色源、主题同步、全局组件和核心页面分别改了什么。
3. 验证：具体路由、viewport、交互、SSO 和 console 结果。
4. 文件：列出本轮实际修改文件。
5. 限制：只列真实未解决项，不泛泛建议下一步。

不要声称“全部完成”而只检查 `/latest` 静态截图。Composer、菜单、帖子详情和移动端至少必须真实打开一次。

---

## 15. 第一动作

新线程开始后立即执行：

1. `git status --short` 分别检查两个仓库，确认没有新的冲突改动。
2. 读取截图、`common.scss`、`about.json`、Phase F 脚本和 p17–p23 原型。
3. 启动 Playwright，截基线并读取 iframe 根变量。
4. 修正 ColorScheme/同步流程，重载后再次读取变量。
5. 变量层正确后，才进入组件 CSS 深度打磨。

本轮最重要的判断标准：**不只是“看起来黑了”，而是让 Discourse 的语义颜色系统真正成为 TeenX 深色系统，确保任何新打开的原生组件也不会再冒出白块。**
