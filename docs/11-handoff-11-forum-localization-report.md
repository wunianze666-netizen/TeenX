# 交接说明 #11 · TeenX Forum 深色视觉与简体中文完成报告

> 本文记录 2026-07-25 本轮实际完成的 TeenX Forum 工作、当前运行状态、验证结果和后续边界。它是一份完成情况交接，不是待实施方案。

---

## 0. 当前结论

本轮论坛工作已完成到可验收状态，主要结果如下：

1. TeenX Forum 的核心用户页面已统一到七色深色视觉系统。
2. 论坛默认语言已切换为简体中文 `zh_CN`。
3. `主题 / 发言 / 分区 / 私信` 等 TeenX 术语已覆盖核心用户路径。
4. 系统欢迎主题、社区公约、管理指南、系统分区和聊天频道已完成中文化。
5. TeenX 插件徽章与私信安全错误已完成中英文资源化。
6. 搜索和移动端发帖按钮的无障碍名称问题已修复。
7. 儿童安全配置漂移已恢复，关键约束再次验证通过。
8. 桌面端、移动端、发帖、搜索、主题、私信、活动页和聊天均已通过真实浏览器回归。

当前没有必须继续开发的论坛功能。剩余事项只有可选的 Git 整理、提交，以及初始化 Discourse 测试数据库后补跑目标 RSpec。

---

## 1. 仓库与范围

| 系统 | 路径 | 分支 | 本轮用途 |
|---|---|---|---|
| Studio 主仓库 | `/Users/baihe/Documents/advx26/` | `advx/main` | 论坛 iframe、SSO 入口、浏览器截图和本交接文档 |
| TeenX Forum | `/Users/baihe/Documents/teenx-forum/` | `teenx/main` | Discourse 主题、中文化、插件和安全配置 |

本轮没有重写 Studio 登录模型、Discourse Connect、论坛信息架构或 Ember 页面。

本轮没有开启成员内容自动翻译，也没有修改既有成员主题的标题和正文。

本轮没有创建 Git commit、remote 或 push。

---

## 2. 已完成工作

### 2.1 七色深色视觉完善

论坛主题继续使用 Discourse 原生 DOM，并通过本地主题统一视觉：

- 黑色背景、深黑表面、白色正文、克制灰色边界。
- 橙色主操作和当前状态。
- 蓝色链接、信息状态与分区标记。
- 统一主题列表、侧边栏、顶部导航、搜索、Composer、帖子正文、菜单、用户页、私信和聊天的颜色语义。
- 消除核心用户页面中的突兀白底和默认浅色组件。
- 保持桌面端和移动端的信息密度，不改写 Discourse 页面结构。
- `script/teenx_phase_f_theme.rb` 保持为主题同步入口。

主题颜色继续遵守七色约束。最终检查只发现以下七个十六进制颜色，且全部位于 `teenx-theme/stylesheets/common.scss` 的令牌定义区：

```text
#000000
#0a0a0a
#ffffff
#737373
#242424
#f48529
#54a2ff
```

### 2.2 简体中文同步脚本

新增：

```text
/Users/baihe/Documents/teenx-forum/script/teenx_phase_i_localization.rb
```

脚本负责：

- 将 `SiteSetting.default_locale` 设置为 `zh_CN`。
- 保留 `SiteSetting.allow_user_locale = true`，允许用户自行选择语言。
- 管理 `238` 个 TeenX 核心中文覆盖。
- 不直接修改 Discourse 生成的 `config/locales/*zh_CN.yml`。
- 不启用成员内容自动翻译。
- 安全刷新仍由系统账号维护的欢迎主题、社区公约和管理指南。
- 保留管理员已经人工修改过的系统主题。
- 修复核心分类同步后可能出现的空 slug。
- 本地化已知系统聊天频道。

最终重复执行结果：

```text
Default locale: zh_CN (changed=false)
User locale selection: true
Translation overrides: 238 managed, 0 changed
Seeded content synchronized: false
TeenX category topics updated: 0
Core category slugs restored: 0
Chat channels updated: 0
Admin guide: unchanged
```

这证明脚本当前是幂等的。

### 2.3 TeenX 术语统一

| Discourse 概念 | TeenX 中文 |
|---|---|
| Topic | 主题 |
| Post | 发言 |
| Category | 分区 |
| Personal message / DM | 私信 |
| AI authored | AI 队员参与 |
| AI reviewed | AI 辅助检查 |

已完成术语统一的核心界面包括：

- 论坛首页和侧边栏。
- 最新、新主题、热门讨论和全部分区。
- 分区列表、分区筛选和新建分区。
- 主题详情、推荐主题和主题操作。
- 搜索首页、高级筛选和搜索结果。
- 发帖 Composer 和私信 Composer。
- 用户活动、通知入口和私信空状态。
- 聊天频道、聊天空状态和私信聊天入口。
- 移动端主题列表、导航菜单和发帖入口。

### 2.4 系统内容与系统数据中文化

以下系统主题已更新为 TeenX 自有中文文案：

```text
欢迎来到 TeenX：让想法组队出发
TeenX 社区公约
TeenX 管理指南：快速开始
```

欢迎主题包含：

- TeenX 的定位和语气。
- 如何从主题广场开始。
- 如何分享过程、给出具体反馈。
- 个人信息保护提醒。
- 到“站务反馈”和管理员入口寻求帮助的链接。

系统分区当前为：

| 名称 | slug |
|---|---|
| 未分类 | `uncategorized` |
| 站务反馈 | `site-feedback` |
| 管理协作 | `staff` |
| 交流广场 | `general` |

TeenX 原有五个分区及 slug 保持不变：

```text
作品分享 / showcase
经验交流 / experience
提问求助 / help
官方公告 / announcements
水区 / off-topic
```

系统聊天频道已更新为：

```text
交流广场
管理协作
```

本轮修复了一个实际数据问题：分类种子同步会暂时清空核心分类 slug，导致欢迎主题中的“站务反馈”被生成成空锚点。现在脚本会先恢复稳定 slug，再生成系统主题；浏览器已确认链接为：

```text
/c/site-feedback/2
```

### 2.5 插件中文资源

`teenx-ai-post-marker` 已补齐：

```text
plugins/teenx-ai-post-marker/config/locales/client.zh_CN.yml
plugins/teenx-ai-post-marker/config/locales/server.en.yml
plugins/teenx-ai-post-marker/config/locales/server.zh_CN.yml
```

浏览器中的徽章当前显示：

```text
AI 队员参与
AI 辅助检查
```

`teenx-pm-safety` 已补齐：

```text
plugins/teenx-pm-safety/config/locales/client.zh_CN.yml
plugins/teenx-pm-safety/config/locales/server.en.yml
plugins/teenx-pm-safety/config/locales/server.zh_CN.yml
```

私信安全错误当前为：

```text
为了保护隐私，私信中不能发送邮箱地址。
为了保护隐私，私信中不能发送电话号码。
为了保护隐私，私信中暂时不能发送站外链接。
```

### 2.6 私信安全校验整理

`plugins/teenx-pm-safety/plugin.rb` 中原有的匿名校验类已整理为：

```text
TeenxPmSafety::Validator
```

校验行为未放宽：

- 普通成员私信中的邮箱地址会被阻止。
- 普通成员私信中的中国大陆手机号会被阻止。
- 普通成员私信中的 `http://` 或 `https://` 外链会被阻止。
- 工作人员继续保留豁免。
- 公开主题和公开回复不受私信限制。

新增目标测试：

```text
plugins/teenx-pm-safety/spec/teenx_pm_safety_validator_spec.rb
```

### 2.7 无障碍修复

完成两处最小 Ember 修复，没有改变 DOM 结构：

1. `search-advanced-options.gjs`

搜索高级筛选按钮原先把已经翻译的中文再次当作 I18n key，读屏名称会变成 `[zh_CN.高级筛选器]`。现在按钮名称正确为“高级筛选器”。

2. `topic-drafts-dropdown.gjs`

移动端发帖按钮隐藏文字后原先没有可访问名称。现在图标按钮的 `aria-label` 正确为“发布主题”。

同时补齐了主题发布者和最近参与者的读屏文案，避免出现“最新海报”这种错误直译。

### 2.8 Smoke 测试内容中文化

`script/teenx-smoke.sh` 新创建的主题、正文和回复已改为中文。

最终 smoke 实际创建了一个本地测试主题：

```text
我的 AI 队伍做出了待办清单 (1784966986)
```

该主题是本地验证数据，不是产品预置内容。

### 2.9 文档更新

`AI-AGENTS.md` 和对应的 `AGENTS.md` 内容已包含：

- Phase I 中文同步命令。
- TeenX 中文术语表。
- 插件语言资源归属规则。
- 不自动翻译成员内容的边界。
- 主题同步和七色视觉约束。
- 当前有效的 SSO 路径说明。

---

## 3. 关键文件

| 文件 | 作用 |
|---|---|
| `teenx-forum/script/teenx_phase_i_localization.rb` | 中文默认值、238 个覆盖、系统内容、slug 和频道同步 |
| `teenx-forum/teenx-theme/stylesheets/common.scss` | 七色深色论坛视觉 |
| `teenx-forum/teenx-theme/about.json` | TeenX Dark 主题与配色声明 |
| `teenx-forum/script/teenx_phase_f_theme.rb` | 主题和 ColorScheme 幂等同步 |
| `teenx-forum/plugins/teenx-ai-post-marker/config/locales/` | AI 徽章中英文资源 |
| `teenx-forum/plugins/teenx-pm-safety/plugin.rb` | 私信安全校验和 I18n 错误 |
| `teenx-forum/plugins/teenx-pm-safety/config/locales/` | 私信安全中英文资源 |
| `teenx-forum/plugins/teenx-pm-safety/spec/teenx_pm_safety_validator_spec.rb` | 私信安全目标测试 |
| `teenx-forum/frontend/discourse/app/components/search-advanced-options.gjs` | 搜索按钮读屏名称修复 |
| `teenx-forum/frontend/discourse/app/components/topic-drafts-dropdown.gjs` | 移动端发帖按钮读屏名称修复 |
| `teenx-forum/script/teenx-smoke.sh` | 中文端到端 smoke 数据 |
| `teenx-forum/AI-AGENTS.md` | 当前 Forum 工程约束和运行说明 |

---

## 4. 当前运行状态

本交接完成时三个服务均在线：

| 服务 | 地址 | 结果 |
|---|---|---|
| Studio API | `http://localhost:3100/api/health` | `200` |
| Discourse 状态 | `http://127.0.0.1:3000/srv/status` | `200` |
| Discourse 根路径 | `http://127.0.0.1:3000/` | `302`，符合登录和嵌入流程预期 |
| Studio Forum | `http://localhost:5174/forum` | `200` |

当前论坛语言状态：

```text
default_locale = zh_CN
allow_user_locale = true
managed TranslationOverride = 238
```

当前关键儿童安全状态：

```text
must_approve_users = true
invite_only = true
allow_anonymous_mode = false
hide_user_profiles_from_public = true
allow_profile_backgrounds = false
enable_names = false
login_required = true
max_topics_per_day = 5
max_personal_messages_per_day = 20
authorized_extensions = .jpg,.jpeg,.png,.gif,.webp
```

验证阶段发现开发数据库中的 `must_approve_users` 和 `invite_only` 曾漂移为 `false`。本轮已执行权威脚本：

```sh
bundle exec rails runner script/teenx_phase_b_safety.rb
```

两项均已恢复为 `true`，并在 smoke 和独立 Rails runner 中再次确认。

---

## 5. 验证结果

### 5.1 自动与静态检查

| 检查 | 结果 |
|---|---|
| `script/teenx_phase_i_localization.rb` 重复执行 | 通过，238 managed / 0 changed |
| TeenX smoke | 通过，7 passed / 0 failed |
| Ruby 语法 | 通过 |
| RuboCop | 通过，4 files / 0 offenses |
| ESLint 目标 GJS | 通过 |
| Prettier 目标 GJS/YAML | 通过 |
| Stylelint `common.scss` | 通过 |
| `bash -n script/teenx-smoke.sh` | 通过 |
| `git diff --check` | 通过 |
| 七色十六进制门禁 | 通过，仅 7 个允许值 |

Smoke 覆盖结果：

```text
enable_discourse_connect = true
API 发主题成功
ai_authored 字段存在
ai_reviewed = passed
回复不带 ai_authored
回复带 ai_reviewed = passed
invite_only = true
五个 TeenX 分区全部存在
```

### 5.2 私信安全验证

Development Rails runner 已验证：

| 场景 | 结果 |
|---|---|
| 私信包含邮箱 | 中文错误，阻止 |
| 私信包含手机号 | 中文错误，阻止 |
| 私信包含站外链接 | 中文错误，阻止 |
| 工作人员发送相同内容 | 允许 |
| 公开发言包含链接 | 允许 |

### 5.3 浏览器验证

真实 Chromium 已覆盖：

- `/latest`
- `/categories`
- `/search?expanded=true`
- 实际关键词搜索 `TeenX`
- 系统欢迎主题
- 带 AI 标记的主题和回复
- 发帖 Composer
- 新私信 Composer
- 用户菜单
- “更多”菜单
- 用户活动页
- 私信页
- 聊天频道
- 移动端搜索
- 移动端导航菜单
- 移动端发帖 Composer
- 移动端主题详情

验证视口：

```text
1440 x 900
390 x 844
```

两个视口下 Studio 父页面和 Forum iframe 的横向溢出均为 `0`。

### 5.4 截图证据

最终截图位于：

```text
/Users/baihe/Documents/advx26/output/playwright/forum-cn-after-desktop.png
/Users/baihe/Documents/advx26/output/playwright/forum-cn-after-mobile.png
/Users/baihe/Documents/advx26/output/playwright/forum-cn-mobile-composer.png
/Users/baihe/Documents/advx26/output/playwright/forum-cn-mobile-topic.png
```

基线截图位于：

```text
/Users/baihe/Documents/advx26/output/playwright/forum-cn-before-desktop.png
```

---

## 6. 已知限制与非问题

### 6.1 既有英文主题仍会显示英文

列表中的以下内容属于此前 smoke 或成员创建的正文，不是界面语言回退：

```text
Welcome to TeenX - build your AI team here
My AI team built a todo app ...
My team scout found interesting resources
```

本轮明确不自动翻译、覆盖或重写成员内容。新的 smoke 已改为中文，因此后续测试数据不会继续增加英文主题。

### 6.2 目标 RSpec 被测试数据库阻断

以下命令已经执行：

```sh
LOAD_PLUGINS=1 bin/rspec plugins/teenx-pm-safety/spec/teenx_pm_safety_validator_spec.rb
```

结果不是测试断言失败，而是测试数据库尚未初始化：

```text
There are pending migrations, run RAILS_ENV=test bin/rake db:migrate
You have 1721 pending migrations
0 examples, 0 failures, 1 error occurred outside of examples
```

本轮没有为了一个插件目标测试执行 1721 个全量迁移。相同行为已通过 development Rails runner 验证。

如果下一位需要正式 RSpec 结果，应先准备独立测试数据库，再执行目标 spec；不要把 development 数据库当作测试库迁移。

### 6.3 开发工具条不是产品 UI

本地 Discourse 会注入 Mini Profiler 和开发者工具条。最终截图在拍摄前移除了这些开发伪影；产品主题本身没有对应元素。

### 6.4 Phase B 的旧设置名

当前 Discourse 已移除部分旧版 SiteSetting 名称，Phase B 执行时会对这些项目输出 `SKIP ... setting does not exist`。当前实际存在的硬约束已经逐项读取并验证，私信内容限制由 `teenx-pm-safety` 插件继续执行。

---

## 7. Git 与并行工作边界

两个仓库都存在未提交的多阶段或并行改动。不要使用 `git reset --hard`、`git checkout --` 或批量清理未跟踪文件。

Forum 仓库中与本轮直接相关的重点文件是第 3 节列出的主题、中文化、插件、目标 GJS、smoke 和文档文件。

以下 Forum 文件包含前序 SSO 或其他阶段改动，不应因为整理本轮提交而回滚：

```text
config/site_settings.yml
lib/action_dispatch/session/discourse_cookie_store.rb
```

Studio 仓库当前同时有 Arena、Landing、Profile 和其他并行改动。本轮没有回滚或整理这些文件。

本交接新增文件为：

```text
docs/11-handoff-11-forum-localization-report.md
```

当前没有创建 commit。

---

## 8. 下一位接手者怎么做

如果目标只是继续产品开发，Forum 中文化与视觉工作无需再补实现，可以直接以当前状态为基线。

如果目标是准备提交：

1. 分别在 `advx26` 和 `teenx-forum` 检查 `git status`、`git diff` 和未跟踪文件。
2. 只暂存与对应阶段相关的文件，不要把并行 Arena、Landing、Profile 或 SSO 改动混入同一个提交。
3. 不要删除本地主题、插件 locale、Phase I 脚本或本交接。
4. 提交前重新执行第 9 节的最小验证命令。

如果目标是补齐测试数据库：

1. 创建或确认独立的 Discourse test 数据库。
2. 执行 test 环境迁移。
3. 仅重跑 `teenx_pm_safety_validator_spec.rb`。
4. 不要修改已经通过 development runner 验证的安全逻辑来规避数据库问题。

---

## 9. 常用命令

Forum 使用 Ruby 3.4：

```sh
export PATH="/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/ruby@3.4/bin:$PATH"
```

同步中文：

```sh
cd /Users/baihe/Documents/teenx-forum
bin/rails runner script/teenx_phase_i_localization.rb
```

同步主题：

```sh
bin/rails runner script/teenx_phase_f_theme.rb
```

恢复儿童安全基线：

```sh
bin/rails runner script/teenx_phase_b_safety.rb
```

运行 TeenX smoke：

```sh
bash script/teenx-smoke.sh
```

目标静态检查：

```sh
bundle exec rubocop \
  script/teenx_phase_i_localization.rb \
  plugins/teenx-pm-safety/plugin.rb \
  plugins/teenx-pm-safety/spec/teenx_pm_safety_validator_spec.rb \
  script/teenx_phase_f_theme.rb

pnpm eslint \
  frontend/discourse/app/components/search-advanced-options.gjs \
  frontend/discourse/app/components/topic-drafts-dropdown.gjs \
  --max-warnings 0

pnpm stylelint teenx-theme/stylesheets/common.scss
bash -n script/teenx-smoke.sh
git diff --check
```

服务健康：

```sh
curl http://localhost:3100/api/health
curl http://127.0.0.1:3000/srv/status
curl -I http://localhost:5174/forum
```

---

## 10. 最终完成度

| 项目 | 状态 |
|---|---|
| 七色深色视觉 | 已完成 |
| 桌面响应式 | 已完成 |
| 移动响应式 | 已完成 |
| 简体中文默认语言 | 已完成 |
| TeenX 核心术语 | 已完成 |
| 系统主题与分区中文化 | 已完成 |
| 聊天频道中文化 | 已完成 |
| AI 徽章中文化 | 已完成 |
| 私信安全中文错误 | 已完成 |
| 搜索与发帖无障碍名称 | 已完成 |
| 儿童安全关键配置 | 已恢复并验证 |
| Smoke | 7 passed / 0 failed |
| 真实浏览器回归 | 已完成 |
| Git commit | 未创建 |
| 目标 RSpec | 代码已写，受测试库 1721 个待迁移阻断 |

结论：本轮功能与体验目标已完成。后续可以进入提交整理或下一项产品工作，无需继续补论坛中文化功能。
