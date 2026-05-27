import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WeatherLayerData } from '../src/modules/weather/types.js'

type MockState = {
  selectedTime: string | null
  availableTimes: string[]
  activeLayers: {
    radar: boolean
    storms: boolean
    precipitation: boolean
    wind: boolean
    pressure: boolean
    smoke: boolean
  }
  layerOpacity: {
    radar: number
    precipitation: number
    wind: number
    pressure: number
    smoke: number
  }
  mapView: {
    center: [number, number]
    zoom: number
  }
  playback: {
    isPlaying: boolean
    speedMs: number
  }
  status: {
    loadingByLayer: Record<'radar' | 'storms' | 'precipitation' | 'wind' | 'pressure' | 'smoke', boolean>
    staleByLayer: Record<'radar' | 'storms' | 'precipitation' | 'wind' | 'pressure' | 'smoke', boolean>
    errorByLayer: Record<'radar' | 'storms' | 'precipitation' | 'wind' | 'pressure' | 'smoke', string | null>
  }
  lastKnown: {
    radarFrame: { timestamp: string; tileUrlTemplate: string; stale?: boolean } | null
    storms: Array<{
      id: string
      name: string
      polygon: Array<[number, number]>
      centroid: [number, number]
      movement: { speedKts: number; directionDeg: number }
      intensity: { category: 'light' | 'moderate' | 'severe'; dbz: number }
      updatedAt: string
    }>
    envLayers: Partial<Record<'precipitation' | 'wind' | 'pressure' | 'smoke', WeatherLayerData>>
    updatedAtByLayer: Record<'radar' | 'storms' | 'precipitation' | 'wind' | 'pressure' | 'smoke', string | null>
  }
  selectedStormId?: string
  setSelectedTime: (time: string | null) => void
  setAvailableTimes: (times: string[]) => void
  toggleLayer: () => void
  setLayerOpacity: () => void
  setMapView: () => void
  setPlayback: () => void
  setLayerLoading: () => void
  setLayerStale: () => void
  setLayerError: () => void
  setLastKnownRadar: () => void
  setLastKnownStorms: () => void
  setLastKnownEnvLayer: () => void
  setSelectedStormId: () => void
}

function createMockState(): MockState {
  return {
    selectedTime: '2026-05-27T10:00:00.000Z',
    availableTimes: [],
    activeLayers: {
      radar: true,
      storms: true,
      precipitation: true,
      wind: false,
      pressure: false,
      smoke: false,
    },
    layerOpacity: {
      radar: 0.55,
      precipitation: 0.55,
      wind: 0.55,
      pressure: 0.55,
      smoke: 0.55,
    },
    mapView: {
      center: [39.8283, -98.5795],
      zoom: 4,
    },
    playback: {
      isPlaying: false,
      speedMs: 750,
    },
    status: {
      loadingByLayer: {
        radar: false,
        storms: false,
        precipitation: false,
        wind: false,
        pressure: false,
        smoke: false,
      },
      staleByLayer: {
        radar: false,
        storms: false,
        precipitation: false,
        wind: false,
        pressure: false,
        smoke: false,
      },
      errorByLayer: {
        radar: null,
        storms: null,
        precipitation: null,
        wind: null,
        pressure: null,
        smoke: null,
      },
    },
    lastKnown: {
      radarFrame: null,
      storms: [],
      envLayers: {},
      updatedAtByLayer: {
        radar: null,
        storms: null,
        precipitation: null,
        wind: null,
        pressure: null,
        smoke: null,
      },
    },
    selectedStormId: undefined,
    setSelectedTime: () => undefined,
    setAvailableTimes: () => undefined,
    toggleLayer: () => undefined,
    setLayerOpacity: () => undefined,
    setMapView: () => undefined,
    setPlayback: () => undefined,
    setLayerLoading: () => undefined,
    setLayerStale: () => undefined,
    setLayerError: () => undefined,
    setLastKnownRadar: () => undefined,
    setLastKnownStorms: () => undefined,
    setLastKnownEnvLayer: () => undefined,
    setSelectedStormId: () => undefined,
  }
}

const hoisted = vi.hoisted(() => {
  let state = createMockState()
  return {
    getState: () => state,
    setState: (next: MockState) => {
      state = next
    },
    reset: () => {
      state = createMockState()
    },
  }
})

vi.mock('@/components/weather/WeatherMapContainer', () => ({
  WeatherMapContainer: ({ noDataMessage }: { noDataMessage?: string | null }) => (
    <div data-testid="mock-weather-map">
      {noDataMessage ? <div data-testid="weather-map-empty">{noDataMessage}</div> : null}
    </div>
  ),
}))

vi.mock('@state/weather', () => ({
  useWeatherStore: () => hoisted.getState(),
}))

vi.mock('@/modules/weather/WeatherDataService', () => ({
  weatherDataService: {
    getRadarFrames: vi.fn(),
    getStormCells: vi.fn(),
    getLayerData: vi.fn(),
  },
}))

import WeatherIntelligence from '@screens/WeatherIntelligence'

describe('WeatherIntelligence fallback UI', () => {
  beforeEach(() => {
    hoisted.reset()
  })

  it('shows fallback status and notes when cached snapshots are used', () => {
    const state = createMockState()
    state.lastKnown.radarFrame = {
      timestamp: '2026-05-27T09:55:00.000Z',
      tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
      stale: true,
    }
    state.lastKnown.storms = [
      {
        id: 'storm-a',
        name: 'Storm A',
        polygon: [[30, -90], [30.3, -89.6], [29.8, -89.3]],
        centroid: [30.0, -89.7],
        movement: { speedKts: 20, directionDeg: 54 },
        intensity: { category: 'moderate', dbz: 42 },
        updatedAt: '2026-05-27T09:55:00.000Z',
      },
    ]
    state.lastKnown.envLayers.precipitation = {
      type: 'precipitation',
      time: '2026-05-27T09:55:00.000Z',
      renderMode: 'vector',
      vectorPoints: [{ lat: 30, lng: -90, value: 11 }],
      units: 'mm/hr',
      legend: [{ label: 'Moderate', color: '#2563eb', value: 20 }],
      stale: true,
    }
    state.lastKnown.updatedAtByLayer.radar = '2026-05-27T09:55:00.000Z'
    state.lastKnown.updatedAtByLayer.storms = '2026-05-27T09:55:00.000Z'
    state.lastKnown.updatedAtByLayer.precipitation = '2026-05-27T09:55:00.000Z'
    hoisted.setState(state)

    const html = renderToStaticMarkup(<WeatherIntelligence />)

    expect(html).toContain('Radar: fallback')
    expect(html).toContain('Storms: fallback')
    expect(html).toContain('Precipitation: fallback')
    expect(html).toContain('fallback: using cached')
  })

  it('shows no-data overlay when enabled layers have no live or cached data', () => {
    const state = createMockState()
    state.activeLayers.radar = true
    state.activeLayers.storms = true
    state.activeLayers.precipitation = true
    state.lastKnown.radarFrame = null
    state.lastKnown.storms = []
    state.lastKnown.envLayers = {}
    hoisted.setState(state)

    const html = renderToStaticMarkup(<WeatherIntelligence />)

    expect(html).toContain('No data available for one or more enabled layers at this timeline position.')
  })

  it('does not show fallback notice when no cached snapshots are active', () => {
    const state = createMockState()
    state.activeLayers.radar = false
    state.activeLayers.storms = false
    state.activeLayers.precipitation = false
    state.lastKnown.radarFrame = null
    state.lastKnown.storms = []
    state.lastKnown.envLayers = {}
    hoisted.setState(state)

    const html = renderToStaticMarkup(<WeatherIntelligence />)

    expect(html).not.toContain('fallback: using cached')
    expect(html).not.toContain('weather-fallback-notes')
  })

  it('clears fallback notices after live data recovers', () => {
    const fallbackState = createMockState()
    fallbackState.lastKnown.radarFrame = {
      timestamp: '2026-05-27T09:55:00.000Z',
      tileUrlTemplate: 'https://radar.example/{z}/{x}/{y}.png',
      stale: true,
    }
    fallbackState.lastKnown.storms = [
      {
        id: 'storm-a',
        name: 'Storm A',
        polygon: [[30, -90], [30.3, -89.6], [29.8, -89.3]],
        centroid: [30.0, -89.7],
        movement: { speedKts: 20, directionDeg: 54 },
        intensity: { category: 'moderate', dbz: 42 },
        updatedAt: '2026-05-27T09:55:00.000Z',
      },
    ]
    fallbackState.lastKnown.envLayers.precipitation = {
      type: 'precipitation',
      time: '2026-05-27T09:55:00.000Z',
      renderMode: 'vector',
      vectorPoints: [{ lat: 30, lng: -90, value: 11 }],
      units: 'mm/hr',
      legend: [{ label: 'Moderate', color: '#2563eb', value: 20 }],
      stale: true,
    }
    fallbackState.lastKnown.updatedAtByLayer.radar = '2026-05-27T09:55:00.000Z'
    fallbackState.lastKnown.updatedAtByLayer.storms = '2026-05-27T09:55:00.000Z'
    fallbackState.lastKnown.updatedAtByLayer.precipitation = '2026-05-27T09:55:00.000Z'
    hoisted.setState(fallbackState)

    const fallbackHtml = renderToStaticMarkup(<WeatherIntelligence />)
    expect(fallbackHtml).toContain('Radar: fallback')
    expect(fallbackHtml).toContain('fallback: using cached')

    const recovered = createMockState()
    recovered.availableTimes = ['2026-05-27T10:00:00.000Z']
    recovered.selectedTime = '2026-05-27T10:00:00.000Z'
    recovered.lastKnown.radarFrame = null
    recovered.lastKnown.storms = []
    recovered.lastKnown.envLayers = {}
    hoisted.setState(recovered)

    const recoveredHtml = renderToStaticMarkup(<WeatherIntelligence />)
    expect(recoveredHtml).toContain('Radar: live')
    expect(recoveredHtml).not.toContain('Radar: fallback')
    expect(recoveredHtml).not.toContain('fallback: using cached')
  })
})
