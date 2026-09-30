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
    previous: "2026-09-16-session-format-v4"
    after: "2129fe973af511d1e387c607c3e79aacfecc78fdaebb42f6c599fb379e7e3b69"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-16-session-format-v4"
    after: "2e8d1b37dc7a94ef7c006ca3756538890381d4683c4935aec50e75937f96fc78"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-16-session-format-v4"
    after: "1c3a798e0c8b188a0f199aa7dd5e7ceac23726e4637e572a5455a0f1461ae5ea"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-16-session-format-v4"
    after: "0b6369bcea29fe8bbb526aa5ea17be8f88ab6001b127a83fbe6c1addecc1f98d"
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
