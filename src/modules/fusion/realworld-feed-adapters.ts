import type { FusedEventCategory, FusedEvidence, FusedSeverity } from './types'

type RawWeatherStorm = {
  id: string
  name?: string
  centroid?: [number, number]
  intensity?: {
    category?: 'light' | 'moderate' | 'severe'
    dbz?: number
  }
  updatedAt?: string
  stale?: boolean
}

type RawSurveillanceAlert = {
  id: string
  type: string
  severity: FusedSeverity
  title?: string
  description?: string
  timestamp?: number
  serverId?: string
  lat?: number
  lon?: number
  lng?: number
  location?: {
    lat?: number
    lon?: number
    lng?: number
  }
}

export type RealWorldSignal = {
  id: string
  category: FusedEventCategory
  type: string
  lat: number
  lon: number
  severity: FusedSeverity
  observedAt: number
  region: string
  evidence: FusedEvidence[]
  title: string
  description: string
}

type JsonObject = Record<string, unknown>

function asObject(input: unknown): JsonObject | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return input as JsonObject
}

function asArray<T>(input: unknown): T[] {
  if (!Array.isArray(input)) return []
  return input as T[]
}

function finiteNumber(input: unknown): number | null {
  if (typeof input !== 'number') return null
  if (!Number.isFinite(input)) return null
  return input
}

function resolveAlertCoordinates(alert: RawSurveillanceAlert): { lat: number; lon: number } | null {
  const locationLat = finiteNumber(alert.location?.lat)
  const locationLon = finiteNumber(alert.location?.lon)
  const locationLng = finiteNumber(alert.location?.lng)
  const topLevelLat = finiteNumber(alert.lat)
  const topLevelLon = finiteNumber(alert.lon)
  const topLevelLng = finiteNumber(alert.lng)

  const lat = locationLat ?? topLevelLat
  const lon = locationLon ?? locationLng ?? topLevelLon ?? topLevelLng
  if (lat === null || lon === null) return null
  return { lat, lon }
}

function mapAlertCategory(type: string): FusedEventCategory {
  const value = type.toLowerCase()
  if (value.includes('weather') || value.includes('storm') || value.includes('flood')) return 'weather'
  if (value.includes('fire') || value.includes('wildfire')) return 'wildfire'
  if (value.includes('power') || value.includes('telecom') || value.includes('transport') || value.includes('service') || value.includes('outage')) return 'infrastructure'
  if (value.includes('conflict')) return 'conflict'
  if (value.includes('security') || value.includes('police') || value.includes('law')) return 'security'
  return 'other'
}

function severityFromStorm(intensity?: RawWeatherStorm['intensity']): FusedSeverity {
  const category = intensity?.category ?? 'light'
  if (category === 'severe') return 'CRITICAL'
  if (category === 'moderate') return 'WARNING'
  return 'INFO'
}

function evidence(source: string, signal: string, value: string | number, observedAt: number, quality: number): FusedEvidence {
  return {
    source,
    signal,
    value,
    observedAt,
    quality,
  }
}

export async function fetchRealWorldSignals(baseUrl = '/api'): Promise<RealWorldSignal[]> {
  const [stormsResult, alertsResult] = await Promise.allSettled([
    fetch(`${baseUrl}/v6/weather/storms`, { headers: { accept: 'application/json' } }).then((response) => response.json()),
    fetch(`${baseUrl}/v6/surveillance/alerts?onlyActive=true`, { headers: { accept: 'application/json' } }).then((response) => response.json()),
  ])

  const realSignals: RealWorldSignal[] = []

  if (stormsResult.status === 'fulfilled') {
    const root = asObject(stormsResult.value)
    const cells = asArray<RawWeatherStorm>(root?.cells)
    cells.forEach((storm) => {
      const centroid = storm.centroid
      if (!centroid || centroid.length !== 2) return
      const observedAt = storm.updatedAt ? Date.parse(storm.updatedAt) : Date.now()
      const dbz = typeof storm.intensity?.dbz === 'number' ? storm.intensity.dbz : 0
      realSignals.push({
        id: `rw-weather-${storm.id}`,
        category: 'weather',
        type: 'storm-cell',
        lat: centroid[0],
        lon: centroid[1],
        severity: severityFromStorm(storm.intensity),
        observedAt,
        region: 'weather-grid',
        title: storm.name ?? 'Weather Storm Cell',
        description: `Storm intensity ${storm.intensity?.category ?? 'light'} (${dbz} dBZ).`,
        evidence: [
          evidence('weather:storms', 'dbz', dbz, observedAt, 0.82),
          evidence('weather:storms', 'stale', storm.stale ? 'true' : 'false', observedAt, storm.stale ? 0.35 : 0.92),
        ],
      })
    })
  }

  if (alertsResult.status === 'fulfilled') {
    const root = asObject(alertsResult.value)
    const rawData = Array.isArray(root?.data)
      ? root?.data
      : Array.isArray(asObject(root?.data)?.data)
        ? (asObject(root?.data)?.data as unknown[])
        : []
    const data = asArray<RawSurveillanceAlert>(rawData)
    data.forEach((alert) => {
      const observedAt = alert.timestamp ?? Date.now()
      const coordinates = resolveAlertCoordinates(alert)
      if (!coordinates) return
      const categoryHint = `${alert.type} ${alert.title ?? ''} ${alert.description ?? ''}`
      realSignals.push({
        id: `rw-alert-${alert.id}`,
        category: mapAlertCategory(categoryHint),
        type: alert.type,
        lat: coordinates.lat,
        lon: coordinates.lon,
        severity: alert.severity,
        observedAt,
        region: alert.serverId ?? 'global',
        title: alert.title ?? alert.type,
        description: alert.description ?? 'Active surveillance alert',
        evidence: [
          evidence('surveillance:alerts', 'type', alert.type, observedAt, 0.75),
          evidence('surveillance:alerts', 'severity', alert.severity, observedAt, 0.81),
          evidence('surveillance:alerts', 'coordinates', `${coordinates.lat.toFixed(4)},${coordinates.lon.toFixed(4)}`, observedAt, 0.92),
        ],
      })
    })
  }

  return realSignals
}
