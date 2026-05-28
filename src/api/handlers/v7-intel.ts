import { Hono } from 'hono'
import type { Env } from '../../types/index.js'

export const v7IntelRouter = new Hono<{ Bindings: Env }>()

const UPSTREAM_BASE = 'https://8b39333f.octane-v7.pages.dev'

async function proxyUpstream(path: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)

  try {
    const response = await fetch(`${UPSTREAM_BASE}${path}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
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
  } finally {
    clearTimeout(timeoutId)
  }
}

v7IntelRouter.get('/global', async (c) => {
  try {
    return await proxyUpstream('/api/v7/intel/global')
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
    return await proxyUpstream(`/api/v7/intel/global/${domain}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'intel upstream unavailable'
    return c.json({ ok: false, error: message }, 502)
  }
})

v7IntelRouter.get('/automation/status', async (c) => {
  try {
    const response = await proxyUpstream('/api/v7/automation/status')
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
