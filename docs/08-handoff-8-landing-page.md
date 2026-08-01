# 交接提示词 #8 · TeenX Landing Page（Axion 参考风格）

> 把本文件完整交给新线程。新线程的任务是：在现有 `ui-advx/` 中实现 TeenX 公开 Landing Page，学习用户提供的 Axion Studio 参考稿的首屏构图、浅色配色、胶囊导航、按钮动效和 Shader 背景，但全部换成 TeenX 自己的产品内容与现有技术体系。

---

## 0. 给新线程的直接指令

你现在接手 TeenX Landing Page 的设计与实现。请直接读取代码、实现页面、安装必要依赖、接入路由，并使用真实浏览器完成桌面和移动端验证，不要只给方案。

用户的要求可以概括为：

> 参考一份 Axion Studio 设计代理商 Landing Page 指南，重点学习最上方带动态背景的 Landing Hero、浅灰/白/深灰/橙色配色、胶囊导航和克制交互；不要照抄 Axion 的业务内容，把 TeenX 自己的内容放进去。用户后续可能继续加入或替换背景素材。

完成顺序：

1. 先读取本交接、TeenX 产品定位、当前路由和设计令牌。
2. 确认当前工作树，不覆盖 `docs/07-handoff-7-forum-visual-polish.md` 等已有改动。
3. 把 `/` 从重定向改为公开 Landing Page。
4. 先完成无 Shader 也能成立的排版和响应式结构。
5. 再把 Shader 背景作为独立、可替换、可降级的视觉层接入。
6. 使用 TeenX 真实内容和真实产品截图，不复制参考站的文案、认证、图片或视频。
7. 完成 typecheck、build、颜色门禁和 Playwright 视觉/交互验收。

需求已经足够明确，不需要先让用户再选风格。如果用户在新线程提供了最终背景文件或新的 Shader 导出代码，以该素材为准；先检查素材，再替换独立背景组件，不要重写整页。

---

## 1. 核心目标

### 1.1 页面职责

Landing Page 是 TeenX 的公开入口，要在一个首屏内回答：

- TeenX 是什么；
- 它为什么不是又一个 AI 聊天工具；
- 少年在这里扮演什么角色；
- 下一步应该点哪里。

### 1.2 一句话定位

TeenX 是面向 11–16 岁少年的 AI 队伍养成平台。少年不写代码，在组队室里定义队员角色、能力与协作方式，通过试跑、复盘和版本迭代，让自己的 AI 队伍不断成长。

### 1.3 品牌核心句

> 别人给孩子一个 AI 工具，我们给孩子一支 AI 队伍，以及成为队长的责任。

这句话是 Hero 主标题，不要改成代理商式的“帮品牌统治赛道”“打造数字体验”等通用文案。

### 1.4 完成效果

- `/` 是完整 Landing Page，不再自动跳 `/studio`。
- 页面分为三个主体 section，加一个极简 footer。
- Hero 占满首屏，内容压在底部，背景有轻柔白灰与橙色流动质感。
- Landing 是浅色品牌入口，Studio/Forum/Me 等产品页仍保持现有深色系统。
- 主 CTA 进入现有 `/studio`，不链接尚不存在的登录/注册页。
- 桌面与移动端都像正式产品官网，不像功能原型。

---

## 2. 当前仓库与工作状态

### 2.1 工作目录

```text
/Users/baihe/Documents/advx26/
```

分支：`advx/main`

Landing 实现在：

```text
/Users/baihe/Documents/advx26/ui-advx/
```

论坛是另一个仓库 `/Users/baihe/Documents/teenx-forum/`，本任务不要修改。

### 2.2 当前 Git 状态

本交接创建前，Studio 仓库已有一个未跟踪交接文件：

```text
?? docs/07-handoff-7-forum-visual-polish.md
```

这是用户刚要求生成的论坛视觉交接，不得删除、回滚或改写。

当前最近的 ADVX 提交：

```text
1b6722f6b feat(ui-advx): add Studio and forum experience
2ec5eaf2c feat(server): add ADVX Studio API
e82c6a1f9 feat(teams-catalog): add ADVX starter roles
1767bdffe docs(advx): add product specs and handoff history
```

除非用户明确要求，不要提交、push 或新建 remote。

### 2.3 当前前端事实

- `ui-advx` 使用 React `19.2.x`，不是参考稿写的 React 18。
- Vite 为 `6.x`。
- React Router 为 `7.x`。
- 当前 `/` 在 `src/main.tsx` 中 `<Navigate to="/studio" />`。
- 当前没有 LandingPage、LoginPage 或 OnboardingPage 的 React 实现。
- 当前 `ui-advx/package.json` 没有 `shaders`、`pixi.js`、`lucide-react`。
- 当前整个应用被 `FeedbackProvider` 和 `CaptainProvider` 包裹，`CaptainProvider` mount 后会立即请求 `/api/advx/me`；公开 Landing 不应触发这次请求，也不应依赖后端才能展示。
- 当前 `index.css` 只能继续 import `tokens.css` 与 `app.css`，不要往里面追加散装 CSS。

---

## 3. 开工前必读

按顺序读取：

1. `/Users/baihe/Documents/advx26/AGENTS.md`
2. `/Users/baihe/Documents/advx26/docs/08-handoff-8-landing-page.md`
3. `/Users/baihe/Documents/advx26/docs/00-studio-v0.1.md`
4. `/Users/baihe/Documents/advx26/docs/03-handoff-3-ui-prototype.md` 的 P01–P03
5. `/Users/baihe/Documents/advx26/docs/06-handoff-6-sso-and-roadmap.md`
6. `/Users/baihe/Documents/advx26/ui-advx/src/main.tsx`
7. `/Users/baihe/Documents/advx26/ui-advx/src/components/TopNav.tsx`
8. `/Users/baihe/Documents/advx26/ui-advx/src/styles/tokens.css`
9. `/Users/baihe/Documents/advx26/ui-advx/src/styles/app.css`
10. `/Users/baihe/Documents/advx26/ui-advx/package.json`
11. Open Design 的 P01 原型：

```text
/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95/p01-landing.html
```

P01 提供 TeenX 原始功能与文案要求；用户给出的 Axion 指南提供新的视觉方向。两者合并方式是：**TeenX 内容骨架 + Axion 视觉语言**。

---

## 4. 从参考稿学习什么

### 4.1 应保留的设计 DNA

- 轻灰色纸面式 Hero，而不是传统深色科技首屏。
- 动态视觉占满首屏，但文字层级仍是主角。
- 白色圆角胶囊导航悬浮在背景上。
- Hero 文案落在视口底部，不居中堆成模板式 SaaS Hero。
- 大字号、中等字重、紧字距、短行距。
- 橙色只承担主 CTA 和少量品牌提示。
- 次级信息用白色小 pill、细边框和克制阴影。
- 按钮文字向上 roll、箭头旋转，动效简短且有一致 easing。
- 移动端使用底部 sheet 菜单，而不是把桌面导航硬挤成两行。
- 后续 section 在白色和浅灰之间切换，靠排版和媒体建立节奏。
- 最大内容宽度约 1440px，宽屏有充足呼吸感。

### 4.2 明确不要复制

不要复制参考稿中的：

- 品牌名 `Axion Studio` 或圆形 `AX` logo；
- `Projects / Studio / Journal / Connect` 代理商导航；
- “Taking on projects for Q1 2026”；
- London 实时时钟；
- “Book a strategy call”“Start a project”；
- `Certified Partner` / `Featured` 等未经证实的认证；
- Narrativ、Luminar 案例名和获奖描述；
- 用户给出的 Higgs 图片 URL；
- 用户给出的 CloudFront 案例视频；
- 参考稿的星芒/指南针 SVG；
- 没有实际用途的 `.liquid-glass` / `.liquid-glass-strong` 类；
- Tailwind utility class 字符串。

最终页面不应像“把 Axion 的英文替换成 TeenX 中文”。结构、文案和媒体必须服务 TeenX。

---

## 5. 技术约束，优先级高于参考稿

### 5.1 禁止 Tailwind

参考稿写的是 Tailwind CSS 3.4，但 `ui-advx/` 已明确完成去 Tailwind 迁移。

**绝对不要安装：**

```text
tailwindcss
@tailwindcss/vite
postcss
autoprefixer
```

不要创建 `tailwind.config.*`，不要在 `index.css` 写 `@tailwind`。把参考稿 utility class 翻译成语义化 class，样式集中放在 `styles/app.css`。

### 5.2 不降级 React

保留当前 React 19，不要为了照抄参考稿降级到 React 18。2026-07-25 已核实 npm `shaders@3.0.443` 的 peerDependencies 支持 React 18 或 19。

### 5.3 需要的依赖

从仓库根目录安装：

```sh
pnpm --filter @advx/ui add shaders pixi.js lucide-react
```

原因：

- `shaders` 提供 `Shader`、`Swirl`、`ChromaFlow`、`FlutedGlass`、`FilmGrain`；
- `shaders` 当前声明 `pixi.js ^8` peer dependency，显式安装避免 peer 警告/运行差异；
- `lucide-react` 提供 `ArrowRight`、`Menu`、`X`、`UsersRound` 等图标。

必须更新 workspace lockfile。不要用 npm/yarn 产生第二份锁文件。

### 5.4 Shader 官方资料

2026-07-25 已核实：

- npm 当前版本：`shaders@3.0.443`
- 官网：`https://shaders.com/`
- React Quickstart：`https://shaders.com/docs/guide/react/quickstart`
- 组合规则：`https://shaders.com/docs/guide/composing-effects`
- 性能：`https://shaders.com/docs/guide/performance`
- Telemetry：`https://shaders.com/docs/guide/telemetry`

`Shader` 最终渲染一个 WebGPU canvas。官方说明不支持 WebGPU 时 canvas 会保持空白，因此 CSS 基础背景必须始终存在。

### 5.5 隐私

Shaders 默认会在生产环境发送匿名域名和 FPS telemetry。TeenX 面向未成年人，必须显式：

```tsx
<Shader disableTelemetry={true}>...</Shader>
```

不要依赖“localhost 自动关闭”。生产构建也必须关闭。

---

## 6. 七色令牌下的浅色 Landing

### 6.1 七色硬约束

唯一允许的基础 hex 仍是：

```text
#000000  background
#0a0a0a  surface
#ffffff  foreground
#737373  muted
#242424  border
#f48529  accent orange
#54a2ff  accent blue
```

只有 `ui-advx/src/styles/tokens.css` 可以包含这些 hex。`.tsx` / `.ts` 禁止出现任何 hex。

### 6.2 如何适配参考色

参考稿的视觉关系要保留，但不要照抄它的新颜色字面量：

| 参考角色 | 参考值 | TeenX 实现 |
|---|---|---|
| Hero 浅灰 | `#EFEFEF` | 在 `tokens.css` 用 `color-mix()` 派生 `--landing-paper` |
| 白色 section/navbar | `#FFFFFF` | `var(--fg)` |
| 第三段浅灰 | `#F5F5F5` | 派生 `--landing-paper-soft` |
| 深灰文字/按钮 | Tailwind gray-900 | 从 `--surface` 与 `--border` 派生 `--landing-ink` |
| 次级文字 | gray-600 | 从 `--bg` 与 `--muted` 派生 `--landing-muted` |
| 橙色 CTA | `#F26522` | 使用现有 `var(--accent)`，即 TeenX 橙 |
| 蓝色 | 未使用 | Landing 首屏默认不主动加蓝；仅真实链接/信息态需要时使用 `--accent-2` |

推荐在 `tokens.css` 增加派生变量，不新增 hex：

```css
--landing-paper: color-mix(in oklch, var(--fg) 88%, var(--muted));
--landing-paper-soft: color-mix(in oklch, var(--fg) 93%, var(--muted));
--landing-ink: color-mix(in oklch, var(--surface) 72%, var(--border));
--landing-muted: color-mix(in oklch, var(--bg) 38%, var(--muted));
--landing-line: color-mix(in oklch, var(--bg) 10%, transparent);
--landing-shadow: color-mix(in oklch, var(--bg) 10%, transparent);
```

实现时肉眼校准，但只能调整 mix 百分比，不新增颜色。

### 6.3 必须页面级作用域

Landing 的浅色规则全部挂在 `.landing-page` 下，例如：

```css
.landing-page { ... }
.landing-page .landing-nav { ... }
.landing-page .landing-cta { ... }
```

不要把全局 `body`、`.btn-primary`、`.card`、`.topnav` 改成浅色，否则会破坏 `/studio`、`/forum`、`/me`。

若需要解决页面 overscroll 背景，可在 Landing mount 时添加并在 unmount 时清理一个 body class，或使用可靠的页面作用域方案；不能让 class 残留到产品页。

---

## 7. 页面信息架构与最终文案

页面由三个主体 section 构成。

## Section 1：Hero

### 7.1 布局

- `min-height: 100svh`，支持时使用 `100dvh`；不是固定 `100vh`。
- 基础背景为 `--landing-paper`。
- 背景层绝对定位铺满，`pointer-events: none`。
- 导航和内容位于背景之上。
- 内容最大宽度 1440px，居中。
- 导航位于首屏顶部；Hero 文案通过 flex spacer 压在视口底部。
- 大屏左右 gutter 接近 48px，中屏 32px，移动 20px。
- 底部间距在移动端约 56px，桌面约 80px。

### 7.2 Landing 专用导航

不要直接复用深色产品 `TopNav`。Landing 需要独立白色胶囊 nav，并应放在共享组件目录：

```text
ui-advx/src/components/LandingNav.tsx
```

`LandingNav` 负责桌面导航、Menu button、移动 bottom sheet 和焦点/滚动管理。页面只负责提供 section 与内容，避免在 page 文件里重新散装导航；也不要继续拆十几个只使用一次的小组件。

导航内容：

**左侧：**

- 深色圆形 logo，文字 `TX`；
- 圆形旁显示 `TeenX`，移动端空间不足时可隐藏文字；
- 桌面 anchor：`为什么 TeenX`、`怎么玩`、`社区`；
- 前两项分别滚到 `#why-teenx`、`#how-it-works`；
- `社区` 进入 `/forum`，沿用现有论坛 reload 行为以保证嵌入初始化。

**右侧：**

- 桌面静态状态：`面向 11–16 岁`；
- 主按钮：`开始建队`，进入 `/studio`；
- 不放 London 时间、接单季度或伪在线状态。

**移动端：**

- 右侧 `Menu` / `X` icon button；
- 打开 fixed 全屏 overlay，黑色透明 backdrop；
- 底部白色 sheet，圆角、外边距约 12px；
- sheet 内显示产品短句、三个链接和 `开始建队` CTA；
- 动画从底部上滑，500ms，`cubic-bezier(0.32, 0.72, 0, 1)`；
- 支持 Escape 关闭、点击 backdrop 关闭、链接后关闭、锁定背景滚动、关闭后焦点回到 Menu。

### 7.3 Hero 文案

小标签：

```text
TeenX · 少年 AI 队伍养成
```

主标题按三行控制：

```text
别人给孩子一个 AI 工具，
我们给孩子一支 AI 队伍，
以及成为队长的责任。
```

移动端允许自然换行，不强行保留桌面 `<br>`。桌面字号约 `clamp(2.5rem, 5vw, 4.2rem)`，移动端约 `clamp(1.9rem, 8.6vw, 3rem)`；中等字重，行高约 1.06–1.1，字距约 -0.03em。

说明文案：

```text
不写代码，也能定义角色、安排协作、发起试跑，并看见每个队员怎样把任务做出来。
```

### 7.4 Hero CTA

**Primary：**

- 文案 `开始建队`；
- 跳 `/studio`；
- 橙色 pill；
- 右侧白色圆形内放橙色 `ArrowRight`；
- hover/focus 时箭头旋转 -45deg；
- 文案使用双层 text-roll，向上移动 50%。

**Secondary badge/link：**

- 白色小方圆角 pill；
- 使用 `UsersRound` 或四个克制的角色缩写；
- 文案 `四角色起步 · 随时迭代`；
- 可滚动到 `#how-it-works`；
- 不写 `Certified Partner` / `Featured`，不使用参考 SVG。

### 7.5 Hero Shader

独立文件建议：

```text
ui-advx/src/components/LandingHeroBackground.tsx
```

该组件只负责背景，不包含导航、标题或 CTA。这样用户后续提供最终背景时，只替换这一个组件。

默认 Shader 参考参数：

```text
Swirl
  colorA: landing white
  colorB: landing paper gray
  detail: 1.7

ChromaFlow
  baseColor: landing white
  up/down/left/right color: TeenX accent orange
  momentum: 13
  radius: 3.5

FlutedGlass
  aberration: 0.61
  angle: 31
  frequency: 8
  highlight: 0.12
  highlightSoftness: 0
  lightAngle: -90
  refraction: 4
  shape: rounded
  softness: 1
  speed: 0.15

FilmGrain
  strength: 0.05
```

组件顺序从底到顶：`Swirl → ChromaFlow → FlutedGlass → FilmGrain`。先按 Shaders v3 的 flat stack 组合验证；若当前版本要求 filter nesting 才得到正确视觉，按官方 composition 文档调整，但最终只保留一个 canvas。

Shader 必须：

- `disableTelemetry={true}`；
- `aria-hidden="true"` 或位于无语义装饰容器；
- 填满 Hero；
- 不阻止链接和按钮点击；
- 失败时不影响布局与文字；
- 在 `prefers-reduced-motion: reduce` 下停止/隐藏动态层，保留静态浅灰背景；
- 不在低性能设备上创建多个全屏 canvas；
- 可通过 lazy-loaded wrapper 延迟加载，先渲染文字和 CSS fallback，避免 Shader 阻塞首屏内容。

### 7.6 Shader 颜色不能写进 TSX

`colorA="#ffffff"` 这种照抄参考稿的写法违反仓库规则。

在浏览器端从 CSS 变量解析实际 RGB 值后传入 Shader。对于 `color-mix()` 派生变量，可临时创建不可见 probe element，设置 `color: var(--landing-paper)`，再读取 `getComputedStyle(probe).color`，得到 Shader 可接受的 `rgb(...)` 字符串。不要在 TS/TSX 写 hex fallback。

若颜色尚未解析完成，先不挂载 canvas，显示 CSS fallback；不要闪现 Shaders 默认蓝绿配色。

### 7.7 用户后续背景接入位

用户说后续会加入背景。实现时保留明确层级：

```text
Hero CSS fallback
  → optional user media/background
  → Shader overlay or replacement
  → navigation/content
```

开工时先检查：

```text
ui-advx/public/landing/
ui-advx/src/assets/
```

如果用户已经加入背景文件：

- 先读取尺寸、格式和视觉；
- 如果它是最终成品背景，则替换默认 Shader，不要两层强效果叠加；
- 如果它是底图，则放在 Shader 下方并调低 Shader 强度；
- 不裁掉关键主体；
- 不把文件转成 base64 塞进 TSX；
- 仍保留无媒体 fallback。

如果没有新文件，则使用上述 Shader 默认方案，不自行生成一张无关图片填充。

---

## Section 2：为什么 TeenX

### 7.8 视觉结构

- `id="why-teenx"`；
- 白色背景 `var(--fg)`；
- 深色文字 `var(--landing-ink)`；
- 顶部留白参考 Axion About：移动约 64px，桌面约 128px；
- 最大宽度 1440px；
- 标题下方使用非对称媒体排版，桌面小图 + 文案 + 大图，移动端堆叠；
- 媒体圆角约 16px，不使用厚重阴影。

### 7.9 Badge 与标题

编号 badge：`01`

pill：

```text
从使用者到队长
```

标题：

```text
不是问 AI 要一个答案，
而是带一支队伍把事情做出来。
```

正文：

```text
在 TeenX，少年决定队伍里有哪些角色、每个队员负责什么、能使用哪些工具，以及它们如何协作。每次修改都可以马上试跑、查看过程，再继续调整。
```

CTA：

```text
看看组队室
```

跳 `/studio`，使用同一 text-roll 与 arrow motion。

### 7.10 媒体

不要使用参考稿的摄影 URL。优先使用当前 TeenX 真实界面截图：

- 小图：队员卡/四角色局部；
- 大图：Studio 队伍概览或试跑活动记录。

建议存放：

```text
ui-advx/public/landing/team-detail.webp
ui-advx/public/landing/studio-overview.webp
```

要求：

- 从本地真实页面用 Playwright 截取；
- 不伪造不存在的功能、积分或用户数量；
- 不露出 budget、cost、credits、模型参数或开发调试信息；
- 先关闭浏览器 DevTools/调试 overlay；
- 用 WebP，尺寸足够 2x 显示但控制体积；
- 有准确 `alt`；
- 若真实截图暂时无法取得，使用带文字标记的诚实 placeholder，不下载无关 stock photo。

---

## Section 3：队伍如何成长

### 7.11 视觉结构

- `id="how-it-works"`；
- 背景 `--landing-paper-soft`；
- 顶部/底部移动约 64px、桌面约 112px；
- 编号 badge：`02`；
- pill：`队伍如何成长`；
- 标题保持与 Hero 同级的宽阔排版，但略小。

标题：

```text
组队、试跑、复盘，再迭代。
```

说明：

```text
让每一次调整都有反馈，让“我的队伍在变强”真正看得见。
```

### 7.12 三步内容

使用 1 列移动、3 列桌面的编辑式 feature grid。不要做通用 icon-card 海洋；每项用大编号、短标题、真实产品细节和细线分隔。

**01 · 定义队伍**

```text
从侦察员、点子员、搭建员、挑刺员开始，给角色起名、写职责、选择工具和协作关系。
```

**02 · 发起试跑**

```text
给队伍一个小任务，看看每个队员查了什么、想了什么、做了什么，以及最后交出了什么。
```

**03 · 复盘迭代**

```text
根据活动记录调整队伍，满意后封存版本，留下可以回看、比较和继续成长的轨迹。
```

可在卡片媒体区使用真实 UI crop，但不要给每项配装饰性 emoji。没有高质量媒体时宁可保持纯排版。

### 7.13 收尾 CTA

在第三段底部做一个宽阔但克制的 CTA 行：

标题：

```text
带上你的第一支 AI 队伍。
```

按钮：

```text
进入 TeenX Studio
```

链接 `/studio`。

---

## 8. Footer

Footer 不是第四个主 section，只做必要信息：

- `TeenX`；
- `给孩子一支 AI 队伍`；
- `© 2026 TeenX`；
- 链接：`Studio`、`社区`；
- 不写虚构公司地址、客户数量、融资、合作伙伴或社交账号。

视觉延续浅灰纸面，以一条细线分隔。

不要在 `LandingPage.tsx` 重新写一个独立 footer。扩展现有 `components/PageFoot.tsx` 支持 `variant="landing"`，保留默认 product variant 的现有文案与样式不变；Landing 通过 page scope 提供浅色外观和上述链接。

---

## 9. 动效规范

### 9.1 Text roll

重复用于 Landing 的主要 CTA：

- 文案复制两份，垂直排列；
- 外层固定单行高度并 `overflow: hidden`；
- hover/focus-visible 时整体向上移动 50%；
- 500ms；
- easing：`cubic-bezier(0.25, 0.1, 0.25, 1)`；
- 两份文字都不可被屏幕阅读器重复朗读，第二份 `aria-hidden="true"`。

### 9.2 Arrow

- 圆形 arrow chip；
- hover/focus 时 `ArrowRight` 旋转 -45deg；
- 与 text roll 同时长、同 easing；
- reduced motion 下不旋转，只改变对比或边框。

### 9.3 Mobile sheet

- backdrop 淡入；
- sheet 从下方滑入；
- 500ms；
- easing：`cubic-bezier(0.32, 0.72, 0, 1)`；
- 关闭时等 exit animation 完成再卸载，或用 class 保持动画；
- reduced motion 下立即显示/隐藏。

### 9.4 页面动效边界

- 不增加滚动劫持。
- 不做每张卡片飞入、数字计数器或视差堆叠。
- Shader 是唯一持续动画的 hero 元素。
- 不添加紫色渐变、glow、cursor halo 或装饰粒子。

---

## 10. 建议代码结构

最小正确结构：

```text
ui-advx/src/pages/LandingPage.tsx
ui-advx/src/components/LandingNav.tsx
ui-advx/src/components/LandingHeroBackground.tsx
ui-advx/src/components/PageFoot.tsx
ui-advx/src/styles/tokens.css
ui-advx/src/styles/app.css
ui-advx/src/main.tsx
ui-advx/index.html
ui-advx/package.json
pnpm-lock.yaml
ui-advx/public/landing/              # 仅在有真实媒体时新增
```

约束：

- `LandingPage.tsx` 负责三个主体 section，并组合共享组件；
- `LandingNav.tsx` 负责桌面/移动导航和 bottom sheet；
- `LandingHeroBackground.tsx` 只负责 Shader/背景降级；
- `PageFoot.tsx` 增加 landing variant，但默认 product variant 不得发生视觉或文案回归；
- Text roll 可用一个极小可复用组件，也可以用一致 markup + class；不要拆十几个只有一处使用的组件；
- 所有颜色、布局和动效样式放 `app.css`；
- 新派生 token 放 `tokens.css`；
- `index.css` 仍只有两个 import；
- 不创建 `App.tsx` 只为包一层路由；
- 不把大段 style object 写进 TSX；
- 不在 TS/TSX 写 hex。

### 10.1 路由修改

当前 `/` 会重定向，而且所有路由都在 `CaptainProvider` 中：

```tsx
<Route path="/" element={<Navigate to="/studio" replace />} />
```

目标不仅是替换 route element，还要让 Landing 成为真正不依赖 `/api/advx/me` 的公开页面。建议在 `main.tsx` 内增加一个很小的 `CaptainLayout`：

```tsx
function CaptainLayout() {
  return (
    <CaptainProvider>
      <Outlet />
    </CaptainProvider>
  );
}
```

路由结构：

```tsx
<Routes>
  <Route path="/" element={<LandingPage />} />
  <Route element={<CaptainLayout />}>
    {/* 现有 /studio、/members、/test-run、/versions、/activity、/forum、/me */}
  </Route>
</Routes>
```

`FeedbackProvider` 可以继续包住全部路由。增加 `Outlet` import，移除不再使用的 `Navigate` import。不要改动现有产品 route path 或 element。

### 10.2 页面标题与 meta

`index.html` 至少调整为：

```text
title: TeenX · 给孩子一支 AI 队伍
description: 面向 11–16 岁少年的 AI 队伍养成平台。定义角色、安排协作、发起试跑，让孩子从使用 AI 走向带领 AI 队伍。
lang: zh-CN
```

不要引入 SEO 框架。若产品页需要不同 title，可在路由页面 mount 时最小更新并清理；本轮不做完整 head manager。

---

## 11. 响应式要求

虽然不用 Tailwind，但沿用参考稿的主要断点思路：

```text
sm: 640px
md: 768px
lg: 1024px
xl: 1280px
```

### Desktop ≥ 1024

- Hero 导航完整显示；
- 标题按设计行断开；
- Section 2 使用非对称三列媒体布局；
- Section 3 三列；
- 最大宽度 1440px。

### Tablet 768–1023

- 导航可保留简化桌面或切 mobile，但不能拥挤；
- Section 2 改为文案在上、两张图并列；
- Section 3 可 2+1 排列或保持单列，不能出现过窄卡片。

### Mobile < 768

- Hero 使用真实 `svh/dvh`；
- 桌面导航隐藏，显示 Menu；
- 主标题自然换行，不能产生孤立标点；
- CTA 纵向排列或在宽度允许时自适应；
- 图像堆叠；
- 三步单列，以分隔线代替厚重卡片；
- 页面无横向滚动；
- iOS bottom safe area 不遮住 sheet CTA。

---

## 12. 可访问性与语义

- 页面只有一个 `h1`。
- Section 2/3 使用 `h2`，内容项使用 `h3`。
- 导航使用 `<nav aria-label="主导航">`。
- Menu button 有 `aria-expanded`、`aria-controls` 和动态 label。
- Mobile sheet 使用合理 dialog 语义，管理焦点、Escape 和 scroll lock。
- Shader 和纯装饰 SVG 不进入无障碍树。
- 图标按钮必须有可读 label。
- 所有 hover 反馈也必须有 focus-visible 等价状态。
- 点击区域至少约 44px。
- Hero 文字在动画背景上始终满足可读对比；必要时降低 Shader 层 opacity，不给文字加夸张阴影。
- `prefers-reduced-motion` 下关闭 Shader 动态、text roll、arrow rotation 和 sheet 滑动。
- 真实截图有描述性 alt，不写“image”。

---

## 13. 性能与降级

- 先渲染 HTML/CSS，再加载 Shader chunk。
- Shader 未 ready 时不能显示默认蓝色或黑色闪屏。
- WebGPU 不支持、编译失败或 canvas 空白时，Hero 仍有完整浅灰底和全部内容。
- 不在首屏同时加载大视频和 Shader。
- 产品截图使用 WebP，设置 width/height 或 aspect-ratio，避免布局跳动。
- below-the-fold 图片 `loading="lazy"`；Hero 无内容图片时不要加预加载。
- 不在每次 render 创建颜色 probe；解析一次并存 state。
- Shader 离开 viewport 后由库自动降帧，但仍需确认没有重复 canvas 或 interval 泄漏。
- Mobile menu 关闭后清理 body scroll lock。

---

## 14. 不可违反的产品约束

- 不展示预算、成本、credits 或 spend。
- 不展示模型参数、temperature、max tokens。
- 不展示底层 Governance/Approval 配置。
- 不修改 Paperclip DB schema。
- 不改变 `/api/advx/*` 调用。
- 不修改论坛 SSO/代理。
- 不声称赛题、排行榜等尚未上线功能已经可用。
- 不伪造用户数、获奖、合作伙伴、认证、客户案例或效果指标。
- TeenX 面向未成年人，第三方 Shader telemetry 必须关闭。

---

## 15. 验证命令

### 15.1 安装后检查依赖

```sh
cd /Users/baihe/Documents/advx26
pnpm --filter @advx/ui list shaders pixi.js lucide-react
```

### 15.2 TypeScript 与构建

```sh
cd /Users/baihe/Documents/advx26
pnpm --filter @advx/ui typecheck
pnpm --filter @advx/ui build
```

### 15.3 七色与 Tailwind 门禁

```sh
cd /Users/baihe/Documents/advx26
rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx' --glob '*.ts' ui-advx/src
rg -n 'tailwindcss|@tailwindcss/vite|postcss|autoprefixer' ui-advx/package.json
rg -n '@tailwind|className="[^"]*(bg-|text-|px-|py-|max-w-|rounded-)' ui-advx/src
```

预期：

- 第一条无匹配；
- 第二条无匹配；
- 第三条不应出现 Tailwind utility 复制；如果误伤普通 class，人工确认。

### 15.4 外部参考资产检查

```sh
cd /Users/baihe/Documents/advx26
rg -n 'Axion|Narrativ|Luminar|images\.higgs\.ai|d8j0ntlcm91z4\.cloudfront\.net|London|Certified Partner' ui-advx
```

预期：无匹配。

---

## 16. Playwright 验收矩阵

使用真实浏览器打开：

```text
http://localhost:5174/
```

至少截图：

| Viewport | 用途 |
|---|---|
| `1440×1000` | 标准桌面 Hero + 下方 section 起始 |
| `1920×1080` | 宽屏最大宽度和标题节奏 |
| `1024×768` | 平板/窄桌面 |
| `390×844` | 移动首屏和 bottom sheet |
| `375×667` | 小屏高度压力测试 |

### 16.1 必测交互

- Hero `开始建队` 进入 `/studio`；
- Logo 回 `/`；
- anchor 平滑滚到 Section 2/3；
- 社区入口进入 `/forum` 且现有 SSO 仍工作；
- 桌面 CTA text roll 和 arrow rotation；
- 键盘 Tab 能看到 focus；
- 移动 Menu 打开/关闭；
- Escape、backdrop、导航链接都能关闭 sheet；
- sheet 打开时背景不滚动；
- resize 后菜单状态不导致页面锁死；
- reduced-motion 模式下无持续动画；
- Shader 失败/禁用时文字和背景仍正常。

### 16.2 必测回归

```text
/studio
/members/new
/test-run
/versions
/activity
/forum
/me
```

Landing 的浅色 CSS 不得污染这些深色产品页。特别检查：

- `.btn-primary` 未被全局改成 Landing 样式；
- `.container` 未被全局从 1120px 改成 1440px；
- `body` 没有残留浅色 class；
- TopNav 仍按原有深色设计显示；
- Forum iframe 高度没有被 Landing CSS 影响。

### 16.3 Console 与网络

- 0 个新增 page errors；
- 0 个 React key/hydration warning；
- 0 个 Shader 编译错误；
- 不请求 Axion 参考图/视频；
- 不发送 Shaders telemetry；
- 不因 `pixi.js` peer 缺失报错；
- 无水平 overflow。

截图与临时浏览器产物放：

```text
/Users/baihe/Documents/advx26/output/playwright/
```

不要新建顶层 screenshots 目录，不默认提交临时验收图。

---

## 17. Definition of Done

以下全部满足才可声称完成：

1. `/` 展示 TeenX Landing，不再跳转。
2. 三段内容与本交接一致，文案全部是 TeenX 自有叙事。
3. Hero 有可用 Shader 背景或用户提供的最终背景，并具备 CSS fallback。
4. 背景与内容解耦，后续替换无需重写页面。
5. Landing 浅色视觉只在 `.landing-page` 生效。
6. 没有 Tailwind，没有新颜色字面量，没有 TS/TSX hex。
7. React 保持 19，现有路由与 API 不受影响。
8. Shader telemetry 显式关闭。
9. CTA、anchor、移动菜单、键盘和 reduced motion 都可用。
10. 桌面、平板、移动端无横向滚动或内容遮挡。
11. `/studio`、`/forum`、`/me` 等深色页面视觉无回归。
12. `typecheck` 与 `build` 通过。
13. 不使用 Axion 的远程媒体、文案、认证或案例。
14. 最终报告列出实际文件、验证命令和真实限制。

---

## 18. 新线程第一动作

1. 执行 `git status --short`，确认 `docs/07`、`docs/08` 和用户可能新增的背景资产。
2. 检查 `ui-advx/public/landing/` 与 `ui-advx/src/assets/` 是否已有用户背景。
3. 读取 P01、tokens、app.css、main.tsx 和 package.json。
4. 启动 Vite，保存当前 `/` 自动跳 `/studio` 的基线。
5. 实现 Landing 无 Shader 版本并确认响应式排版。
6. 安装并接入 `shaders` / `pixi.js` / `lucide-react`。
7. 加 Shader、降级、reduced motion 和 telemetry 关闭。
8. 用 Playwright 完成视觉与交互回归。

本轮最重要的判断标准：**学习参考稿的克制、节奏和背景质感，但让用户第一眼认出的必须是 TeenX 的“少年成为 AI 队长”，而不是 Axion 模板换了一套文案。**
