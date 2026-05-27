import { create } from 'zustand'
import type {
  WeatherEnvLayerType,
  WeatherLayerData,
  WeatherLayerType,
  WeatherMapView,
  WeatherRadarFrame,
  WeatherStormCell,
} from '@/modules/weather/types'

export type { WeatherLayerType, WeatherMapView, WeatherRadarFrame }

type LayerVisibility = Record<WeatherLayerType, boolean>
type LayerOpacity = Record<'radar' | 'precipitation' | 'wind' | 'pressure' | 'smoke', number>
type LayerStatus = Record<WeatherLayerType, boolean>
type LayerErrorState = Record<WeatherLayerType, string | null>

interface WeatherStore {
  selectedTime: string | null
  availableTimes: string[]
  activeLayers: LayerVisibility
  layerOpacity: LayerOpacity
  mapView: WeatherMapView
  playback: {
    isPlaying: boolean
    speedMs: number
  }
  status: {
    loadingByLayer: LayerStatus
    staleByLayer: LayerStatus
    errorByLayer: LayerErrorState
  }
  lastKnown: {
    radarFrame: WeatherRadarFrame | null
    storms: WeatherStormCell[]
    envLayers: Partial<Record<WeatherEnvLayerType, WeatherLayerData>>
    updatedAtByLayer: Record<WeatherLayerType, string | null>
  }
  selectedStormId?: string
  setSelectedTime: (timestamp: string | null) => void
  setAvailableTimes: (timestamps: string[]) => void
  toggleLayer: (layer: WeatherLayerType) => void
  setLayerOpacity: (layer: keyof LayerOpacity, opacity: number) => void
  setMapView: (view: Partial<WeatherMapView>) => void
  setPlayback: (patch: Partial<WeatherStore['playback']>) => void
  setLayerLoading: (layer: WeatherLayerType, loading: boolean) => void
  setLayerStale: (layer: WeatherLayerType, stale: boolean) => void
  setLayerError: (layer: WeatherLayerType, message: string | null) => void
  setLastKnownRadar: (frame: WeatherRadarFrame) => void
  setLastKnownStorms: (storms: WeatherStormCell[]) => void
  setLastKnownEnvLayer: (type: WeatherEnvLayerType, data: WeatherLayerData) => void
  setSelectedStormId: (stormId?: string) => void
}

const LAYER_DEFAULTS: LayerVisibility = {
  radar: true,
  storms: true,
  precipitation: true,
  wind: true,
  pressure: true,
  smoke: true,
}

const LOADING_DEFAULTS: LayerStatus = {
  radar: false,
  storms: false,
  precipitation: false,
  wind: false,
  pressure: false,
  smoke: false,
}

const STALE_DEFAULTS: LayerStatus = {
  radar: false,
  storms: false,
  precipitation: false,
  wind: false,
  pressure: false,
  smoke: false,
}

const ERROR_DEFAULTS: LayerErrorState = {
  radar: null,
  storms: null,
  precipitation: null,
  wind: null,
  pressure: null,
  smoke: null,
}

const LAST_KNOWN_UPDATED_DEFAULTS: Record<WeatherLayerType, string | null> = {
  radar: null,
  storms: null,
  precipitation: null,
  wind: null,
  pressure: null,
  smoke: null,
}

export const useWeatherStore = create<WeatherStore>((set) => ({
  selectedTime: null,
  availableTimes: [],
  activeLayers: LAYER_DEFAULTS,
  layerOpacity: {
    radar: 0.58,
    precipitation: 0.72,
    wind: 0.72,
    pressure: 0.72,
    smoke: 0.72,
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
    loadingByLayer: LOADING_DEFAULTS,
    staleByLayer: STALE_DEFAULTS,
    errorByLayer: ERROR_DEFAULTS,
  },
  lastKnown: {
    radarFrame: null,
    storms: [],
    envLayers: {},
    updatedAtByLayer: LAST_KNOWN_UPDATED_DEFAULTS,
  },
  selectedStormId: undefined,
  setSelectedTime: (selectedTime) => set({ selectedTime }),
  setAvailableTimes: (availableTimes) => set({ availableTimes }),
  toggleLayer: (layer) => set((state) => ({
    activeLayers: {
      ...state.activeLayers,
      [layer]: !state.activeLayers[layer],
    },
  })),
  setLayerOpacity: (layer, opacity) => set((state) => ({
    layerOpacity: {
      ...state.layerOpacity,
      [layer]: Math.max(0, Math.min(1, opacity)),
    },
  })),
  setMapView: (view) => set((state) => ({
    mapView: {
      ...state.mapView,
      ...view,
    },
  })),
  setPlayback: (patch) => set((state) => ({
    playback: {
      ...state.playback,
      ...patch,
    },
  })),
  setLayerLoading: (layer, loading) => set((state) => ({
    status: {
      ...state.status,
      loadingByLayer: {
        ...state.status.loadingByLayer,
        [layer]: loading,
      },
    },
  })),
  setLayerStale: (layer, stale) => set((state) => ({
    status: {
      ...state.status,
      staleByLayer: {
        ...state.status.staleByLayer,
        [layer]: stale,
      },
    },
  })),
  setLayerError: (layer, message) => set((state) => ({
    status: {
      ...state.status,
      errorByLayer: {
        ...state.status.errorByLayer,
        [layer]: message,
      },
    },
  })),
  setLastKnownRadar: (frame) => set((state) => ({
    lastKnown: {
      ...state.lastKnown,
      radarFrame: frame,
      updatedAtByLayer: {
        ...state.lastKnown.updatedAtByLayer,
        radar: new Date().toISOString(),
      },
    },
  })),
  setLastKnownStorms: (storms) => set((state) => ({
    lastKnown: {
      ...state.lastKnown,
      storms,
      updatedAtByLayer: {
        ...state.lastKnown.updatedAtByLayer,
        storms: new Date().toISOString(),
      },
    },
  })),
  setLastKnownEnvLayer: (type, data) => set((state) => ({
    lastKnown: {
      ...state.lastKnown,
      envLayers: {
        ...state.lastKnown.envLayers,
        [type]: data,
      },
      updatedAtByLayer: {
        ...state.lastKnown.updatedAtByLayer,
        [type]: new Date().toISOString(),
      },
    },
  })),
  setSelectedStormId: (selectedStormId) => set({ selectedStormId }),
}))
