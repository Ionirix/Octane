import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import visualizationConfig from '@/config/visualization.json'
import type { VisualizationAlert, VisualizationNode } from '@/modules/visualization/types'
import '@/styles/map.css'

type MapModule = typeof import('@/modules/visualization/map')
type MapController = ReturnType<MapModule['initMap']>

type SurveillanceMapProps = {
  altitude: number
  focusedNodeId: string
  nodes: VisualizationNode[]
  alerts: VisualizationAlert[]
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
  angle: number
  color: string
  metric: string
  threatLabel: string
}

type TargetPhase = 'entry' | 'acquire' | 'dwell' | 'exit' | 'resolved'

type TargetTrack = TargetLock & {
  phase: TargetPhase
  phaseStartedAt: number
  lastSeenAt: number
}

type ProjectedTarget = TargetTrack & {
  x: number
  y: number
  phaseElapsedMs: number
  dwellRemainingSeconds: number
  phaseLabel: string
}

const TARGET_ANGLES = [-31, 0, 22, 47]
const TARGET_PHASE_MS = {
  entry: 620,
  acquire: 1_850,
  dwell: 8_000,
  exit: 420,
  resolved: 220,
} as const

function nextPhase(current: TargetPhase): TargetPhase {
  if (current === 'entry') return 'acquire'
  if (current === 'acquire') return 'dwell'
  if (current === 'dwell') return 'exit'
  if (current === 'exit') return 'resolved'
  return 'resolved'
}

function phaseLabel(phase: TargetPhase): string {
  if (phase === 'entry') return 'ENTRY'
  if (phase === 'acquire') return 'ACQUIRING'
  if (phase === 'dwell') return 'LOCKED'
  if (phase === 'exit') return 'DISENGAGING'
  return 'INCIDENT RESOLVED'
}

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

function hashToPoint(id: string): { lat: number; lng: number } {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = ((hash << 5) - hash) + id.charCodeAt(index)
    hash |= 0
  }
  const lat = -52 + (Math.abs(hash % 132))
  const lng = -170 + (Math.abs((hash >> 3) % 340))
  return { lat, lng }
}

function resolveAlertPoint(alert: VisualizationAlert, nodeById: Map<string, VisualizationNode>): { lat: number; lng: number } {
  if (typeof alert.lat === 'number' && typeof alert.lng === 'number') return { lat: alert.lat, lng: alert.lng }
  if (alert.location && typeof alert.location.lat === 'number' && typeof alert.location.lng === 'number') {
    return { lat: alert.location.lat, lng: alert.location.lng }
  }
  if (alert.serverId) {
    const node = nodeById.get(alert.serverId)
    if (node) return { lat: node.lat, lng: node.lng }
  }
  return hashToPoint(`${alert.id}:${alert.type}`)
}

function geoDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const latDelta = a.lat - b.lat
  const lngDelta = Math.min(Math.abs(a.lng - b.lng), 360 - Math.abs(a.lng - b.lng))
  return Math.sqrt((latDelta * latDelta) + (lngDelta * lngDelta))
}

function pickDistributedTargets(alerts: VisualizationAlert[], nodes: VisualizationNode[]): Array<VisualizationAlert & { lat: number; lng: number; category: TargetCategory }> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  let prioritized = alerts
    .filter((alert) => !alert.resolved)
    .map((alert) => {
      const point = resolveAlertPoint(alert, nodeById)
      return {
        ...alert,
        category: normalizeCategory(alert.type),
        lat: point.lat,
        lng: point.lng,
      }
    })
    .sort((left, right) => {
      const severityDelta = severityRank(right.severity) - severityRank(left.severity)
      if (severityDelta !== 0) return severityDelta
      return (right.timestamp ?? 0) - (left.timestamp ?? 0)
    })

  if (prioritized.length === 0) {
    prioritized = nodes
      .slice()
      .sort((left, right) => {
        if (left.status !== right.status) {
          return severityRank(
            right.status === 'CRITICAL' || right.status === 'OFFLINE' ? 'CRITICAL' : right.status === 'DEGRADED' ? 'WARNING' : 'INFO',
          )
            - severityRank(
              left.status === 'CRITICAL' || left.status === 'OFFLINE' ? 'CRITICAL' : left.status === 'DEGRADED' ? 'WARNING' : 'INFO',
            )
        }
        return right.latencyMs - left.latencyMs
      })
      .slice(0, 4)
      .map((node, index) => {
        const fallbackSeverity: VisualizationAlert['severity'] = node.status === 'CRITICAL' || node.status === 'OFFLINE'
          ? 'CRITICAL'
          : node.status === 'DEGRADED'
            ? 'WARNING'
            : 'INFO'
        const fallbackType = index % 3 === 0 ? 'TRAFFIC' : index % 3 === 1 ? 'SERVICE' : 'POLICE'
        return {
          id: `fallback-target-${node.id}`,
          type: fallbackType,
          severity: fallbackSeverity,
          title: `${node.country} ${node.name}`,
          timestamp: Date.now(),
          resolved: false,
          lat: node.lat,
          lng: node.lng,
          category: normalizeCategory(fallbackType),
        }
      })
  }

  const picked: Array<VisualizationAlert & { lat: number; lng: number; category: TargetCategory }> = []
  for (const candidate of prioritized) {
    if (picked.length >= 4) break
    if (picked.length === 0) {
      picked.push(candidate)
      continue
    }

    const farEnough = picked.every((target) => geoDistance(target, candidate) >= 18)
    if (farEnough || picked.length >= 3) {
      picked.push(candidate)
    }
  }

  for (const candidate of prioritized) {
    if (picked.length >= 4) break
    if (picked.some((target) => target.id === candidate.id)) continue
    picked.push(candidate)
  }

  return picked.slice(0, 4)
}

function buildMetric(alert: VisualizationAlert): string {
  if (alert.type.toLowerCase().includes('route')) return 'Route Pressure'
  if (alert.type.toLowerCase().includes('weather')) return 'Weather Vector'
  if (alert.type.toLowerCase().includes('police')) return 'Security Index'
  if (alert.type.toLowerCase().includes('traffic')) return 'Transit Density'
  return 'Incident Signal'
}

export function SurveillanceMap({ altitude, focusedNodeId, nodes, alerts, wireframesVisible = true, audioReactive, edgeToEdge }: SurveillanceMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<MapController | null>(null)
  const lockMetaRef = useRef<Map<string, { angle: number }>>(new Map())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [targetTracks, setTargetTracks] = useState<TargetTrack[]>([])
  const [projectedTargets, setProjectedTargets] = useState<ProjectedTarget[]>([])
  const [now, setNow] = useState(Date.now())

  const selectedTargets = useMemo(() => {
    const nextTargets = pickDistributedTargets(alerts, nodes)
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
      const confidence = clamp01(0.58 + (intensity * 0.12))
      const threat = target.severity === 'EMERGENCY' || target.severity === 'CRITICAL'
        ? `THREAT ${Math.round(82 + (confidence * 13))}`
        : `CONFIDENCE ${Math.round(confidence * 1000) / 10}%`

      return {
        id: target.id,
        title: target.title ?? target.type,
        severity: target.severity,
        category: target.category,
        lat: target.lat,
        lng: target.lng,
        angle: meta.angle,
        color: targetColor(target.severity, target.category),
        metric: buildMetric(target),
        threatLabel: threat,
      }
    })
  }, [alerts, nodes])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === surfaceRef.current)
      controllerRef.current?.setAltitude(altitude)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [altitude])

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
      controller.setData(nodes, alerts, focusedNodeId)
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
    controllerRef.current?.setData(nodes, alerts, focusedNodeId)
  }, [alerts, focusedNodeId, nodes])

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
    const timer = window.setInterval(() => {
      setNow(Date.now())
    }, 200)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const selectedById = new Map(selectedTargets.map((target) => [target.id, target]))

    setTargetTracks((previous) => {
      const previousById = new Map(previous.map((track) => [track.id, track]))
      const nextById = new Map<string, TargetTrack>()

      selectedTargets.forEach((target) => {
        const previousTrack = previousById.get(target.id)
        if (!previousTrack) {
          nextById.set(target.id, {
            ...target,
            phase: 'entry',
            phaseStartedAt: now,
            lastSeenAt: now,
          })
          return
        }

        const restarting = previousTrack.phase === 'exit' || previousTrack.phase === 'resolved'
        nextById.set(target.id, {
          ...previousTrack,
          ...target,
          phase: restarting ? 'entry' : previousTrack.phase,
          phaseStartedAt: restarting ? now : previousTrack.phaseStartedAt,
          lastSeenAt: now,
        })
      })

      previous.forEach((track) => {
        if (selectedById.has(track.id)) return
        if (track.phase === 'exit' || track.phase === 'resolved') {
          nextById.set(track.id, track)
          return
        }
        nextById.set(track.id, {
          ...track,
          phase: 'exit',
          phaseStartedAt: now,
        })
      })

      const advanced: TargetTrack[] = []
      nextById.forEach((track) => {
        let nextTrack = track
        let iterations = 0
        while (iterations < 3) {
          iterations += 1
          const elapsed = now - nextTrack.phaseStartedAt
          const duration = TARGET_PHASE_MS[nextTrack.phase]
          if (nextTrack.phase === 'dwell' && elapsed >= duration) {
            nextTrack = {
              ...nextTrack,
              phase: 'exit',
              phaseStartedAt: now,
            }
            continue
          }
          if (nextTrack.phase !== 'dwell' && elapsed >= duration) {
            const promoted = nextPhase(nextTrack.phase)
            if (promoted === 'resolved') {
              nextTrack = {
                ...nextTrack,
                phase: promoted,
                phaseStartedAt: now,
              }
              continue
            }
            nextTrack = {
              ...nextTrack,
              phase: promoted,
              phaseStartedAt: now,
            }
            continue
          }
          break
        }

        if (nextTrack.phase === 'resolved' && (now - nextTrack.phaseStartedAt) >= TARGET_PHASE_MS.resolved) {
          return
        }

        advanced.push(nextTrack)
      })

      return advanced
    })
  }, [now, selectedTargets])

  useEffect(() => {
    let rafId = 0

    const tick = () => {
      const controller = controllerRef.current
      const container = containerRef.current
      if (!controller || !container || targetTracks.length === 0) {
        setProjectedTargets([])
        rafId = window.requestAnimationFrame(tick)
        return
      }

      const width = container.clientWidth
      const height = container.clientHeight
      const next = targetTracks
        .map((target) => {
          const point = controller.projectLatLng(target.lat, target.lng)
          if (!point) return null

          const x = Math.max(72, Math.min(width - 72, point.x))
          const y = Math.max(72, Math.min(height - 72, point.y))
          const phaseElapsedMs = Math.max(0, now - target.phaseStartedAt)
          const dwellRemainingSeconds = target.phase === 'dwell'
            ? Math.max(0, (TARGET_PHASE_MS.dwell - phaseElapsedMs) / 1000)
            : 0
          return {
            ...target,
            x,
            y,
            phaseElapsedMs,
            dwellRemainingSeconds,
            phaseLabel: phaseLabel(target.phase),
          }
        })
        .filter((target): target is ProjectedTarget => target !== null)

      setProjectedTargets(next)
      rafId = window.requestAnimationFrame(tick)
    }

    rafId = window.requestAnimationFrame(tick)
    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [now, targetTracks])

  const toggleFullscreen = async () => {
    const surface = surfaceRef.current
    if (!surface) return

    try {
      if (document.fullscreenElement === surface) {
        await document.exitFullscreen()
      } else {
        await surface.requestFullscreen()
      }
    } catch {
      // Ignore fullscreen API errors for unsupported browsers/policies.
    }
  }

  return (
    <div ref={surfaceRef} className={`surveillance-surface surveillance-surface--map flex-1 ${edgeToEdge ? 'surveillance-surface--map-edge' : ''}`}>
      <button
        type="button"
        onClick={() => void toggleFullscreen()}
        className="surveillance-map-fullscreen-btn"
        aria-label={isFullscreen ? 'Exit fullscreen map' : 'Enter fullscreen map'}
      >
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
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
          TARGETING LAYER ACTIVE • {projectedTargets.filter((target) => target.phase === 'entry' || target.phase === 'acquire' || target.phase === 'dwell').length}/4 INCIDENTS LOCKED • GLOBAL MULTI-TARGET ACQUISITION • ROTATION CYCLE: 2.4s
        </div>
        {projectedTargets.map((target, index) => {
          const labelRight = target.x < 440
          const labelX = target.x + (labelRight ? 96 : -240)
          const labelY = target.y - 18
          const lineX = target.x + (labelRight ? 62 : -140)
          const lineWidth = labelRight ? 90 : 76

          return (
            <div key={target.id} className={`surveillance-target-lock surveillance-target-lock--${target.phase}`} style={{ left: `${target.x}px`, top: `${target.y}px` }}>
              <div
                className="surveillance-target-reticle"
                style={{
                  ['--target-color' as string]: target.color,
                  ['--target-angle' as string]: `${target.angle}deg`,
                  ['--target-phase-progress' as string]: String(clamp01(target.phaseElapsedMs / TARGET_PHASE_MS[target.phase])),
                  animationDelay: `${index * 90}ms`,
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
                <div className="surveillance-target-meta">{target.phaseLabel} • {target.metric}</div>
                {target.phase !== 'resolved' ? <div className="surveillance-target-threat">{target.threatLabel}</div> : null}
                <div className="surveillance-target-dwell">
                  {target.phase === 'dwell'
                    ? `DWELL ${target.dwellRemainingSeconds.toFixed(1)}s`
                    : target.phase === 'resolved'
                      ? 'FLASH RESOLVED'
                      : target.phase === 'exit'
                        ? 'EXITING'
                        : 'LOCK TRANSITION'}
                </div>
              </div>
            </div>
          )
        })}
        <div className="surveillance-targeting-footer">
          TARGETING LAYER v2.3 ENABLED • Auto-dwell 8s per target • Auto-dismiss on resolution
        </div>
      </div>
      {!edgeToEdge && <div className="surveillance-surface__caption">Leaflet transit map with live wireframe grid, route overlays, and alert rings.</div>}
    </div>
  )
}