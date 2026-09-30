# Agent Note: Turbo task notes and model-free context replacement

Status: implemented

English | [中文](2026-09-29-turbo-note-context.zh.md)

## Problem

Turbo targets repeated investigation with short evidence reports. A separate summarizer adds model latency and can omit task constraints, while discarding history without a recoverable checkpoint loses evidence.

## Decision

The optional [context entry](../../../../packages/session-query/tool-session-query/README.md#turbo-context-windows) reuses the durable session log as the only note store and the existing history tools for retrieval. Successful note tool results drive a replayable projection. Replacement starts only after the completed tool step is durably flushed, and uses the existing surface replacement and token shadow-price protocol. The original events remain queryable. Official presets keep their existing compaction policy.

The message source identifies reset and reminder content; older readers preserve those messages and their replacement envelopes without understanding the optional projection. It is an attribution-only source addition within the released Session format, acknowledged in the persistence record.

## Alternatives considered

**An additional summarization call.** It restores a potentially richer summary but adds the model request that the user wants to remove. Maintained notes move that work into ordinary task progress.

**A separate filesystem note database.** It duplicates the durable log and creates a second recovery and authorization path. The existing tool result and history index cover the current need.

**Discarding history without a fresh note.** It removes the only active account of intermediate corrections and unfinished actions. Replacement instead requires a current bounded note, preserving first/latest user inputs and instruction messages verbatim.

## Consequences

Replacement avoids a summarizer call but still spends tokens maintaining notes and retrieving evidence. Its rebuilt request can reduce cache reuse. Notes can omit intermediate constraints; the agent must keep them current and read original evidence when uncertain. Without model capacity metadata, automatic pressure handling is unavailable, but explicit replacement remains available. Missing persistence or failed checkpoints prevent destructive replacement; a failure of the final checkpoint stops the turn with the original history already saved.

The real Web composition tests cover restore, search, automatic thresholds, missing and oversized notes, cancellation, and failed persistence. The keyless context snapshot covers model-visible output; these checks do not establish real-model latency gains.

Turbo enables the optional trigram tokenizer adapted from [Happy2Git session-query-trigram](https://github.com/Happy2Git/deepseek-harness/tree/feat/session-query-trigram). Chinese fragments can then recover evidence embedded in unsegmented text. The short-query scan escapes literal wildcards and folds ASCII consistently for both matching and ranking. Other presets retain unicode61. The sidebar-search-locate branch is not imported: its current-surface, conversation-only search cannot retrieve Turbo’s shadowed tool evidence, and model tools already return exact event sequences.
