import { describe, expect, it } from 'vitest'
import { weatherRouter } from '../src/api/handlers/weather.js'

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
        polygon: Array<[number, number]>
        movement: { speedKts: number; directionDeg: number }
        intensity: { category: string; dbz: number }
      }>
    }

    expect(payload.cells.length).toBeGreaterThan(0)
    const first = payload.cells[0]
    expect(typeof first.id).toBe('string')
    expect(Array.isArray(first.polygon)).toBe(true)
    expect(first.polygon.length).toBeGreaterThan(2)
    expect(typeof first.movement.speedKts).toBe('number')
    expect(typeof first.movement.directionDeg).toBe('number')
    expect(typeof first.intensity.category).toBe('string')
    expect(typeof first.intensity.dbz).toBe('number')
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
