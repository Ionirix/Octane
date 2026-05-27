import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeatherDataService } from '../src/modules/weather/WeatherDataService.js'

describe('WeatherDataService caching and fallback', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('uses cache on repeated radar request', async () => {
    const service = new WeatherDataService()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        frames: [
          {
            timestamp: '2026-05-27T10:00:00.000Z',
            tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
            attribution: 'test',
            stale: false,
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const query = {
      from: '2026-05-27T08:00:00.000Z',
      to: '2026-05-27T10:00:00.000Z',
      stepMinutes: 5,
    }

    await service.getRadarFrames(query)
    await service.getRadarFrames(query)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refetches after cache expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-27T00:00:00.000Z'))

    const service = new WeatherDataService()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        frames: [
          {
            timestamp: '2026-05-27T00:00:00.000Z',
            tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
            attribution: 'test',
            stale: false,
          },
        ],
      }),
    })

    vi.stubGlobal('fetch', fetchMock)

    const query = {
      from: '2026-05-26T22:00:00.000Z',
      to: '2026-05-27T00:00:00.000Z',
      stepMinutes: 7,
    }

    await service.getRadarFrames(query)
    vi.setSystemTime(new Date('2026-05-27T00:02:01.000Z'))
    await service.getRadarFrames(query)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns fallback frames for malformed radar payload', async () => {
    const service = new WeatherDataService()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ bad: true }) }))

    const result = await service.getRadarFrames({
      from: '2026-05-27T08:00:00.000Z',
      to: '2026-05-27T10:00:00.000Z',
      stepMinutes: 5,
    })

    expect(Array.isArray(result.frames)).toBe(true)
    expect(result.frames.length).toBeGreaterThan(0)
    expect(typeof result.frames[0].tileUrlTemplate).toBe('string')
  })

  it('normalizes storm and layer fallback responses', async () => {
    const service = new WeatherDataService()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const storms = await service.getStormCells({ time: '2026-05-27T10:00:00.000Z' })
    expect(storms.time).toBe('2026-05-27T10:00:00.000Z')
    expect(storms.cells).toEqual([])

    const layer = await service.getLayerData({
      type: 'smoke',
      time: '2026-05-27T10:00:00.000Z',
    })
    expect(layer.type).toBe('smoke')
    expect(layer.renderMode).toBe('vector')
    expect(layer.stale).toBe(true)
  })
})
