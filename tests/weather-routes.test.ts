import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { weatherRouter } from '../src/api/handlers/weather.js'

const rainViewerPayload = {
  host: 'https://tilecache.rainviewer.com',
  radar: {
    past: [
      { time: 1716793200, path: '/v2/radar/1716793200' },
      { time: 1716793500, path: '/v2/radar/1716793500' },
      { time: 1716793800, path: '/v2/radar/1716793800' },
    ],
    nowcast: [],
  },
  satellite: {
    infrared: [
      { time: 1716793500, path: '/v2/satellite/1716793500' },
    ],
  },
}

const activeAlertsPayload = {
  type: 'FeatureCollection',
  features: [
    {
      id: 'https://api.weather.gov/alerts/test-severe-thunderstorm',
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-120.22, 47.22],
          [-119.78, 47.22],
          [-119.72, 47.56],
          [-120.18, 47.64],
          [-120.22, 47.22],
        ]],
      },
      properties: {
        event: 'Severe Thunderstorm Warning',
        headline: 'Severe Thunderstorm Warning issued by NWS Spokane WA',
        description: 'At 429 PM PDT, Doppler radar was tracking a severe thunderstorm.',
        sent: '2026-05-29T04:29:00Z',
        effective: '2026-05-29T04:29:00Z',
        expires: '2026-05-29T05:15:00Z',
        senderName: 'NWS Spokane WA',
        severity: 'Severe',
        urgency: 'Immediate',
        certainty: 'Observed',
        parameters: {
          eventMotionDescription: ['2026-05-29T04:29:00-00:00...storm...102DEG...60KT...47.47,-120.08 47.87,-119.34'],
        },
      },
    },
    {
      id: 'https://api.weather.gov/alerts/test-small-craft',
      type: 'Feature',
      geometry: null,
      properties: {
        event: 'Small Craft Advisory',
        headline: 'Small Craft Advisory issued by NWS Eureka CA',
        description: 'Hazardous conditions for small craft.',
        sent: '2026-05-29T04:29:00Z',
        effective: '2026-05-29T04:29:00Z',
        expires: '2026-05-29T05:15:00Z',
        senderName: 'NWS Eureka CA',
        severity: 'Minor',
        urgency: 'Expected',
        certainty: 'Likely',
      },
    },
  ],
}

beforeEach(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('api.rainviewer.com/public/weather-maps.json')) {
      return {
        ok: true,
        json: async () => rainViewerPayload,
      } as Response
    }

    if (url.includes('api.weather.gov/alerts/active')) {
      return {
        ok: true,
        json: async () => activeAlertsPayload,
      } as Response
    }

    return {
      ok: false,
      json: async () => ({}),
    } as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('weatherRouter contracts', () => {
  it('returns radar frames with stale flags', async () => {
    const response = await weatherRouter.request('/radar/frames?from=2026-05-27T08:00:00.000Z&to=2026-05-27T09:00:00.000Z&stepMinutes=5')
    expect(response.status).toBe(200)

    const payload = await response.json() as { frames: Array<{ stale: boolean; timestamp: string; tileUrlTemplate: string }> }
    expect(payload.frames.length).toBeGreaterThan(0)
    expect(typeof payload.frames[0].stale).toBe('boolean')
    expect(typeof payload.frames[0].timestamp).toBe('string')
    expect(typeof payload.frames[0].tileUrlTemplate).toBe('string')
  })

  it('returns storm cells with movement and intensity metadata', async () => {
    const response = await weatherRouter.request('/storms?time=2026-05-27T09:30:00.000Z')
    expect(response.status).toBe(200)

    const payload = await response.json() as {
      cells: Array<{
        id: string
        name: string
        polygon: Array<[number, number]>
        movement: { speedKts: number; directionDeg: number }
        intensity: { category: string; dbz: number }
      }>
    }

    expect(payload.cells.length).toBeGreaterThan(0)
    const first = payload.cells[0]
    expect(typeof first.id).toBe('string')
    expect(first.name).toContain('Severe Thunderstorm Warning')
    expect(Array.isArray(first.polygon)).toBe(true)
    expect(first.polygon.length).toBeGreaterThan(2)
    expect(typeof first.movement.speedKts).toBe('number')
    expect(typeof first.movement.directionDeg).toBe('number')
    expect(typeof first.intensity.category).toBe('string')
    expect(typeof first.intensity.dbz).toBe('number')
    expect(payload.cells.some((cell) => /nyx/i.test(cell.name))).toBe(false)
  })

  it('returns layer schema with units and legend', async () => {
    const response = await weatherRouter.request('/layers?type=pressure&time=2026-05-27T09:30:00.000Z')
    expect(response.status).toBe(200)

    const payload = await response.json() as {
      layer: {
        type: string
        units: string | null
        legend: Array<{ label: string; color: string; value: number }>
        stale: boolean
      }
    }

    expect(payload.layer.type).toBe('pressure')
    expect(typeof payload.layer.units).toBe('string')
    expect(payload.layer.legend.length).toBeGreaterThan(0)
    expect(typeof payload.layer.legend[0].label).toBe('string')
    expect(typeof payload.layer.legend[0].color).toBe('string')
    expect(typeof payload.layer.legend[0].value).toBe('number')
    expect(typeof payload.layer.stale).toBe('boolean')
  })
})
