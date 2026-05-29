import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import visualizationConfig from '@/config/visualization.json'
import type {
  VisualizationAlert,
  VisualizationGeoOverlay,
  VisualizationNode,
  VisualizationSubsystem,
  VisualizationTrafficSegment,
} from '@/modules/visualization/types'
import '@/styles/map.css'

type MapModule = typeof import('@/modules/visualization/map')
type MapController = ReturnType<MapModule['initMap']>

type ActiveHealthNode = {
  id: string
  name: string
  country: string
  tier: 'town' | 'city' | 'metropolis'
  lat: number
  lng: number
  repairRadiusKm: number
  mission: string
}

type SurveillanceMapProps = {
  altitude: number
  focusedNodeId: string
  nodes: VisualizationNode[]
  alerts: VisualizationAlert[]
  healthNodes?: ActiveHealthNode[]
  basemapMode?: 'satellite' | 'traffic'
  onTrafficViewportChange?: (bbox: string) => void
  trafficSegments?: VisualizationTrafficSegment[]
  subsystems?: VisualizationSubsystem[]
  geo?: VisualizationGeoOverlay[]
  showFlows?: boolean
  showTraffic?: boolean
  wireframesVisible?: boolean
  audioReactive?: {
    enabled: boolean
    level: number
    bands: {
      bass: number
      mid: number
      treble: number
      pulse: number
      beat: number
    }
  }
  edgeToEdge?: boolean
}

type TargetCategory = 'traffic' | 'weather' | 'police' | 'service'

type TargetLock = {
  id: string
  title: string
  severity: VisualizationAlert['severity']
  category: TargetCategory
  lat: number
  lng: number
  baseAngle: number
  color: string
  metric: string
  sourceLabel: string
}

type ProjectedTarget = TargetLock & {
  x: number
  y: number
  audioScale: number
  audioTwistDeg: number
}

type ProjectedHealthNode = ActiveHealthNode & {
  x: number
  y: number
}

const TARGET_ANGLES = [-31, 0, 22, 47]

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeCategory(type: string): TargetCategory {
  const value = type.trim().toLowerCase()
  if (value.includes('weather') || value.includes('storm') || value.includes('wind') || value.includes('flood')) return 'weather'
  if (value.includes('police') || value.includes('law') || value.includes('crime') || value.includes('security')) return 'police'
  if (value.includes('service') || value.includes('closure') || value.includes('maintenance') || value.includes('utility') || value.includes('outage')) return 'service'
  return 'traffic'
}

function severityRank(severity: VisualizationAlert['severity']): number {
  if (severity === 'EMERGENCY' || severity === 'CRITICAL') return 3
  if (severity === 'WARNING') return 2
  return 1
}

function targetColor(severity: VisualizationAlert['severity'], category: TargetCategory): string {
  if (severity === 'EMERGENCY' || severity === 'CRITICAL') return '#ff4f66'
  if (severity === 'WARNING') return '#ffae42'
  if (category === 'service') return '#35f0a1'
  if (category === 'weather') return '#58b7ff'
  return '#4fe6ff'
}

function resolveAlertPoint(alert: VisualizationAlert, nodeById: Map<string, VisualizationNode>): { lat: number; lng: number } | null {
  if (typeof alert.lat === 'number' && typeof alert.lng === 'number') return { lat: alert.lat, lng: alert.lng }
  if (alert.location && typeof alert.location.lat === 'number' && typeof alert.location.lng === 'number') {
    return { lat: alert.location.lat, lng: alert.location.lng }
  }
  return null
}

function hasRealEvidence(alert: VisualizationAlert): boolean {
  return Array.isArray(alert.realWorldEvidence) && alert.realWorldEvidence.length > 0
}

function maxRealEvidenceQuality(alert: VisualizationAlert): number {
  if (!Array.isArray(alert.realWorldEvidence) || alert.realWorldEvidence.length === 0) return 0
  return alert.realWorldEvidence.reduce((max, evidence) => Math.max(max, evidence.quality ?? 0.5), 0)
}

function isValidLatLng(point: { lat: number; lng: number }): boolean {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return false
  if (Math.abs(point.lat) > 90 || Math.abs(point.lng) > 180) return false
  if (Math.abs(point.lat) < 0.01 && Math.abs(point.lng) < 0.01) return false
  return true
}

function isSyntheticOnlyAlert(alert: VisualizationAlert): boolean {
  const withSimulation = alert as VisualizationAlert & { simulatedEvidence?: unknown[] }
  const hasSimulation = Array.isArray(withSimulation.simulatedEvidence) && withSimulation.simulatedEvidence.length > 0
  return hasSimulation && !hasRealEvidence(alert)
}

function hasTrustedRealLocation(alert: VisualizationAlert): boolean {
  if (!hasRealEvidence(alert)) return false
  const quality = maxRealEvidenceQuality(alert)
  if (quality < 0.55) return false

  if (typeof alert.lat === 'number' && typeof alert.lng === 'number') {
    return isValidLatLng({ lat: alert.lat, lng: alert.lng })
  }

  if (alert.location && typeof alert.location.lat === 'number' && typeof alert.location.lng === 'number') {
    return isValidLatLng({ lat: alert.location.lat, lng: alert.location.lng })
  }

  return false
}

function pickRealTargets(
  alerts: VisualizationAlert[],
  nodes: VisualizationNode[],
): Array<VisualizationAlert & { lat: number; lng: number; category: TargetCategory }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const prioritized = alerts
    .filter((alert) => !alert.resolved && !isSyntheticOnlyAlert(alert) && hasTrustedRealLocation(alert))
    .map((alert) => {
      const point = resolveAlertPoint(alert, nodeById)
      if (!point || !isValidLatLng(point)) return null
      return {
        ...alert,
        category: normalizeCategory(alert.type),
        lat: point.lat,
        lng: point.lng,
      }
    })
    .filter((alert): alert is VisualizationAlert & { lat: number; lng: number; category: TargetCategory } => alert !== null)
    .sort((left, right) => {
      const severityDelta = severityRank(right.severity) - severityRank(left.severity)
      if (severityDelta !== 0) return severityDelta
      return (right.timestamp ?? 0) - (left.timestamp ?? 0)
    })

  return prioritized.slice(0, 4)
}

function buildMetric(alert: VisualizationAlert): string {
  if (alert.type.toLowerCase().includes('route')) return 'Route Pressure'
  if (alert.type.toLowerCase().includes('weather')) return 'Weather Vector'
  if (alert.type.toLowerCase().includes('police')) return 'Security Index'
  if (alert.type.toLowerCase().includes('traffic')) return 'Transit Density'
  return 'Incident Signal'
}

export function SurveillanceMap({
  altitude,
  focusedNodeId,
  nodes,
  alerts,
  healthNodes = [],
  basemapMode = 'satellite',
  onTrafficViewportChange,
  trafficSegments,
  subsystems,
  geo,
  showFlows = true,
  showTraffic = true,
  wireframesVisible = true,
  audioReactive,
  edgeToEdge,
}: SurveillanceMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<MapController | null>(null)
  const lockMetaRef = useRef<Map<string, { angle: number }>>(new Map())
  const alertsSignatureRef = useRef('')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMobileFullscreenFallback, setIsMobileFullscreenFallback] = useState(false)
  const [projectedTargets, setProjectedTargets] = useState<ProjectedTarget[]>([])
  const [projectedHealthNodes, setProjectedHealthNodes] = useState<ProjectedHealthNode[]>([])
  const fullscreenActive = isFullscreen || isMobileFullscreenFallback

  const selectedTargets = useMemo(() => {
    const nextTargets = pickRealTargets(alerts, nodes)
    const activeIds = new Set(nextTargets.map((target) => target.id))

    Array.from(lockMetaRef.current.keys()).forEach((id) => {
      if (!activeIds.has(id)) {
        lockMetaRef.current.delete(id)
      }
    })

    const usedAngles = new Set<number>()
    lockMetaRef.current.forEach((meta) => {
      usedAngles.add(meta.angle)
    })

    return nextTargets.map((target) => {
      let meta = lockMetaRef.current.get(target.id)
      if (!meta) {
        const nextAngle = TARGET_ANGLES.find((angle) => !usedAngles.has(angle)) ?? TARGET_ANGLES[target.id.length % TARGET_ANGLES.length]
        usedAngles.add(nextAngle)
        meta = { angle: nextAngle }
        lockMetaRef.current.set(target.id, meta)
      }

      const intensity = severityRank(target.severity)
      const confidence = typeof target.confidence === 'number' ? Math.round(target.confidence * 100) : null
      const sourceLabel = target.realWorldEvidence && target.realWorldEvidence.length > 0
        ? 'VERIFIED LIVE SIGNAL'
        : confidence !== null
          ? `LIVE CONF ${confidence}%`
          : 'LIVE SIGNAL'

      return {
        id: target.id,
        title: target.title ?? target.type,
        severity: target.severity,
        category: target.category,
        lat: target.lat,
        lng: target.lng,
        baseAngle: meta.angle,
        color: targetColor(target.severity, target.category),
        metric: buildMetric(target),
        sourceLabel,
      }
    })
  }, [alerts, nodes])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null }
      const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
      setIsFullscreen(fullscreenElement === surfaceRef.current)
      controllerRef.current?.setAltitude(altitude)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [altitude])

  useEffect(() => {
    if (!isMobileFullscreenFallback) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileFullscreenFallback(false)
      }
    }

    window.addEventListener('keydown', onEscape)
    controllerRef.current?.setAltitude(altitude)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onEscape)
      controllerRef.current?.setAltitude(altitude)
    }
  }, [altitude, isMobileFullscreenFallback])

  useEffect(() => {
    let disposed = false
    let controller: MapController | null = null

    const mount = async () => {
      if (!containerRef.current) return
      const module = await import('@/modules/visualization/map')
      if (disposed || !containerRef.current) return
      controller = module.initMap(containerRef.current, visualizationConfig)
      controllerRef.current = controller
      controller.setAltitude(altitude)
      controller.setBasemap(basemapMode)
      controller.setViewportChangeHandler(onTrafficViewportChange)
      controller.setData(nodes, alerts, focusedNodeId, {
        trafficSegments,
        subsystems,
        geo,
        showFlows,
        showTraffic,
      })
      controller.setWireframesVisible(wireframesVisible)
      controller.setAudioReactive(
        audioReactive?.enabled ?? false,
        audioReactive?.level ?? 0,
        audioReactive?.bands,
      )
    }

    void mount()

    return () => {
      disposed = true
      controller?.destroy()
      controllerRef.current = null
    }
  }, [])

  useEffect(() => {
    controllerRef.current?.setAltitude(altitude)
  }, [altitude])

  useEffect(() => {
    controllerRef.current?.setBasemap(basemapMode)
  }, [basemapMode])

  useEffect(() => {
    controllerRef.current?.setViewportChangeHandler(onTrafficViewportChange)
  }, [onTrafficViewportChange])

  useEffect(() => {
    const sig = `${nodes.length}:${alerts.length}:${alerts.map(a => `${a.id}${a.resolved ? 'r' : ''}`).join(',')}:${trafficSegments?.length ?? 0}:${trafficSegments?.map(segment => `${segment.id}:${segment.congestionIndex.toFixed(2)}`).join(',') ?? ''}:${subsystems?.length ?? 0}:${geo?.length ?? 0}:${showFlows ? 1 : 0}:${showTraffic ? 1 : 0}:${basemapMode}:${focusedNodeId}`
    if (sig === alertsSignatureRef.current) return
    alertsSignatureRef.current = sig
    controllerRef.current?.setData(nodes, alerts, focusedNodeId, {
      trafficSegments,
      subsystems,
      geo,
      showFlows,
      showTraffic,
    })
  }, [alerts, basemapMode, focusedNodeId, geo, nodes, showFlows, showTraffic, subsystems, trafficSegments])

  useEffect(() => {
    controllerRef.current?.setAudioReactive(
      audioReactive?.enabled ?? false,
      audioReactive?.level ?? 0,
      audioReactive?.bands,
    )
  }, [audioReactive])

  useEffect(() => {
    controllerRef.current?.setWireframesVisible(wireframesVisible)
  }, [wireframesVisible])

  useEffect(() => {
    let rafId = 0
    let lastTickAt = 0

    const tick = (timestamp: number) => {
      // Cap to ~30fps — projection only needs to update when map is panned
      // or target tracks change (which is already gated by the 200ms `now` ticker).
      if (timestamp - lastTickAt < 33) {
        rafId = window.requestAnimationFrame(tick)
        return
      }
      lastTickAt = timestamp

      const controller = controllerRef.current
      const container = containerRef.current
      if (!controller || !container) {
        setProjectedTargets([])
        setProjectedHealthNodes([])
        rafId = window.requestAnimationFrame(tick)
        return
      }

      const width = container.clientWidth
      const height = container.clientHeight
      const audioEnergy = clamp01(
        audioReactive?.enabled
          ? ((audioReactive.level * 0.55) + ((audioReactive.bands?.pulse ?? 0) * 0.45))
          : 0.12,
      )

      const nextTargets = selectedTargets
        .map((target) => {
          const point = controller.projectLatLng(target.lat, target.lng)
          if (!point) return null

          const x = Math.max(72, Math.min(width - 72, point.x))
          const y = Math.max(72, Math.min(height - 72, point.y))
          const wobble = audioReactive?.enabled ? Math.sin((timestamp + (x * 0.7) + (y * 0.35)) / 240) : 0
          const audioTwistDeg = wobble * (3 + (audioEnergy * 8))
          const audioScale = 1 + (audioEnergy * 0.24) + (wobble * 0.05)
          return {
            ...target,
            x,
            y,
            audioScale,
            audioTwistDeg,
          }
        })
        .filter((target): target is ProjectedTarget => target !== null)

      const nextHealthNodes = healthNodes
        .map((node) => {
          const point = controller.projectLatLng(node.lat, node.lng)
          if (!point) return null
          const x = Math.max(20, Math.min(width - 20, point.x))
          const y = Math.max(20, Math.min(height - 20, point.y))
          return { ...node, x, y }
        })
        .filter((node): node is ProjectedHealthNode => node !== null)

      setProjectedTargets(nextTargets)
      setProjectedHealthNodes(nextHealthNodes)
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [audioReactive, healthNodes, selectedTargets])

  const toggleFullscreen = async () => {
    const surface = surfaceRef.current
    if (!surface) return

    const doc = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void
      webkitFullscreenElement?: Element | null
    }
    const surfaceWithVendor = surface as HTMLDivElement & {
      webkitRequestFullscreen?: () => Promise<void> | void
    }

    const fullscreenElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
    const usingNativeFullscreen = fullscreenElement === surface

    try {
      if (fullscreenActive) {
        if (usingNativeFullscreen) {
          if (document.exitFullscreen) {
            await document.exitFullscreen()
          } else if (doc.webkitExitFullscreen) {
            await doc.webkitExitFullscreen()
          }
        }
        setIsMobileFullscreenFallback(false)
        return
      }

      if (surface.requestFullscreen) {
        await surface.requestFullscreen()
        return
      }

      if (surfaceWithVendor.webkitRequestFullscreen) {
        await surfaceWithVendor.webkitRequestFullscreen()
        return
      }

      setIsMobileFullscreenFallback(true)
    } catch {
      // Mobile browsers can reject fullscreen requests; use CSS fallback.
      setIsMobileFullscreenFallback(true)
    }
  }

  return (
    <div ref={surfaceRef} className={`surveillance-surface surveillance-surface--map flex-1 ${edgeToEdge ? 'surveillance-surface--map-edge' : ''} ${isMobileFullscreenFallback ? 'surveillance-surface--map-mobile-fullscreen' : ''}`}>
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="surveillance-map-fullscreen-btn"
        aria-label={fullscreenActive ? 'Exit fullscreen map' : 'Enter fullscreen map'}
      >
        {fullscreenActive ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        <span>{fullscreenActive ? 'Exit Fullscreen' : 'Fullscreen'}</span>
      </button>
      <div ref={containerRef} className="surveillance-map-canvas" />
      <div
        className="surveillance-targeting-overlay"
        style={{
          ['--target-audio-energy' as string]: String(
            clamp01((audioReactive?.enabled ? ((audioReactive.level * 0.5) + ((audioReactive.bands?.pulse ?? 0) * 0.5)) : 0.2)),
          ),
        }}
      >
        <div className="surveillance-targeting-banner">
          TARGETING LAYER ACTIVE • {projectedTargets.length} REAL INCIDENT TARGETS • AUDIO REACTIVITY ON LIVE TARGETS ONLY
        </div>
        {projectedHealthNodes.map((node) => (
          <div key={node.id} className={`surveillance-health-node surveillance-health-node--${node.tier}`} style={{ left: `${node.x}px`, top: `${node.y}px` }}>
            <div className="surveillance-health-node__dot" />
            <div className="surveillance-health-node__pulse" />
            {node.tier === 'metropolis' ? <div className="surveillance-health-node__label">{node.name} HEAL</div> : null}
          </div>
        ))}
        {projectedTargets.map((target) => {
          const labelRight = target.x < 440
          const labelX = target.x + (labelRight ? 96 : -240)
          const labelY = target.y - 18
          const lineX = target.x + (labelRight ? 62 : -140)
          const lineWidth = labelRight ? 90 : 76

          return (
            <div key={target.id} className="surveillance-target-lock surveillance-target-lock--live" style={{ left: `${target.x}px`, top: `${target.y}px` }}>
              <div
                className="surveillance-target-reticle"
                style={{
                  ['--target-color' as string]: target.color,
                  ['--target-angle' as string]: `${target.baseAngle + target.audioTwistDeg}deg`,
                }}
              >
                <div className="surveillance-target-reticle-inner" />
                <div className="surveillance-target-reticle-axis surveillance-target-reticle-axis-x" />
                <div className="surveillance-target-reticle-axis surveillance-target-reticle-axis-y" />
                <div className="surveillance-target-reticle-bracket surveillance-target-reticle-bracket-tl" />
                <div className="surveillance-target-reticle-bracket surveillance-target-reticle-bracket-tr" />
                <div className="surveillance-target-reticle-bracket surveillance-target-reticle-bracket-bl" />
                <div className="surveillance-target-reticle-bracket surveillance-target-reticle-bracket-br" />
              </div>

              <div className="surveillance-target-link" style={{ left: `${lineX - target.x}px`, width: `${lineWidth}px` }} />

              <div className="surveillance-target-label" style={{ left: `${labelX - target.x}px`, top: `${labelY - target.y}px` }}>
                <div className="surveillance-target-title">{target.title.toUpperCase()}</div>
                <div className="surveillance-target-meta">LIVE • {target.metric}</div>
                <div className="surveillance-target-threat">{target.sourceLabel}</div>
                <div className="surveillance-target-dwell">LAT {target.lat.toFixed(2)} • LNG {target.lng.toFixed(2)}</div>
              </div>
            </div>
          )
        })}
        <div className="surveillance-targeting-footer">
          TARGETING LAYER v2.4 ENABLED • NO SYNTHETIC TARGETS • REAL EVENTS ONLY
        </div>
      </div>
      {!edgeToEdge && <div className="surveillance-surface__caption">Leaflet transit map with live wireframe grid, route overlays, and alert rings.</div>}
    </div>
  )
}