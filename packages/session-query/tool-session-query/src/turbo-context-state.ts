/** Replay-derived task notes and context-window requests; no second note store. */
import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

const noteMeta = z.object({ turboContext: z.literal('note'), text: z.string().min(1) })
const resetMeta = z.object({ turboContext: z.literal('reset') })
const stateSchema = z.object({
  note: z.object({ text: z.string(), seq: z.number().int().nonnegative() }).nullable(),
  requested: z.number().int(), reset: z.number().int(), warned: z.number().int(),
  lastUser: z.number().int(), lastStep: z.number().int(),
})
type State = z.infer<typeof stateSchema>

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** Logged context attribution; readers preserve the message without this plugin.
     * @persistenceAttribution
     */
    'turbo-context': { kind: 'turbo-context'; action: 'reset' | 'reminder'; form: 'recall' }
  }
}
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Reconstructed from successful note/reset tool results and context replacements. */
    turboContext: State
  }
}

/** Replay the successful note operations and active context window from durable events. */
export const projection = {
  key: 'turboContext', stateVersion: 1, stateSchema,
  init: () => ({ note: null, requested: -1, reset: -1, warned: -2, lastUser: -1, lastStep: -1 }),
  apply: (state, event) => {
    if (event.type === 'step/start') return { ...state, lastStep: event.seq }
    if (event.type === 'user/message') {
      if (event.data.source.kind === 'user') return { ...state, lastUser: event.seq, requested: -1 }
      if (event.data.source.kind === 'turbo-context') {
        return event.data.source.action === 'reset'
          ? { ...state, reset: event.seq, requested: -1 }
          : { ...state, warned: state.reset }
      }
    }
    if (event.type !== 'tool/result' || event.data.message.isError) return state
    const note = noteMeta.safeParse(event.data.meta)
    if (note.success) return { ...state, note: { text: note.data.text, seq: event.seq } }
    if (resetMeta.safeParse(event.data.meta).success) return { ...state, requested: event.seq }
    return state
  },
} satisfies ProjectionDefinition<'turboContext'>
