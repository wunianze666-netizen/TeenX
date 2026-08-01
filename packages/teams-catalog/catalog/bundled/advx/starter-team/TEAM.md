---
name: ADVX 起步四角色整队
description: ADVX 面向 11-16 岁少年的起步队伍模板，包含侦察员、点子员、搭建员、挑刺员四个角色，覆盖查事实-出点子-做产物-质检的完整协作链路。
schema: agentcompanies/v1
slug: starter-team
category: advx
key: paperclipai/bundled/advx/starter-team
manager: agents/scout/AGENTS.md
includes:
  - agents/inventor/AGENTS.md
  - agents/builder/AGENTS.md
  - agents/critic/AGENTS.md
defaultInstall: false
recommendedForCompanyTypes:
  - advx
  - generalist
tags:
  - advx
  - starter
  - default
---

# ADVX 起步四角色整队

这是 ADVX 少年 AI 队伍养成平台的默认起步模板。一支队伍四个角色，覆盖"查事实 → 出点子 → 做产物 → 质检"的完整协作链路。

## 内容

- `侦察员（Scout）` — 查清事实、找约束。向点子员汇报。
- `点子员（Inventor）` — 基于事实出 2-3 个方案。委托搭建员。
- `搭建员（Builder）` — 把方案做成实际产物。交给挑刺员质检。
- `挑刺员（Critic）` — 挑毛病、质检，向队长汇报。不直接改产物。

## 协作链路

```
队长（少年）
  └─ 侦察员 →（事实）→ 点子员 →（方案）→ 搭建员 →（产物）→ 挑刺员 →（质检报告）→ 队长
```

## 给孩子的话

这是你的起步队伍。四个角色各有分工：侦察员查资料、点子员出主意、搭建员做产物、挑刺员挑毛病。你可以给每个角色起名字、换工具、改职责，让你的队伍越来越像你自己。
