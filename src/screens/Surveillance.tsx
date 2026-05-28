import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Radar, RefreshCcw, Server } from 'lucide-react'
import { SurveillanceMap } from '@/components/surveillance/SurveillanceMap'
import { createPollingIntelTransport, type IntelFocusMode } from '@/modules/surveillance/intel'
import { runFusionCycle } from '@/modules/fusion'
import { useFusedEventStore } from '@/modules/fusion/event-store'
import { emitTelemetryEvent, type TelemetrySample } from '@/modules/visualization/telemetry'
import type { VisualizationAlert, VisualizationGeoOverlay, VisualizationNode, VisualizationSubsystem } from '@/modules/visualization/types'
import { useSurveillanceIntelStore } from '@/state/surveillance-intel'
import { Panel } from '@components/primitives/Panel'
import { MetricCard } from '@components/primitives/MetricCard'
import { StatusBadge } from '@components/primitives/StatusBadge'

type AudioBands = {
  bass: number
  mid: number
  treble: number
  pulse: number
  beat: number
}

type GlobalEventCategory = 'traffic' | 'weather' | 'wildfire' | 'police' | 'service'

type SurveillanceAlertFeed = {
  id: string
  type: string
  severity: VisualizationAlert['severity']
  title: string
  description: string
  probability?: number
  confidence?: number
  serverId?: string
  timestamp: number
  resolved: boolean
  resolvedAt?: number
}

const FALLBACK_NODES: VisualizationNode[] = [
  { id: 'edge-na', name: 'EDGE NA', country: 'United States', region: 'North America', lat: 39.8, lng: -98.6, status: 'NOMINAL', latencyMs: 36, loadPercent: 48, requestsPerMin: 22400, connections: ['edge-eu', 'edge-apac'] },
  { id: 'edge-eu', name: 'EDGE EU', country: 'Germany', region: 'Europe', lat: 51.2, lng: 10.4, status: 'NOMINAL', latencyMs: 54, loadPercent: 42, requestsPerMin: 19700, connections: ['edge-na', 'edge-apac'] },
  { id: 'edge-apac', name: 'EDGE APAC', country: 'Singapore', region: 'Asia Pacific', lat: 1.3, lng: 103.8, status: 'DEGRADED', latencyMs: 112, loadPercent: 76, requestsPerMin: 15100, connections: ['edge-na', 'edge-eu'] },
]

const FEED_TIMELINE_LIMIT = 96
const STALE_THRESHOLD_MS = 24_000

function normalizeAlertCategory(rawType: string): GlobalEventCategory {
  const value = rawType.trim().toLowerCase()
  if (value.includes('wildfire') || value.includes('wild fire') || value.includes('brush fire') || value.includes('forest fire') || value.includes('fire')) return 'wildfire'
  if (value.includes('weather') || value.includes('storm') || value.includes('flood') || value.includes('wind')) return 'weather'
  if (value.includes('police') || value.includes('law') || value.includes('crime') || value.includes('security')) return 'police'
  if (value.includes('service') || value.includes('closure') || value.includes('utility') || value.includes('maintenance') || value.includes('outage')) return 'service'
  return 'traffic'
}

function mapStatus(status: string): VisualizationNode['status'] {
  const value = status.toLowerCase()
  if (value.includes('offline') || value.includes('critical')) return 'OFFLINE'
  if (value.includes('degraded') || value.includes('warn')) return 'DEGRADED'
  return 'NOMINAL'
}

function formatAgo(timestamp: number, now: number): string {
  const minutes = Math.max(1, Math.round((now - timestamp) / 60_000))
  return minutes === 1 ? '1 min ago' : `${minutes} mins ago`
}

function mergeFeedTimeline(
  existing: SurveillanceAlertFeed[],
  previousActiveById: Map<string, SurveillanceAlertFeed>,
  nextActiveById: Map<string, SurveillanceAlertFeed>,
  now: number,
): SurveillanceAlertFeed[] {
  const timeline = [...existing]

  nextActiveById.forEach((activeAlert, id) => {
    const existingActiveIndex = timeline.findIndex((entry) => entry.id === id && !entry.resolved)
    if (existingActiveIndex >= 0) {
      const originalTimestamp = timeline[existingActiveIndex].timestamp
      timeline[existingActiveIndex] = {
        ...timeline[existingActiveIndex],
        ...activeAlert,
        resolved: false,
        timestamp: originalTimestamp,
      }
      return
    }

    timeline.unshift({
      ...activeAlert,
      resolved: false,
      timestamp: Math.max(activeAlert.timestamp, now - 60_000),
    })
  })

  previousActiveById.forEach((previousAlert, id) => {
    if (nextActiveById.has(id)) return

    const openIndex = timeline.findIndex((entry) => entry.id === id && !entry.resolved)
    if (openIndex >= 0) {
      timeline[openIndex] = {
        ...timeline[openIndex],
        resolved: true,
        resolvedAt: now,
      }
      return
    }

    timeline.unshift({
      ...previousAlert,
      id: `${id}:resolved:${now}`,
      resolved: true,
      resolvedAt: now,
      timestamp: now,
    })
  })

  return timeline
    .sort((left, right) => (right.resolvedAt ?? right.timestamp) - (left.resolvedAt ?? left.timestamp))
    .slice(0, FEED_TIMELINE_LIMIT)
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = values.length > 0 ? values : [0]
  const max = Math.max(...points, 1)
  const min = Math.min(...points, 0)
  const range = max - min || 1
  const encoded = points
    .slice(-72)
    .map((value, index, arr) => {
      const x = (index / Math.max(arr.length - 1, 1)) * 100
      const y = 100 - (((value - min) / range) * 100)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-10 w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="3" points={encoded} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function Surveillance() {
  const [altitude, setAltitude] = useState(78)
  const [clockNow, setClockNow] = useState(Date.now())
  const [focusedNodeId, setFocusedNodeId] = useState('edge-na')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<number>(Date.now())
  const [feedAlerts, setFeedAlerts] = useState<SurveillanceAlertFeed[]>([])
  const [alertFeedClearedAt, setAlertFeedClearedAt] = useState<number>(0)
  const [telemetrySamples, setTelemetrySamples] = useState<TelemetrySample[]>([])
  const [wireframesVisible, setWireframesVisible] = useState(true)
  const [audioStatus, setAudioStatus] = useState('AUDIO OFF')
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioBands, setAudioBands] = useState<AudioBands>({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
  const [fusionAutomationState, setFusionAutomationState] = useState('nominal')

  const activeAlertIndexRef = useRef<Map<string, SurveillanceAlertFeed>>(new Map())
  const audioBandsRef = useRef<AudioBands>({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
  const audioRef = useRef<{ context?: AudioContext; analyser?: AnalyserNode; source?: MediaStreamAudioSourceNode; stream?: MediaStream; raf?: number }>({})
  const transportRef = useRef<{ stop: () => void } | null>(null)

  const nodesRaw = useSurveillanceIntelStore((state) => state.nodes)
  const subsystemsRaw = useSurveillanceIntelStore((state) => state.subsystems)
  const flowsRaw = useSurveillanceIntelStore((state) => state.flows)
  const eventsRaw = useSurveillanceIntelStore((state) => state.events)
  const geoRaw = useSurveillanceIntelStore((state) => state.geo)
  const metrics = useSurveillanceIntelStore((state) => state.metrics)
  const generatedAt = useSurveillanceIntelStore((state) => state.generatedAt)
  const layerVisibility = useSurveillanceIntelStore((state) => state.layerVisibility)
  const focusMode = useSurveillanceIntelStore((state) => state.focusMode)
  const intervalMs = useSurveillanceIntelStore((state) => state.intervalMs)
  const connection = useSurveillanceIntelStore((state) => state.connection)
  const setIntervalMs = useSurveillanceIntelStore((state) => state.setIntervalMs)
  const setLayerVisibility = useSurveillanceIntelStore((state) => state.setLayerVisibility)
  const setFocusMode = useSurveillanceIntelStore((state) => state.setFocusMode)
  const upsertBundle = useSurveillanceIntelStore((state) => state.upsertBundle)
  const setConnectionState = useSurveillanceIntelStore((state) => state.setConnectionState)
  const loadCachedBundle = useSurveillanceIntelStore((state) => state.loadCachedBundle)
  const fusedEvents = useFusedEventStore((state) => state.getFilteredEvents())
  const setFusedEvents = useFusedEventStore((state) => state.setEvents)

  const nodes = useMemo<VisualizationNode[]>(() => {
    if (nodesRaw.length === 0) return FALLBACK_NODES
    return nodesRaw.map((node) => {
      const signals = node.signals
      const signalLatency = typeof signals.latencyMs === 'number' ? signals.latencyMs : null
      const signalRequests = typeof signals.requestsPerMin === 'number' ? signals.requestsPerMin : null
      const region = typeof signals.region === 'string' ? signals.region : 'Global region'
      const country = typeof signals.country === 'string' ? signals.country : 'Global'
      return {
        id: node.id,
        name: node.label ?? node.id.toUpperCase(),
        country,
        region,
        lat: node.lat,
        lng: node.lon,
        status: mapStatus(node.status),
        latencyMs: Math.round(signalLatency ?? metrics.p95Latency ?? 62),
        loadPercent: Math.round(node.load * 100),
        requestsPerMin: Math.round(signalRequests ?? 4_200 + (node.load * 22_000)),
        connections: node.connections,
      }
    })
  }, [metrics.p95Latency, nodesRaw])

  const events = useMemo<VisualizationAlert[]>(() => eventsRaw.map((event) => ({
    id: event.id,
    type: event.label ?? event.type,
    severity: event.severity,
    title: event.label ?? event.id,
    description: typeof event.signals.description === 'string' ? event.signals.description : 'Live event pulse from global intel feed.',
    serverId: typeof event.signals.nodeId === 'string' ? event.signals.nodeId : undefined,
    timestamp: event.updatedAt,
    lat: event.lat,
    lng: event.lon,
    resolved: false,
  })), [eventsRaw])

  const fusedVisualizationEvents = useMemo<VisualizationAlert[]>(() => fusedEvents.map((event) => ({
    id: event.eventId,
    type: event.eventType,
    severity: event.severity,
    title: event.eventType,
    description: `${event.category} event · status ${event.status} · trend ${event.trend}`,
    timestamp: event.updatedAt,
    lat: event.lat,
    lng: event.lon,
    resolved: event.status === 'resolved',
    probability: event.probability,
    confidence: event.confidence,
    impactScore: event.impactScore,
    priority: event.priority,
    trend: event.trend,
    recommendation: event.recommendation,
    simulatedEvidence: event.simulatedEvidence,
    realWorldEvidence: event.realWorldEvidence,
  })), [fusedEvents])

  const subsystems = useMemo<VisualizationSubsystem[]>(() => subsystemsRaw.map((entry) => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    lat: entry.lat,
    lng: entry.lon,
    status: mapStatus(entry.status),
    load: entry.load,
    updatedAt: entry.updatedAt,
  })), [subsystemsRaw])

  const geo = useMemo<VisualizationGeoOverlay[]>(() => geoRaw.map((entry) => ({
    id: entry.id,
    label: entry.label ?? entry.id,
    lat: entry.lat,
    lng: entry.lon,
    status: entry.status,
    load: entry.load,
    radiusKm: entry.radiusKm,
  })), [geoRaw])

  const activeEvents = fusedVisualizationEvents.length > 0 ? fusedVisualizationEvents : events
  const mapEvents = activeEvents.filter((event) => {
    if (typeof event.lat !== 'number' || typeof event.lng !== 'number') return false
    return !(Math.abs(event.lat) < 0.01 && Math.abs(event.lng) < 0.01)
  })

  const visibleNodes = layerVisibility.nodes ? nodes : []
  const visibleEvents = layerVisibility.events ? mapEvents : []
  const visibleSubsystems = layerVisibility.subsystems ? subsystems : []
  const visibleGeo = layerVisibility.geo ? geo : []

  const focusedNode = useMemo(() => visibleNodes.find((node) => node.id === focusedNodeId) ?? visibleNodes[0] ?? nodes[0] ?? FALLBACK_NODES[0], [focusedNodeId, nodes, visibleNodes])

  const audioReactiveEnabled = audioStatus !== 'AUDIO OFF' && audioStatus !== 'REQUESTING...'
  const audioReactiveState = useMemo(() => ({ enabled: audioReactiveEnabled, level: audioLevel, bands: audioBands }), [audioReactiveEnabled, audioLevel, audioBands])

  const reloadNow = useCallback(async () => {
    setConnectionState({ status: 'reconnecting', message: 'Manual refresh in progress', retries: 0, lastUpdateAt: Date.now() })
    try {
      const { fetchGlobalIntelBundle } = await import('@/modules/surveillance/intel')
      const bundle = await fetchGlobalIntelBundle({ timeoutMs: 6_500 })
      upsertBundle(bundle)
      setError(null)
      setLoading(false)
      setLastSync(Date.now())
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError))
      setConnectionState({ status: 'degraded', message: 'Manual refresh failed', retries: 1, lastUpdateAt: Date.now() })
    }
  }, [setConnectionState, upsertBundle])

  useEffect(() => {
    audioBandsRef.current = audioBands
  }, [audioBands])

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 1_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    loadCachedBundle()
    const transport = createPollingIntelTransport(
      { intervalMs, timeoutMs: 6_500 },
      {
        onMessage: (bundle) => {
          upsertBundle(bundle)
          setError(null)
          setLoading(false)
          setLastSync(Date.now())
        },
        onError: (transportError) => {
          setError(transportError.message)
        },
        onState: (state) => {
          if (state.connected) {
            setConnectionState({ status: 'connected', message: 'Telemetry live', retries: state.retries, lastUpdateAt: Date.now() })
            return
          }
          setConnectionState({ status: state.retries >= 3 ? 'degraded' : 'reconnecting', message: 'Retrying telemetry with exponential backoff', retries: state.retries, lastUpdateAt: Date.now() })
        },
      },
    )

    transport.start()
    transportRef.current = transport

    return () => {
      transport.stop()
      transportRef.current = null
    }
  }, [intervalMs, loadCachedBundle, setConnectionState, upsertBundle])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setConnectionState({})
    }, 4_000)

    return () => window.clearInterval(timer)
  }, [setConnectionState])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const result = await runFusionCycle('/api')
        if (cancelled) return
        setFusedEvents(result.events)
        setFusionAutomationState(result.diagnostics.automationState)
        setError(null)
        setLoading(false)
      } catch (fusionError) {
        if (cancelled) return
        setError(fusionError instanceof Error ? fusionError.message : String(fusionError))
      }
    }

    void run()
    const timer = window.setInterval(() => {
      void run()
    }, Math.max(5_000, intervalMs))

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [intervalMs, setFusedEvents])

  useEffect(() => {
    const activeFeed = activeEvents
      .filter((event) => !event.resolved)
      .sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0))
      .map<SurveillanceAlertFeed>((event) => ({
        id: event.id,
        type: event.type,
        severity: event.severity,
        title: event.title ?? event.type,
        description: event.description ?? 'Live event signal',
        probability: event.probability,
        confidence: event.confidence,
        serverId: event.serverId,
        timestamp: event.timestamp ?? Date.now(),
        resolved: false,
      }))

    const previousActiveById = activeAlertIndexRef.current
    const nextActiveById = new Map(activeFeed.map((alert) => [alert.id, alert]))
    activeAlertIndexRef.current = nextActiveById

    setFeedAlerts((current) => mergeFeedTimeline(current, previousActiveById, nextActiveById, Date.now()))
  }, [activeEvents])

  useEffect(() => {
    const weatherAlerts = activeEvents.filter((alert) => normalizeAlertCategory(alert.type) === 'weather').length
    const trafficAlerts = activeEvents.filter((alert) => normalizeAlertCategory(alert.type) === 'traffic').length
    const avgLoad = visibleNodes.reduce((sum, node) => sum + (node.loadPercent ?? 0), 0) / Math.max(1, visibleNodes.length)

    const liveSample: TelemetrySample = {
      timestamp: Date.now(),
      alerts: activeEvents.length,
      traffic: Math.max(0, Math.min(1, (avgLoad / 100) * 0.76 + Math.min(trafficAlerts, 8) * 0.03)),
      weather: Math.max(0, Math.min(1, (weatherAlerts / Math.max(activeEvents.length, 1)) * 0.9)),
    }

    setTelemetrySamples((current) => [...current.slice(-119), liveSample])
  }, [activeEvents, visibleNodes])

  useEffect(() => {
    emitTelemetryEvent('scene:focus', { focusedNodeId: focusedNode.id })
  }, [focusedNode.id])

  const stopAudioReactive = useCallback(() => {
    const current = audioRef.current
    if (current.raf) window.cancelAnimationFrame(current.raf)
    current.stream?.getTracks().forEach((track) => track.stop())
    current.source?.disconnect()
    current.analyser?.disconnect()
    current.context?.close().catch(() => undefined)
    audioRef.current = {}
    setAudioLevel(0)
    setAudioBands({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
    setAudioStatus('AUDIO OFF')
  }, [])

  const startAudioReactive = useCallback(async () => {
    if (audioRef.current.stream) {
      stopAudioReactive()
      return
    }

    setAudioStatus('REQUESTING...')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.86
      const source = context.createMediaStreamSource(stream)
      source.connect(analyser)

      const frequencies = new Uint8Array(analyser.frequencyBinCount)
      const readBand = (start: number, end: number) => {
        const s = Math.max(0, start)
        const e = Math.min(frequencies.length, end)
        if (e <= s) return 0
        let sum = 0
        for (let index = s; index < e; index += 1) sum += frequencies[index]
        return sum / ((e - s) * 255)
      }

      const loop = () => {
        analyser.getByteFrequencyData(frequencies)
        const energy = frequencies.reduce((sum, value) => sum + value, 0) / (frequencies.length * 255)
        const bass = readBand(0, Math.max(1, Math.floor(frequencies.length * 0.12)))
        const mid = readBand(Math.floor(frequencies.length * 0.12), Math.max(2, Math.floor(frequencies.length * 0.5)))
        const treble = readBand(Math.floor(frequencies.length * 0.5), frequencies.length)
        const pulse = Math.max(0, Math.min(1, (energy * 0.55) + (bass * 0.45)))
        const beat = Math.max(0, Math.min(1, (bass * 1.1) + (energy * 0.22) - (audioBandsRef.current.bass * 0.35)))
        const nextBands = { bass, mid, treble, pulse, beat }
        audioBandsRef.current = nextBands
        setAudioLevel(Math.max(0, Math.min(1, energy)))
        setAudioBands(nextBands)
        audioRef.current.raf = window.requestAnimationFrame(loop)
      }

      audioRef.current = { context, analyser, source, stream }
      setAudioStatus('MIC LIVE')
      loop()
    } catch {
      stopAudioReactive()
    }
  }, [stopAudioReactive])

  useEffect(() => stopAudioReactive, [stopAudioReactive])

  const closureFeed = useMemo(() => {
    return feedAlerts
      .filter((alert) => (alert.resolvedAt ?? alert.timestamp) >= alertFeedClearedAt)
      .slice(0, 24)
  }, [alertFeedClearedAt, feedAlerts])

  const liveCategoryCounts = useMemo(() => activeEvents.reduce<Record<GlobalEventCategory, number>>((acc, alert) => {
    const category = normalizeAlertCategory(`${alert.type} ${alert.title} ${alert.description}`)
    acc[category] += 1
    return acc
  }, { traffic: 0, weather: 0, wildfire: 0, police: 0, service: 0 }), [activeEvents])

  const stale = (Date.now() - (connection.lastSuccessAt ?? lastSync)) > STALE_THRESHOLD_MS
  const mapSubtitle = 'v7 global intel layered over the v6 sovereign surveillance surface.'

  return (
    <div className="oct-screen space-y-3 md:space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,_rgba(0,245,255,0.12),_transparent_42%),linear-gradient(180deg,_rgba(10,16,28,0.96),_rgba(4,8,15,0.98))] p-4 md:p-5 overflow-hidden relative shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]"><Radar size={12} /> v6 x v7 SURVEILLANCE FUSION</div>
        <h2 className="mt-2 text-2xl md:text-4xl font-black leading-tight tracking-tight">Global Intelligence Diagnostics Surface</h2>
        <p className="mt-2 max-w-3xl text-sm md:text-[13px] text-[var(--muted)] leading-6">Live global intel is normalized, layered, and rendered on one map canvas with stale-state fallback and stream-ready transport boundaries.</p>
      </div>

      <div className="oct-grid-4">
        <MetricCard label="Nodes" value={visibleNodes.length} accent="var(--accent)" sub="Global compute anchors" />
        <MetricCard label="Active Events" value={activeEvents.length} accent="var(--warn)" sub={`Live intelligence pulses · automation ${fusionAutomationState}`} />
        <MetricCard label="p95 Latency" value={Math.round(metrics.p95Latency || 0)} unit="ms" accent="var(--stellar)" sub="Metrics layer" />
        <MetricCard label="CPU / Memory" value={`${Math.round(metrics.cpu * 100)} / ${Math.round(metrics.memory * 100)}`} unit="%" accent="var(--accent-2)" sub={`Generated ${formatAgo(metrics.generatedAt || generatedAt || Date.now(), clockNow)}`} />
      </div>

      <Panel title="Map Controls" subtitle="status, layers, and transport control strip">
        <div className="grid gap-2 pt-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em]">
              <div className="flex items-center gap-2">
                <StatusBadge status={connection.status === 'connected' ? 'ok' : connection.status === 'stale' ? 'warn' : connection.status === 'degraded' ? 'crit' : 'info'} label={connection.status.toUpperCase()} />
                <span className="text-[var(--muted)]">{connection.message}</span>
                <span className={`rounded border px-2 py-1 ${stale ? 'border-[var(--warn)] text-[var(--warn)]' : 'border-[var(--border)] text-[var(--muted)]'}`}>{stale ? 'STALE DATA' : 'FRESH'}</span>
              </div>
              <span className="text-[var(--muted)]">Last sync {new Date(lastSync).toLocaleTimeString('en', { hour12: false })}</span>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => void startAudioReactive()} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{audioStatus === 'AUDIO OFF' ? 'Enable Audio' : 'Disable Audio'}</button>
              <button type="button" onClick={() => setWireframesVisible((current) => !current)} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{wireframesVisible ? 'Hide Wireframes' : 'Show Wireframes'}</button>
              <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">Refresh</span>
              <select
                value={intervalMs}
                onChange={(event) => setIntervalMs(Number(event.target.value))}
                className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)]"
              >
                <option value={4_000}>4s</option>
                <option value={8_000}>8s</option>
                <option value={15_000}>15s</option>
              </select>
              <button type="button" onClick={() => void reloadNow()} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--text)]"><RefreshCcw size={11} /> now</button>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 lg:col-span-2">
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
              <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                {(['nodes', 'subsystems', 'flows', 'events', 'geo'] as const).map((layer) => (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => setLayerVisibility(layer, !layerVisibility[layer])}
                    className={`rounded border px-2 py-1 ${layerVisibility[layer] ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  >
                    {layer}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {(['health', 'flow', 'event'] as IntelFocusMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFocusMode(mode)}
                    className={`rounded border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${focusMode === mode ? 'border-[var(--accent)] text-[var(--text)]' : 'border-[var(--border)] text-[var(--muted)]'}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="flex min-w-[230px] items-center gap-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">{altitude > 70 ? 'Earth' : altitude > 35 ? 'Regional' : 'Street'}</div>
                <input type="range" min={0} max={100} value={altitude} onChange={(event) => setAltitude(Number(event.target.value))} className="w-full accent-[var(--accent)]" />
                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--border)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${Math.round(audioLevel * 100)}%` }} /></div>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.8fr)_minmax(320px,0.7fr)]">
        <Panel title="Live Intel Map" subtitle={mapSubtitle} className="h-full">
          <div className="flex h-full min-h-0 flex-col gap-3 pt-3">
            <div className="mx-2 flex min-h-[560px] flex-1 pt-1 lg:min-h-[620px]">
              <SurveillanceMap
                altitude={altitude}
                focusedNodeId={focusedNode.id}
                nodes={visibleNodes}
                alerts={visibleEvents}
                subsystems={visibleSubsystems}
                geo={visibleGeo}
                showFlows={layerVisibility.flows && flowsRaw.length > 0}
                wireframesVisible={wireframesVisible}
                audioReactive={audioReactiveState}
                edgeToEdge
              />
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Node Health" subtitle="anchor status and pressure">
            <div className="flex flex-col gap-2 max-h-[315px] overflow-y-auto pr-1">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setFocusedNodeId(node.id)}
                  className={`rounded border p-3 text-left transition-colors ${focusedNode.id === node.id ? 'border-[var(--accent)] bg-[rgba(0,245,255,0.07)]' : 'border-[var(--border)] bg-[var(--surface2)] hover:border-[var(--accent)]/60'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><Server size={12} className="text-[var(--accent)]" /><span className="font-semibold text-[var(--text)]">{node.country}</span></div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{node.name} · {node.region}</div>
                    </div>
                    <StatusBadge status={node.status === 'OFFLINE' ? 'crit' : node.status === 'DEGRADED' ? 'warn' : 'ok'} label={node.status} />
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">{node.latencyMs}ms latency · {Math.round(node.loadPercent ?? 0)}% load</div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Event Feed" subtitle={error ?? `${Math.round(intervalMs / 1000)}s cadence • ${connection.status}`}>
            <div className="mb-2 flex items-center justify-end gap-2 text-[10px] uppercase tracking-[0.14em]"><button type="button" onClick={() => setAlertFeedClearedAt(Date.now())} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1 text-[var(--muted)] hover:text-[var(--text)]">Clear Feed</button></div>
            <div className="flex max-h-[355px] flex-col gap-2 overflow-y-auto pr-1">
              {closureFeed.slice(0, 14).map((alert) => (
                <button key={alert.id} type="button" onClick={() => setFocusedNodeId(alert.serverId ?? focusedNode.id)} className="rounded border border-[var(--border)] bg-[var(--surface2)] p-3 text-left transition-colors hover:border-[var(--accent)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2"><span className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{alert.type}</span><span className="text-[9px] text-[var(--muted)]">{formatAgo(alert.resolvedAt ?? alert.timestamp, clockNow)}</span></div>
                      <div className="mt-1 text-sm font-semibold text-[var(--text)]">{alert.title}</div>
                      <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{alert.description}</div>
                      {typeof alert.probability === 'number' || typeof alert.confidence === 'number' ? (
                        <div className="mt-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                          Prob {Math.round((alert.probability ?? 0) * 100)}% · Conf {Math.round((alert.confidence ?? 0) * 100)}%
                        </div>
                      ) : null}
                    </div>
                    <StatusBadge status={alert.resolved ? 'ok' : alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY' ? 'crit' : alert.severity === 'WARNING' ? 'warn' : 'info'} label={alert.resolved ? 'RESOLVED' : alert.severity} />
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Layer Metrics" subtitle="operator read in under 10 seconds">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              <MetricCard label="Traffic" value={liveCategoryCounts.traffic} accent="var(--accent)" sub="Flow pressure" />
              <MetricCard label="Weather" value={liveCategoryCounts.weather} accent="var(--warn)" sub="Storm vectors" />
              <MetricCard label="Fire" value={liveCategoryCounts.wildfire} accent="#a855f7" sub="Perimeter events" />
              <MetricCard label="Police" value={liveCategoryCounts.police} accent="var(--red)" sub="Security alerts" />
              <MetricCard label="Service" value={liveCategoryCounts.service} accent="var(--accent-2)" sub="Infra incidents" />
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Mission Timeline" subtitle="flow and pressure trends">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Traffic flow</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.traffic)} color="var(--accent)" /></div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Weather pressure</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.weather)} color="var(--amber)" /></div></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3"><div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Alert intensity</div><div className="mt-3"><Sparkline values={telemetrySamples.map((sample) => sample.alerts)} color="var(--red)" /></div></div>
        </div>
      </Panel>
    </div>
  )
}
