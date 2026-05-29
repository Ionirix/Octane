import { z } from 'zod'

export type IntelLayerKey = 'nodes' | 'subsystems' | 'flows' | 'events' | 'metrics' | 'geo'
export type IntelFocusMode = 'health' | 'flow' | 'event'

export type CanonicalTelemetryType = 'node' | 'subsystem' | 'flow' | 'event' | 'geo'

export type CanonicalTelemetryEntity = {
  id: string
  type: CanonicalTelemetryType
  lat: number
  lon: number
  status: string
  load: number
  signals: Record<string, unknown>
  updatedAt: number
  label?: string
}

export type IntelMetrics = {
  cpu: number
  memory: number
  p95Latency: number
  generatedAt: number
  raw: Record<string, unknown>
}

export type IntelNode = CanonicalTelemetryEntity & {
  type: 'node'
  connections: string[]
}

export type IntelFlow = CanonicalTelemetryEntity & {
  type: 'flow'
  fromId?: string
  toId?: string
}

export type IntelSubsystem = CanonicalTelemetryEntity & {
  type: 'subsystem'
  nodeId?: string
}

export type IntelEvent = CanonicalTelemetryEntity & {
  type: 'event'
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
  expiresAt: number
}

export type IntelGeo = CanonicalTelemetryEntity & {
  type: 'geo'
  radiusKm: number
}

export type NormalizedIntelBundle = {
  generatedAt: number
  entities: CanonicalTelemetryEntity[]
  nodes: IntelNode[]
  subsystems: IntelSubsystem[]
  flows: IntelFlow[]
  events: IntelEvent[]
  geo: IntelGeo[]
  metrics: IntelMetrics
}

const objectRecordSchema = z.record(z.unknown())
const rootSchema = z.object({
  data: objectRecordSchema.optional(),
  nodes: z.array(objectRecordSchema).optional(),
  subsystems: z.array(objectRecordSchema).optional(),
  flows: z.array(objectRecordSchema).optional(),
  events: z.array(objectRecordSchema).optional(),
  geo: z.array(objectRecordSchema).optional(),
  metrics: objectRecordSchema.optional(),
  generatedAt: z.union([z.string(), z.number()]).optional(),
}).passthrough()

type RawObject = Record<string, unknown>

type RawIntelPayload = {
  generatedAt?: number
  nodes: RawObject[]
  subsystems: RawObject[]
  flows: RawObject[]
  events: RawObject[]
  geo: RawObject[]
  metrics: RawObject
}

function asRecord(input: unknown): RawObject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as RawObject
}

function asArray(input: unknown): RawObject[] {
  if (!Array.isArray(input)) return []
  return input.map((entry) => asRecord(entry)).filter((entry): entry is RawObject => Boolean(entry))
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function asTimestamp(value: unknown, fallback: number): number {
  const raw = asNumber(value)
  if (raw !== null) {
    if (raw > 10_000_000_000) return raw
    if (raw > 1_000_000_000) return raw * 1000
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function clampLoad(value: number): number {
  return clamp01(value > 1 ? value / 100 : value)
}

function coarseCoordinate(value: number): number {
  return Math.round(value * 10) / 10
}

function normalizeStatus(value: string): string {
  const lowered = value.trim().toLowerCase()
  if (!lowered) return 'unknown'
  if (lowered.includes('critical') || lowered.includes('down') || lowered.includes('offline')) return 'offline'
  if (lowered.includes('degraded') || lowered.includes('warn') || lowered.includes('error')) return 'degraded'
  if (lowered.includes('idle')) return 'idle'
  if (lowered.includes('active') || lowered.includes('healthy') || lowered.includes('ok') || lowered.includes('nominal')) return 'active'
  return lowered
}

function toLatLon(record: RawObject): { lat: number; lon: number } | null {
  const lat = asNumber(record.lat ?? record.latitude ?? record.y)
  const lon = asNumber(record.lon ?? record.lng ?? record.long ?? record.longitude ?? record.x)
  if (lat !== null && lon !== null) {
    return { lat: coarseCoordinate(lat), lon: coarseCoordinate(lon) }
  }

  const location = asRecord(record.location)
  if (!location) return null
  const nestedLat = asNumber(location.lat ?? location.latitude)
  const nestedLon = asNumber(location.lon ?? location.lng ?? location.longitude)
  if (nestedLat === null || nestedLon === null) return null
  return { lat: coarseCoordinate(nestedLat), lon: coarseCoordinate(nestedLon) }
}

function toEntity(type: CanonicalTelemetryType, record: RawObject, now: number, index: number): CanonicalTelemetryEntity | null {
  const point = toLatLon(record)
  if (!point) return null

  const id = asString(record.id || record.key || record.uuid || `${type}-${index}`)
  const status = normalizeStatus(asString(record.status ?? record.health ?? record.state ?? 'active'))
  const load = clampLoad(asNumber(record.load ?? record.utilization ?? record.pressure ?? record.intensity ?? 0.4) ?? 0.4)
  const updatedAt = asTimestamp(record.updatedAt ?? record.timestamp ?? record.generatedAt, now)
  const label = asString(record.label ?? record.name ?? record.title, '') || undefined

  return {
    id,
    type,
    lat: point.lat,
    lon: point.lon,
    status,
    load,
    signals: record,
    updatedAt,
    label,
  }
}

function parseRawPayload(input: unknown): RawIntelPayload {
  const parsed = rootSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error('Invalid global intel payload shape')
  }

  const root = parsed.data
  const data = asRecord(root.data) ?? {}
  const generatedAt = asTimestamp(root.generatedAt ?? data.generatedAt, Date.now())

  return {
    generatedAt,
    nodes: asArray(root.nodes ?? data.nodes),
    subsystems: asArray(root.subsystems ?? data.subsystems),
    flows: asArray(root.flows ?? data.flows),
    events: asArray(root.events ?? data.events),
    geo: asArray(root.geo ?? data.geo),
    metrics: asRecord(root.metrics ?? data.metrics) ?? {},
  }
}

function mergeSignals(...parts: Array<Record<string, unknown>>): Record<string, unknown> {
  return parts.reduce<Record<string, unknown>>((acc, part) => ({ ...acc, ...part }), {})
}

function eventSeverity(entity: CanonicalTelemetryEntity): IntelEvent['severity'] {
  if (entity.status === 'offline') return 'CRITICAL'
  if (entity.status === 'degraded') return 'WARNING'
  const load = entity.load
  if (load >= 0.92) return 'EMERGENCY'
  if (load >= 0.78) return 'CRITICAL'
  if (load >= 0.6) return 'WARNING'
  return 'INFO'
}

function parseMetrics(metricsRaw: RawObject, generatedAt: number): IntelMetrics {
  const cpu = clampLoad(asNumber(metricsRaw.cpu ?? metricsRaw.cpuLoad ?? metricsRaw.cpuUtilization ?? 0.42) ?? 0.42)
  const memory = clampLoad(asNumber(metricsRaw.memory ?? metricsRaw.memoryLoad ?? metricsRaw.memoryUtilization ?? 0.36) ?? 0.36)
  const p95Latency = Math.max(0, asNumber(metricsRaw.p95 ?? metricsRaw.p95Latency ?? metricsRaw.latencyP95 ?? 84) ?? 84)
  return {
    cpu,
    memory,
    p95Latency,
    generatedAt: asTimestamp(metricsRaw.generatedAt ?? metricsRaw.timestamp, generatedAt),
    raw: metricsRaw,
  }
}

function collectFlowLinks(flows: RawObject[]): Map<string, string[]> {
  const links = new Map<string, Set<string>>()

  flows.forEach((flow) => {
    const fromId = asString(flow.fromId ?? flow.sourceId ?? flow.from ?? flow.source)
    const toId = asString(flow.toId ?? flow.targetId ?? flow.to ?? flow.target)
    if (!fromId || !toId) return

    if (!links.has(fromId)) links.set(fromId, new Set())
    if (!links.has(toId)) links.set(toId, new Set())
    links.get(fromId)?.add(toId)
    links.get(toId)?.add(fromId)
  })

  return new Map(Array.from(links.entries()).map(([key, value]) => [key, Array.from(value)]))
}

export function normalizeIntelBundle(input: unknown, fallbackNow = Date.now()): NormalizedIntelBundle {
  const raw = parseRawPayload(input)
  const now = raw.generatedAt || fallbackNow

  const flowLinks = collectFlowLinks(raw.flows)

  const nodes: IntelNode[] = raw.nodes
    .map((record, index) => toEntity('node', record, now, index))
    .filter((entry): entry is CanonicalTelemetryEntity => Boolean(entry))
    .map((entity) => ({
      ...entity,
      type: 'node',
      connections: flowLinks.get(entity.id) ?? asArray(entity.signals.connections).map((entry) => asString(entry.id ?? entry)).filter(Boolean),
    }))

  const subsystems: IntelSubsystem[] = raw.subsystems
    .flatMap((record, index) => {
      const entity = toEntity('subsystem', record, now, index)
      if (!entity) return []
      return [{
        ...entity,
        type: 'subsystem' as const,
        nodeId: asString(record.nodeId ?? record.anchorNodeId) || undefined,
      }]
    })

  const flows: IntelFlow[] = raw.flows
    .flatMap((record, index) => {
      const entity = toEntity('flow', record, now, index)
      if (!entity) return []
      return [{
        ...entity,
        type: 'flow' as const,
        fromId: asString(record.fromId ?? record.sourceId ?? record.from ?? record.source) || undefined,
        toId: asString(record.toId ?? record.targetId ?? record.to ?? record.target) || undefined,
      }]
    })

  const events: IntelEvent[] = raw.events
    .map((record, index) => {
      const entity = toEntity('event', record, now, index)
      if (!entity) return null
      const ttlSeconds = Math.max(20, asNumber(record.ttlSeconds ?? record.ttl ?? 120) ?? 120)
      return {
        ...entity,
        type: 'event' as const,
        severity: eventSeverity(entity),
        expiresAt: entity.updatedAt + (ttlSeconds * 1000),
      }
    })
    .filter((entry): entry is IntelEvent => Boolean(entry))

  const geo: IntelGeo[] = raw.geo
    .map((record, index) => {
      const entity = toEntity('geo', record, now, index)
      if (!entity) return null
      return {
        ...entity,
        type: 'geo' as const,
        radiusKm: Math.max(80, asNumber(record.radiusKm ?? record.radius ?? 240) ?? 240),
      }
    })
    .filter((entry): entry is IntelGeo => Boolean(entry))

  const entities: CanonicalTelemetryEntity[] = [
    ...nodes,
    ...subsystems,
    ...flows,
    ...events,
    ...geo,
  ].map((entity) => ({
    ...entity,
    signals: mergeSignals(entity.signals, {
      canonicalType: entity.type,
      canonicalStatus: entity.status,
      canonicalLoad: entity.load,
    }),
  }))

  return {
    generatedAt: now,
    entities,
    nodes,
    subsystems,
    flows,
    events,
    geo,
    metrics: parseMetrics(raw.metrics, now),
  }
}

export type IntelClientOptions = {
  baseUrl?: string
  timeoutMs?: number
  authToken?: string
  headers?: Record<string, string>
}

type IntelBridgeMode = 'protected' | 'public'

export type IntelBridgeRuntime = {
  mode: IntelBridgeMode
  baseUrl: string
  fallbackBaseUrl: boolean
  timeoutMs: number
  retries: number
}

const DEFAULT_BASE_URL = 'https://8b39333f.octane-v7.pages.dev'
const DEFAULT_MODE: IntelBridgeMode = 'protected'
const DEFAULT_TIMEOUT_MS = 6_500
const DEFAULT_RETRIES = 1

function readEnvVar(key: string): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  return (env[key] ?? '').trim()
}

function normalizeBaseUrl(value: string): string | null {
  if (!value) return null
  if (value.startsWith('/')) return value.replace(/\/$/, '') || '/'

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

function normalizeMode(value: string): IntelBridgeMode {
  return value.toLowerCase() === 'public' ? 'public' : DEFAULT_MODE
}

function normalizePositiveInteger(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  const rounded = Math.round(parsed)
  if (rounded < min) return min
  if (rounded > max) return max
  return rounded
}

export function getIntelBridgeRuntime(): IntelBridgeRuntime {
  const mode = normalizeMode(readEnvVar('VITE_OCTANE_V7_INTEL_MODE'))
  const configuredPublicBase = normalizeBaseUrl(readEnvVar('VITE_OCTANE_V7_INTEL_BASE_URL'))
  const protectedBase = '/api'
  const publicBase = configuredPublicBase ?? DEFAULT_BASE_URL

  return {
    mode,
    baseUrl: mode === 'protected' ? protectedBase : publicBase,
    fallbackBaseUrl: mode === 'public' && !configuredPublicBase,
    timeoutMs: normalizePositiveInteger(readEnvVar('VITE_OCTANE_V7_INTEL_TIMEOUT_MS'), DEFAULT_TIMEOUT_MS, 2_000, 20_000),
    retries: normalizePositiveInteger(readEnvVar('VITE_OCTANE_V7_INTEL_RETRIES'), DEFAULT_RETRIES, 0, 3),
  }
}

function getPublicModeToken(): string | null {
  const runtime = getIntelBridgeRuntime()
  if (runtime.mode !== 'public') return null
  const token = readEnvVar('VITE_OCTANE_V7_INTEL_TOKEN')
  return token ? token : null
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number, headers: Record<string, string>): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`intel_http_${response.status}`)
    }

    return response.json()
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function unwrapData(payload: unknown): unknown {
  const asObject = asRecord(payload)
  if (!asObject) return payload
  return asObject.data ?? payload
}

async function fetchDomainIntelBundle(baseUrl: string, timeoutMs: number, headers: Record<string, string>): Promise<NormalizedIntelBundle> {
  const endpointMap = {
    nodes: '/v7/intel/global/nodes',
    subsystems: '/v7/intel/global/subsystems',
    flows: '/v7/intel/global/flows',
    events: '/v7/intel/global/events',
    metrics: '/v7/intel/global/metrics',
    geo: '/v7/intel/global/geo',
  } as const

  const results = await Promise.allSettled(
    Object.values(endpointMap).map((path) => fetchJsonWithTimeout(`${baseUrl}${path}`, timeoutMs, headers)),
  )

  const byKey = Object.keys(endpointMap) as Array<keyof typeof endpointMap>
  const stitched: Record<string, unknown> = {
    generatedAt: Date.now(),
  }

  byKey.forEach((key, index) => {
    const result = results[index]
    if (result.status !== 'fulfilled') return
    stitched[key] = unwrapData(result.value)
  })

  return normalizeIntelBundle(stitched)
}

export async function fetchGlobalIntelBundle(options: IntelClientOptions = {}): Promise<NormalizedIntelBundle> {
  const runtime = getIntelBridgeRuntime()
  const requestedBaseUrl = options.baseUrl
  const timeoutMs = options.timeoutMs ?? runtime.timeoutMs
  const retries = runtime.retries
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...options.headers,
  }

  const effectiveAuthToken = options.authToken ?? getPublicModeToken()
  if (effectiveAuthToken) {
    headers.authorization = `Bearer ${effectiveAuthToken}`
  }

  const baseCandidates = requestedBaseUrl
    ? [requestedBaseUrl]
    : [runtime.baseUrl]

  let lastError: Error | null = null

  for (const baseUrl of baseCandidates) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const payload = await fetchJsonWithTimeout(`${baseUrl}/v7/intel/global`, timeoutMs, headers)
        return normalizeIntelBundle(payload)
      } catch (globalError) {
        try {
          return await fetchDomainIntelBundle(baseUrl, timeoutMs, headers)
        } catch (domainError) {
          lastError = domainError instanceof Error
            ? domainError
            : globalError instanceof Error
              ? globalError
              : new Error(String(domainError))
        }
      }

      if (attempt < retries) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 250 * (attempt + 1))
        })
      }
    }
  }

  throw (lastError ?? new Error('Unable to fetch global intel'))
}

export type IntelTransportCallbacks = {
  onMessage: (bundle: NormalizedIntelBundle) => void
  onError: (error: Error) => void
  onState?: (state: { connected: boolean; retries: number }) => void
}

export type IntelTransportAdapter = {
  start: () => void
  stop: () => void
}

export type PollingTransportOptions = IntelClientOptions & {
  intervalMs: number
  maxRetries?: number
  initialBackoffMs?: number
}

export function createPollingIntelTransport(
  options: PollingTransportOptions,
  callbacks: IntelTransportCallbacks,
): IntelTransportAdapter {
  let running = false
  let timer: number | null = null

  const maxRetries = options.maxRetries ?? 3
  const initialBackoffMs = options.initialBackoffMs ?? 400

  const schedule = (delayMs: number, task: () => void) => {
    if (!running) return
    if (timer !== null) {
      window.clearTimeout(timer)
    }
    timer = window.setTimeout(task, delayMs)
  }

  const tick = async () => {
    if (!running) return

    let attempt = 0
    while (attempt <= maxRetries && running) {
      try {
        const bundle = await fetchGlobalIntelBundle(options)
        callbacks.onMessage(bundle)
        callbacks.onState?.({ connected: true, retries: attempt })
        schedule(options.intervalMs, () => {
          void tick()
        })
        return
      } catch (error) {
        attempt += 1
        const normalizedError = error instanceof Error ? error : new Error(String(error))
        callbacks.onError(normalizedError)
        callbacks.onState?.({ connected: false, retries: attempt })
        if (attempt > maxRetries) break
        const delayMs = initialBackoffMs * (2 ** (attempt - 1))
        await new Promise<void>((resolve) => {
          window.setTimeout(() => resolve(), delayMs)
        })
      }
    }

    schedule(options.intervalMs, () => {
      void tick()
    })
  }

  return {
    start: () => {
      if (running) return
      running = true
      void tick()
    },
    stop: () => {
      running = false
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    },
  }
}
