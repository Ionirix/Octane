import { Hono } from 'hono';
import type { Env } from '../../types/index.js';

export const weatherRouter = new Hono<{ Bindings: Env }>();

type RadarFrame = {
  timestamp: string
  tileUrlTemplate: string
  attribution: string
  stale: boolean
}

type StormCell = {
  id: string
  name: string
  type?: 'storm' | 'hurricane'
  hurricaneCategory?: 1 | 2 | 3 | 4 | 5
  polygon: Array<[number, number]>
  centroid: [number, number]
  movement: {
    speedKts: number
    directionDeg: number
  }
  intensity: {
    category: 'light' | 'moderate' | 'severe'
    dbz: number
  }
  updatedAt: string
  stale: boolean
}

type EnvLayerType = 'precipitation' | 'wind' | 'pressure' | 'smoke'
type ViewportBounds = {
  west: number
  south: number
  east: number
  north: number
}

function parseStepMinutes(raw?: string): number {
  const parsed = Number(raw ?? '5');
  if (!Number.isFinite(parsed) || parsed <= 0) return 5;
  return Math.max(5, Math.min(15, Math.round(parsed)));
}

function toUnixSeconds(iso: string): number {
  return Math.floor(new Date(iso).getTime() / 1000);
}

function buildRadarFrames(fromIso: string, toIso: string, stepMinutes: number): RadarFrame[] {
  const now = Date.now();
  const fromMs = Number.isFinite(+new Date(fromIso)) ? +new Date(fromIso) : now - (2 * 60 * 60 * 1000);
  const toMs = Number.isFinite(+new Date(toIso)) ? +new Date(toIso) : now;
  const start = Math.min(fromMs, toMs);
  const end = Math.max(fromMs, toMs);
  const stepMs = stepMinutes * 60 * 1000;

  const frames: RadarFrame[] = [];
  for (let cursor = start; cursor <= end; cursor += stepMs) {
    const timestamp = new Date(cursor).toISOString();
    const ageMinutes = Math.max(0, Math.round((now - cursor) / 60000));
    const radarTime = toUnixSeconds(timestamp);
    frames.push({
      timestamp,
      tileUrlTemplate: `https://tilecache.rainviewer.com/v2/radar/${radarTime}/256/{z}/{x}/{y}/2/1_1.png`,
      attribution: 'Radar: RainViewer',
      stale: ageMinutes > 12,
    });
  }

  return frames;
}

type RainViewerFrame = {
  time: number
  path: string
}

type RainViewerMapsResponse = {
  host?: string
  radar?: {
    past?: RainViewerFrame[]
    nowcast?: RainViewerFrame[]
  }
}

async function fetchRainViewerFrames(fromIso: string, toIso: string): Promise<RadarFrame[] | null> {
  try {
    const response = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    if (!response.ok) return null;

    const payload = await response.json() as RainViewerMapsResponse;
    const host = typeof payload.host === 'string' ? payload.host : 'https://tilecache.rainviewer.com';
    const candidates = [
      ...(Array.isArray(payload.radar?.past) ? payload.radar?.past : []),
      ...(Array.isArray(payload.radar?.nowcast) ? payload.radar?.nowcast : []),
    ]
      .filter((entry): entry is RainViewerFrame => {
        return typeof entry?.time === 'number' && typeof entry?.path === 'string';
      })
      .sort((a, b) => a.time - b.time);

    if (candidates.length === 0) return null;

    const fromSec = Math.floor(new Date(fromIso).getTime() / 1000);
    const toSec = Math.floor(new Date(toIso).getTime() / 1000);
    const start = Math.min(fromSec, toSec);
    const end = Math.max(fromSec, toSec);
    const nowSec = Math.floor(Date.now() / 1000);

    const scoped = candidates.filter((entry) => entry.time >= start && entry.time <= end);
    const selected = scoped.length > 0 ? scoped : candidates.slice(-13);

    return selected.map((entry) => ({
      timestamp: new Date(entry.time * 1000).toISOString(),
      tileUrlTemplate: `${host}${entry.path}/256/{z}/{x}/{y}/2/1_1.png`,
      attribution: 'Radar: RainViewer',
      stale: (nowSec - entry.time) > (12 * 60),
    }));
  } catch {
    return null;
  }
}

function getTimeJitter(timeIso: string): number {
  const seconds = Math.floor(new Date(timeIso).getTime() / 1000)
  return Number.isFinite(seconds) ? seconds : Math.floor(Date.now() / 1000)
}

function shiftPoint(lat: number, lng: number, jitter: number, latFactor: number, lngFactor: number): [number, number] {
  const latShift = Math.sin((jitter / 420) + latFactor) * 0.35
  const lngShift = Math.cos((jitter / 520) + lngFactor) * 0.45
  return [Number((lat + latShift).toFixed(4)), Number((lng + lngShift).toFixed(4))]
}

function parseBbox(raw?: string): ViewportBounds | undefined {
  if (!raw) return undefined
  const parts = raw.split(',').map((part) => Number(part.trim()))
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return undefined

  let [west, south, east, north] = parts
  if (west > east) [west, east] = [east, west]
  if (south > north) [south, north] = [north, south]

  return {
    west,
    south: Math.max(-85, Math.min(85, south)),
    east,
    north: Math.max(-85, Math.min(85, north)),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function createSeedCellFromCenter(options: {
  id: string
  name: string
  center: [number, number]
  latRadius: number
  lngRadius: number
  speedKts: number
  directionDeg: number
  dbz: number
  category: 'light' | 'moderate' | 'severe'
  type?: 'storm' | 'hurricane'
  hurricaneCategory?: 1 | 2 | 3 | 4 | 5
}): {
  id: string
  name: string
  type?: 'storm' | 'hurricane'
  hurricaneCategory?: 1 | 2 | 3 | 4 | 5
  base: Array<[number, number]>
  centroid: [number, number]
  speedKts: number
  directionDeg: number
  dbz: number
  category: 'light' | 'moderate' | 'severe'
} {
  const [lat, lng] = options.center
  const base: Array<[number, number]> = [
    [lat + options.latRadius, lng - (options.lngRadius * 0.15)],
    [lat + (options.latRadius * 0.2), lng + options.lngRadius],
    [lat - options.latRadius, lng + (options.lngRadius * 0.15)],
    [lat - (options.latRadius * 0.2), lng - options.lngRadius],
  ]

  return {
    id: options.id,
    name: options.name,
    type: options.type,
    hurricaneCategory: options.type === 'hurricane' ? options.hurricaneCategory : undefined,
    base,
    centroid: options.center,
    speedKts: options.speedKts,
    directionDeg: options.directionDeg,
    dbz: options.dbz,
    category: options.category,
  }
}

function buildStormCells(timeIso: string, bounds?: ViewportBounds): StormCell[] {
  const jitter = getTimeJitter(timeIso)
  const now = Date.now()

  const seed = [
    {
      id: 'storm-gulf-echo',
      name: 'Echo Cell',
      base: [
        [29.8, -92.8],
        [30.4, -91.9],
        [29.9, -91.1],
        [29.2, -91.8],
      ] as Array<[number, number]>,
      centroid: [29.8, -91.9] as [number, number],
      speedKts: 34,
      directionDeg: 58,
      dbz: 49,
      category: 'severe' as const,
    },
    {
      id: 'storm-midwest-nova',
      name: 'Nova Band',
      base: [
        [41.6, -92.4],
        [42.2, -91.2],
        [41.4, -90.6],
        [40.9, -91.7],
      ] as Array<[number, number]>,
      centroid: [41.5, -91.5] as [number, number],
      speedKts: 26,
      directionDeg: 81,
      dbz: 41,
      category: 'moderate' as const,
    },
    {
      id: 'storm-atlantic-cirrus',
      name: 'Cirrus Front',
      type: 'storm' as const,
      base: [
        [36.1, -75.2],
        [36.8, -74.5],
        [36.2, -73.8],
        [35.6, -74.4],
      ] as Array<[number, number]>,
      centroid: [36.2, -74.5] as [number, number],
      speedKts: 22,
      directionDeg: 36,
      dbz: 33,
      category: 'light' as const,
    },
    {
      id: 'hurricane-atlantic-helena',
      name: 'Hurricane Helena',
      type: 'hurricane' as const,
      hurricaneCategory: 3 as const,
      base: [
        [24.5, -67.5],
        [26.2, -65.1],
        [24.8, -62.8],
        [22.7, -64.4],
      ] as Array<[number, number]>,
      centroid: [24.6, -64.9] as [number, number],
      speedKts: 17,
      directionDeg: 318,
      dbz: 57,
      category: 'severe' as const,
    },
    {
      id: 'hurricane-pacific-orion',
      name: 'Hurricane Orion',
      type: 'hurricane' as const,
      hurricaneCategory: 2 as const,
      base: [
        [15.2, -128.8],
        [16.9, -126.3],
        [15.4, -123.9],
        [13.2, -125.4],
      ] as Array<[number, number]>,
      centroid: [15.2, -126.1] as [number, number],
      speedKts: 13,
      directionDeg: 298,
      dbz: 54,
      category: 'severe' as const,
    },
    {
      id: 'storm-noreaster-nyb',
      name: 'Noreaster Band',
      type: 'storm' as const,
      base: [
        [41.6, -75.8],
        [42.3, -73.9],
        [41.2, -72.2],
        [40.3, -73.8],
      ] as Array<[number, number]>,
      centroid: [41.4, -73.9] as [number, number],
      speedKts: 29,
      directionDeg: 62,
      dbz: 46,
      category: 'moderate' as const,
    },
    {
      id: 'hurricane-atlantic-ny-approach',
      name: 'Hurricane Nyx',
      type: 'hurricane' as const,
      hurricaneCategory: 1 as const,
      base: [
        [38.6, -69.8],
        [39.9, -67.9],
        [38.8, -66.2],
        [37.4, -67.3],
      ] as Array<[number, number]>,
      centroid: [38.7, -67.8] as [number, number],
      speedKts: 16,
      directionDeg: 334,
      dbz: 52,
      category: 'severe' as const,
    },
  ]

  const viewportCells = bounds
    ? (() => {
      const latSpan = Math.max(2, bounds.north - bounds.south)
      const lngSpan = Math.max(3, bounds.east - bounds.west)
      const baseLat = bounds.south + (latSpan * 0.52)
      const baseLng = bounds.west + (lngSpan * 0.5)
      const latRadius = clamp(latSpan * 0.1, 0.5, 2.1)
      const lngRadius = clamp(lngSpan * 0.1, 0.8, 2.8)

      return [
        createSeedCellFromCenter({
          id: 'storm-viewport-core',
          name: 'Viewport Core Cell',
          center: [baseLat, baseLng],
          latRadius,
          lngRadius,
          speedKts: 30,
          directionDeg: 62,
          dbz: 47,
          category: 'moderate',
          type: 'storm',
        }),
        createSeedCellFromCenter({
          id: 'storm-viewport-west',
          name: 'Viewport Western Band',
          center: [baseLat + (latSpan * 0.14), bounds.west + (lngSpan * 0.3)],
          latRadius: latRadius * 0.92,
          lngRadius: lngRadius * 0.95,
          speedKts: 24,
          directionDeg: 40,
          dbz: 39,
          category: 'light',
          type: 'storm',
        }),
        createSeedCellFromCenter({
          id: 'hurricane-viewport-track',
          name: 'Hurricane Vesper',
          center: [baseLat - (latSpan * 0.18), bounds.west + (lngSpan * 0.72)],
          latRadius: latRadius * 1.15,
          lngRadius: lngRadius * 1.1,
          speedKts: 18,
          directionDeg: 328,
          dbz: 55,
          category: 'severe',
          type: 'hurricane',
          hurricaneCategory: 2,
        }),
      ]
    })()
    : []

  return [...viewportCells, ...seed].map((cell, index) => {
    const polygon = cell.base.map(([lat, lng], pointIndex) => (
      shiftPoint(lat, lng, jitter + (index * 90), pointIndex * 0.8, pointIndex * 0.6)
    ))
    const centroid = shiftPoint(cell.centroid[0], cell.centroid[1], jitter + (index * 120), 0.2, 0.5)
    const stale = (now - new Date(timeIso).getTime()) > (20 * 60 * 1000)

    return {
      id: cell.id,
      name: cell.name,
      type: cell.type,
      hurricaneCategory: cell.type === 'hurricane' ? cell.hurricaneCategory : undefined,
      polygon,
      centroid,
      movement: {
        speedKts: cell.speedKts,
        directionDeg: cell.directionDeg,
      },
      intensity: {
        category: cell.category,
        dbz: cell.dbz,
      },
      updatedAt: new Date(Math.min(now, new Date(timeIso).getTime() + 180000)).toISOString(),
      stale,
    }
  })
}

function buildLayerResponse(type: EnvLayerType, timeIso: string, bounds?: ViewportBounds) {
  const jitter = getTimeJitter(timeIso)
  const stale = (Date.now() - new Date(timeIso).getTime()) > (30 * 60 * 1000)

  const anchorPoints: Array<[number, number]> = [
    [47.61, -122.33], [37.77, -122.42], [34.05, -118.24], [39.74, -104.99],
    [41.88, -87.63], [32.78, -96.8], [29.76, -95.37], [33.75, -84.39],
    [40.71, -74.0], [42.36, -71.06], [25.76, -80.19], [45.52, -73.57],
    [19.43, -99.13], [14.63, -90.55], [-23.55, -46.63], [-34.6, -58.38],
    [51.51, -0.13], [48.86, 2.35], [52.52, 13.4], [41.9, 12.5],
    [59.33, 18.07], [40.42, -3.7], [31.23, 121.47], [35.68, 139.69],
    [37.57, 126.98], [1.35, 103.82], [13.75, 100.5], [19.08, 72.88],
    [25.2, 55.27], [30.04, 31.24], [-1.29, 36.82], [-26.2, 28.04],
    [6.52, 3.38], [-33.87, 151.21], [-36.85, 174.76], [21.31, -157.86],
  ]

  const vectorPoints = bounds
    ? (() => {
      const latSpan = Math.max(1.2, bounds.north - bounds.south)
      const lngSpan = Math.max(1.6, bounds.east - bounds.west)
      const rows = 6
      const cols = 8

      return Array.from({ length: rows * cols }).map((_, index) => {
        const row = Math.floor(index / cols)
        const col = index % cols
        const latRatio = (row + 0.5) / rows
        const lngRatio = (col + 0.5) / cols

        const latBase = bounds.south + (latSpan * latRatio)
        const lngBase = bounds.west + (lngSpan * lngRatio)
        const lat = clamp(latBase + (Math.sin((jitter / 540) + index) * latSpan * 0.03), bounds.south, bounds.north)
        const lng = clamp(lngBase + (Math.cos((jitter / 460) + (index * 0.7)) * lngSpan * 0.035), bounds.west, bounds.east)

        const value = type === 'pressure'
          ? 992 + ((index * 2.4) % 28)
          : type === 'wind'
            ? 12 + ((index * 3.8) % 58)
            : type === 'smoke'
              ? 10 + ((index * 4.6) % 85)
              : 1 + ((index * 2.9) % 55)

        return {
          lat: Number(lat.toFixed(4)),
          lng: Number(lng.toFixed(4)),
          value: Number(value.toFixed(2)),
          directionDeg: type === 'wind' ? ((index * 19) + (jitter % 210)) % 360 : undefined,
        }
      })
    })()
    : anchorPoints.map(([baseLat, baseLng], index) => {
      const lat = baseLat + (Math.sin((jitter / 560) + index) * 0.9)
      const lng = baseLng + (Math.cos((jitter / 430) + (index * 0.7)) * 1.1)
      const value = type === 'pressure'
        ? 992 + ((index * 2.4) % 28)
        : type === 'wind'
          ? 12 + ((index * 3.8) % 58)
          : type === 'smoke'
            ? 10 + ((index * 4.6) % 85)
            : 1 + ((index * 2.9) % 55)

      return {
        lat: Number(lat.toFixed(4)),
        lng: Number(lng.toFixed(4)),
        value: Number(value.toFixed(2)),
        directionDeg: type === 'wind' ? ((index * 19) + (jitter % 210)) % 360 : undefined,
      }
    })

  const legend = type === 'precipitation'
    ? [
      { label: 'Light', color: '#60a5fa', value: 5 },
      { label: 'Moderate', color: '#2563eb', value: 20 },
      { label: 'Heavy', color: '#1d4ed8', value: 40 },
    ]
    : type === 'wind'
      ? [
        { label: 'Breeze', color: '#86efac', value: 10 },
        { label: 'Windy', color: '#22c55e', value: 25 },
        { label: 'Strong', color: '#15803d', value: 45 },
      ]
      : type === 'pressure'
        ? [
          { label: 'Low', color: '#fcd34d', value: 995 },
          { label: 'Mid', color: '#f59e0b', value: 1007 },
          { label: 'High', color: '#d97706', value: 1019 },
        ]
        : [
          { label: 'Trace', color: '#d8b4fe', value: 15 },
          { label: 'Elevated', color: '#c084fc', value: 35 },
          { label: 'Dense', color: '#a855f7', value: 60 },
        ]

  return {
    layer: {
      type,
      time: timeIso,
      renderMode: 'vector',
      vectorPoints,
      units: type === 'pressure' ? 'hPa' : type === 'wind' ? 'kt' : type === 'smoke' ? 'AQI' : 'mm/hr',
      legend,
      stale,
    },
  }
}

weatherRouter.get('/radar/frames', async (c) => {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - (2 * 60 * 60 * 1000)).toISOString();
  const defaultTo = now.toISOString();

  const from = c.req.query('from') ?? defaultFrom;
  const to = c.req.query('to') ?? defaultTo;
  const stepMinutes = parseStepMinutes(c.req.query('stepMinutes'));
  const liveFrames = await fetchRainViewerFrames(from, to);

  return c.json({
    frames: liveFrames ?? buildRadarFrames(from, to, stepMinutes),
  });
});

weatherRouter.get('/storms', (c) => {
  const time = c.req.query('time') ?? new Date().toISOString();
  const bounds = parseBbox(c.req.query('bbox'))
  return c.json({
    time,
    cells: buildStormCells(time, bounds),
  });
});

weatherRouter.get('/layers', (c) => {
  const rawType = c.req.query('type') ?? 'precipitation';
  const time = c.req.query('time') ?? new Date().toISOString();
  const bounds = parseBbox(c.req.query('bbox'))
  const type: EnvLayerType = rawType === 'wind' || rawType === 'pressure' || rawType === 'smoke'
    ? rawType
    : 'precipitation'

  return c.json(buildLayerResponse(type, time, bounds));
});

export default weatherRouter;
