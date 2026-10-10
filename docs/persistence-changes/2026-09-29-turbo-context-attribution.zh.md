---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-29-turbo-context-attribution

[English](2026-09-29-turbo-context-attribution.md) | 中文

## 概述

新增 Turbo 上下文消息来源标记，用于任务笔记与不调用摘要模型的上下文替换。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-29-turbo-context-attribution
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-05-working-directory-attribution"
    after: "1f62c08dbd21d3d2f95e4c06530ffbb45c75f2f0046e5cf70b88ab1a96184154"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "fc36c87cc87f8996d607649d94e1f5bef5a30cd66b1c59f3094addfe38d72daa"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-07-title-reasoning-effort"
    after: "6b26345bf8b0353246263e2fc38cdf069676736a7cbf2435a55247e50a3aabea"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-05-working-directory-attribution"
    after: "214d26bd12a3c9102f1f9063f8696d5208dfbbb3f81c09da096cfe80f18f8756"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增来源仅标记已有用户消息。未加载插件的读取方保留消息内容及上下文替换语义。可选 Turbo 投影解释替换与提醒动作；已有会话无需迁移。

<a id="verification"></a>
## 验证

Web 预设测试覆盖无摘要替换、历史证据检索、会话恢复、压力阈值及保存失败；无需密钥的 turbo-context 回放覆盖持久化消息。

<a id="dev-note"></a>
## 开发备注

无。
