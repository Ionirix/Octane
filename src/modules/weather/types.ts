export type WeatherLayerType = 'radar' | 'storms' | 'precipitation' | 'wind' | 'pressure' | 'smoke'

export type WeatherEnvLayerType = 'precipitation' | 'wind' | 'pressure' | 'smoke'

export type WeatherMapView = {
  center: [number, number]
  zoom: number
  bounds?: {
    west: number
    south: number
    east: number
    north: number
  }
}

export type WeatherRadarFrame = {
  timestamp: string
  tileUrlTemplate: string
  attribution?: string
  stale?: boolean
}

export type WeatherRadarFrameResponse = {
  frames: WeatherRadarFrame[]
}

export type WeatherRadarFrameQuery = {
  from: string
  to: string
  stepMinutes: number
  bbox?: string
  zoom?: number
}

export type StormIntensityCategory = 'light' | 'moderate' | 'severe'

export type WeatherStormCell = {
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
    category: StormIntensityCategory
    dbz: number
  }
  updatedAt: string
  stale?: boolean
}

export type WeatherStormCellResponse = {
  time: string
  cells: WeatherStormCell[]
}

export type WeatherStormQuery = {
  time: string
  bbox?: string
}

export type WeatherLegendItem = {
  label: string
  color: string
  value: number
}

export type WeatherVectorPoint = {
  lat: number
  lng: number
  value: number
  directionDeg?: number
}

export type WeatherLayerData = {
  type: WeatherEnvLayerType
  time: string
  renderMode: 'tile' | 'vector'
  tileUrlTemplate?: string | null
  vectorPoints?: WeatherVectorPoint[]
  units: string | null
  legend: WeatherLegendItem[]
  stale?: boolean
}

export type WeatherLayerDataResponse = {
  layer: WeatherLayerData
}

export type WeatherLayerQuery = {
  type: WeatherEnvLayerType
  time: string
  bbox?: string
}
