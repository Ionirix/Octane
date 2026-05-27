import { beforeEach, describe, expect, it } from 'vitest'
import { useWeatherStore } from '../src/state/weather.js'
import type { WeatherLayerData, WeatherStormCell } from '../src/modules/weather/types.js'

describe('useWeatherStore fallback transitions', () => {
  beforeEach(() => {
    useWeatherStore.setState(useWeatherStore.getInitialState(), true)
  })

  it('stores last-known radar snapshot', () => {
    const frame = {
      timestamp: '2026-05-27T10:00:00.000Z',
      tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
      attribution: 'test',
      stale: false,
    }

    useWeatherStore.getState().setLastKnownRadar(frame)
    const state = useWeatherStore.getState()

    expect(state.lastKnown.radarFrame?.timestamp).toBe(frame.timestamp)
    expect(state.lastKnown.updatedAtByLayer.radar).not.toBeNull()
  })

  it('stores storm snapshots and updates timestamp', () => {
    const storms: WeatherStormCell[] = [
      {
        id: 'storm-a',
        name: 'Storm A',
        polygon: [[30, -90], [30.5, -89.4], [29.7, -89.1]],
        centroid: [30.1, -89.6],
        movement: { speedKts: 26, directionDeg: 72 },
        intensity: { category: 'moderate', dbz: 44 },
        updatedAt: '2026-05-27T10:00:00.000Z',
        stale: false,
      },
    ]

    useWeatherStore.getState().setLastKnownStorms(storms)
    const state = useWeatherStore.getState()

    expect(state.lastKnown.storms).toHaveLength(1)
    expect(state.lastKnown.storms[0].id).toBe('storm-a')
    expect(state.lastKnown.updatedAtByLayer.storms).not.toBeNull()
  })

  it('stores environmental layer snapshots and keeps previous entries', () => {
    const precipitation: WeatherLayerData = {
      type: 'precipitation',
      time: '2026-05-27T10:00:00.000Z',
      renderMode: 'vector',
      vectorPoints: [{ lat: 30, lng: -90, value: 12 }],
      units: 'mm/hr',
      legend: [{ label: 'Moderate', color: '#2563eb', value: 20 }],
      stale: false,
    }

    const smoke: WeatherLayerData = {
      type: 'smoke',
      time: '2026-05-27T10:00:00.000Z',
      renderMode: 'vector',
      vectorPoints: [{ lat: 31, lng: -91, value: 38 }],
      units: 'AQI',
      legend: [{ label: 'Elevated', color: '#c084fc', value: 35 }],
      stale: true,
    }

    useWeatherStore.getState().setLastKnownEnvLayer('precipitation', precipitation)
    useWeatherStore.getState().setLastKnownEnvLayer('smoke', smoke)
    const state = useWeatherStore.getState()

    expect(state.lastKnown.envLayers.precipitation?.units).toBe('mm/hr')
    expect(state.lastKnown.envLayers.smoke?.units).toBe('AQI')
    expect(state.lastKnown.updatedAtByLayer.precipitation).not.toBeNull()
    expect(state.lastKnown.updatedAtByLayer.smoke).not.toBeNull()
  })

  it('preserves fallback snapshots while current layer status changes', () => {
    const frame = {
      timestamp: '2026-05-27T10:00:00.000Z',
      tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
      stale: false,
    }

    useWeatherStore.getState().setLastKnownRadar(frame)
    useWeatherStore.getState().setLayerLoading('radar', true)
    useWeatherStore.getState().setLayerError('radar', 'provider timeout')
    useWeatherStore.getState().setLayerLoading('radar', false)

    const state = useWeatherStore.getState()
    expect(state.lastKnown.radarFrame?.tileUrlTemplate).toContain('radar.example')
    expect(state.status.errorByLayer.radar).toBe('provider timeout')
  })
})
