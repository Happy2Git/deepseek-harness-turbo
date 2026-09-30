/** Optional Host-wide capacity ceiling for all model streams, including ordinary agents. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export const name = 'turbo-capacity'
export const inject = ['llm']

/** Shared process capacity, independent of per-investigation scout fan-out. */
export interface Config {
  /** Maximum simultaneous model streams across all routes in this Host. */
  maxConcurrent: number
  /** Maximum waiting requests; excess requests fail instead of retaining unbounded state. */
  maxQueued: number
}
export const Config: z<Config> = z.object({
  maxConcurrent: z.natural().min(1).default(10),
  maxQueued: z.natural().min(1).default(100),
})

/** Install one FIFO admission queue. Multiple processes require a shared serving gateway. */
export function apply(ctx: Context, config: Config): void {
  // ponytail: one process-wide pool; use a shared gateway for multiple Host processes.
  let active = 0
  const waiting = new Set<() => void>()
  const lifetime = new AbortController()
  ctx.effect(() => () => { lifetime.abort() }, 'turbo-capacity.cancel-queue')
  const release = (): void => {
    active -= 1
    waiting.values().next().value?.()
  }
  ctx.on('llm/stream', async function* (options, next) {
    const signal = AbortSignal.any([...(options.signal === undefined ? [] : [options.signal]), lifetime.signal])
    signal.throwIfAborted()
    if (active >= config.maxConcurrent) {
      if (waiting.size >= config.maxQueued) throw new Error('Model capacity queue is full. Retry after current requests finish.')
      await new Promise<void>((resolve, reject) => {
        const abort = (): void => {
          waiting.delete(admit)
          reject(signal.reason instanceof Error ? signal.reason : new Error('Model request cancelled.'))
        }
        const admit = (): void => {
          waiting.delete(admit)
          signal.removeEventListener('abort', abort)
          active += 1
          resolve()
        }
        waiting.add(admit)
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) abort()
      })
    } else active += 1
    try {
      signal.throwIfAborted()
      yield* next()
    } finally {
      release()
    }
  })
}
