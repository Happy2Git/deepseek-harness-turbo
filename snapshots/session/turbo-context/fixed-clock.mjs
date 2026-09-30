/** Pin event timestamps in this process-local snapshot; real persistence/search remain active. */
export const name = 'turbo-snapshot-clock'
export function apply(ctx) {
  ctx.effect(() => {
    const original = Date.now
    Date.now = () => 1790685600000
    return () => { Date.now = original }
  })
}
