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
## Compatibility

The new source kind only attributes existing user messages. Readers without the plugin preserve message content and surface replacement semantics. Optional Turbo projections interpret reset and reminder actions; existing sessions require no migration.

<a id="verification"></a>
## Verification

Web preset tests exercise model-free replacement, shadowed history retrieval, resume, pressure thresholds, and checkpoint failures; keyless turbo-context replay exercises the durable messages.

<a id="dev-note"></a>
## Dev Note

None.
