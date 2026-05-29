export type VisualizationNodeStatus = 'NOMINAL' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE'

export type VisualizationNode = {
  id: string
  name: string
  country: string
  region: string
  lat: number
  lng: number
  status: VisualizationNodeStatus
  latencyMs: number
  loadPercent?: number
  requestsPerMin?: number
  connections: string[]
}

export type VisualizationAlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'

export type VisualizationAlert = {
  id: string
  type: string
  severity: VisualizationAlertSeverity
  serverId?: string
  title?: string
  description?: string
  timestamp?: number
  probability?: number
  confidence?: number
  impactScore?: number
  priority?: 'critical' | 'high' | 'medium' | 'low'
  trend?: 'rising' | 'stable' | 'falling'
  recommendation?: string[]
  simulatedEvidence?: Array<{ source: string; signal: string; value: string | number; quality?: number }>
  realWorldEvidence?: Array<{ source: string; signal: string; value: string | number; quality?: number }>
  lat?: number
  lng?: number
  location?: {
    lat: number
    lng: number
    radius?: number
  }
  resolved: boolean
}

export type VisualizationSubsystem = {
  id: string
  label: string
  lat: number
  lng: number
  status: VisualizationNodeStatus
  load: number
  updatedAt: number
}

export type VisualizationGeoOverlay = {
  id: string
  label: string
  lat: number
  lng: number
  status: string
  load: number
  radiusKm: number
}

export type VisualizationTrafficSegment = {
  id: string
  polyline: Array<[number, number]>
  centroid: {
    lat: number
    lng: number
  }
  currentSpeedKph: number
  freeFlowSpeedKph: number
  congestionIndex: number
  confidence: number
  roadClass: 'highway' | 'arterial' | 'collector'
  source: string
  updatedAt: string
  stale: boolean
}

export type VisualizationLayerPayload = {
  subsystems?: VisualizationSubsystem[]
  geo?: VisualizationGeoOverlay[]
  showFlows?: boolean
  showTraffic?: boolean
  trafficSegments?: VisualizationTrafficSegment[]
}

export type VisualizationConfig = {
  colors: {
    wireframe: string
    background: string
    grid: string
    nominal: string
    degraded: string
    critical: string
    atmosphere: string
    starfield: string
  }
  rotationSpeed: number
  updateInterval: number
  tileOpacity: number
  globeRadius: number
  minZoom: number
  maxZoom: number
  fogDensity: number
  telemetryBufferSize: number
}