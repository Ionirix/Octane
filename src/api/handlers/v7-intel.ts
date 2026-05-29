import { Hono } from 'hono'
import type { Env } from '../../types/index.js'

export const v7IntelRouter = new Hono<{ Bindings: Env }>()

const DEFAULT_UPSTREAM_BASE = 'https://8b39333f.octane-v7.pages.dev'

function resolveUpstreamBase(env: Env): string {
  const configured = (env.V7_INTEL_UPSTREAM_BASE_URL ?? '').trim()
  if (!configured) return DEFAULT_UPSTREAM_BASE

  try {
    const parsed = new URL(configured)
    if (parsed.protocol !== 'https:') return DEFAULT_UPSTREAM_BASE
    return parsed.origin
  } catch {
    return DEFAULT_UPSTREAM_BASE
  }
}

async function proxyUpstream(env: Env, path: string): Promise<Response> {
  const upstreamBase = resolveUpstreamBase(env)
  const upstreamToken = env.V7_INTEL_UPSTREAM_TOKEN
  const maxRetries = Math.max(0, Math.min(2, env.V7_INTEL_UPSTREAM_RETRIES ?? 1))

  let lastError: unknown = null

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    try {
      const headers: Record<string, string> = {
        accept: 'application/json',
      }

      if (upstreamToken) {
        headers.authorization = `Bearer ${upstreamToken}`
      }

      const response = await fetch(`${upstreamBase}${path}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      })

      const text = await response.text()
      return new Response(text, {
        status: response.status,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    } catch (error) {
      lastError = error
      if (attempt < maxRetries) {
        await new Promise<void>((resolve) => setTimeout(() => resolve(), 200 * (attempt + 1)))
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  throw (lastError instanceof Error ? lastError : new Error('intel upstream unavailable'))
}

v7IntelRouter.get('/global', async (c) => {
  try {
    return await proxyUpstream(c.env, '/api/v7/intel/global')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'intel upstream unavailable'
    return c.json({ ok: false, error: message }, 502)
  }
})

v7IntelRouter.get('/global/:domain', async (c) => {
  const domain = c.req.param('domain')
  if (!['nodes', 'subsystems', 'flows', 'events', 'metrics', 'geo'].includes(domain)) {
    return c.json({ ok: false, error: 'invalid intel domain' }, 400)
  }

  try {
    return await proxyUpstream(c.env, `/api/v7/intel/global/${domain}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'intel upstream unavailable'
    return c.json({ ok: false, error: message }, 502)
  }
})

v7IntelRouter.get('/automation/status', async (c) => {
  try {
    const response = await proxyUpstream(c.env, '/api/v7/automation/status')
    if (response.status >= 400) {
      return c.json({
        ok: true,
        data: {
          state: 'degraded',
          activeJobs: 0,
          queueDepth: 0,
          lastRunAt: new Date().toISOString(),
          message: 'Automation status upstream unavailable - fallback active',
        },
      }, 200)
    }
    return response
  } catch {
    return c.json({
      ok: true,
      data: {
        state: 'degraded',
        activeJobs: 0,
        queueDepth: 0,
        lastRunAt: new Date().toISOString(),
        message: 'Automation status proxy fallback active',
      },
    }, 200)
  }
})

export default v7IntelRouter
