---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-29-turbo-context-attribution

English | [中文](2026-09-29-turbo-context-attribution.zh.md)

## Summary

Adds Turbo context-message attribution for maintained notes and model-free context replacement.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

The new source kind only attributes existing user messages. Readers without the plugin preserve message content and surface replacement semantics. Optional Turbo projections interpret reset and reminder actions; existing sessions require no migration.

<a id="verification"></a>
## Verification

Web preset tests exercise model-free replacement, shadowed history retrieval, resume, pressure thresholds, and checkpoint failures; keyless turbo-context replay exercises the durable messages.

<a id="dev-note"></a>
## Dev Note

None.
