import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MapPin,
  Radar,
  RefreshCcw,
  Server,
} from 'lucide-react'
import { SurveillanceMap } from '@/components/surveillance/SurveillanceMap'
import visualizationConfig from '@/config/visualization.json'
import { emitTelemetryEvent, startTelemetry, type TelemetrySample } from '@/modules/visualization/telemetry'
import { Panel } from '@components/primitives/Panel'
import { MetricCard } from '@components/primitives/MetricCard'
import { StatusBadge } from '@components/primitives/StatusBadge'

type SurveillanceSnapshot = {
  timestamp: number
  totalNodes: number
  onlineNodes: number
  degradedNodes: number
  criticalNodes: number
  offlineNodes: number
  globalLatencyMs: number
  totalRequestsPerMin: number
  activeAlerts: number
  mapState?: { mode?: string; baseLayer?: string }
}

type SurveillanceNode = {
  id: string
  name: string
  country: string
  region: string
  lat: number
  lng: number
  status: 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE'
  latencyMs: number
  loadPercent: number
  requestsPerMin: number
  connections: string[]
}

type SurveillanceAlert = {
  id: string
  type: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
  title: string
  description: string
  serverId?: string
  timestamp: number
  resolved: boolean
}

type PeaceMarker = {
  marker: string
  createdAt: number
  source: string
  disturbanceType: string
  modality: string
  converged: boolean
  triggerAlertId?: string
  summary: string
}

type ApiPayload<T> = { success?: boolean; data?: T }

type AudioBands = {
  bass: number
  mid: number
  treble: number
  pulse: number
  beat: number
}

type GlobalEventCategory = 'traffic' | 'weather' | 'police' | 'service'

const ENDPOINTS = [
  '/api/v6/surveillance/snapshot',
  '/api/v6/surveillance/nodes',
  '/api/v6/surveillance/alerts',
]

const COUNTRY_CENTERS: Record<string, { lat: number; lng: number }> = {
  'United States': { lat: 39.8283, lng: -98.5795 },
  Ireland: { lat: 53.1424, lng: -7.6921 },
  Germany: { lat: 51.1657, lng: 10.4515 },
  Japan: { lat: 36.2048, lng: 138.2529 },
  Singapore: { lat: 1.3521, lng: 103.8198 },
  Australia: { lat: -25.2744, lng: 133.7751 },
  Brazil: { lat: -14.235, lng: -51.9253 },
  'South Africa': { lat: -30.5595, lng: 22.9375 },
  Bahrain: { lat: 26.0667, lng: 50.5577 },
  Canada: { lat: 56.1304, lng: -106.3468 },
  Sweden: { lat: 60.1282, lng: 18.6435 },
  India: { lat: 20.5937, lng: 78.9629 },
  'United Kingdom': { lat: 55.3781, lng: -3.436 },
}

const GLOBAL_EVENT_DOT_LEGEND: Array<{ category: GlobalEventCategory; label: string; color: string; description: string }> = [
  { category: 'traffic', label: 'Traffic', color: '#f97316', description: 'Road congestion, detours, and transit flow incidents.' },
  { category: 'weather', label: 'Weather', color: '#3b82f6', description: 'Storm, rain, wind, and climate-related disruptions.' },
  { category: 'police', label: 'Police', color: '#ef4444', description: 'Police/security incidents and law-enforcement alerts.' },
  { category: 'service', label: 'Service', color: '#14b8a6', description: 'Closures, maintenance, utility, and service outages.' },
]

const LIVE_FEED_REFRESH_MS = 5_000
const AUDIO_UI_COMMIT_MS = 64

function normalizeAlertCategory(rawType: string): GlobalEventCategory {
  const value = rawType.trim().toLowerCase()
  if (value.includes('weather') || value.includes('storm') || value.includes('flood') || value.includes('wind')) return 'weather'
  if (value.includes('police') || value.includes('law') || value.includes('crime') || value.includes('security')) return 'police'
  if (value.includes('service') || value.includes('closure') || value.includes('utility') || value.includes('maintenance') || value.includes('outage')) return 'service'
  return 'traffic'
}

const FALLBACK_NODES: SurveillanceNode[] = [
  { id: 'us-east-1', name: 'US-EAST-1', country: 'United States', region: 'Virginia, USA', lat: 38.9, lng: -77.0, status: 'NOMINAL', latencyMs: 8, loadPercent: 62, requestsPerMin: 43120, connections: ['ca-central', 'eu-west-1', 'sa-east-1'] },
  { id: 'us-west-1', name: 'US-WEST-1', country: 'United States', region: 'California, USA', lat: 37.7, lng: -122.4, status: 'NOMINAL', latencyMs: 12, loadPercent: 48, requestsPerMin: 35240, connections: ['us-east-1', 'ap-east-1'] },
  { id: 'eu-west-1', name: 'EU-WEST-1', country: 'Ireland', region: 'Dublin, Ireland', lat: 53.3, lng: -6.3, status: 'NOMINAL', latencyMs: 22, loadPercent: 71, requestsPerMin: 40870, connections: ['uk-south-1', 'eu-central', 'eu-north-1'] },
  { id: 'eu-central', name: 'EU-CENTRAL', country: 'Germany', region: 'Frankfurt, Germany', lat: 50.1, lng: 8.7, status: 'NOMINAL', latencyMs: 19, loadPercent: 55, requestsPerMin: 31800, connections: ['eu-west-1', 'me-south-1'] },
  { id: 'ap-east-1', name: 'AP-EAST-1', country: 'Japan', region: 'Tokyo, Japan', lat: 35.7, lng: 139.7, status: 'NOMINAL', latencyMs: 88, loadPercent: 44, requestsPerMin: 28800, connections: ['ap-south-1', 'us-west-1'] },
  { id: 'ap-south-1', name: 'AP-SOUTH-1', country: 'Singapore', region: 'Singapore', lat: 1.35, lng: 103.8, status: 'NOMINAL', latencyMs: 95, loadPercent: 39, requestsPerMin: 27440, connections: ['ap-east-1', 'ap-india-1', 'ap-aus-1'] },
  { id: 'ap-aus-1', name: 'AP-AUS-1', country: 'Australia', region: 'Sydney, Australia', lat: -33.8, lng: 151.2, status: 'DEGRADED', latencyMs: 142, loadPercent: 88, requestsPerMin: 16420, connections: ['ap-south-1'] },
  { id: 'sa-east-1', name: 'SA-EAST-1', country: 'Brazil', region: 'Sao Paulo, Brazil', lat: -23.5, lng: -46.6, status: 'NOMINAL', latencyMs: 110, loadPercent: 31, requestsPerMin: 18350, connections: ['us-east-1', 'af-south-1'] },
  { id: 'af-south-1', name: 'AF-SOUTH-1', country: 'South Africa', region: 'Johannesburg, SA', lat: -26.2, lng: 28.0, status: 'NOMINAL', latencyMs: 180, loadPercent: 22, requestsPerMin: 12730, connections: ['eu-west-1', 'me-south-1'] },
  { id: 'me-south-1', name: 'ME-SOUTH-1', country: 'Bahrain', region: 'Manama, Bahrain', lat: 26.0, lng: 50.5, status: 'NOMINAL', latencyMs: 55, loadPercent: 35, requestsPerMin: 22690, connections: ['eu-central', 'ap-india-1'] },
  { id: 'ca-central', name: 'CA-CENTRAL', country: 'Canada', region: 'Toronto, Canada', lat: 43.7, lng: -79.4, status: 'NOMINAL', latencyMs: 14, loadPercent: 57, requestsPerMin: 15960, connections: ['us-east-1'] },
  { id: 'eu-north-1', name: 'EU-NORTH-1', country: 'Sweden', region: 'Stockholm, Sweden', lat: 59.3, lng: 18.1, status: 'NOMINAL', latencyMs: 28, loadPercent: 41, requestsPerMin: 14150, connections: ['eu-west-1'] },
  { id: 'ap-india-1', name: 'AP-INDIA-1', country: 'India', region: 'Mumbai, India', lat: 19.1, lng: 72.9, status: 'NOMINAL', latencyMs: 78, loadPercent: 66, requestsPerMin: 36120, connections: ['me-south-1', 'ap-south-1'] },
  { id: 'uk-south-1', name: 'UK-SOUTH-1', country: 'United Kingdom', region: 'London, UK', lat: 51.5, lng: -0.12, status: 'NOMINAL', latencyMs: 16, loadPercent: 73, requestsPerMin: 19740, connections: ['eu-west-1', 'eu-central'] },
]

function formatAgo(timestamp: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))
  return minutes === 1 ? '1 min ago' : `${minutes} mins ago`
}

function formatRelative(timestamp?: number): string {
  if (!timestamp) return 'fresh'
  return formatAgo(timestamp)
}

function MapLegend({ altitude, refreshMs }: { altitude: number; refreshMs: number }) {
  const refreshSeconds = Math.max(1, Math.round(refreshMs / 1000))
  return (
    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
      <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">2D Earth Transit</span>
      <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">Altitude: {altitude > 70 ? 'Earth scale' : altitude > 35 ? 'Regional scale' : 'Street scale'}</span>
      <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">Live refresh: {refreshSeconds}s</span>
    </div>
  )
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const TARGET_POINTS = 72
  if (values.length === 0) return <div className="h-10 rounded border border-[var(--border)] bg-[var(--bg)]" />

  const seeded = values.length >= TARGET_POINTS
    ? values.slice(-TARGET_POINTS)
    : [...Array.from({ length: TARGET_POINTS - values.length }, () => values[0] ?? 0.5), ...values]

  const max = Math.max(...seeded, 1)
  const min = Math.min(...seeded, 0)
  const range = max - min || 1
  const points = seeded.map((value, index) => {
    const x = (index / Math.max(seeded.length - 1, 1)) * 100
    const y = 100 - (((value - min) / range) * 100)
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox="0 0 100 100" className="h-10 w-full overflow-visible">
      <polyline fill="none" stroke={color} strokeWidth="3" points={points} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function Surveillance() {
  const feedSessionStartRef = useRef<number>(Date.now())
  const [snapshot, setSnapshot] = useState<SurveillanceSnapshot | null>(null)
  const [nodes, setNodes] = useState<SurveillanceNode[]>(FALLBACK_NODES)
  const [alerts, setAlerts] = useState<SurveillanceAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [altitude, setAltitude] = useState(78)
  const [focusedNodeId, setFocusedNodeId] = useState('us-east-1')
  const [lastSync, setLastSync] = useState<number>(Date.now())
  const [telemetrySamples, setTelemetrySamples] = useState<TelemetrySample[]>([])
  const [audioStatus, setAudioStatus] = useState('AUDIO OFF')
  const [audioLevel, setAudioLevel] = useState(0)
  const [audioBands, setAudioBands] = useState<AudioBands>({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
  const [wireframesVisible, setWireframesVisible] = useState(true)
  const [peaceMarkers, setPeaceMarkers] = useState<PeaceMarker[]>([])
  const alertsRef = useRef<HTMLDivElement | null>(null)
  const reloadDataRef = useRef<(() => Promise<void>) | null>(null)
  const audioBandsRef = useRef<AudioBands>({ bass: 0, mid: 0, treble: 0, pulse: 0, beat: 0 })
  const audioRef = useRef<{
    context?: AudioContext
    analyser?: AnalyserNode
    source?: MediaStreamAudioSourceNode
    stream?: MediaStream
    raf?: number
  }>({})

  const focusedNode = useMemo(() => nodes.find((node) => node.id === focusedNodeId) ?? nodes[0] ?? FALLBACK_NODES[0], [nodes, focusedNodeId])
  const audioReactiveEnabled = audioStatus !== 'AUDIO OFF' && audioStatus !== 'REQUESTING...'
  const audioReactiveState = useMemo(() => ({
    enabled: audioReactiveEnabled,
    level: audioLevel,
    bands: audioBands,
  }), [audioReactiveEnabled, audioLevel, audioBands])

  useEffect(() => {
    audioBandsRef.current = audioBands
  }, [audioBands])

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

    const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

    setAudioStatus('REQUESTING...')
    try {
      let stream: MediaStream | null = null
      let mode = 'SYSTEM'

      if (navigator.mediaDevices?.getDisplayMedia) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          })
          if (!stream.getAudioTracks().length) {
            stream.getTracks().forEach((track) => track.stop())
            stream = null
          }
        } catch {
          stream = null
        }
      }

      if (!stream && navigator.mediaDevices?.getUserMedia) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        mode = 'MIC'
      }

      if (!stream) throw new Error('No audio stream available')

      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioCtor) throw new Error('Web Audio unsupported')

      const context = new AudioCtor()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.86
      source.connect(analyser)

      const frequencies = new Uint8Array(analyser.frequencyBinCount)
      let lastUiCommitAt = 0
      const readBand = (start: number, end: number) => {
        const clampedStart = Math.max(0, start)
        const clampedEnd = Math.min(frequencies.length, end)
        const length = clampedEnd - clampedStart
        if (length <= 0) return 0

        let sum = 0
        for (let index = clampedStart; index < clampedEnd; index += 1) {
          sum += frequencies[index]
        }
        return sum / (length * 255)
      }

      const loop = () => {
        analyser.getByteFrequencyData(frequencies)
        const energy = frequencies.reduce((sum, value) => sum + value, 0) / (frequencies.length * 255)
        const bass = readBand(0, Math.max(1, Math.floor(frequencies.length * 0.12)))
        const mid = readBand(Math.floor(frequencies.length * 0.12), Math.max(2, Math.floor(frequencies.length * 0.5)))
        const treble = readBand(Math.floor(frequencies.length * 0.5), frequencies.length)
        const pulse = clamp01((energy * 0.55) + (bass * 0.45))
        const beat = clamp01(Math.max(0, (bass * 1.25) - (audioBandsRef.current.bass * 0.45) + (energy * 0.22)))
        const nextBands = { bass, mid, treble, pulse, beat }
        audioBandsRef.current = nextBands

        const now = performance.now()
        if ((now - lastUiCommitAt) >= AUDIO_UI_COMMIT_MS) {
          lastUiCommitAt = now
          setAudioLevel(clamp01(energy))
          setAudioBands(nextBands)
        }

        audioRef.current.raf = window.requestAnimationFrame(loop)
      }

      audioRef.current = { context, analyser, source, stream }
      setAudioStatus(`${mode} LIVE`)
      loop()
    } catch {
      stopAudioReactive()
    }
  }, [stopAudioReactive])

  useEffect(() => stopAudioReactive, [stopAudioReactive])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const [snapshotResponse, nodesResponse, alertsResponse] = await Promise.all([
          fetch('/api/v6/surveillance/snapshot'),
          fetch('/api/v6/surveillance/nodes'),
          fetch('/api/v6/surveillance/alerts'),
        ])

        const snapshotPayload = await snapshotResponse.json() as ApiPayload<SurveillanceSnapshot>
        const nodesPayload = await nodesResponse.json() as ApiPayload<SurveillanceNode[]>
        const alertsPayload = await alertsResponse.json() as ApiPayload<SurveillanceAlert[]>
        const freshAlerts = (alertsPayload.data ?? []).filter((alert) => alert.timestamp >= feedSessionStartRef.current)

        let nextMarkers: PeaceMarker[] = []
        try {
          const markersResponse = await fetch('/api/v6/self-healing/markers?limit=8')
          const markersPayload = await markersResponse.json() as ApiPayload<PeaceMarker[]>
          nextMarkers = markersPayload.data ?? []
        } catch {
          nextMarkers = []
        }

        if (!cancelled) {
          setSnapshot(snapshotPayload.data ?? null)
          setNodes(nodesPayload.data?.length ? nodesPayload.data : FALLBACK_NODES)
          setAlerts(freshAlerts)
          setPeaceMarkers(nextMarkers)
          setError(null)
          setLastSync(Date.now())
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setNodes(FALLBACK_NODES)
          setAlerts([])
          setPeaceMarkers([])
          setLastSync(Date.now())
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    reloadDataRef.current = load

    void load()
    const timer = window.setInterval(load, LIVE_FEED_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      reloadDataRef.current = null
    }
  }, [])

  useEffect(() => {
    const seededSeries = Array.from({ length: 60 }, (_, index) => {
      const offset = 60 - index
      return {
        timestamp: Date.now() - (offset * visualizationConfig.updateInterval),
        alerts: Math.max(0, Math.round(2 + Math.sin(index / 8) * 1.5)),
        traffic: 0.44 + Math.sin(index / 6) * 0.16,
        weather: 0.36 + Math.cos(index / 7) * 0.14,
      }
    })
    setTelemetrySamples(seededSeries)

    const stopTelemetry = startTelemetry((sample) => {
      setTelemetrySamples((current) => [...current.slice(-119), sample])
    }, visualizationConfig.updateInterval, visualizationConfig.telemetryBufferSize)
    return stopTelemetry
  }, [])

  useEffect(() => {
    emitTelemetryEvent('scene:focus', { focusedNodeId })
  }, [focusedNodeId])

  const liveAlerts = alerts.filter((alert) => !alert.resolved)
  const liveCategoryCounts = useMemo(() => {
    return liveAlerts.reduce<Record<GlobalEventCategory, number>>((acc, alert) => {
      const category = normalizeAlertCategory(alert.type)
      acc[category] += 1
      return acc
    }, { traffic: 0, weather: 0, police: 0, service: 0 })
  }, [liveAlerts])

  useEffect(() => {
    alertsRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [liveAlerts.length])

  const mapSubtitle = '2D Earth transit map with street-scale detail, closures, and live transport data.'
  const uptimeHours = useMemo(() => ((Date.now() - (snapshot?.timestamp ?? Date.now() - 1000 * 60 * 60 * 72)) / 3_600_000).toFixed(1), [snapshot])
  const trafficSeries = telemetrySamples.map((sample) => sample.traffic)
  const weatherSeries = telemetrySamples.map((sample) => sample.weather)
  const eventSeries = telemetrySamples.map((sample) => sample.alerts)

  return (
    <div className="oct-screen space-y-3 md:space-y-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[radial-gradient(circle_at_top,_rgba(0,245,255,0.12),_transparent_42%),linear-gradient(180deg,_rgba(10,16,28,0.96),_rgba(4,8,15,0.98))] p-4 md:p-5 overflow-hidden relative shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
        <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, rgba(104,196,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(104,196,255,0.08) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        <div className="relative">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[var(--accent)]">
              <Radar size={12} /> SENTINEL / SURVEILLANCE
            </div>
            <h2 className="mt-2 text-2xl md:text-4xl font-black leading-tight tracking-tight">Octane v6 Global Surveillance</h2>
            <p className="mt-2 max-w-3xl text-sm md:text-[13px] text-[var(--muted)] leading-6">
              2D Earth surveillance powered by live telemetry, recent closures, transit disruptions,
              weather overlays, and city-scale server activity for the Octane edge.
            </p>
          </div>
        </div>
      </div>

      <div className="oct-grid-4">
        <MetricCard label="Total Nodes" value={snapshot?.totalNodes ?? (loading ? '...' : nodes.length)} accent="var(--accent)" sub="Country-level presence" />
        <MetricCard label="Active Alerts" value={snapshot?.activeAlerts ?? (loading ? '...' : liveAlerts.length)} accent="var(--warn)" sub="Traffic, weather, closure, transit" />
        <MetricCard label="Global Latency" value={snapshot?.globalLatencyMs ?? (loading ? '...' : 62)} unit="ms" accent="var(--stellar)" sub="Average node latency" />
        <MetricCard label="Requests / Min" value={snapshot?.totalRequestsPerMin ?? (loading ? '...' : 534531)} accent="var(--accent-2)" sub="Aggregate node throughput" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.8fr)]">
        <Panel title="2D Earth Transit Map" subtitle={mapSubtitle} className="h-full">
          <div className="flex h-full min-h-0 flex-col gap-3 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3">
              <MapLegend altitude={altitude} refreshMs={LIVE_FEED_REFRESH_MS} />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void startAudioReactive()}
                  className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {audioStatus === 'AUDIO OFF' ? 'Enable Audio React' : 'Disable Audio React'}
                </button>
                <button
                  type="button"
                  onClick={() => setWireframesVisible((current) => !current)}
                  className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  {wireframesVisible ? 'Hide Wireframes' : 'Show Wireframes'}
                </button>
                <button
                  type="button"
                  onClick={() => void reloadDataRef.current?.()}
                  className="inline-flex items-center gap-2 rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2 text-[11px] uppercase tracking-[0.16em] text-[var(--muted)] hover:text-[var(--text)]"
                >
                  <RefreshCcw size={12} /> Refresh
                </button>
              </div>
            </div>

            <div className="mx-3 flex flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-3">
              <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                <span>Resolution</span>
                <span>{altitude > 70 ? 'Earth' : altitude > 35 ? 'Regional' : 'Street'}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">
                <span>Audio React</span>
                <span>{audioStatus}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${Math.round(audioLevel * 100)}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={altitude}
                onChange={(event) => setAltitude(Number(event.target.value))}
                className="w-full accent-[var(--accent)]"
              />
              <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-[var(--muted)]">
                <span>Street</span>
                <span>Planet</span>
              </div>
            </div>

            <div className="flex min-h-[420px] flex-1 pt-1">
              <SurveillanceMap
                altitude={altitude}
                focusedNodeId={focusedNode.id}
                nodes={nodes}
                alerts={liveAlerts}
                wireframesVisible={wireframesVisible}
                audioReactive={audioReactiveState}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">Focus: {focusedNode.region}</span>
              <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">Last sync: {new Date(lastSync).toLocaleTimeString('en', { hour12: false })}</span>
              <span className="rounded border border-[var(--border)] bg-[var(--surface2)] px-2 py-1">Updated: {snapshot ? new Date(snapshot.timestamp).toLocaleTimeString('en', { hour12: false }) : 'live'}</span>
            </div>
          </div>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel title="Server Country Presence" subtitle="city-scale monitoring in the 2D view">
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
                      <div className="flex items-center gap-2">
                        <Server size={12} className="text-[var(--accent)]" />
                        <span className="font-semibold text-[var(--text)]">{node.country}</span>
                      </div>
                      <div className="mt-1 text-[11px] text-[var(--muted)]">{node.name} · {node.region}</div>
                    </div>
                    <StatusBadge status={node.status === 'CRITICAL' ? 'crit' : node.status === 'DEGRADED' ? 'warn' : 'ok'} label={node.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <MapPin size={11} /> Country presence only
                    <span className="ml-auto">{node.latencyMs}ms latency</span>
                  </div>
                </button>
              ))}
            </div>
          </Panel>

          <Panel title="Live Closures & Alerts" subtitle={error ?? 'recently updated map data'}>
            <div ref={alertsRef} className="flex max-h-[355px] flex-col gap-2 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
              {liveAlerts.slice(0, 5).map((alert) => (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => setFocusedNodeId(alert.serverId ?? focusedNode.id)}
                  className="rounded border border-[var(--border)] bg-[var(--surface2)] p-3 text-left transition-colors hover:border-[var(--accent)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{alert.type}</span>
                        <span className="text-[9px] text-[var(--muted)]">{formatRelative(alert.timestamp)}</span>
                      </div>
                      <div className="mt-1 text-sm font-semibold text-[var(--text)]">{alert.title}</div>
                      <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{alert.description}</div>
                    </div>
                    <StatusBadge status={alert.severity === 'CRITICAL' || alert.severity === 'EMERGENCY' ? 'crit' : alert.severity === 'WARNING' ? 'warn' : 'info'} label={alert.severity} />
                  </div>
                </button>
              ))}
              {liveAlerts.length === 0 && (
                <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--muted)]">
                  No active alerts. The surveillance fabric is stable and polling fresh data.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Peaceful Resolve Feed" subtitle="self-healing markers from runtime stability protocol">
            <div className="flex max-h-[250px] flex-col gap-2 overflow-y-auto pr-1 [mask-image:linear-gradient(to_bottom,transparent,black_10%,black_90%,transparent)]">
              {peaceMarkers.slice(0, 6).map((marker) => (
                <div
                  key={marker.marker}
                  className="rounded border border-[var(--border)] bg-[var(--surface2)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--accent)]">{marker.modality.replaceAll('_', ' ')}</div>
                    <StatusBadge status={marker.converged ? 'ok' : 'warn'} label={marker.converged ? 'CONVERGED' : 'IN PROGRESS'} />
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--text)]">{marker.disturbanceType.replaceAll('_', ' ')}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{marker.summary}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-[var(--muted)]">
                    <span className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1">Marker {marker.marker}</span>
                    <span className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1">{formatRelative(marker.createdAt)}</span>
                  </div>
                </div>
              ))}
              {peaceMarkers.length === 0 && (
                <div className="rounded border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--muted)]">
                  No peace markers yet. Runtime self-healing will post here when alerts trigger restorative cycles.
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Live Route Surface" subtitle="traffic + weather + police + service">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MetricCard label="Traffic" value="LIVE" accent="var(--accent)" sub="Road congestion & detours" />
              <MetricCard label="Weather" value="LIVE" accent="var(--warn)" sub="Storm & visibility closures" />
              <MetricCard label="Police" value={liveCategoryCounts.police} accent="var(--red)" sub="Law/security incidents" />
              <MetricCard label="Service" value={liveCategoryCounts.service} accent="var(--accent-2)" sub="Closures & utility events" />
            </div>
          </Panel>

          <Panel title="Global Event Dot Color Code" subtitle="persistent map dots while events are active">
            <div className="flex flex-col gap-2">
              {GLOBAL_EVENT_DOT_LEGEND.map((entry) => (
                <div key={entry.category} className="rounded border border-[var(--border)] bg-[var(--surface2)] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full border"
                      style={{ backgroundColor: entry.color, borderColor: entry.color }}
                    />
                    <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text)]">
                      {entry.label} · {entry.color}
                    </span>
                    <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-[var(--muted)]">
                      Active: {liveCategoryCounts[entry.category]}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">{entry.description}</div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="Surveillance Notes" subtitle="Ionic-grade 2D surveillance stack">
        <div className="grid gap-3 md:grid-cols-3 text-sm text-[var(--muted)] leading-6">
          <p>
            The 2D map is tuned for full-earth transit context and street-level zoom, with recent weather, traffic,
            rail, and closure overlays refreshed continuously.
          </p>
          <p>
            Server presence is shown on a single 2D Earth surface so operational teams can stay focused on one
            consistent view while monitoring closures and latency in real time.
          </p>
          <p>
            The page now includes an HTML download link so the surveillance briefing can be opened or saved as a
            standalone artifact from the command interface.
          </p>
        </div>
      </Panel>

      <Panel title="Mission Timeline" subtitle="recent telemetry pulses and anomaly pressure">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Traffic flow</div>
            <div className="mt-3"><Sparkline values={trafficSeries} color="var(--accent)" /></div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Weather pressure</div>
            <div className="mt-3"><Sparkline values={weatherSeries} color="var(--amber)" /></div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface2)] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Alert intensity</div>
            <div className="mt-3"><Sparkline values={eventSeries} color="var(--red)" /></div>
          </div>
        </div>
      </Panel>
    </div>
  )
}