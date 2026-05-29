export type TrafficRoadClass = 'highway' | 'arterial' | 'collector'

export type TrafficFlowSegment = {
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
  roadClass: TrafficRoadClass
  source: string
  updatedAt: string
  stale: boolean
}

export type TrafficIncident = {
  id: string
  type: string
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
  title: string
  description: string
  lat: number
  lng: number
  roadClass: TrafficRoadClass
  source: string
  updatedAt: string
  stale: boolean
}