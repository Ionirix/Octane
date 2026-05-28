import { useEffect, useRef, useState } from 'react'
import type { CircleMarker, ImageOverlay, LayerGroup, Map as LeafletMap, Polyline, Polygon, TileLayer, Tooltip } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import '@/styles/weather.css'
import type { WeatherEnvLayerType, WeatherLayerData, WeatherMapView, WeatherRadarFrame, WeatherStormCell } from '@/modules/weather/types'
import { RadarLayer } from './RadarLayer'

function findNearestPoint(
  points: Array<{ lat: number; lng: number; value: number }>,
  lat: number,
  lng: number,
): { lat: number; lng: number; value: number } | undefined {
  let nearest: { lat: number; lng: number; value: number } | undefined
  let bestScore = Number.POSITIVE_INFINITY

  points.forEach((point) => {
    const dLat = point.lat - lat
    const dLng = point.lng - lng
    const score = (dLat * dLat) + (dLng * dLng)
    if (score < bestScore) {
      bestScore = score
      nearest = point
    }
  })

  return nearest
}

function projectPoint(origin: [number, number], headingDeg: number, distanceDeg: number): [number, number] {
  const heading = (headingDeg * Math.PI) / 180
  const lat = origin[0] + (Math.cos(heading) * distanceDeg)
  const lngScale = Math.max(0.3, Math.cos((origin[0] * Math.PI) / 180))
  const lng = origin[1] + ((Math.sin(heading) * distanceDeg) / lngScale)
  return [Number(lat.toFixed(4)), Number(lng.toFixed(4))]
}

function buildPredictionTrack(
  centroid: [number, number],
  speedKts: number,
  directionDeg: number,
  horizonHours = 12,
  stepHours = 2,
): Array<[number, number]> {
  const points: Array<[number, number]> = [centroid]
  const speedDegPerHour = Math.max(0.04, speedKts / 60)

  for (let hour = stepHours; hour <= horizonHours; hour += stepHours) {
    const drift = Math.sin(hour / 2.3) * 8
    const heading = directionDeg + drift
    const distance = speedDegPerHour * hour
    points.push(projectPoint(centroid, heading, distance))
  }

  return points
}

type HurricaneModelTrack = {
  name: string
  color: string
  points: Array<[number, number]>
}

const HURRICANE_MODEL_GUIDANCE: Array<{ name: string; color: string; headingBias: number; speedScale: number }> = [
  { name: 'GFS', color: '#22c55e', headingBias: -6, speedScale: 1.04 },
  { name: 'ECMWF', color: '#f59e0b', headingBias: 2, speedScale: 0.98 },
  { name: 'UKMET', color: '#ef4444', headingBias: -12, speedScale: 1.1 },
  { name: 'CMC', color: '#38bdf8', headingBias: 8, speedScale: 0.93 },
  { name: 'HWRF', color: '#eab308', headingBias: -3, speedScale: 1.08 },
  { name: 'HMON', color: '#84cc16', headingBias: -10, speedScale: 1.02 },
  { name: 'ICON', color: '#f97316', headingBias: 11, speedScale: 0.91 },
  { name: 'NAVGEM', color: '#a855f7', headingBias: 5, speedScale: 0.96 },
  { name: 'CTCX', color: '#f8fafc', headingBias: 14, speedScale: 0.88 },
  { name: 'AP02', color: '#fef08a', headingBias: 18, speedScale: 0.85 },
]

function buildModelGuidanceTracks(
  centroid: [number, number],
  speedKts: number,
  directionDeg: number,
): HurricaneModelTrack[] {
  return HURRICANE_MODEL_GUIDANCE.map((model, modelIndex) => {
    const horizonHours = 36
    const stepHours = 6
    const totalSteps = horizonHours / stepHours
    const speedDegPerHour = Math.max(0.04, (speedKts * model.speedScale) / 60)

    const points: Array<[number, number]> = [centroid]

    for (let stepIndex = 1; stepIndex <= totalSteps; stepIndex += 1) {
      // Keep model guidance tightly grouped near origin, then fan out downstream.
      const divergence = Math.pow(stepIndex / totalSteps, 1.85)
      const headingBias = model.headingBias * divergence
      const curvature = Math.sin((stepIndex * 0.62) + modelIndex) * 5.2 * divergence
      const heading = directionDeg + headingBias + curvature
      const distance = speedDegPerHour * stepHours * stepIndex * (0.96 + (divergence * 0.08))
      points.push(projectPoint(centroid, heading, distance))
    }

    return {
      name: model.name,
      color: model.color,
      points,
    }
  })
}

function toGrayHex(value: number, min = 58, max = 220): string {
  const clamped = Math.max(0, Math.min(100, value)) / 100
  const channel = Math.round(min + ((max - min) * clamped))
  const hex = channel.toString(16).padStart(2, '0')
  return `#${hex}${hex}${hex}`
}

function toBlueHex(value: number, min = 120, max = 235): string {
  const clamped = Math.max(0, Math.min(100, value)) / 100
  const blue = Math.round(min + ((max - min) * clamped))
  const green = Math.round(130 + (clamped * 70))
  const red = Math.round(40 + (clamped * 55))
  const r = red.toString(16).padStart(2, '0')
  const g = green.toString(16).padStart(2, '0')
  const b = blue.toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function distanceSquared(a: [number, number], b: [number, number]): number {
  const dLat = a[0] - b[0]
  const dLng = a[1] - b[1]
  return (dLat * dLat) + (dLng * dLng)
}

function buildCloudPatch(
  center: [number, number],
  intensity: number,
  seed: number,
  scaleDeg: number,
): Array<[number, number]> {
  const points = CLOUD_PATCH_POINT_COUNT
  const strength = 0.96 + (intensity * 0.62)
  const lngScale = Math.max(0.35, Math.cos((center[0] * Math.PI) / 180))

  return Array.from({ length: points }).map((_, index) => {
    const angle = (index / points) * Math.PI * 2
    const wobbleA = Math.sin((seed * 0.61) + (index * 0.74)) * 0.16
    const wobbleB = Math.cos((seed * 0.47) + (index * 1.03)) * 0.13
    const puff = 0.92 + (Math.abs(Math.sin((seed * 0.29) + (angle * 1.45))) * 0.42)
    const lobe = 0.94 + (Math.abs(Math.cos((seed * 0.18) + (angle * 2.15))) * 0.24)
    const radius = scaleDeg * strength * (0.94 + wobbleA + wobbleB) * puff * lobe
    const lat = center[0] + (Math.cos(angle) * radius)
    const lng = center[1] + ((Math.sin(angle) * radius * (1.14 + (wobbleA * 0.55))) / lngScale)
    return [Number(lat.toFixed(4)), Number(lng.toFixed(4))]
  })
}

function buildCloudMassCenters(
  center: [number, number],
  driftDeg: number,
  scaleDeg: number,
): Array<[number, number]> {
  return [
    center,
    projectPoint(center, driftDeg + 24, scaleDeg * 0.56),
    projectPoint(center, driftDeg - 31, scaleDeg * 0.48),
    projectPoint(center, driftDeg + 78, scaleDeg * 0.33),
    projectPoint(center, driftDeg - 88, scaleDeg * 0.29),
  ]
}

function downsampleVectorPoints(
  points: Array<{ lat: number; lng: number; value: number; directionDeg?: number }>,
  cap: number,
): Array<{ lat: number; lng: number; value: number; directionDeg?: number }> {
  if (points.length <= cap) return points
  const stride = Math.max(1, Math.floor(points.length / cap))
  const sampled: Array<{ lat: number; lng: number; value: number; directionDeg?: number }> = []
  for (let index = 0; index < points.length; index += stride) {
    sampled.push(points[index])
    if (sampled.length >= cap) break
  }
  return sampled
}

function buildCloudRasterDataUrl(
  points: Array<{ lat: number; lng: number; value: number; directionDeg?: number }>,
  bounds: { west: number; south: number; east: number; north: number },
  mode: 'cloud' | 'storm',
  timeIso: string,
): string {
  function blurField(source: Float32Array, w: number, h: number, passes: number): Float32Array {
    let current = source
    for (let pass = 0; pass < passes; pass += 1) {
      const horizontal = new Float32Array(w * h)
      const out = new Float32Array(w * h)

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const left = current[(y * w) + Math.max(0, x - 1)]
          const center = current[(y * w) + x]
          const right = current[(y * w) + Math.min(w - 1, x + 1)]
          horizontal[(y * w) + x] = (left + (center * 2) + right) / 4
        }
      }

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const top = horizontal[(Math.max(0, y - 1) * w) + x]
          const center = horizontal[(y * w) + x]
          const bottom = horizontal[(Math.min(h - 1, y + 1) * w) + x]
          out[(y * w) + x] = (top + (center * 2) + bottom) / 4
        }
      }

      current = out
    }
    return current
  }

  const width = 480
  const height = 300
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')

  const field = new Float32Array(width * height)
  const lngSpan = Math.max(0.0001, bounds.east - bounds.west)
  const latSpan = Math.max(0.0001, bounds.north - bounds.south)
  const nowPhase = Math.floor(new Date(timeIso).getTime() / 1000) / 3600

  points.forEach((point, index) => {
    const nx = (point.lng - bounds.west) / lngSpan
    const ny = (bounds.north - point.lat) / latSpan
    if (nx < -0.2 || nx > 1.2 || ny < -0.2 || ny > 1.2) return

    const cx = Math.round(nx * (width - 1))
    const cy = Math.round(ny * (height - 1))
    const normalized = Math.max(0, Math.min(1, mode === 'storm' ? (point.value - 30) / 70 : (point.value - 18) / 82))
    const radius = (mode === 'storm' ? 18 : 24) + (normalized * (mode === 'storm' ? 26 : 38))
    const sigma = radius * 0.72
    const denom = 2 * sigma * sigma
    const heading = ((point.directionDeg ?? 245) * Math.PI) / 180
    const advectX = Math.sin(heading)
    const advectY = -Math.cos(heading)

    const minX = Math.max(0, Math.floor(cx - radius))
    const maxX = Math.min(width - 1, Math.ceil(cx + radius))
    const minY = Math.max(0, Math.floor(cy - radius))
    const maxY = Math.min(height - 1, Math.ceil(cy + radius))

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = x - cx
        const dy = y - cy
        const d2 = (dx * dx) + (dy * dy)
        if (d2 > radius * radius) continue

        const noise = 0.88 + (0.18 * Math.sin((x * 0.06) + (y * 0.04) + nowPhase + (index * 0.07)))
        const influence = normalized * Math.exp(-d2 / denom) * noise
        const slot = (y * width) + x
        field[slot] = Math.min(1, field[slot] + (influence * (mode === 'storm' ? 0.75 : 0.62)))

        // Advection smear: stretch cloud energy along motion direction for fluid cloud flow.
        const smearDistance = mode === 'storm' ? 9 : 13
        const sx = Math.round(x + (advectX * smearDistance))
        const sy = Math.round(y + (advectY * smearDistance))
        if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
          const sSlot = (sy * width) + sx
          field[sSlot] = Math.min(1, field[sSlot] + (influence * (mode === 'storm' ? 0.22 : 0.3)))
        }
      }
    }
  })

  const smoothedField = blurField(field, width, height, mode === 'storm' ? 2 : 3)

  const imageData = ctx.createImageData(width, height)
  for (let i = 0; i < field.length; i += 1) {
    const v = Math.max(0, Math.min(1, smoothedField[i]))
    const alpha = v < 0.08 ? 0 : Math.min(1, Math.pow(v, 1.18))
    const pixel = i * 4

    if (mode === 'storm') {
      imageData.data[pixel] = Math.round(180 + (v * 45))
      imageData.data[pixel + 1] = Math.round(200 + (v * 35))
      imageData.data[pixel + 2] = Math.round(232 + (v * 20))
      imageData.data[pixel + 3] = Math.round(alpha * 180)
    } else {
      imageData.data[pixel] = Math.round(218 + (v * 35))
      imageData.data[pixel + 1] = Math.round(228 + (v * 27))
      imageData.data[pixel + 2] = Math.round(243 + (v * 12))
      imageData.data[pixel + 3] = Math.round(alpha * 168)
    }
  }

  ctx.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/png')
}

function buildVectorPointsSignature(
  points: Array<{ lat: number; lng: number; value: number; directionDeg?: number }> | undefined,
): string {
  if (!points || points.length === 0) return 'none'

  const sampleCount = Math.min(16, points.length)
  const sampleIndexes = Array.from({ length: sampleCount }).map((_, index) => {
    if (sampleCount === 1) return 0
    return Math.floor((index / (sampleCount - 1)) * (points.length - 1))
  })
  const sample = sampleIndexes
    .map((index) => points[index])
    .filter((point): point is { lat: number; lng: number; value: number; directionDeg?: number } => Boolean(point))
    .map((point) => `${point.lat.toFixed(2)},${point.lng.toFixed(2)},${point.value.toFixed(1)},${(point.directionDeg ?? -1).toFixed(1)}`)
    .join('|')

  return `${points.length}:${sample}`
}

type LeafletModule = typeof import('leaflet')

const CLOUD_MASS_SIZE_MULTIPLIER = 4
const CLOUD_PATCH_POINT_COUNT = 18
const CLOUD_COVERAGE_POINT_CAP = 90
const STORM_CLOUD_POINT_CAP = 120
const HURRICANE_RAIN_POINT_CAP = 140

type WeatherMapContainerProps = {
  mapView: WeatherMapView
  frame?: WeatherRadarFrame
  stormCells: WeatherStormCell[]
  selectedStormId?: string
  envLayers: Partial<Record<WeatherEnvLayerType, WeatherLayerData>>
  stormsVisible: boolean
  envVisibility: Record<WeatherEnvLayerType, boolean>
  envOpacity: Record<WeatherEnvLayerType, number>
  radarVisible: boolean
  radarOpacity: number
  loading?: boolean
  noDataMessage?: string | null
  followSelectedStorm?: boolean
  onStormSelect: (stormId: string) => void
  onMapViewChange: (
    center: [number, number],
    zoom: number,
    bounds: { west: number; south: number; east: number; north: number },
  ) => void
}

export function WeatherMapContainer({
  mapView,
  frame,
  stormCells,
  selectedStormId,
  envLayers,
  stormsVisible,
  envVisibility,
  envOpacity,
  radarVisible,
  radarOpacity,
  loading = false,
  noDataMessage,
  followSelectedStorm = true,
  onStormSelect,
  onMapViewChange,
}: WeatherMapContainerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const baseLayerRef = useRef<TileLayer | null>(null)
  const radarLayerRef = useRef<TileLayer | null>(null)
  const stormLayerRef = useRef<LayerGroup | null>(null)
  const envLayerRefs = useRef<Partial<Record<WeatherEnvLayerType, LayerGroup>>>({})
  const envTileLayerRefs = useRef<Partial<Record<WeatherEnvLayerType, TileLayer>>>({})
  const envImageLayerRefs = useRef<Partial<Record<WeatherEnvLayerType, ImageOverlay>>>({})
  const envLayerSignatureRefs = useRef<Partial<Record<WeatherEnvLayerType, string>>>({})
  const isZoomingRef = useRef(false)
  const isPanningRef = useRef(false)
  const lastMapEventViewRef = useRef<{ center: [number, number]; zoom: number } | null>(null)
  const leafletRef = useRef<LeafletModule | null>(null)
  const hoverTimerRef = useRef<number | null>(null)
  const envProbeTooltipRef = useRef<Tooltip | null>(null)
  const stormHoverTimerRef = useRef<number | null>(null)
  const stormPrecipTooltipRef = useRef<Tooltip | null>(null)
  const [mapReady, setMapReady] = useState(false)

  useEffect(() => {
    let disposed = false

    const mount = async () => {
      if (!rootRef.current) return

      const leaflet = await import('leaflet')
      if (disposed || !rootRef.current) return

      leafletRef.current = leaflet
      const map = leaflet.map(rootRef.current, {
        zoomControl: true,
        attributionControl: true,
        minZoom: 2,
        maxZoom: 12,
        preferCanvas: true,
        zoomAnimation: true,
        markerZoomAnimation: true,
        fadeAnimation: false,
      }).setView(mapView.center, mapView.zoom)

      map.createPane('weatherRadarPane')
      map.getPane('weatherRadarPane')!.style.zIndex = '420'
      map.createPane('weatherEnvPane')
      map.getPane('weatherEnvPane')!.style.zIndex = '460'
      map.createPane('weatherStormPane')
      map.getPane('weatherStormPane')!.style.zIndex = '470'

      const baseProviders = [
        {
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          options: { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' },
        },
        {
          url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          options: { maxZoom: 20, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO' },
        },
      ] as const

      let providerIndex = 0
      let providerErrors = 0

      const mountBaseLayer = () => {
        const provider = baseProviders[Math.min(providerIndex, baseProviders.length - 1)]
        baseLayerRef.current?.remove()
        const layer = leaflet.tileLayer(provider.url, {
          ...provider.options,
          crossOrigin: true,
        }).addTo(map)

        layer.on('tileerror', () => {
          providerErrors += 1
          if (providerErrors < 6) return

          if (providerIndex < baseProviders.length - 1) {
            providerIndex += 1
            providerErrors = 0
            mountBaseLayer()
          }
        })

        baseLayerRef.current = layer
      }

      mountBaseLayer()

      stormLayerRef.current = leaflet.layerGroup().addTo(map)
      envLayerRefs.current = {
        precipitation: leaflet.layerGroup().addTo(map),
        wind: leaflet.layerGroup().addTo(map),
        pressure: leaflet.layerGroup().addTo(map),
        smoke: leaflet.layerGroup().addTo(map),
        cloudCoverage: leaflet.layerGroup().addTo(map),
        stormCloudCoverage: leaflet.layerGroup().addTo(map),
        hurricaneRainRadar: leaflet.layerGroup().addTo(map),
        lightningTracking: leaflet.layerGroup().addTo(map),
      }

      map.on('movestart', () => {
        isPanningRef.current = true
      })

      map.on('moveend', () => {
        const center = map.getCenter()
        const bounds = map.getBounds()
        const nextCenter: [number, number] = [
          Number(center.lat.toFixed(6)),
          Number(center.lng.toFixed(6)),
        ]
        const zoom = map.getZoom()
        isPanningRef.current = false
        lastMapEventViewRef.current = { center: nextCenter, zoom }

        onMapViewChange(
          nextCenter,
          zoom,
          {
            west: Number(bounds.getWest().toFixed(6)),
            south: Number(bounds.getSouth().toFixed(6)),
            east: Number(bounds.getEast().toFixed(6)),
            north: Number(bounds.getNorth().toFixed(6)),
          },
        )
      })

      map.on('zoomstart', () => {
        isZoomingRef.current = true
      })

      map.on('zoomend', () => {
        isZoomingRef.current = false
      })

      const forceSize = () => map.invalidateSize({ pan: false, animate: false })
      const observer = new ResizeObserver(() => forceSize())
      observer.observe(rootRef.current)

      requestAnimationFrame(() => {
        forceSize()
        requestAnimationFrame(() => forceSize())
      })

      mapRef.current = map
      setMapReady(true)

      ;(map as LeafletMap & { __weatherResizeObserver?: ResizeObserver }).__weatherResizeObserver = observer
    }

    void mount()

    return () => {
      disposed = true
      baseLayerRef.current?.remove()
      baseLayerRef.current = null
      radarLayerRef.current?.remove()
      radarLayerRef.current = null
      stormLayerRef.current?.remove()
      stormLayerRef.current = null
      Object.values(envTileLayerRefs.current).forEach((layer) => layer?.remove())
      envTileLayerRefs.current = {}
      Object.values(envImageLayerRefs.current).forEach((layer) => layer?.remove())
      envImageLayerRefs.current = {}
      envLayerSignatureRefs.current = {}
      Object.values(envLayerRefs.current).forEach((layer) => layer?.remove())
      envLayerRefs.current = {}
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      if (stormHoverTimerRef.current) {
        window.clearTimeout(stormHoverTimerRef.current)
        stormHoverTimerRef.current = null
      }
      envProbeTooltipRef.current?.remove()
      envProbeTooltipRef.current = null
      stormPrecipTooltipRef.current?.remove()
      stormPrecipTooltipRef.current = null
      const map = mapRef.current as (LeafletMap & { __weatherResizeObserver?: ResizeObserver }) | null
      map?.__weatherResizeObserver?.disconnect()
      map?.remove()
      mapRef.current = null
      leafletRef.current = null
      isZoomingRef.current = false
      isPanningRef.current = false
      lastMapEventViewRef.current = null
      setMapReady(false)
    }
  }, [onMapViewChange])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const lastMapEventView = lastMapEventViewRef.current
    if (lastMapEventView) {
      const centerMatchesMapEvent = Math.abs(lastMapEventView.center[0] - mapView.center[0]) < 0.0002
        && Math.abs(lastMapEventView.center[1] - mapView.center[1]) < 0.0002
      const zoomMatchesMapEvent = lastMapEventView.zoom === mapView.zoom
      if (centerMatchesMapEvent && zoomMatchesMapEvent) {
        lastMapEventViewRef.current = null
        return
      }
    }

    const center = map.getCenter()
    const centerChanged = Math.abs(center.lat - mapView.center[0]) > 0.0001 || Math.abs(center.lng - mapView.center[1]) > 0.0001
    const zoomChanged = map.getZoom() !== mapView.zoom

    if (!isZoomingRef.current && !isPanningRef.current && (centerChanged || zoomChanged)) {
      map.setView(mapView.center, mapView.zoom, { animate: false })
    }
  }, [mapView])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!map || !leaflet || !followSelectedStorm || !selectedStormId || !stormsVisible) return

    const selectedStorm = stormCells.find((storm) => storm.id === selectedStormId)
    if (!selectedStorm || selectedStorm.polygon.length < 3) return

    const stormBounds = leaflet.latLngBounds(selectedStorm.polygon)
    const mapBounds = map.getBounds()

    // Re-frame only when the selected storm is not already comfortably in-view.
    if (!mapBounds.pad(-0.12).contains(stormBounds)) {
      map.fitBounds(stormBounds.pad(0.55), {
        animate: false,
        maxZoom: 8,
      })
    }
  }, [followSelectedStorm, mapReady, selectedStormId, stormCells, stormsVisible])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!map || !leaflet) return

    radarLayerRef.current?.remove()
    radarLayerRef.current = null

    if (!radarVisible || !frame) return

    radarLayerRef.current = leaflet.tileLayer(frame.tileUrlTemplate, {
      opacity: radarOpacity,
      className: 'weather-radar-tile',
      attribution: frame.attribution ?? 'Weather radar',
      zIndex: 450,
      pane: 'weatherRadarPane',
      maxNativeZoom: 6,
      minNativeZoom: 0,
      updateWhenZooming: true,
      updateWhenIdle: true,
      keepBuffer: 4,
      crossOrigin: true,
      errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    }).addTo(map)
  }, [frame, mapReady, radarOpacity, radarVisible])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const leaflet = leafletRef.current
    const stormLayer = stormLayerRef.current
    if (!map || !leaflet || !stormLayer) return

    const precipitationPoints = envLayers.precipitation?.vectorPoints ?? []
    const stormCloudPoints = envLayers.stormCloudCoverage?.vectorPoints ?? []
    const hurricaneRainPoints = envLayers.hurricaneRainRadar?.vectorPoints ?? []

    const clearStormPrecipProbe = () => {
      if (stormHoverTimerRef.current) {
        window.clearTimeout(stormHoverTimerRef.current)
        stormHoverTimerRef.current = null
      }
      stormPrecipTooltipRef.current?.remove()
      stormPrecipTooltipRef.current = null
    }

    stormLayer.clearLayers()
    if (!stormsVisible) return

    const polygons: Polygon[] = []
    const arrows: Polyline[] = []
    const centroids: CircleMarker[] = []

    stormCells.forEach((storm) => {
      const polygonColor = storm.type === 'hurricane'
        ? '#fb7185'
        : storm.intensity.category === 'severe'
          ? '#ef4444'
          : storm.intensity.category === 'moderate'
            ? '#f59e0b'
            : '#22d3ee'
      const isSelected = selectedStormId === storm.id

      const polygon = leaflet.polygon(storm.polygon, {
        color: polygonColor,
        fillColor: polygonColor,
        fillOpacity: isSelected ? 0.56 : 0.4,
        opacity: isSelected ? 1 : 0.95,
        weight: isSelected ? 4.1 : 3,
        dashArray: storm.type === 'hurricane' ? '8 6' : undefined,
        pane: 'weatherStormPane',
        className: 'weather-storm-polygon',
      }).addTo(stormLayer)

      const label = storm.type === 'hurricane'
        ? `${storm.name} · Cat ${storm.hurricaneCategory ?? '?'} · ${storm.intensity.dbz} dBZ`
        : `${storm.name} · ${storm.intensity.dbz} dBZ`
      polygon.bindTooltip(label, { direction: 'top', opacity: 0.92 })
      polygon.on('click', () => onStormSelect(storm.id))
      polygon.on('mouseover', (event: { latlng?: { lat: number; lng: number } }) => {
        clearStormPrecipProbe()
        if (!envVisibility.precipitation || precipitationPoints.length === 0 || !event.latlng) return

        const { lat, lng } = event.latlng
        stormHoverTimerRef.current = window.setTimeout(() => {
          const nearest = findNearestPoint(precipitationPoints, lat, lng)
          if (!nearest) return

          stormPrecipTooltipRef.current = leaflet.tooltip({
            direction: 'top',
            offset: [0, -12],
            opacity: 0.95,
            className: 'weather-smoke-cursor-tooltip',
            pane: 'tooltipPane',
          })

          const nearestCloud = findNearestPoint(stormCloudPoints, lat, lng)
          const lines = [`Precipitation ${nearest.value.toFixed(1)} mm/hr`]
          if (nearestCloud) {
            lines.push(`Storm cloud ${nearestCloud.value.toFixed(0)}%`)
          }

          stormPrecipTooltipRef.current
            .setLatLng([lat, lng])
            .setContent(lines.join('<br/>'))
            .addTo(map)
        }, 2000)
      })
      polygon.on('mouseout', clearStormPrecipProbe)
      polygons.push(polygon)

      const centroid = leaflet.circleMarker(storm.centroid, {
        radius: isSelected ? 8.2 : 6.4,
        color: '#f8fafc',
        fillColor: polygonColor,
        fillOpacity: 1,
        opacity: 1,
        weight: storm.type === 'hurricane' ? 2.4 : 1.8,
        pane: 'weatherStormPane',
      }).addTo(stormLayer)
      centroid.on('click', () => onStormSelect(storm.id))
      centroid.on('mouseover', () => {
        clearStormPrecipProbe()
        if (!envVisibility.precipitation || precipitationPoints.length === 0) return

        const lat = storm.centroid[0]
        const lng = storm.centroid[1]
        stormHoverTimerRef.current = window.setTimeout(() => {
          const nearest = findNearestPoint(precipitationPoints, lat, lng)
          if (!nearest) return

          stormPrecipTooltipRef.current = leaflet.tooltip({
            direction: 'top',
            offset: [0, -12],
            opacity: 0.95,
            className: 'weather-smoke-cursor-tooltip',
            pane: 'tooltipPane',
          })

          const nearestCloud = findNearestPoint(stormCloudPoints, lat, lng)
          const lines = [`Precipitation ${nearest.value.toFixed(1)} mm/hr`]
          if (nearestCloud) {
            lines.push(`Storm cloud ${nearestCloud.value.toFixed(0)}%`)
          }

          stormPrecipTooltipRef.current
            .setLatLng([lat, lng])
            .setContent(lines.join('<br/>'))
            .addTo(map)
        }, 2000)
      })
      centroid.on('mouseout', clearStormPrecipProbe)
      centroids.push(centroid)

      const distance = 0.95
      const heading = (storm.movement.directionDeg * Math.PI) / 180
      const arrowLat = storm.centroid[0] + (Math.cos(heading) * distance)
      const arrowLng = storm.centroid[1] + (Math.sin(heading) * distance)
      const arrow = leaflet.polyline([storm.centroid, [arrowLat, arrowLng]], {
        color: storm.type === 'hurricane' ? '#fda4af' : '#f8fafc',
        opacity: 0.98,
        weight: isSelected ? 3.6 : 3,
        pane: 'weatherStormPane',
        className: 'weather-storm-vector',
      }).addTo(stormLayer)
      arrows.push(arrow)

      if (storm.type === 'hurricane') {
        const localRainBands = hurricaneRainPoints
          .filter((point) => distanceSquared([point.lat, point.lng], storm.centroid) <= 7.2)
          .sort((a, b) => distanceSquared([a.lat, a.lng], storm.centroid) - distanceSquared([b.lat, b.lng], storm.centroid))
          .slice(0, 18)

        localRainBands.forEach((bandPoint) => {
          const rainIntensity = Math.max(0, Math.min(1, bandPoint.value / 75))
          const isInnerBand = bandPoint.value >= 35
          const cloudShade = isInnerBand ? '#4b5563' : '#d1d5db'
          const outerPatch = buildCloudPatch(
            [bandPoint.lat, bandPoint.lng],
            rainIntensity,
            bandPoint.value + (storm.movement.directionDeg * 0.03),
            isInnerBand ? 0.24 : 0.2,
          )

          leaflet.polygon(outerPatch, {
            color: cloudShade,
            fillColor: cloudShade,
            fillOpacity: isInnerBand ? 0.3 : 0.22,
            opacity: isInnerBand ? 0.42 : 0.32,
            weight: 0,
            pane: 'weatherStormPane',
            className: isInnerBand ? 'weather-hurricane-mid-band-patch' : 'weather-hurricane-edge-band-patch',
          }).addTo(stormLayer)

          if (isInnerBand) {
            const innerPatch = buildCloudPatch(
              [bandPoint.lat, bandPoint.lng],
              rainIntensity,
              bandPoint.value + (storm.movement.directionDeg * 0.11),
              0.14,
            )
            leaflet.polygon(innerPatch, {
              color: '#334155',
              fillColor: '#334155',
              fillOpacity: 0.22,
              opacity: 0.24,
              weight: 0,
              pane: 'weatherStormPane',
              className: 'weather-cloud-patch-inner',
            }).addTo(stormLayer)
          }

          if (typeof bandPoint.directionDeg === 'number') {
            const rainVectorEnd = projectPoint([bandPoint.lat, bandPoint.lng], bandPoint.directionDeg, 0.22)
            leaflet.polyline([[bandPoint.lat, bandPoint.lng], rainVectorEnd], {
              color: '#38bdf8',
              opacity: 0.45 + (rainIntensity * 0.35),
              weight: 1.3,
              pane: 'weatherStormPane',
              className: 'weather-hurricane-rain-stream',
            }).addTo(stormLayer)
          }
        })

        // Funnel motion tracking: swirling darker-gray funnel with rain activity.
        const funnelTrack = Array.from({ length: 9 }).map((_, segmentIndex) => {
          const distance = 0.16 + (segmentIndex * 0.09)
          const headingOffset = (segmentIndex * 26) - 36
          return projectPoint(storm.centroid, storm.movement.directionDeg + headingOffset, distance)
        })

        leaflet.polyline(funnelTrack, {
          color: '#374151',
          opacity: isSelected ? 0.95 : 0.84,
          weight: isSelected ? 3.1 : 2.4,
          pane: 'weatherStormPane',
          className: 'weather-hurricane-funnel-track',
        })
          .bindTooltip('Hurricane funnel motion', { direction: 'top', opacity: 0.92 })
          .addTo(stormLayer)

        const prediction = buildPredictionTrack(
          storm.centroid,
          storm.movement.speedKts,
          storm.movement.directionDeg,
          18,
          3,
        )

        leaflet.polyline(prediction, {
          color: '#67e8f9',
          opacity: isSelected ? 0.95 : 0.78,
          weight: isSelected ? 2.8 : 2.2,
          dashArray: '7 6',
          pane: 'weatherStormPane',
          className: 'weather-hurricane-prediction',
        })
          .bindTooltip('Predicted hurricane path (18h)', { direction: 'top', opacity: 0.92 })
          .addTo(stormLayer)

        prediction.slice(1).forEach((point) => {
          leaflet.circleMarker(point, {
            radius: 2.6,
            color: '#bae6fd',
            fillColor: '#22d3ee',
            fillOpacity: 0.88,
            opacity: 0.92,
            weight: 1.2,
            pane: 'weatherStormPane',
          }).addTo(stormLayer)
        })

        const guidanceTracks = buildModelGuidanceTracks(
          storm.centroid,
          storm.movement.speedKts,
          storm.movement.directionDeg,
        )

        guidanceTracks.forEach((track, index) => {
          leaflet.polyline(track.points, {
            color: track.color,
            opacity: isSelected ? 0.94 : 0.78,
            weight: isSelected ? 5.2 : 3.9,
            pane: 'weatherStormPane',
            className: 'weather-hurricane-model-track',
          })
            .bindTooltip(`${track.name} guidance`, { direction: 'top', opacity: 0.94 })
            .addTo(stormLayer)

          const endPoint = track.points[track.points.length - 1]
          if (!endPoint) return
          const modelLabelIcon = leaflet.divIcon({
            className: 'weather-hurricane-model-label-host',
            html: `<span class="weather-hurricane-model-label" style="color:${track.color}">${track.name}</span>`,
            iconSize: [44, 16],
            iconAnchor: [10, 10],
          })

          const offsetPoint = projectPoint(endPoint, storm.movement.directionDeg + (index * 3), 0.16)
          leaflet.marker(offsetPoint, {
            icon: modelLabelIcon,
            pane: 'weatherStormPane',
          }).addTo(stormLayer)
        })

        const eyeIcon = leaflet.divIcon({
          className: 'weather-hurricane-eye-host',
          html: '<span class="weather-hurricane-eye-icon">🌀</span>',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })

        leaflet.marker(storm.centroid, {
          icon: eyeIcon,
          pane: 'weatherStormPane',
        })
          .bindTooltip('Hurricane center', { direction: 'top', opacity: 0.94 })
          .addTo(stormLayer)
      }
    })

    return () => {
      clearStormPrecipProbe()
    }
  }, [envLayers.precipitation?.vectorPoints, envLayers.stormCloudCoverage?.vectorPoints, envVisibility.precipitation, mapReady, onStormSelect, selectedStormId, stormCells, stormsVisible])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const leaflet = leafletRef.current
    const layers = envLayerRefs.current
    const tileLayers = envTileLayerRefs.current
    const imageLayers = envImageLayerRefs.current
    const layerSignatures = envLayerSignatureRefs.current
    if (!leaflet || !map) return
    if (isZoomingRef.current || isPanningRef.current) return

    const envTypes: WeatherEnvLayerType[] = [
      'precipitation',
      'wind',
      'pressure',
      'smoke',
      'cloudCoverage',
      'stormCloudCoverage',
      'hurricaneRainRadar',
      'lightningTracking',
    ]
    envTypes.forEach((type) => {
      const targetLayer = layers[type]
      if (!targetLayer) return

      if (!envVisibility[type]) {
        tileLayers[type]?.remove()
        delete tileLayers[type]
        imageLayers[type]?.remove()
        delete imageLayers[type]
        targetLayer.clearLayers()
        delete layerSignatures[type]
        return
      }

      tileLayers[type]?.setOpacity(envOpacity[type])
      imageLayers[type]?.setOpacity(envOpacity[type])

      const disableFullSurfaceCloudLayer = type === 'cloudCoverage' || type === 'stormCloudCoverage'
      if (disableFullSurfaceCloudLayer) {
        tileLayers[type]?.remove()
        delete tileLayers[type]
        imageLayers[type]?.remove()
        delete imageLayers[type]
      }

      if (type === 'smoke' || type === 'pressure' || type === 'precipitation') {
        // Smoke, pressure, and precipitation are shown via hover probes instead of full-screen overlays.
        return
      }

      const data = envLayers[type]
      if (!data || !Array.isArray(data.vectorPoints)) {
        tileLayers[type]?.remove()
        delete tileLayers[type]
        imageLayers[type]?.remove()
        delete imageLayers[type]
        targetLayer.clearLayers()
        delete layerSignatures[type]
        return
      }

      const vectorSignature = buildVectorPointsSignature(data.vectorPoints)
      const tileSignature = data.renderMode === 'tile'
        && data.tileUrlTemplate
        && type !== 'cloudCoverage'
        && type !== 'stormCloudCoverage'
        ? `tile|${type}|${data.tileUrlTemplate}`
        : null
      const vectorSignatureWithState = `vector|${type}|${vectorSignature}|z${mapView.zoom}`
      const signature = tileSignature ?? vectorSignatureWithState

      if (layerSignatures[type] === signature) {
        return
      }

      layerSignatures[type] = signature
      tileLayers[type]?.remove()
      delete tileLayers[type]
      imageLayers[type]?.remove()
      delete imageLayers[type]
      targetLayer.clearLayers()

      if (!disableFullSurfaceCloudLayer && data.renderMode === 'tile' && data.tileUrlTemplate) {
        tileLayers[type] = leaflet.tileLayer(data.tileUrlTemplate, {
          opacity: envOpacity[type],
          pane: 'weatherEnvPane',
          className: 'weather-storm-cloud-tile',
          maxNativeZoom: 8,
          minNativeZoom: 0,
          updateWhenZooming: true,
          updateWhenIdle: true,
          keepBuffer: 4,
          crossOrigin: true,
          errorTileUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
        }).addTo(map)
        return
      }

      const pointsToRender = (type === 'cloudCoverage' || type === 'stormCloudCoverage' || type === 'hurricaneRainRadar')
        ? downsampleVectorPoints(
            data.vectorPoints,
            type === 'cloudCoverage'
              ? CLOUD_COVERAGE_POINT_CAP
              : type === 'stormCloudCoverage'
                ? STORM_CLOUD_POINT_CAP
                : HURRICANE_RAIN_POINT_CAP,
          )
        : data.vectorPoints

      pointsToRender.forEach((point, index) => {
        const windColor = '#22c55e'

        if (type === 'wind' && typeof point.directionDeg === 'number') {
          const windStride = mapView.zoom >= 11
            ? 7
            : mapView.zoom >= 10
              ? 5
            : mapView.zoom >= 8
              ? 3
              : mapView.zoom >= 6
                ? 2
                : 1

          if (index % windStride !== 0) return

          const heading = (point.directionDeg * Math.PI) / 180
          const lineLength = mapView.zoom >= 11
            ? 0.14
            : mapView.zoom >= 10
              ? 0.22
            : mapView.zoom >= 8
              ? 0.5
              : mapView.zoom >= 6
                ? 0.7
                : 0.9
          const startLat = point.lat - (Math.cos(heading) * lineLength * 0.48)
          const startLng = point.lng - (Math.sin(heading) * lineLength * 0.48)
          const endLat = point.lat + (Math.cos(heading) * lineLength * 0.52)
          const endLng = point.lng + (Math.sin(heading) * lineLength * 0.52)

          const line = leaflet.polyline([[startLat, startLng], [endLat, endLng]], {
            color: windColor,
            opacity: mapView.zoom >= 11
              ? 0.2 + (envOpacity.wind * 0.16)
              : 0.38 + (envOpacity.wind * 0.22),
            weight: mapView.zoom >= 11 ? 1.05 : mapView.zoom >= 9 ? 1.4 : 2,
            pane: 'weatherEnvPane',
            className: 'weather-wind-line',
          }).addTo(targetLayer)

          const arrowSize = mapView.zoom >= 11 ? 0.06 : mapView.zoom >= 10 ? 0.08 : mapView.zoom >= 8 ? 0.14 : 0.18
          const wingAngle = Math.PI / 6
          const leftLat = endLat - (Math.cos(heading - wingAngle) * arrowSize)
          const leftLng = endLng - (Math.sin(heading - wingAngle) * arrowSize)
          const rightLat = endLat - (Math.cos(heading + wingAngle) * arrowSize)
          const rightLng = endLng - (Math.sin(heading + wingAngle) * arrowSize)

          leaflet.polyline([[endLat, endLng], [leftLat, leftLng]], {
            color: windColor,
            opacity: mapView.zoom >= 11
              ? 0.22 + (envOpacity.wind * 0.14)
              : 0.4 + (envOpacity.wind * 0.24),
            weight: mapView.zoom >= 11 ? 0.9 : mapView.zoom >= 9 ? 1.2 : 1.7,
            pane: 'weatherEnvPane',
            className: 'weather-wind-arrowhead',
          }).addTo(targetLayer)

          leaflet.polyline([[endLat, endLng], [rightLat, rightLng]], {
            color: windColor,
            opacity: mapView.zoom >= 11
              ? 0.22 + (envOpacity.wind * 0.14)
              : 0.4 + (envOpacity.wind * 0.24),
            weight: mapView.zoom >= 11 ? 0.9 : mapView.zoom >= 9 ? 1.2 : 1.7,
            pane: 'weatherEnvPane',
            className: 'weather-wind-arrowhead',
          }).addTo(targetLayer)

          line.bindTooltip(`wind: ${point.value}${data.units ? ` ${data.units}` : ''}`, {
            direction: 'top',
            opacity: 0.92,
          })
          return
        }

        if (type === 'lightningTracking') {
          const recentMinutes = Math.max(1, point.value)
          const recentFactor = Math.max(0, Math.min(1, (16 - recentMinutes) / 16))
          const icon = leaflet.divIcon({
            className: 'weather-lightning-icon-host',
            html: '<span class="weather-lightning-icon">⚡</span>',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })
          const marker = leaflet.marker([point.lat, point.lng], { icon, pane: 'weatherEnvPane' }).addTo(targetLayer)
          marker.bindTooltip(`Lightning strike ${recentMinutes.toFixed(0)} min ago`, {
            direction: 'top',
            opacity: 0.95,
          })

          leaflet.circleMarker([point.lat, point.lng], {
            radius: 4.5 + (recentFactor * 4.2),
            color: '#fde047',
            fillColor: '#facc15',
            fillOpacity: 0.12 + (recentFactor * 0.2),
            opacity: 0.25 + (recentFactor * 0.4),
            weight: 1,
            pane: 'weatherEnvPane',
            className: 'weather-lightning-pulse',
          }).addTo(targetLayer)
          return
        }

        if (type === 'cloudCoverage' || type === 'stormCloudCoverage' || type === 'hurricaneRainRadar') {
          if ((type === 'cloudCoverage' || type === 'stormCloudCoverage')) {
            const cloudStride = type === 'cloudCoverage'
              ? (mapView.zoom >= 9 ? 2 : 3)
              : (mapView.zoom >= 9 ? 1 : 2)
            if (index % cloudStride !== 0) return
          }

          const baseScale = mapView.zoom >= 9
            ? 0.18
            : mapView.zoom >= 7
              ? 0.29
              : 0.41
          const cloudScale = (type === 'cloudCoverage' || type === 'stormCloudCoverage' || type === 'hurricaneRainRadar')
            ? baseScale * CLOUD_MASS_SIZE_MULTIPLIER
            : baseScale
          const patchIntensity = type === 'hurricaneRainRadar'
            ? Math.max(0, Math.min(1, point.value / 70))
            : Math.max(0.18, Math.min(0.86, point.value / 100))

          const baseColor = type === 'cloudCoverage'
            ? toGrayHex(point.value, 194, 228)
            : type === 'stormCloudCoverage'
              ? toGrayHex(point.value, 150, 206)
              : toBlueHex(point.value, 150, 242)

          const driftHeading = typeof point.directionDeg === 'number'
            ? point.directionDeg
            : ((index * 31) + mapView.zoom * 9) % 360

          const massCenters = buildCloudMassCenters([point.lat, point.lng], driftHeading, cloudScale)
          const massCount = type === 'cloudCoverage'
            ? (mapView.zoom >= 8 ? 3 : 2)
            : (mapView.zoom >= 8 ? 4 : 3)

          massCenters.slice(0, massCount).forEach((massCenter, massIndex) => {
            const outerPatch = buildCloudPatch(
              massCenter,
              patchIntensity,
              index + (point.value * 0.04) + (massIndex * 1.73),
              cloudScale * (massIndex === 0 ? 1 : 0.6),
            )

            const outer = leaflet.polygon(outerPatch, {
              color: baseColor,
              fillColor: baseColor,
              fillOpacity: type === 'hurricaneRainRadar'
                ? 0.1 + (envOpacity[type] * 0.2)
                : 0.08 + (envOpacity[type] * 0.16),
              opacity: type === 'hurricaneRainRadar'
                ? 0.1 + (envOpacity[type] * 0.2)
                : 0.08 + (envOpacity[type] * 0.14),
              weight: 0,
              pane: 'weatherEnvPane',
              className: type === 'cloudCoverage'
                ? 'weather-cloud-patch'
                : type === 'stormCloudCoverage'
                  ? 'weather-storm-cloud-patch'
                  : point.value >= 35
                    ? 'weather-hurricane-mid-band-patch'
                    : 'weather-hurricane-edge-band-patch',
            }).addTo(targetLayer)

            if (massIndex === 0) {
              outer.bindTooltip(`${type}: ${point.value}${data.units ? ` ${data.units}` : ''}`, {
                direction: 'top',
                opacity: 0.92,
              })
            }
          })

          if (type !== 'cloudCoverage' && mapView.zoom >= 7) {
            const innerColor = type === 'stormCloudCoverage' ? '#dbeafe' : toBlueHex(point.value + 20, 170, 250)
            const innerPatch = buildCloudPatch(
              [point.lat, point.lng],
              patchIntensity,
              index + (point.value * 0.11),
              cloudScale * 0.62,
            )

            leaflet.polygon(innerPatch, {
              color: innerColor,
              fillColor: innerColor,
              fillOpacity: type === 'hurricaneRainRadar'
                ? 0.16 + (envOpacity[type] * 0.24)
                : 0.07 + (envOpacity[type] * 0.12),
              opacity: type === 'hurricaneRainRadar'
                ? 0.16 + (envOpacity[type] * 0.26)
                : 0.08 + (envOpacity[type] * 0.12),
              weight: 0,
              pane: 'weatherEnvPane',
              className: 'weather-cloud-patch-inner',
            }).addTo(targetLayer)
          }

          if (type === 'hurricaneRainRadar' && typeof point.directionDeg === 'number') {
            const vectorEnd = projectPoint([point.lat, point.lng], point.directionDeg, 0.26)
            leaflet.polyline([[point.lat, point.lng], vectorEnd], {
              color: '#38bdf8',
              opacity: 0.46 + (envOpacity.hurricaneRainRadar * 0.36),
              weight: 1.2,
              pane: 'weatherEnvPane',
              className: 'weather-hurricane-radar-vector',
            }).addTo(targetLayer)
          }
          return
        }

      })
    })
  }, [envLayers, envOpacity, envVisibility, mapReady, mapView.zoom])

  useEffect(() => {
    if (!mapReady) return
    const map = mapRef.current
    const leaflet = leafletRef.current
    if (!map || !leaflet) return

    const smokePoints = envLayers.smoke?.vectorPoints ?? []
    const pressurePoints = envLayers.pressure?.vectorPoints ?? []
    const cloudCoveragePoints = envLayers.cloudCoverage?.vectorPoints ?? []
    const hurricaneRainPoints = envLayers.hurricaneRainRadar?.vectorPoints ?? []
    const lightningPoints = envLayers.lightningTracking?.vectorPoints ?? []

    const clearHoverProbe = () => {
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
      envProbeTooltipRef.current?.remove()
      envProbeTooltipRef.current = null
    }

    const onMouseMove = (event: { latlng: { lat: number; lng: number } }) => {
      clearHoverProbe()

      const smokeEnabled = envVisibility.smoke && smokePoints.length > 0
      const pressureEnabled = envVisibility.pressure && pressurePoints.length > 0
      const cloudEnabled = envVisibility.cloudCoverage && cloudCoveragePoints.length > 0
      const hurricaneRainEnabled = envVisibility.hurricaneRainRadar && hurricaneRainPoints.length > 0
      const lightningEnabled = envVisibility.lightningTracking && lightningPoints.length > 0
      if (!smokeEnabled && !pressureEnabled && !cloudEnabled && !hurricaneRainEnabled && !lightningEnabled) return

      const lat = event.latlng.lat
      const lng = event.latlng.lng

      hoverTimerRef.current = window.setTimeout(() => {
        const nearestSmoke = smokeEnabled ? findNearestPoint(smokePoints, lat, lng) : undefined
        const nearestPressure = pressureEnabled ? findNearestPoint(pressurePoints, lat, lng) : undefined
        const nearestCloudCoverage = cloudEnabled ? findNearestPoint(cloudCoveragePoints, lat, lng) : undefined
        const nearestHurricaneRain = hurricaneRainEnabled ? findNearestPoint(hurricaneRainPoints, lat, lng) : undefined
        const nearestLightning = lightningEnabled ? findNearestPoint(lightningPoints, lat, lng) : undefined
        if (!nearestSmoke && !nearestPressure && !nearestCloudCoverage && !nearestHurricaneRain && !nearestLightning) return

        const lines: string[] = []
        if (nearestSmoke) lines.push(`AQI ${Math.round(nearestSmoke.value)}`)
        if (nearestPressure) lines.push(`Pressure ${Math.round(nearestPressure.value)} hPa`)
        if (nearestCloudCoverage) lines.push(`Cloud ${Math.round(nearestCloudCoverage.value)}%`)
        if (nearestHurricaneRain) lines.push(`Hurricane rain ${nearestHurricaneRain.value.toFixed(1)} mm/hr`)
        if (nearestLightning) lines.push(`Lightning ${nearestLightning.value.toFixed(0)} min ago`)

        envProbeTooltipRef.current = leaflet.tooltip({
          direction: 'top',
          offset: [0, -10],
          opacity: 0.95,
          className: 'weather-smoke-cursor-tooltip',
          pane: 'tooltipPane',
        })

        envProbeTooltipRef.current
          .setLatLng([lat, lng])
          .setContent(lines.join('<br/>'))
          .addTo(map)
      }, 2000)
    }

    map.on('mousemove', onMouseMove)
    map.on('mouseout', clearHoverProbe)
    map.on('mousedown', clearHoverProbe)
    map.on('zoomstart', clearHoverProbe)
    map.on('movestart', clearHoverProbe)

    return () => {
      map.off('mousemove', onMouseMove)
      map.off('mouseout', clearHoverProbe)
      map.off('mousedown', clearHoverProbe)
      map.off('zoomstart', clearHoverProbe)
      map.off('movestart', clearHoverProbe)
      clearHoverProbe()
    }
  }, [envLayers.cloudCoverage?.vectorPoints, envLayers.hurricaneRainRadar?.vectorPoints, envLayers.lightningTracking?.vectorPoints, envLayers.pressure?.vectorPoints, envLayers.smoke?.vectorPoints, envVisibility.cloudCoverage, envVisibility.hurricaneRainRadar, envVisibility.lightningTracking, envVisibility.pressure, envVisibility.smoke, mapReady])

  return (
    <div className="weather-map-surface">
      <div ref={rootRef} className="weather-map-canvas" />
      {loading ? <div className="weather-map-loading">Loading weather layers...</div> : null}
      {noDataMessage ? <div className="weather-map-empty" data-testid="weather-map-empty">{noDataMessage}</div> : null}
      <RadarLayer frame={frame} visible={radarVisible} opacity={radarOpacity} />
    </div>
  )
}
