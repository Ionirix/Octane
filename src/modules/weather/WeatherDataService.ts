import type {
  WeatherEnvLayerType,
  WeatherLayerData,
  WeatherLayerDataResponse,
  WeatherLayerQuery,
  WeatherRadarFrame,
  WeatherRadarFrameQuery,
  WeatherRadarFrameResponse,
  WeatherStormCell,
  WeatherStormCellResponse,
  WeatherStormQuery,
} from './types'
import { TimedCache } from './cache'

const WEATHER_API_BASE = '/api/v6/weather'
const RADAR_CACHE = new TimedCache<WeatherRadarFrameResponse>(36, 2 * 60 * 1000)
const STORM_CACHE = new TimedCache<WeatherStormCellResponse>(80, 90 * 1000)
const LAYER_CACHE = new TimedCache<WeatherLayerData>(160, 2 * 60 * 1000)

function cacheKey(parts: Array<string | number | undefined>): string {
  return parts.map((part) => String(part ?? '')).join('|')
}

function toIso(value: number): string {
  return new Date(value).toISOString()
}

function buildFallbackFrames(windowHours = 2, stepMinutes = 5): WeatherRadarFrame[] {
  const now = Date.now()
  const start = now - (windowHours * 60 * 60 * 1000)
  const stepMs = Math.max(1, stepMinutes) * 60 * 1000
  const frames: WeatherRadarFrame[] = []
  const transparentTile = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='

  for (let cursor = start; cursor <= now; cursor += stepMs) {
    const ageMinutes = Math.max(0, Math.round((now - cursor) / 60000))
    frames.push({
      timestamp: toIso(cursor),
      tileUrlTemplate: transparentTile,
      attribution: 'Radar fallback frame',
      stale: ageMinutes > 12,
    })
  }

  return frames
}

function normalizeRadarResponse(payload: unknown): WeatherRadarFrameResponse {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as WeatherRadarFrameResponse).frames)) {
    return { frames: buildFallbackFrames() }
  }

  const frames = (payload as WeatherRadarFrameResponse).frames
    .filter((frame) => frame && typeof frame.timestamp === 'string' && typeof frame.tileUrlTemplate === 'string')
    .sort((a, b) => +new Date(a.timestamp) - +new Date(b.timestamp))

  return { frames: frames.length > 0 ? frames : buildFallbackFrames() }
}

function isLatLng(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'number'
    && typeof value[1] === 'number'
}

function normalizeStormResponse(payload: unknown, time: string): WeatherStormCellResponse {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as WeatherStormCellResponse).cells)) {
    return { time, cells: [] }
  }

  const cells = (payload as WeatherStormCellResponse).cells
    .filter((cell): cell is WeatherStormCell => {
      return !!cell
        && typeof cell.id === 'string'
        && typeof cell.name === 'string'
        && Array.isArray(cell.polygon)
        && cell.polygon.every((point) => isLatLng(point))
        && isLatLng(cell.centroid)
        && typeof cell.movement?.speedKts === 'number'
        && typeof cell.movement?.directionDeg === 'number'
        && typeof cell.intensity?.dbz === 'number'
        && typeof cell.intensity?.category === 'string'
        && typeof cell.updatedAt === 'string'
    })

  return {
    time: (payload as WeatherStormCellResponse).time ?? time,
    cells,
  }
}

function normalizeLayerResponse(payload: unknown, fallbackType: WeatherEnvLayerType, time: string): WeatherLayerData {
  const fallback: WeatherLayerData = {
    type: fallbackType,
    time,
    renderMode: 'vector',
    vectorPoints: [],
    units: null,
    legend: [],
    stale: true,
  }

  if (!payload || typeof payload !== 'object' || !(payload as WeatherLayerDataResponse).layer) {
    return fallback
  }

  const layer = (payload as WeatherLayerDataResponse).layer
  if (!layer || typeof layer !== 'object') {
    return fallback
  }

  return {
    type: layer.type === fallbackType ? layer.type : fallbackType,
    time: typeof layer.time === 'string' ? layer.time : time,
    renderMode: layer.renderMode === 'tile' ? 'tile' : 'vector',
    tileUrlTemplate: typeof layer.tileUrlTemplate === 'string' ? layer.tileUrlTemplate : null,
    vectorPoints: Array.isArray(layer.vectorPoints)
      ? layer.vectorPoints.filter((point) => (
        point && typeof point.lat === 'number' && typeof point.lng === 'number' && typeof point.value === 'number'
      ))
      : [],
    units: typeof layer.units === 'string' ? layer.units : null,
    legend: Array.isArray(layer.legend)
      ? layer.legend.filter((entry) => (
        entry && typeof entry.label === 'string' && typeof entry.color === 'string' && typeof entry.value === 'number'
      ))
      : [],
    stale: Boolean(layer.stale),
  }
}

export class WeatherDataService {
  async getRadarFrames(query: WeatherRadarFrameQuery): Promise<WeatherRadarFrameResponse> {
    const key = cacheKey(['radar', query.from, query.to, query.stepMinutes, query.bbox, query.zoom])
    const cached = RADAR_CACHE.get(key)
    if (cached) return cached

    const search = new URLSearchParams({
      from: query.from,
      to: query.to,
      stepMinutes: String(query.stepMinutes),
    })

    if (query.bbox) search.set('bbox', query.bbox)
    if (typeof query.zoom === 'number') search.set('zoom', String(query.zoom))

    try {
      const response = await fetch(`${WEATHER_API_BASE}/radar/frames?${search.toString()}`)
      if (!response.ok) {
        throw new Error(`Radar request failed (${response.status})`)
      }
      const payload = await response.json()
      const normalized = normalizeRadarResponse(payload)
      RADAR_CACHE.set(key, normalized)
      return normalized
    } catch {
      const fallback = { frames: buildFallbackFrames(2, query.stepMinutes) }
      RADAR_CACHE.set(key, fallback)
      return fallback
    }
  }

  async getRadarTiles(query: WeatherRadarFrameQuery): Promise<WeatherRadarFrame[]> {
    const response = await this.getRadarFrames(query)
    return response.frames
  }

  async getStormCells(query: WeatherStormQuery): Promise<WeatherStormCellResponse> {
    const key = cacheKey(['storms', query.time, query.bbox])
    const cached = STORM_CACHE.get(key)
    if (cached) return cached

    const search = new URLSearchParams({
      time: query.time,
    })
    if (query.bbox) search.set('bbox', query.bbox)

    try {
      const response = await fetch(`${WEATHER_API_BASE}/storms?${search.toString()}`)
      if (!response.ok) {
        throw new Error(`Storm request failed (${response.status})`)
      }
      const normalized = normalizeStormResponse(await response.json(), query.time)
      STORM_CACHE.set(key, normalized)
      return normalized
    } catch {
      const fallback = { time: query.time, cells: [] }
      STORM_CACHE.set(key, fallback)
      return fallback
    }
  }

  async getLayerData(query: WeatherLayerQuery): Promise<WeatherLayerData> {
    const key = cacheKey(['layer', query.type, query.time, query.bbox])
    const cached = LAYER_CACHE.get(key)
    if (cached) return cached

    const search = new URLSearchParams({
      type: query.type,
      time: query.time,
    })
    if (query.bbox) search.set('bbox', query.bbox)

    try {
      const response = await fetch(`${WEATHER_API_BASE}/layers?${search.toString()}`)
      if (!response.ok) {
        throw new Error(`Layer request failed (${response.status})`)
      }
      const normalized = normalizeLayerResponse(await response.json(), query.type, query.time)
      LAYER_CACHE.set(key, normalized)
      return normalized
    } catch {
      const fallback = normalizeLayerResponse(null, query.type, query.time)
      LAYER_CACHE.set(key, fallback)
      return fallback
    }
  }
}

export const weatherDataService = new WeatherDataService()
