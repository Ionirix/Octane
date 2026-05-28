import { fetchGlobalIntelBundle, type NormalizedIntelBundle } from '@/modules/surveillance/intel'

export type AutomationStatus = {
  state: 'nominal' | 'degraded' | 'critical'
  activeJobs: number
  queueDepth: number
  lastRunAt: number
  message: string
}

type JsonObject = Record<string, unknown>

function asObject(input: unknown): JsonObject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as JsonObject
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asTimestamp(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

export async function fetchV7IntelGlobal(baseUrl = '/api'): Promise<NormalizedIntelBundle> {
  return fetchGlobalIntelBundle({ baseUrl })
}

export async function fetchV7AutomationStatus(baseUrl = '/api'): Promise<AutomationStatus> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 6500)

  try {
    const response = await fetch(`${baseUrl}/v7/intel/automation/status`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`automation_http_${response.status}`)
    }

    const payload = await response.json() as unknown
    const root = asObject(payload)
    const data = asObject(root?.data) ?? root ?? {}

    const stateRaw = asString(data.state ?? data.status ?? 'nominal', 'nominal').toLowerCase()
    const state = stateRaw.includes('critical')
      ? 'critical'
      : stateRaw.includes('degraded') || stateRaw.includes('warn')
        ? 'degraded'
        : 'nominal'

    return {
      state,
      activeJobs: asNumber(data.activeJobs ?? data.active_jobs ?? 0, 0),
      queueDepth: asNumber(data.queueDepth ?? data.queue_depth ?? 0, 0),
      lastRunAt: asTimestamp(data.lastRunAt ?? data.last_run_at, Date.now()),
      message: asString(data.message ?? data.summary ?? 'Automation status available', 'Automation status available'),
    }
  } catch {
    return {
      state: 'degraded',
      activeJobs: 0,
      queueDepth: 0,
      lastRunAt: Date.now(),
      message: 'Automation status unavailable - degraded fallback applied',
    }
  } finally {
    window.clearTimeout(timeoutId)
  }
}
