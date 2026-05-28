import { create } from 'zustand'
import type {
  CanonicalTelemetryEntity,
  IntelEvent,
  IntelFocusMode,
  IntelGeo,
  IntelLayerKey,
  IntelNode,
  IntelSubsystem,
  IntelFlow,
  IntelMetrics,
  NormalizedIntelBundle,
} from '@/modules/surveillance/intel'

export type IntelConnectionStatus = 'connected' | 'reconnecting' | 'stale' | 'degraded' | 'offline'

type LayerVisibility = Record<IntelLayerKey, boolean>

type IntelConnectionState = {
  status: IntelConnectionStatus
  message: string
  lastUpdateAt: number | null
  lastSuccessAt: number | null
  retries: number
  stale: boolean
}

type IntelStore = {
  entitiesById: Record<string, CanonicalTelemetryEntity>
  nodes: IntelNode[]
  subsystems: IntelSubsystem[]
  flows: IntelFlow[]
  events: IntelEvent[]
  geo: IntelGeo[]
  metrics: IntelMetrics
  generatedAt: number
  layerVisibility: LayerVisibility
  focusMode: IntelFocusMode
  intervalMs: number
  connection: IntelConnectionState
  setIntervalMs: (intervalMs: number) => void
  setLayerVisibility: (layer: IntelLayerKey, visible: boolean) => void
  setFocusMode: (mode: IntelFocusMode) => void
  upsertBundle: (bundle: NormalizedIntelBundle) => void
  setConnectionState: (patch: Partial<IntelConnectionState>) => void
  loadCachedBundle: () => void
}

const CACHE_KEY = 'octane-v7-surveillance-last-good'
const STALE_THRESHOLD_MS = 24_000
const EVENT_TTL_MS = 120_000

const DEFAULT_METRICS: IntelMetrics = {
  cpu: 0,
  memory: 0,
  p95Latency: 0,
  generatedAt: 0,
  raw: {},
}

const DEFAULT_LAYER_VISIBILITY: LayerVisibility = {
  nodes: true,
  subsystems: true,
  flows: true,
  events: true,
  metrics: true,
  geo: true,
}

function toEntityMap(entities: CanonicalTelemetryEntity[]): Record<string, CanonicalTelemetryEntity> {
  return entities.reduce<Record<string, CanonicalTelemetryEntity>>((acc, entity) => {
    acc[entity.id] = entity
    return acc
  }, {})
}

function applyFocusMode(base: LayerVisibility, mode: IntelFocusMode): LayerVisibility {
  if (mode === 'health') {
    return {
      ...base,
      nodes: true,
      subsystems: true,
      flows: false,
      events: false,
      geo: true,
      metrics: true,
    }
  }

  if (mode === 'flow') {
    return {
      ...base,
      nodes: true,
      subsystems: false,
      flows: true,
      events: false,
      geo: true,
      metrics: true,
    }
  }

  return {
    ...base,
    nodes: true,
    subsystems: false,
    flows: false,
    events: true,
    geo: true,
    metrics: true,
  }
}

function persistBundle(bundle: NormalizedIntelBundle): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(bundle))
}

function readCachedBundle(): NormalizedIntelBundle | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(CACHE_KEY)
  if (!raw) return null

  try {
    return JSON.parse(raw) as NormalizedIntelBundle
  } catch {
    return null
  }
}

export const useSurveillanceIntelStore = create<IntelStore>((set, get) => ({
  entitiesById: {},
  nodes: [],
  subsystems: [],
  flows: [],
  events: [],
  geo: [],
  metrics: DEFAULT_METRICS,
  generatedAt: 0,
  layerVisibility: DEFAULT_LAYER_VISIBILITY,
  focusMode: 'health',
  intervalMs: 8_000,
  connection: {
    status: 'reconnecting',
    message: 'Initializing telemetry bridge',
    lastUpdateAt: null,
    lastSuccessAt: null,
    retries: 0,
    stale: false,
  },
  setIntervalMs: (intervalMs) => set({ intervalMs: Math.max(2_000, intervalMs) }),
  setLayerVisibility: (layer, visible) => set((state) => ({
    layerVisibility: {
      ...state.layerVisibility,
      [layer]: visible,
    },
    focusMode: state.focusMode,
  })),
  setFocusMode: (mode) => set((state) => ({
    focusMode: mode,
    layerVisibility: applyFocusMode(state.layerVisibility, mode),
  })),
  upsertBundle: (bundle) => set((state) => {
    const now = Date.now()
    const events = bundle.events
      .filter((event) => event.expiresAt > now)
      .slice(0, 120)

    persistBundle(bundle)

    return {
      entitiesById: toEntityMap(bundle.entities),
      nodes: bundle.nodes,
      subsystems: bundle.subsystems,
      flows: bundle.flows,
      events,
      geo: bundle.geo,
      metrics: bundle.metrics,
      generatedAt: bundle.generatedAt,
      connection: {
        ...state.connection,
        status: 'connected',
        message: 'Telemetry live',
        lastUpdateAt: now,
        lastSuccessAt: now,
        retries: 0,
        stale: false,
      },
    }
  }),
  setConnectionState: (patch) => set((state) => {
    const nextConnection: IntelConnectionState = {
      ...state.connection,
      ...patch,
    }

    const lastReference = nextConnection.lastSuccessAt ?? nextConnection.lastUpdateAt
    const stale = lastReference ? (Date.now() - lastReference) > STALE_THRESHOLD_MS : false
    nextConnection.stale = stale

    if (nextConnection.status === 'connected' && stale) {
      nextConnection.status = 'stale'
      nextConnection.message = 'Telemetry stale - awaiting fresh update'
    }

    if (nextConnection.status === 'reconnecting' && nextConnection.retries >= 3) {
      nextConnection.status = 'degraded'
      nextConnection.message = 'Retrying telemetry with backoff'
    }

    return {
      connection: nextConnection,
      events: state.events
        .filter((event) => event.expiresAt > Date.now() - EVENT_TTL_MS)
        .slice(0, 120),
    }
  }),
  loadCachedBundle: () => {
    const cached = readCachedBundle()
    if (!cached) return

    get().upsertBundle(cached)
    set((state) => ({
      connection: {
        ...state.connection,
        status: 'stale',
        message: 'Loaded cached telemetry',
      },
    }))
  },
}))
