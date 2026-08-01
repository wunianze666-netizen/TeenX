# 交接提示词 #2 · Fork Discourse 搭建 TeenX 论坛

> 本文件是开新线程执行的第二份交接提示词。读取本文件后，按顺序执行下列阶段，每阶段完成后回报。

---

## 0. 前置与上下文

### 0.1 你的身份
你是一名高级全栈工程师，负责把开源项目 [discourse/discourse](https://github.com/discourse/discourse) Fork 并改造成 TeenX 论坛——一个面向 11–16 岁少年的、与 ADVX Studio（基于 Paperclip）深度集成的社区论坛。

### 0.2 项目背景
TeenX 是一个 AI 队伍养成平台，由两个子系统组成：
1. **ADVX Studio**（基于 Paperclip Fork，Node.js）—— 孩子在里面定义、维护自己的 AI 队伍
2. **TeenX 论坛**（基于 Discourse Fork，Ruby on Rails）—— 本轮交付，社区论坛

两个子系统**独立部署、通过 API 集成**。Studio 里用户有一个"写帖 Agent"，它会根据用户的想法 + 做过的项目自动检索并扩写成论坛帖子，然后通过 Discourse API 发布到论坛。论坛里的评论和私信也是核心功能。

### 0.3 已锁定的关键决策（不可违反）

| 决策 | 约束 |
|---|---|
| Fork Discourse，**不再跟上游** | 一次性拉取，之后独立演化 |
| 保留 Discourse 原 UI（Ember.js）| 本轮不做 UI 重写，只做品牌定制和配置 |
| 面向 11–16 岁少年 | **儿童安全是发布阻断项**，不是上线后补丁 |
| 帖子由 Studio 的写帖 Agent 通过 API 发布 | 论坛本身不实现"写帖 Agent"，它只接收外部 API 创建的帖子 |
| AI 审核先挂"会审"标牌 | 实现一个 placeholder：所有帖子显示"AI 已审"标记，实际审核逻辑后置 |
| 评论和私信 | **都要做**，私信受儿童安全约束（见 §C） |
| 协议 | Discourse 是 GPL-2.0，SaaS 部署不触发开源义务，但若分发源码须遵守 GPL |

### 0.4 工作目录
所有工作在 `/Users/baihe/Documents/teenx-forum/` 下进行（新建目录）。与 ADVX Studio 仓库（`/Users/baihe/Documents/advx26/`）独立。

### 0.5 环境要求
Discourse 要求：Ruby 3.4+ / PostgreSQL 15+ / Redis 7+。macOS 开发环境参考 [官方 macOS 安装指南](https://meta.discourse.org/t/15772)。推荐用 Docker 方式跑（见阶段 A）。

---

## 阶段 A · 拉取 Discourse 并初始化 TeenX 仓库

### A1. 创建工作目录并克隆
```bash
mkdir -p /Users/baihe/Documents/teenx-forum
cd /Users/baihe/Documents/teenx-forum
git clone https://github.com/discourse/discourse.git .
```

### A2. 初始化为 TeenX 独立仓库
```bash
git remote rename origin discourse-upstream
git remote add origin <你的 TeenX 远程仓库地址，若暂无则跳过>
git checkout -b teenx/main
```

### A3. 确认基线可跑
优先用 Docker 方式启动（最简）：
```bash
# 方式 1：Docker（推荐，零依赖）
# 参考官方文档：docs/INSTALL-DOCKER.md 或 .devcontainer

# 方式 2：本地 Ruby 环境
# 参考 macOS 安装指南：https://meta.discourse.org/t/15772
bundle install
bundle exec rake db:create db:migrate
bundle exec rails server
```
验收：`http://localhost:3000` 能打开 Discourse 首页。基线跑通后再进下一阶段。**若基线跑不通，先修环境问题，不要进 B。**

### A4. 品牌定制（TeenX）
修改以下文件做最简品牌替换：
- `app/assets/images/` 下的 logo（替换为 TeenX logo，若无现成 logo 先用占位文字 "TeenX"）
- `config/site_settings.yml` 里改 `default_site_name`、`default_title` 为 "TeenX"
- `config/locales/client.en.yml` 里把 "Discourse" 文案替换为 "TeenX"（仅前台用户可见的部分，后台管理文案可保留 Discourse 原文）

> 本轮不做深度视觉定制，只做品牌名替换。视觉优化后置。

---

## 阶段 B · 儿童安全基线配置

这是 TeenX 与普通 Discourse 的核心区别。所有配置写在 `config/site_settings.yml` 或通过 `rails c` 的 `SiteSetting` 设置。

### B1. 注册与访问控制
| 配置项 | 值 | 理由 |
|---|---|---|
| `must_approve_users` | `true` | 所有新用户需管理员审批才能发帖 |
| `invite_only` | `true`（P0 阶段） | 只能通过邀请加入，不自助注册 |
| `allow_new_registrations` | `true`（保留，但 invite_only 已挡住） | 预留未来开放注册的口子 |
| `min_username_length` | `3` | |
| `max_username_length` | `20` | |
| `full_name_required` | `false` | 不强制真名 |
| `allow_anonymous_posting` | `false` | 禁止匿名发帖 |
| `allow_anonymous` | `false` | 禁止匿名浏览需登录的内容 |

### B2. 内容安全
| 配置项 | 值 | 理由 |
|---|---|---|
| `min_post_length` | `5` | |
| `max_post_length` | `10000` | 限制超长帖 |
| `allow_uploaded_files` | `true` | 允许上传图片 |
| `authorized_extensions` | `.jpg,.jpeg,.png,.gif,.webp` | 只允许图片，禁止其他文件类型 |
| `max_image_size_kb` | `2048` | 限制图片大小 |
| `clean_up_uploads` | `true` | 自动清理孤儿上传 |
| `min_trust_level_for_user_cards` | `0` | 所有用户可看头像卡 |
| `min_trust_level_to_send_messages` | `0` | 所有用户可发私信（受其他约束） |
| `min_trust_level_for_user_profile` | `0` | |

### B3. 私信安全约束
| 配置项 | 值 | 理由 |
|---|---|---|
| `min_trust_level_to_send_messages` | `0` | 允许所有用户发私信 |
| `max_personal_messages_per_day` | `20` | 限制每日私信数量，防骚扰 |
| `allow_user_to_disable_personal_messages` | `false` | 不允许关闭私信接收（保证可被联系） |
| `enable_personal_email_messages` | `false` | 不通过邮件转发私信内容 |
| `pm_max_recipients` | `1` | 私信最多 1 个收件人（一对一） |

### B4. 防滥用
| 配置项 | 值 | 理由 |
|---|---|---|
| `rate_limits` | 启用 | 防刷帖刷评论 |
| `max_topics_in_category_per_day` | `5` | 每天每分类最多 5 个新帖 |
| `max_posts_per_topic_per_day` | `20` | |
| `flagging_enabled` | `true` | 启用举报 |
| `min_flags_for_hide_post` | `2` | 2 个举报自动隐藏帖子 |
| `alert_admins_on_flagged_posts` | `true` | 举报通知管理员 |

### B5. 隐私保护
| 配置项 | 值 | 理由 |
|---|---|---|
| `enable_user_directory` | `true` | 保留用户目录（用于找人提问学习） |
| `hide_user_profiles_from_public` | `true` | 用户资料不对未登录用户公开 |
| `allow_profile_backgrounds` | `false` | 关闭自定义背景图（防不当图片） |
| `default_avatars` | 设置一组 TeenX 默认头像 | 不使用 Gravatar（防外链泄露邮箱） |
| `enable_names` | `false` | 不显示真名 |
| `enable_location` | `false` | 关闭地理位置 |
| `enable_website` | `false` | 关闭个人网站字段 |
| `enable_card_backgrounds` | `false` | |

> **本轮不实现"监护同意层"**（后置），先用 invite_only + must_approve_users 兜住。儿童同意层在后续独立轮设计。

---

## 阶段 C · SSO 与 Studio 集成

### C1. 认证策略
TeenX 论坛与 ADVX Studio 是两个独立服务。用户**不应该登录两次**。方案：

**Studio 为主身份源，Discourse 作为从属**：
- Studio（Paperclip）作为 IdP（Identity Provider）
- Discourse 启用 SSO，信任 Studio 签发的 SSO payload
- 用户在 Studio 登录后，访问论坛时自动完成 SSO 登录

### C2. Discourse SSO 配置
Discourse 内置 SSO 支持（`discourse_sso` / `external_auth`）：

1. 在 Discourse 管理后台启用 SSO：
   - `enable_sso: true`
   - `sso_url: http://localhost:3100/api/auth/sso`（Studio 的 SSO 端点，后述）
   - `sso_secret: <生成一个强随机密钥>`

2. 在 Studio（Paperclip）侧新增 SSO 端点（**这条不在本轮实现，记录为集成依赖**）：
   - `GET /api/auth/sso` 接收 Discourse 跳转的 SSO 请求
   - 验证 `sso` 和 `sig` 参数
   - 返回签名的 SSO payload（含 `external_id`、`username`、`email`、`name`）
   - `external_id` 用 Studio 的队长 ID
   - `username` 用 Studio 的队伍名或队长名

> **本轮只配 Discourse 侧的 SSO 接收端**，Studio 侧的 SSO 签发端记为集成依赖（见 §H 交接报告）。本轮验收时用手动注入 SSO payload 的方式验证 Discourse 侧能正确接收和创建用户。

### C3. API Key 供 Studio 调用
Discourse 需要给 Studio 发一个 **All Users API Key**（管理后台 → API → 新建）：
- 权限范围：`posts:write`、`topics:write`、`users:read`、`groups:read`
- 这个 Key 给 Studio 的写帖 Agent 用，通过 Discourse API 发帖
- 本轮：创建 Key 并记录到 `.env`，不传给 Studio（Studio 侧集成后置）

### C4. 论坛分类结构预置
通过 `rails c` 或 seeds 创建以下分类：

| 分类 | 描述 | 权限 |
|---|---|---|
| `作品分享` | 分享你的 AI 队伍做了什么 | 所有用户可发帖 |
| `经验交流` | 养队伍的经验、技巧 | 所有用户可发帖 |
| `提问求助` | 向社区提问 | 所有用户可发帖 |
| `官方公告` | 官方赛题、活动公告 | 仅管理员可发帖 |
| `水区` | 自由闲聊（仍受审核） | 所有用户可发帖 |

```ruby
# db/seeds.rb 或 rails c 执行
categories = [
  { name: "作品分享", slug: "showcase", description: "分享你的 AI 队伍做了什么" },
  { name: "经验交流", slug: "experience", description: "养队伍的经验、技巧" },
  { name: "提问求助", slug: "help", description: "向社区提问" },
  { name: "官方公告", slug: "announcements", description: "官方赛题、活动公告", read_restricted: false },
  { name: "水区", slug: "off-topic", description: "自由闲聊" }
]
categories.each { |c| Category.find_or_create_by!(name: c[:name]) { |cat| cat.assign_attributes(c) } }
```

---

## 阶段 D · 写帖 Agent API 接口

### D1. 论坛接收外部发帖的 API
Discourse 原生 API 已支持创建帖子和话题：
```
POST /posts.json
  raw=<帖子正文>
  title=<帖子标题>
  category=<分类 slug 或 id>
  api_key=<API Key>
  api_username=<发帖用户的 username>
```

本轮不需要改 Discourse 的发帖 API，**原生接口即可**。需要做的是：

### D2. "AI 写帖"标记
给通过 API 由 Agent 发布的帖子加一个**可视标记**，让读者知道这是 Agent 扩写的帖子（而非孩子直接手写的）：

1. 在 `app/models/post.rb` 或通过 plugin 给 `Post` 加一个 `custom_fields['ai_authored'] = true` 标记
2. 创建一个 Discourse Plugin（见 `plugins/` 目录结构参考现有插件）：
   - 插件名：`teenx-ai-post-marker`
   - 位置：`plugins/teenx-ai-post-marker/`
   - 功能：当 `Post.custom_fields['ai_authored'] == true` 时，在帖子标题旁显示一个 "AI 协助撰写" 的小徽章（用 Discourse 的 plugin_outlet 系统）
3. Studio 的写帖 Agent 发帖时，在 API 请求里附带 `custom_fields: { ai_authored: true }`

### D3. "AI 已审"标牌（placeholder）
实现一个最简的 AI 审核标记（**实际不审，只标记**）：
1. 在同一个 plugin（或新 plugin `teenx-ai-review-marker`）里：
   - 所有新帖创建后，自动给 `Post.custom_fields['ai_reviewed'] = 'pending'` 赋值
   - 立即异步改为 `ai_reviewed = 'passed'`（本轮不做真实审核，直接过）
   - 在帖子底部显示 "AI 已审" 小标牌
2. 未来真实审核逻辑接入时，只需要改这个赋值逻辑——接口已留好

### D4. 帖子模板
Studio 的写帖 Agent 发帖时，帖子正文有一个**推荐结构**（由 Studio 侧生成，Discourse 只接收和展示）。Discourse 侧不做模板渲染，但可以预置一个"帖子模板"供手动发帖时参考：

在 `admin/customize/post_templates` 里为每个分类预置模板（本轮可跳过，记为后置）。

---

## 阶段 E · 评论与私信

### E1. 评论（回帖）
Discourse 原生支持回帖，无需额外开发。确保：
- `min_trust_level_to_reply` = `0`（所有用户可回帖）
- 回帖也走"AI 已审"标记流程（在 plugin 里对 `reply_to_post` 也赋 `ai_reviewed`）
- 回帖不受"AI 协助撰写"标记影响（回帖是用户直接写的，不走 Agent）

### E2. 私信（Personal Message）
Discourse 原生支持私信（PM），无需额外开发。确保 §B3 的私信配置已生效。补充：
- 私信内容**不显示** "AI 已审" 标牌（私信不公开，不走审核流程）
- 私信内容**不显示** "AI 协助撰写" 标记
- 在私信页面加一个"举报"按钮（Discourse 原生有 flag 功能，确保启用）

### E3. 儿童安全的私信约束（额外加）
写一个 plugin `teenx-pm-safety`：
- 私信内容自动过关键词过滤（用 Discourse 原生的 `watched_words` 功能，配一批敏感词）
- 私信里禁止包含外部链接（防钓鱼/防泄露个人信息）：用 `watched_words` 设 `link` 类型，自动阻止含外链的私信
- 私信里禁止包含邮箱地址、手机号模式：用正则 `watched_words`

---

## 阶段 F · 主题与视觉最简调整

### F1. 颜色方案
在 Discourse 管理后台 → Customize → Colors 创建一个 TeenX 主题色板：
- 主色：选一个活泼但不刺眼的颜色（如 `#6C5CE7` 紫蓝，适合青少年）
- 背景：浅色
- 文字：深灰
- 链接：主色

> 本轮只配默认色板，不做深度主题开发。视觉设计语言后置。

### F2. 关闭不适合儿童的功能
| 配置项 | 值 | 理由 |
|---|---|---|
| `enable_badges` | `true` | 保留徽章（游戏化） |
| `enable_likes` | `true` | 保留点赞 |
| `enable_bookmarks` | `true` | 保留书签 |
| `enable_polls` | `true` | 保留投票 |
| `enable_user_directory` | `true` | 保留用户目录 |
| `enable_signatures` | `false` | 关闭签名（防不当内容） |
| `enable_avatars` | `true` | |
| `allow_user_cards` | `true` | |
| `enable_mobile` | `true` | 移动端必须支持 |
| `enable_desktop` | `true` | |
| `login_required` | `true` | 必须登录才能浏览 |
| `force_https` | `true` | |

---

## 阶段 G · 联调与验收

### G1. 端到端验收脚本
写一个 `script/teenx-smoke.sh`，依次：
1. 用 admin 账号登录 Discourse
2. 验证 SSO 配置已生效（检查 `enable_sso` 返回 true）
3. 手动构造一个 SSO payload 并跳转 `/session/sso_login`，验证能创建/登录用户
4. 用 API Key 创建一个帖子（标题 + 正文 + `ai_authored=true`）
5. 验证帖子页显示 "AI 协助撰写" 徽章
6. 验证帖子页显示 "AI 已审" 标牌
7. 用另一个用户回帖，验证回帖不显示 "AI 协助撰写" 但显示 "AI 已审"
8. 发一条私信，验证私信不显示标记、不含外链的能发、含外链的被阻止
9. 验证 `invite_only` 生效（未登录用户访问被跳转登录）
10. 验证分类结构存在

每一步用 `curl` 调用 API 并打印响应。全流程跑通即验收通过。

### G2. 验收门
- [ ] Discourse 基线启动无错
- [ ] `http://localhost:3000` 打开是 TeenX 品牌
- [ ] `invite_only` + `must_approve_users` 生效
- [ ] SSO 配置已就绪（`enable_sso=true`，`sso_url` 指向 Studio）
- [ ] API Key 已创建并记录
- [ ] 五个分类已预置
- [ ] "AI 协助撰写" 徽章在带 `ai_authored=true` 的帖子上显示
- [ ] "AI 已审" 标牌在所有帖子上显示
- [ ] 私信功能可用，含外链的私信被阻止
- [ ] `login_required` 生效
- [ ] 敏感词过滤已配置
- [ ] 颜色主题已应用

---

## 阶段 H · 文档与交接

### H1. 写 `AGENTS.md`
在仓库根写 `AGENTS.md`，告诉后续 agent：
- 这是 Fork Discourse 的 TeenX 仓库，不跟上游
- 哪些是 Discourse 原生功能、哪些是 TeenX 自有 plugin（列出 `plugins/teenx-*/`）
- SSO 集成依赖：Studio 侧需要实现 `GET /api/auth/sso` 端点（见 §C2）
- API Key 需要传给 Studio 侧使用
- 儿童安全配置不可随意关闭（列出 §B 的关键配置项）
- 不要恢复匿名发帖、不要关闭 `login_required`

### H2. 写 `docs/handoff-2-report.md`
完成后写一份交接报告：
- 实际改了哪些文件（清单）
- 创建了哪些 plugin（路径 + 功能）
- 遇到的问题与解决方式
- 哪些验收门通过、哪些没通过（附原因）
- **集成依赖清单**（给 Studio 侧的接口需求）：
  - Studio 需实现 `GET /api/auth/sso`（SSO 签发端）
  - Studio 需获取 Discourse 的 API Key 和 base URL
  - Studio 的写帖 Agent 需调用 `POST /posts.json` 发帖，附带 `custom_fields.ai_authored=true`
  - Studio 侧的 SSO `external_id` 应使用队长 ID，`username` 应使用队伍名
- 下一轮应该做什么（AI 真实审核 / 儿童同意层 / 视觉深度定制 / 评分系统接入）

---

## 执行顺序与回报规则

1. **按阶段 A → B → C → D → E → F → G → H 顺序执行**，不跳阶段
2. 每完成一个阶段，简短回报：阶段名 + 关键改动 + 遇到的问题 + 是否进入下一阶段
3. 若某阶段卡住超过 3 次尝试仍不通，停下回报卡点，不要继续硬试
4. 全部完成后，在 `docs/handoff-2-report.md` 写交接报告，等待下一轮指令

---

## 关键约束提醒

- **不要实现写帖 Agent 本身**——那是 Studio 侧的事，论坛只接收 API 发帖
- **不要实现真实 AI 审核**——本轮只做 placeholder 标牌
- **不要实现儿童同意层/监护人层**——后置独立轮
- **不要实现赛题/排行榜/评分**——后置独立轮
- **不要深度定制 UI 主题**——本轮只换品牌名和颜色，视觉后置
- **不要关闭 §B 的任何儿童安全配置**——这些是硬约束

---

## 参考文件清单
- Discourse `README.md` / `CONTRIBUTING.md` / `docs/INSTALL.md` —— 底座文档
- Discourse `AGENTS.md` / `AI-AGENTS.md` —— Discourse 自己的 AI agent 集成指南
- Discourse `plugins/` —— 现有 plugin 样例（参考写 TeenX 自有 plugin）
- [Discourse SSO 文档](https://meta.discourse.org/t/discourse-sso/13045)
- [Discourse API 文档](https://docs.discourse.org/)
- ADVX Studio 方案：`/Users/baihe/Documents/advx26/docs/00-studio-v0.1.md`

---

*本交接提示词基于 2026-07-24 方案 v0.1 与对话锁定项撰写。执行过程中若发现方案有未覆盖的工程细节，优先按方案精神处理并在回报中说明，不要擅自扩大范围（如不要实现写帖 Agent / 真实 AI 审核 / 儿童同意层）。*
