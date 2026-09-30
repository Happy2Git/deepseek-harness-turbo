/** Bounded read-only investigation through the existing in-process subagent runtime. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { z as zod } from 'zod'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { SubagentRun } from '@deepseek-ai/dsh-subagent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'

export const name = 'turbo-investigate'
export const inject = ['tools', 'systemPrompt', 'subagents']

/** Deployment-owned limits; model arguments cannot widen them. */
export interface Config {
  /** Concurrent scouts in one investigation. */
  concurrency: number
  /** Maximum scopes accepted in one call. */
  maxScopes: number
  /** Whole investigation deadline, including queueing and child cleanup initiation. */
  timeoutMs: number
  /** Maximum admitted model steps per child; transport retries share the deadline. */
  maxScoutSteps: number
  /** Maximum UTF-8 bytes in one complete structured report. */
  maxReportBytes: number
  /** Soft report length instruction, in model tokens. */
  reportTargetTokens: number
  /** Maximum findings accepted from a child. */
  maxFindings: number
  /** Optional per-request generation ceiling; omission inherits the parent. */
  maxTokens?: number
  /** Optional adapter-supported effort; omission preserves route defaults. */
  reasoningEffort?: string
  /** Explicit scout provider/model routes; blank placeholders reject calls until configured. */
  routes: { provider: string; model: string }[]
}

export const Config: z<Config> = z.object({
  concurrency: z.natural().min(1).max(4).default(2),
  maxScopes: z.natural().min(1).max(4).default(4),
  timeoutMs: z.natural().min(1).max(2_147_483_647).default(180_000),
  maxScoutSteps: z.natural().min(1).default(12),
  maxReportBytes: z.natural().min(1).default(4096),
  reportTargetTokens: z.natural().min(1).default(384),
  maxFindings: z.natural().min(1).default(3),
  maxTokens: z.natural().min(1),
  reasoningEffort: z.string().min(1),
  routes: z.array(z.object({ provider: z.string().required(), model: z.string().required() })).default([]),
})

const READ_TOOLS = ['read', 'glob', 'grep']
const REPORT_SCHEMA: ObjectJsonSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: {
        file: { type: 'string' }, line: { type: 'integer' },
        problem: { type: 'string' }, evidence: { type: 'string' }, check: { type: 'string' },
      },
      required: ['file', 'line', 'problem', 'evidence', 'check'],
    } },
    coverage: { type: 'string' },
  },
  required: ['findings', 'coverage'],
}
const finding = zod.object({
  file: zod.string().min(1), line: zod.number().int().positive(), problem: zod.string().min(1),
  evidence: zod.string().min(1), check: zod.string(),
}).strict()
type Report = { findings: zod.infer<typeof finding>[]; coverage: string }
type Status = 'completed' | 'failed' | 'invalid_result' | 'timed_out' | 'cancelled' | 'budget_exhausted'
interface Result {
  scope: string
  status: Status
  report?: Report
}

/** Register the native investigation tool and its concise usage policy. */
export function apply(ctx: Context, config: Config): void {
  const reportValidator = zod.object({
    findings: zod.array(finding).max(config.maxFindings), coverage: zod.string().min(1),
  }).strict()
  const validReport = (value: unknown): Report | undefined => {
    const parsed = reportValidator.safeParse(value)
    if (!parsed.success || Buffer.byteLength(JSON.stringify(parsed.data), 'utf8') > config.maxReportBytes) return undefined
    return parsed.data
  }
  const activeParents = new Set<Agent>()
  const budgets = new WeakMap<Agent, { steps: number; exhausted: boolean }>()
  ctx.on('agent/created', ({ agent }) => {
    if (![...activeParents].some(parent => parent.id === agent.session.header.parentSession)) return
    const budget = { steps: 0, exhausted: false }
    budgets.set(agent, budget)
    agent.ctx.tools.guard((exec) => {
      if (![...READ_TOOLS, 'structured_output'].includes(exec.name)) return 'Turbo scouts can only read, search, and submit their report.'
      if (exec.name === 'structured_output' && validReport(exec.arguments) === undefined) {
        return `Report rejected: use at most ${config.maxFindings} findings, positive line numbers, nonempty coverage, and at most ${config.maxReportBytes} UTF-8 bytes. Submit a shorter valid report.`
      }
      return undefined
    })
    agent.ctx.on('agent/pre-step', async (_payload, next) => {
      const decision = await next()
      if (decision.kind === 'enter' && ++budget.steps > config.maxScoutSteps) {
        budget.exhausted = true
        return { kind: 'reject' }
      }
      return decision
    })
  })
  ctx.systemPrompt.section({
    name: 'tool:turbo_investigate', order: 500,
    text: 'Use direct tools for small tasks. For independent investigation areas, call turbo_investigate with the full task, symptoms, expected behavior, and distinct scopes. Scouts only investigate; you are the only writer. Check coverage and failures, verify key evidence, then make and test the change. Do not repeat reports or write unnecessary plans. A passing generic test suite alone does not establish task completion. Make at most one additional repair attempt before reporting unresolved failures.',
  })
  ctx.tools.register(defineTool({
    name: 'turbo_investigate',
    description: 'Investigate independent code areas with bounded read-only scouts. Returns a status and short evidence report for EVERY scope. Failure is not an empty successful report. Children do not inherit this conversation: include all necessary task context. Waits for child cleanup; never edits files.',
    parameters: {
      task: { type: 'string', required: true, description: 'Complete task summary, symptoms, expected behavior, known evidence, and acceptance criteria.' },
      scopes: { type: 'array', required: true, items: { type: 'string' }, description: `Distinct search areas; at most ${config.maxScopes}.` },
    },
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        results: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
          scope: { type: 'string', required: true }, status: { type: 'string', required: true },
          report: { type: 'object', additionalProperties: false, properties: {
            coverage: { type: 'string', required: true },
            findings: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
              file: { type: 'string', required: true }, line: { type: 'integer', required: true },
              problem: { type: 'string', required: true }, evidence: { type: 'string', required: true }, check: { type: 'string', required: true },
            } } },
          } },
        } } },
      } },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      const input = zod.object({
        task: zod.string().trim().min(1).max(16000),
        scopes: zod.array(zod.string().trim().min(1).max(2000)).min(1).max(config.maxScopes),
      }).parse(args)
      if (new Set(input.scopes).size !== input.scopes.length) throw new Error('Investigation scopes must be distinct.')
      if (config.routes.length === 0 || config.routes.some(route => !route.provider.trim() || !route.model.trim())) throw new Error('Configure Turbo scout routes with an explicit provider and model before investigating. No parent-model fallback is used.')
      const parent = exec.agent
      if (parent === undefined) throw new Error('turbo_investigate requires an active agent.')
      if (activeParents.has(parent)) throw new Error('This agent already has an active investigation.')
      const provider = ctx.subagents.getProvider('spawn')
      if (provider === undefined || provider.inheritsParentContext
        || !provider.capabilities.toolFilter || !provider.capabilities.outputSchema
        || !provider.capabilities.persona || !provider.capabilities.agentOptions) {
        throw new Error('Turbo requires the in-process spawn provider with tool filtering, persona, model options, and structured output.')
      }
      const controller = new AbortController()
      const signal = AbortSignal.any([exec.signal, controller.signal])
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, config.timeoutMs)
      activeParents.add(parent)
      const results = new Array<Result>(input.scopes.length)
      const pending = input.scopes.entries()
      const isAborted = (): boolean => signal.aborted
      const stopped = (): Status => timedOut ? 'timed_out' : 'cancelled'
      try {
        const workers = await Promise.allSettled(Array.from({ length: Math.min(config.concurrency, input.scopes.length) }, async () => {
          for (const [index, scope] of pending) {
            let run: SubagentRun | undefined
            let result: Result = { scope, status: 'failed' }
            try {
              if (signal.aborted) { results[index] = { scope, status: stopped() }; continue }
              const route = config.routes[index % config.routes.length]
              if (route === undefined) throw new Error('No configured scout route.')
              run = await ctx.subagents.start('spawn', {
                parent, signal,
                prompt: [{ type: 'text', text: `Task:\n${input.task}\n\nAssigned scope:\n${scope}` }],
                toolFilter: { allow: READ_TOOLS },
                persona: `Investigate the assigned scope using read/search tools directly. Do not narrate plans or progress, edit, delegate, or write a patch. Return at most ${config.maxFindings} concrete findings with source locations, evidence, and checks. Empty findings are valid; state coverage gaps. Aim for at most ${config.reportTargetTokens} tokens in the final report. Submit it through structured_output; do not repeat it as prose.`,
                outputSchema: REPORT_SCHEMA,
                agentOptions: {
                  ...route,
                  ...config.maxTokens === undefined ? {} : { maxTokens: config.maxTokens },
                  ...config.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(config.reasoningEffort) },
                },
              })
              const settled = await run.result
              const report = validReport(settled.structured)
              const exhausted = run.localAgent !== undefined && budgets.get(run.localAgent)?.exhausted
              result = isAborted() ? { scope, status: stopped() }
                : exhausted ? { scope, status: 'budget_exhausted' }
                  : settled.stopReason !== 'completed' ? { scope, status: 'failed' }
                    : report === undefined ? { scope, status: 'invalid_result' }
                      : { scope, status: 'completed', report }
            } catch {
              // Provider diagnostics stay in child/provider logs, not in model-visible reports.
              result = { scope, status: signal.aborted ? stopped() : 'failed' }
            } finally {
              if (run !== undefined) {
                try { await run.dispose() } catch (error) {
                  controller.abort()
                  throw error
                }
              }
            }
            results[index] = result
          }
        }))
        for (const worker of workers) if (worker.status === 'rejected') throw worker.reason
        return { results }
      } finally {
        clearTimeout(timer)
        controller.abort()
        activeParents.delete(parent)
      }
    },
  }))
}
