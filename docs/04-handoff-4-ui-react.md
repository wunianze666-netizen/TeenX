# 交接提示词 #4 · TeenX UI 框架落地为 React + TS

> 本文件是开新线程做 UI 美化与框架落地的交接提示词。读取后，把 Open Design 回传的 25 页 HTML/CSS/JS 原型迁移为真实可运行的 React + TypeScript 工程，保持现有视觉、布局、交互和素材完全一致。

---

## 0. 前置与上下文

### 0.1 你的任务
把一套已经由 Open Design 产出的 25 页功能原型（纯 HTML/CSS/JS），迁移为 **React + TypeScript** 工程，保持视觉、布局、交互、mock 数据完全一致。这是"框架落地 + UI 美化"任务，不是重新设计。

### 0.2 源文件位置
Open Design 原型位于：
```
/Users/baihe/Library/Application Support/Open Design/namespaces/release-stable/data/projects/046dbe48-c77a-47df-ac9f-62a1f8b63c95
```
内含 25 个 `pXX-*.html` 页面 + `css/tokens.css` + `css/app.css` + `js/app.js` + `js/mock.js`。**开工前必须逐个读取这些文件**，理解设计系统、页面结构、交互逻辑和 mock 数据格式。

### 0.3 目标工程位置
```
/Users/baihe/Documents/teenx-ui/
```
新建 React + TS 工程，把原型迁移进去。

### 0.4 技术栈（固定，不讨论）
- React 18 + TypeScript
- Vite 构建
- React Router（页面路由）
- CSS：把 `tokens.css` + `app.css` 原样迁移为 CSS 文件，用 CSS 变量，**不引入** Tailwind / styled-components / CSS-in-JS
- 状态：用 React Context + useState 管理 mock 数据（对应原型的 localStorage 持久化）
- 不引入 UI 组件库（Ant Design / MUI 等一律不用）

---

## 1. 设计系统（必须原样迁移，不可改动）

这套原型有一套自洽的设计系统，**核心是 tokens.css 里的设计令牌**，必须 1:1 迁移。

### 1.1 颜色令牌（七色，不允许新增 hex）
```css
--bg:      #000000;   /* 背景 */
--surface: #0a0a0a;   /* 表面/卡片 */
--fg:      #ffffff;   /* 前景/文字 */
--muted:   #737373;   /* 弱化文字 */
--border:  #242424;   /* 描边 */
--accent:  #f48529;   /* 主 accent（橙）*/
--accent-2:#54a2ff;   /* 次 accent（蓝）*/
```
派生色用 `color-mix(in oklch, ...)`，已在 tokens.css 里定义，原样迁移。

> **硬约束**：整个工程里只允许这 7 个 hex 出现（在 tokens.css 里），其余一律用 `var(--xx)` 或 `color-mix` 派生。禁止在组件里写任何 hex 字面量。这是 AdventureX 设计令牌的硬规则。

### 1.2 字体令牌
```css
--font-display: 'Patika', system-ui, ...;
--font-body:    'Patika', system-ui, ...;
--font-mono:    ui-monospace, 'JetBrains Mono', ...;
```
字号层级：`--fs-h1`（clamp 40-64px）/ `--fs-h2`（clamp 28-40px）/ `--fs-h3`(20px) / `--fs-lead`(17px) / `--fs-body`(15px) / `--fs-meta`(13px)。

### 1.3 间距令牌
`--gap-xs`(8) / `--gap-sm`(12) / `--gap-md`(20) / `--gap-lg`(32) / `--gap-xl`(48) / `--container`(1120) / `--gutter`(32) / `--radius`(8)。

### 1.4 组件类（app.css，原样迁移）
原型在 `app.css` 里定义了一套完整的组件类，**全部原样迁移到 React 工程的 CSS 文件里**，不要改成 Tailwind 或 CSS-in-JS。关键类：

| 类 | 用途 |
|---|---|
| `.container` / `.section` / `.stack` / `.row` / `.row-between` | 布局原语 |
| `.grid-2` / `.grid-3` / `.grid-4` / `.grid-2-1` / `.grid-1-2` | 网格 |
| `.h1/.h2/.h3` / `.lead` / `.eyebrow` / `.meta` / `.num` | 字体层级 |
| `.topnav` / `.topnav-inner` / `.logo` / `.nav-user` | 全局导航 |
| `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-blue` / `.btn-sm` | 按钮 |
| `.card` / `.card-hover` / `.card-link` | 卡片 |
| `.pill` / `.pill-blue` / `.pill-dim` / `.tag` / `.tag-x` | 徽标标签 |
| `.field` / `.input` / `.textarea` / `.select` / `.switch` | 表单 |
| `.ds-table` | 表格 |
| `.log-row` | 列表行 |
| `.seg` / `.catbar` | 分段筛选条/分类条 |
| `.modal-mask` / `.modal` | 弹窗 |
| `.notice` / `.toast-wrap` / `.toast` | 公告/提示 |
| `.bubble` / `.bubble-me` / `.bubble-them` | 聊天气泡 |
| `.tl-item` / `.tl-detail` | 时间流 |
| `.avatar` / `.avatar.sm/.lg/.me` / `.score-big` / `.ph-block` / `.empty` / `.progress-track` / `.step-dots` / `.rank-top` | 骨架小件 |
| `.muted` / `.small` / `.mt-0` / `.mb-0` / `.clickable` / `.truncate` / `.checkbox-row` | 工具类 |

---

## 2. 共享运行时（app.js → React 层）

原型的 `app.js` 提供了全局共享功能，迁移为 React 组件/Hook：

### 2.1 全局导航 `<TopNav>`
原 `renderNav(active)` → 迁移为 `<TopNav active="studio" />` 组件：
- 5 个导航项：Studio / 赛题 / 排行榜 / 论坛 / 我的
- logo：`Teen<em>X</em>`（X 是橙色）
- 右侧用户信息：`队长 · {nickname}` + "本地演示"
- 当前页高亮（橙色下划线）
- 落地页(P01)、登录(P02)、引导(P03) 不显示导航

### 2.2 页脚 `<PageFoot />`
固定内容：`© 2026 TeenX · 给孩子一支 AI 队伍` + 右侧 `功能原型 · 全部数据为本地 mock`

### 2.3 Toast `useToast()`
原 `toast(msg)` → 迁移为 Context + Hook，调用方式 `const { toast } = useToast(); toast('已保存')`。样式用 `.toast-wrap` / `.toast` 类。

### 2.4 确认弹窗 `<ConfirmModal />` / `useConfirm()`
原 `confirmModal({title, body, input, okText, onOk, danger})` → 迁移为可命令式调用的组件/Hook。支持：
- 标题/正文
- 可选输入框（input + placeholder + value）
- 确认/取消按钮
- danger 样式（用 btn-secondary）
- 点遮罩关闭

### 2.5 分段筛选条 `<Seg />` 和分类条 `<CatBar />`
封装为受控组件：
```tsx
<Seg options={[{v:'all',label:'全部'},...]} value={v} onChange={setV} />
<CatBar options={[...]} value={v} onChange={setV} />
```

### 2.6 Mock 数据层 `useMock()`
原 `mock.js` 的 localStorage 持久化 → 迁移为 Context + Hook：
- `useMock()` 返回 `{ DB, updateDB, resetDB }`
- `DB` 结构与原型完全一致：user / members / memberSeq / tools / runTasks / versions / activities / contests / myContests / boardUsers / boardAgents / posts / replies / messages
- `updateDB(mutator)` 接收一个对 DB 的修改函数，执行后写回 localStorage 并触发组件更新
- `resetDB()` 清空 localStorage 并重置为种子数据

> **seed 数据必须从原型 `mock.js` 原样搬过来**，包括所有 mock 队员、工具、版本、活动、赛题、榜单、帖子、私信。不要自己重新编数据。

---

## 3. 页面迁移清单（25 页 → 25 路由）

路由结构（React Router）：

```
/                    → P01 落地页（无导航）
/login               → P02 登录（无导航）
/onboarding          → P03 首次建队引导（无导航）
/studio              → P04 组队室主页
/studio/member/:id   → P05 队员详情/编辑
/studio/add          → P06 加队员
/studio/tools        → P07 工具库
/studio/run          → P08 试跑
/studio/run/:id      → P09 试跑结果
/studio/versions     → P10 版本历史
/studio/activity     → P11 活动记录
/contests            → P12 赛题列表
/contests/:id        → P13 赛题详情/参战
/contests/:id/result → P14 赛题成绩
/board/users         → P15 用户总积分榜
/board/agents        → P16 Agent 赛题效果榜
/forum               → P17 论坛首页
/forum/:cat          → P18 分类页
/forum/post/:id      → P19 帖子详情
/forum/compose       → P20 发帖（写帖 Agent）
/messages            → P21 私信列表
/messages/:id        → P22 私信对话
/user/:nick          → P23 用户主页
/me                  → P24 个人中心
/me/settings         → P25 设置
```

### 3.1 迁移规则（每页都要遵守）
1. **HTML 结构 → JSX**：原 `pXX-*.html` 的 `<main>` 内容迁移为页面组件的 return
2. **CSS 类名不变**：`class="card"` → `className="card"`，所有类名原样保留
3. **内联 style 迁移**：原型的内联 `style="..."` 迁移为 JSX 的 `style={{...}}`，值保持一致
4. **交互逻辑 → React**：原型 `<script>` 里的 DOM 操作迁移为 useState + 事件处理
5. **mock 数据读取**：原 `DB.xxx` → `const { DB } = useMock()`
6. **mock 数据修改**：原 `DB.xxx = v; DB.__save()` → `updateDB(db => { db.xxx = v })`
7. **页面跳转**：原 `<a href="p04-studio.html">` → `<Link to="/studio">`
8. **query 参数**：原 `qs('id')` → `useParams()` 或 `useSearchParams()`
9. **导航栏**：原型 `data-page="studio"` + `renderNav('studio')` → 页面组件里渲染 `<TopNav active="studio" />`（P01/P02/P03 不渲染）
10. **页脚**：每页底部渲染 `<PageFoot />`

### 3.2 各页面交互逻辑要点（从原型 script 里提取）

| 页面 | 关键交互 |
|---|---|
| P01 落地页 | 纯静态，两个 CTA 按钮跳转 |
| P02 登录 | 表单提交后跳 /studio 或 /onboarding |
| P03 引导 | 4 步表单（起名→描述→选模板→确认），step-dots 进度，完成后写 DB 跳 /studio |
| P04 组队室 | 渲染队伍信息卡 + 队员网格；编辑队名/简介用 ConfirmModal；封存版本用 ConfirmModal 带输入框 |
| P05 队员详情 | 读 `?id=`；编辑各字段；工具多选（跳 P07 选器模式或弹窗）；删除队员（ConfirmModal，≤1 人禁删） |
| P06 加队员 | 模板卡片网格；选中后弹起名框；8 人上限 |
| P07 工具库 | 筛选（seg）+ 搜索；选器模式下带勾选 + 确认回传 |
| P08 试跑 | 3 个任务卡片；点击后确认 → 跳 P09 |
| P09 试跑结果 | 活动时间流（可展开详情）+ 产物展示；封存版本/再跑/返回 |
| P10 版本 | 列表展开快照；设为当前（ConfirmModal）；fork（toast 提示跳 /studio?forked=1） |
| P11 活动记录 | 按队员筛选 + 按类型筛选；分页 |
| P12 赛题列表 | 状态筛选（seg）；公告条 |
| P13 赛题详情 | 参战 ConfirmModal（封存提示）；执行进度 mock |
| P14 成绩 | 大字得分 + 分项 + 诊断 + 产物回看 + fork 按钮 |
| P15 用户榜 | 15 行表格；我的排名置顶；赛季/历史筛选 |
| P16 Agent 榜 | 15 行；按赛题筛选；展开历次成绩 |
| P17 论坛首页 | 分类条 + 帖子流；AI 协助撰写/AI 已审 标记 |
| P18 分类页 | 三种排序（seg） |
| P19 帖子详情 | 正文 + 互动（赞/收藏/举报）+ 回复列表 + 回复输入 + 发私信/看主页 |
| P20 发帖 | 分类选 + 意图输入 + 关联项目选；点"让 Agent 写帖"→ mock 生成 → 可编辑 → 发布 |
| P21 私信列表 | 对话列表 + 未读标记 |
| P22 私信对话 | 气泡流；输入框含外链/邮箱/手机号正则拦截（禁用发送按钮 + 提示） |
| P23 用户主页 | 用户信息 + TA 的帖子 + TA 的成绩 + 关注/私信按钮 |
| P24 个人中心 | 队伍摘要 + 赛题记录 + 论坛活动 + 私信入口 |
| P25 设置 | 账号/隐私/通知/偏好 四组开关（switch 组件） |

### 3.3 P22 私信违禁词拦截（重要交互）
原型在 P22 实现了私信内容拦截，必须迁移：
- 检测外部链接（`http://` / `https://`）
- 检测邮箱（正则）
- 检测手机号（11 位数字正则）
- 命中时：发送按钮置灰 + 输入框下方显示红色提示
- 未命中时：正常发送，消息追加到气泡流

---

## 4. 工程结构

```
teenx-ui/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.tsx                    # 入口
│   ├── App.tsx                     # 路由表
│   ├── styles/
│   │   ├── tokens.css              # 原样迁移自原型 css/tokens.css
│   │   └── app.css                 # 原样迁移自原型 css/app.css
│   ├── context/
│   │   ├── MockContext.tsx         # mock 数据 Provider + useMock Hook
│   │   ├── ToastContext.tsx        # toast Provider + useToast Hook
│   │   └── ConfirmContext.tsx      # 确认弹窗 Provider + useConfirm Hook
│   ├── data/
│   │   └── seed.ts                 # 从原型 mock.js 搬过来的种子数据
│   ├── components/                 # 共享组件
│   │   ├── TopNav.tsx
│   │   ├── PageFoot.tsx
│   │   ├── ConfirmModal.tsx
│   │   ├── Seg.tsx
│   │   ├── CatBar.tsx
│   │   └── ...（按需拆分）
│   ├── pages/                      # 25 个页面组件
│   │   ├── P01Landing.tsx
│   │   ├── P02Login.tsx
│   │   ├── P03Onboarding.tsx
│   │   ├── P04Studio.tsx
│   │   ├── P05Member.tsx
│   │   ├── P06AddMember.tsx
│   │   ├── P07Tools.tsx
│   │   ├── P08Run.tsx
│   │   ├── P09RunResult.tsx
│   │   ├── P10Versions.tsx
│   │   ├── P11Activity.tsx
│   │   ├── P12Contests.tsx
│   │   ├── P13ContestDetail.tsx
│   │   ├── P14ContestResult.tsx
│   │   ├── P15BoardUsers.tsx
│   │   ├── P16BoardAgents.tsx
│   │   ├── P17Forum.tsx
│   │   ├── P18ForumCat.tsx
│   │   ├── P19Post.tsx
│   │   ├── P20Compose.tsx
│   │   ├── P21Messages.tsx
│   │   ├── P22MessageThread.tsx
│   │   ├── P23User.tsx
│   │   ├── P24Me.tsx
│   │   └── P25Settings.tsx
│   └── types/
│       └── mock.ts                 # 从 seed 数据推导的 TS 类型
└── README.md
```

---

## 5. 执行顺序

1. **读源文件**：逐个读取原型目录下的 `index.html` / `css/tokens.css` / `css/app.css` / `js/app.js` / `js/mock.js` / 全部 25 个 `pXX-*.html`，理解设计系统和每页结构
2. **初始化工程**：`npm create vite@latest teenx-ui -- --template react-ts`，装 react-router-dom
3. **迁移样式**：把 `tokens.css` 和 `app.css` 复制到 `src/styles/`，在 `main.tsx` 引入
4. **迁移 mock 数据**：把 `mock.js` 的 seed 数据搬到 `src/data/seed.ts`，写 TS 类型，实现 `MockContext` + `useMock`
5. **实现共享组件**：TopNav / PageFoot / ConfirmModal / Toast / Seg / CatBar
6. **逐页迁移**：按 P01 → P25 顺序，每页一个组件文件，HTML→JSX + 交互→React
7. **联调路由**：所有页面跳转走通
8. **验收**：见 §6

---

## 6. 验收门

- [ ] `npm run dev` 启动无错
- [ ] 25 个路由全部可访问
- [ ] 视觉与原型 HTML 逐页对比一致（颜色/布局/间距/字号）
- [ ] 全局导航在 P04-P25 可见，P01-P03 不可见
- [ ] 落地页 → 登录 → 引导 → 组队室 流程可走通
- [ ] 组队室：编辑队名/简介、封存版本、加/删/改队员、配工具 流程可走通
- [ ] 试跑 → 试跑结果 → 封存 流程可走通
- [ ] 赛题列表 → 详情 → 参战 → 成绩 流程可走通
- [ ] 两个排行榜展示 mock 数据
- [ ] 论坛：首页 → 帖子详情 → 回复 → 私信 流程可走通
- [ ] 发帖（写帖 Agent）输入 → mock 生成 → 发布 流程可走通
- [ ] P22 私信违禁词拦截生效（外链/邮箱/手机号被拦）
- [ ] mock 数据修改后 localStorage 持久化（刷新不丢）
- [ ] "重置 mock 数据"按钮可用
- [ ] 整个工程没有任何 hex 字面量出现在 `src/pages/` 和 `src/components/`（只允许在 `tokens.css`）
- [ ] `npm run build` 成功
- [ ] `tsc --noEmit` 无类型错误

---

## 7. 约束

- **不要改设计**——这是迁移任务，视觉、布局、间距、颜色、交互必须与原型 HTML 一致
- **不要引入 UI 库**——不用 Tailwind / Ant Design / MUI / Chakra 等
- **不要引入状态管理库**——不用 Redux / Zustand / Jotai，用 Context + useState
- **不要新增 hex 颜色**——只允许 tokens.css 里的 7 个 hex，其余用 var() 或 color-mix()
- **不要改 mock 数据**——seed 数据从原型原样搬，不要自己重新编
- **不要做响应式**——桌面单尺寸，与原型一致
- **不要做动画/过渡**——除了原型 CSS 里已有的 transition（按钮、toast、modal），不新增
- **不要接真实 API**——全部用 mock 数据

---

## 8. 交接报告

完成后在 `teenx-ui/README.md` 写：
- 工程启动命令
- 25 个路由清单
- 与原型的差异说明（如有任何不一致，必须列出原因）
- 已知问题与后续建议

---

*本交接提示词要求把 Open Design 的 25 页 HTML 原型 1:1 迁移为 React + TS 工程，保持设计系统、视觉、交互、mock 数据完全一致。源文件在 Open Design 项目目录，目标工程在 /Users/baihe/Documents/teenx-ui/。*
