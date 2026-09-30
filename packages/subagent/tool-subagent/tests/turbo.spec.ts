import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { ToolCallId } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import ProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import Subagents from '@deepseek-ai/dsh-subagent'
import * as spawn from '@deepseek-ai/dsh-subagent-spawn-in-process'
import { MockAdapter, toolCallResponse, maxTokensResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'
import * as turbo from '../src/turbo.ts'
import * as capacity from '../src/turbo-capacity.ts'

type Script = ConstructorParameters<typeof MockAdapter>[0]
const owned: { ctx: Context; root: string }[] = []
afterEach(async () => {
  for (const { ctx, root } of owned.splice(0)) {
    await ctx.fiber.dispose()
    await rm(root, { recursive: true, force: true })
  }
})

async function setup(script: Script, config: Partial<turbo.Config> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'turbo-loader-'))
  const ctx = new Context()
  owned.push({ ctx, root })
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const plugins = {
    llm: LlmRuntime, sessions: SessionStore, projections: ProjectionRegistry,
    prompt: SystemPrompt, tools: Tools, agents: AgentRegistry, loop: AgentLoop,
    subagents: Subagents, spawn, turbo, capacity,
  }
  Object.assign(ctx.loader.builtins, plugins)
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([
    ...['llm', 'sessions', 'projections', 'prompt', 'tools', 'agents'].map(name => ({ name: `cordis:${name}` })),
    { name: 'cordis:loop', config: { agents: [] } }, { name: 'cordis:subagents' }, { name: 'cordis:spawn' },
    { name: 'cordis:turbo', config: { routes: [{ provider: 'mock', model: 'qwen38' }], ...config } },
    { name: 'cordis:capacity', config: { maxConcurrent: 2, maxQueued: 4 } },
  ]))
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  expect(ctx.tools.get('turbo_investigate')).toBeDefined()
  const adapter = new MockAdapter(script)
  ctx.llm.registerAdapter(['mock'], adapter)
  let writes = 0
  for (const name of ['read', 'glob', 'grep', 'write', 'bash', 'subagent', 'run_other']) {
    ctx.tools.register({ name, description: name, parameters: { type: 'object' },
      output: { schema: { type: 'object' }, render: () => [{ type: 'text', text: 'ok' }] },
      execute: async () => { if (name === 'write') writes++; return {} },
    })
  }
  const parent = await ctx.agentLoop.create(SessionId('parent'), { provider: 'mock', model: 'main-model' })
  const call = (scopes = ['auth', 'tests'], signal = new AbortController().signal) => ctx.tools.execute({
    name: 'turbo_investigate', arguments: { task: 'Fix the intermittent login failure. Preserve valid sessions.', scopes },
    callId: ToolCallId('investigate'), agent: parent, signal,
  })
  return { ctx, parent, adapter, call, writes: () => writes }
}
const report = { findings: [], coverage: 'Inspected assigned scope.' }
const submit = () => toolCallResponse('report', 'structured_output', report)
function body(result: Awaited<ReturnType<Awaited<ReturnType<typeof setup>>['call']>>) {
  expect(result.isError, JSON.stringify(result.content)).toBeFalsy()
  return JSON.parse(result.content.filter(b => b.type === 'text').map(b => b.text).join('')) as { results: { scope: string; status: string; report?: typeof report }[] }
}

describe('Turbo through Loader and real in-process children', () => {
  it('uses explicit scout models, returns empty successful reports, and disposes children', async () => {
    const { call, adapter, ctx } = await setup([submit(), submit()])
    const childIds: string[] = []
    ctx.on('subagent/start', (info) => { childIds.push(info.id) })
    expect(body(await call())).toEqual({ results: ['auth', 'tests'].map(scope => ({ scope, status: 'completed', report })) })
    expect(adapter.requests).toHaveLength(2)
    for (const request of adapter.requests) {
      expect(request.model).toBe('qwen38')
      expect(request.tools?.map(t => t.name).sort()).toEqual(['glob', 'grep', 'read', 'structured_output'])
      expect(JSON.stringify(request.messages)).toContain('intermittent login failure')
    }
    expect(childIds).toHaveLength(2)
    for (const id of childIds) expect(ctx.agents.get(SessionId(id))).toBeUndefined()
  })

  it('denies forced writes and submissions exceeding the report limit, then admits valid reports', async () => {
    const { call, writes } = await setup([
      toolCallResponse('write', 'write', {}),
      toolCallResponse('bad', 'structured_output', { findings: [], coverage: 'x'.repeat(300) }),
      submit(),
    ], { concurrency: 1, maxReportBytes: 200 })
    expect(body(await call(['auth'])).results[0]?.status).toBe('completed')
    expect(writes()).toBe(0)
  })

  it('counts complete report bytes in UTF-8 and accepts the exact boundary', async () => {
    const unicodeReport = { findings: [], coverage: '已检查' }
    const bytes = Buffer.byteLength(JSON.stringify(unicodeReport), 'utf8')
    const { call, adapter } = await setup([
      toolCallResponse('oversized', 'structured_output', { ...unicodeReport, coverage: '已检查。' }),
      toolCallResponse('exact', 'structured_output', unicodeReport),
    ], { maxReportBytes: bytes })
    expect(body(await call(['auth'])).results[0]?.report).toEqual(unicodeReport)
    expect(adapter.requests).toHaveLength(2)
  })

  it('cancels running and queued scopes and disposes the child', async () => {
    const { call, adapter, ctx } = await setup(['hang'], { concurrency: 1 })
    const controller = new AbortController()
    const ids: string[] = []
    ctx.on('subagent/start', (info) => { ids.push(info.id) })
    const pending = call(['auth', 'tests'], controller.signal)
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
    controller.abort()
    const result = await pending
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('tool call aborted')
    for (const id of ids) expect(ctx.agents.get(SessionId(id))).toBeUndefined()
  })

  it('reports partial failure instead of silently dropping it', async () => {
    const { call } = await setup([maxTokensResponse('truncated'), submit()], { concurrency: 1 })
    expect(body(await call()).results.map((r: { status: string }) => r.status)).toEqual(['failed', 'completed'])
  })

  it('enforces the model-step budget and has no recursive delegation', async () => {
    const { call, adapter } = await setup([toolCallResponse('r', 'read', {})], { maxScoutSteps: 1 })
    expect(body(await call(['auth'])).results[0]?.status).toBe('budget_exhausted')
    expect(adapter.requests).toHaveLength(1)
  })

  it('bounds a stalled investigation and cleans up its children', async () => {
    const { call, ctx } = await setup(['hang'], { concurrency: 1, timeoutMs: 60 })
    const ids: string[] = []
    ctx.on('subagent/start', (info) => { ids.push(info.id) })
    expect(body(await call()).results.map((r: { status: string }) => r.status)).toEqual(['timed_out', 'timed_out'])
    for (const id of ids) expect(ctx.agents.get(SessionId(id))).toBeUndefined()
  })

  it('rejects blank scout configuration without falling back to the parent model', async () => {
    const { call, adapter } = await setup([], { routes: [{ provider: '', model: 'qwen38' }] })
    const result = await call()
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result.content)).toContain('No parent-model fallback')
    expect(adapter.requests).toHaveLength(0)
  })

  it('rejects too many or duplicate scopes before starting a model', async () => {
    const { call, adapter } = await setup([])
    expect((await call(['a', 'a'])).isError).toBe(true)
    expect((await call(['a', 'b', 'c', 'd', 'e'])).isError).toBe(true)
    expect(adapter.requests).toHaveLength(0)
  })

  it('removes registrations when Loader unloads the plugin', async () => {
    const { ctx } = await setup([])
    const row = [...ctx.loader.entries()].find(entry => entry.options.name === 'cordis:turbo')!
    await row.fiber!.dispose()
    expect(ctx.tools.get('turbo_investigate')).toBeUndefined()
  })
})


describe('Host model capacity', () => {
  it('shares slots across callers, removes cancelled waiters, and releases completed streams', async () => {
    const { ctx, adapter } = await setup(['hang', 'hang', submit()])
    const controls = Array.from({ length: 4 }, () => new AbortController())
    const consume = async (index: number) => {
      for await (const _ of ctx.llm.stream({ provider: 'mock', model: 'qwen38', messages: [], signal: controls[index]!.signal })) { /* drain */ }
    }
    const first = consume(0)
    const second = consume(1)
    await vi.waitFor(() => { expect(adapter.requests).toHaveLength(2) })
    const cancelled = consume(2).catch(() => undefined)
    const last = consume(3)
    controls[2]!.abort()
    await cancelled
    expect(adapter.requests).toHaveLength(2)
    controls[0]!.abort()
    await first
    await last
    expect(adapter.requests).toHaveLength(3)
    controls[1]!.abort()
    await second
  })
})
