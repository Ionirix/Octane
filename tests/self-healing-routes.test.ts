import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selfHealingRouter } from '../src/api/handlers/self-healing.js'

type KVListResult = { keys: Array<{ name: string }> }

class MemoryKV {
  private store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value)
  }

  async list(options?: { prefix?: string; limit?: number }): Promise<KVListResult> {
    const prefix = options?.prefix ?? ''
    const limit = options?.limit ?? 1000
    const keys = [...this.store.keys()]
      .filter((key) => key.startsWith(prefix))
      .slice(0, limit)
      .map((name) => ({ name }))
    return { keys }
  }
}

function createMockEnv() {
  const kv = new MemoryKV()
  const surveillanceFetch = async (url: string) => {
    if (url.includes('/alerts')) {
      return new Response(JSON.stringify({ success: true, data: [{ severity: 'CRITICAL' }, { severity: 'WARNING' }] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (url.includes('/snapshot')) {
      return new Response(JSON.stringify({ success: true, data: { degradedNodes: 1, onlineNodes: 13 } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ success: true, data: {} }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const env = {
    OPERATOR_STATE_KV: kv,
    SURVEILLANCE_DO: {
      idFromName: () => 'global-id',
      get: () => ({
        fetch: (input: string) => surveillanceFetch(input),
      }),
    },
    SELF_HEALING_SIGNING_SECRET: 'test-signing-secret',
    SELF_HEALING_DNS_ENDPOINT: 'https://dns.adapter.local/execute',
    SELF_HEALING_CDN_ENDPOINT: 'https://cdn.adapter.local/execute',
    SELF_HEALING_LB_ENDPOINT: 'https://lb.adapter.local/execute',
    SELF_HEALING_CELL_TOWER_ENDPOINT: 'https://cell-tower.adapter.local/execute',
    SELF_HEALING_CELL_ACTIVITY_ENDPOINT: 'https://cell-activity.adapter.local/execute',
    SELF_HEALING_INCIDENT_ENDPOINT: 'https://incident.adapter.local/execute',
  }

  return env as unknown as Parameters<typeof selfHealingRouter.request>[2]
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return [...new Uint8Array(signature)].map((value) => value.toString(16).padStart(2, '0')).join('')
}

async function signedHeaders(options: { method: string; path: string; actor: string; role: string; secret: string }) {
  const ts = Date.now().toString()
  const message = `${options.method}\n${options.path}\n${ts}\n${options.actor}\n${options.role}`
  const sig = await hmacSha256Hex(options.secret, message)
  return {
    'x-octane-actor': options.actor,
    'x-octane-role': options.role,
    'x-octane-ts': ts,
    'x-octane-sig': sig,
    'Content-Type': 'application/json',
  }
}

describe('self-healing lifecycle routes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires signed RBAC headers for approval and execution', async () => {
    const env = createMockEnv()

    const createRes = await selfHealingRouter.request('/active-nodes/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    }, env)
    expect(createRes.status).toBe(201)
    const createPayload = await createRes.json() as { data: { operation: { id: string } } }

    const approveRes = await selfHealingRouter.request(`/active-nodes/operations/${createPayload.data.operation.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env)
    expect(approveRes.status).toBe(401)

    const executeRes = await selfHealingRouter.request(`/active-nodes/operations/${createPayload.data.operation.id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }, env)
    expect(executeRes.status).toBe(401)
  })

  it('enforces RBAC role constraints on approval', async () => {
    const env = createMockEnv()

    const createRes = await selfHealingRouter.request('/active-nodes/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false }),
    }, env)
    const createPayload = await createRes.json() as { data: { operation: { id: string } } }

    const roleHeaders = await signedHeaders({
      method: 'POST',
      path: `/active-nodes/operations/${createPayload.data.operation.id}/approve`,
      actor: 'viewer-user',
      role: 'viewer',
      secret: 'test-signing-secret',
    })

    const approveRes = await selfHealingRouter.request(`/active-nodes/operations/${createPayload.data.operation.id}/approve`, {
      method: 'POST',
      headers: roleHeaders,
      body: JSON.stringify({}),
    }, env)

    expect(approveRes.status).toBe(403)
  })

  it('transitions operation through approve, execute, and rollback', async () => {
    const env = createMockEnv()

    const createRes = await selfHealingRouter.request('/active-nodes/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        playbookId: 'playbook-route-failover',
      }),
    }, env)
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { data: { operation: { id: string; status: string } } }
    expect(created.data.operation.status).toBe('awaiting_approval')

    const approveHeaders = await signedHeaders({
      method: 'POST',
      path: `/active-nodes/operations/${created.data.operation.id}/approve`,
      actor: 'alice-operator',
      role: 'operator',
      secret: 'test-signing-secret',
    })
    const approveRes = await selfHealingRouter.request(`/active-nodes/operations/${created.data.operation.id}/approve`, {
      method: 'POST',
      headers: approveHeaders,
      body: JSON.stringify({}),
    }, env)
    expect(approveRes.status).toBe(200)

    const executeHeaders = await signedHeaders({
      method: 'POST',
      path: `/active-nodes/operations/${created.data.operation.id}/execute`,
      actor: 'alice-operator',
      role: 'operator',
      secret: 'test-signing-secret',
    })
    const executeRes = await selfHealingRouter.request(`/active-nodes/operations/${created.data.operation.id}/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({}),
    }, env)
    expect(executeRes.status).toBe(200)
    const executed = await executeRes.json() as { data: { status: string; controlPlane: { ok: boolean; results: unknown[] } } }
    expect(executed.data.status).toBe('succeeded')
    expect(executed.data.controlPlane.ok).toBe(true)
    expect(executed.data.controlPlane.results.length).toBeGreaterThan(0)

    const rollbackRes = await selfHealingRouter.request(`/active-nodes/operations/${created.data.operation.id}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, env)
    expect(rollbackRes.status).toBe(200)
    const rolledBack = await rollbackRes.json() as { data: { status: string } }
    expect(rolledBack.data.status).toBe('rolled_back')
  })

  it('executes targeted self-healing against authorized cell domains', async () => {
    const env = createMockEnv()

    const createRes = await selfHealingRouter.request('/active-nodes/heal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dryRun: false,
        playbookId: 'playbook-targeted-cell-self-healing',
      }),
    }, env)
    expect(createRes.status).toBe(201)
    const created = await createRes.json() as { data: { operation: { id: string } } }

    const approveHeaders = await signedHeaders({
      method: 'POST',
      path: `/active-nodes/operations/${created.data.operation.id}/approve`,
      actor: 'alice-operator',
      role: 'operator',
      secret: 'test-signing-secret',
    })
    const approveRes = await selfHealingRouter.request(`/active-nodes/operations/${created.data.operation.id}/approve`, {
      method: 'POST',
      headers: approveHeaders,
      body: JSON.stringify({}),
    }, env)
    expect(approveRes.status).toBe(200)

    const executeHeaders = await signedHeaders({
      method: 'POST',
      path: `/active-nodes/operations/${created.data.operation.id}/execute`,
      actor: 'alice-operator',
      role: 'operator',
      secret: 'test-signing-secret',
    })
    const executeRes = await selfHealingRouter.request(`/active-nodes/operations/${created.data.operation.id}/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({}),
    }, env)
    expect(executeRes.status).toBe(200)

    const executed = await executeRes.json() as {
      data: {
        controlPlane: { results: Array<{ domain: string }> }
      }
    }
    const domains = new Set(executed.data.controlPlane.results.map((result) => result.domain))
    expect(domains.has('cell-tower')).toBe(true)
    expect(domains.has('cell-activity')).toBe(true)
  })
})
