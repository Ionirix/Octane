import { useEffect, useRef, useState } from 'react'
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

export function SurveillanceMap({ altitude, focusedNodeId, nodes, alerts, wireframesVisible = true, audioReactive, edgeToEdge }: SurveillanceMapProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<MapController | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
      {!edgeToEdge && <div className="surveillance-surface__caption">Leaflet transit map with live wireframe grid, route overlays, and alert rings.</div>}
    </div>
  )
}