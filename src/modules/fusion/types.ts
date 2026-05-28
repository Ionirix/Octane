export type FusedEventCategory =
  | 'weather'
  | 'seismic'
  | 'wildfire'
  | 'publicHealth'
  | 'infrastructure'
  | 'conflict'
  | 'security'
  | 'automation'
  | 'other'

export type FusedSeverity = 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
export type FusedPriority = 'critical' | 'high' | 'medium' | 'low'
export type FusedStatus = 'emerging' | 'active' | 'stabilized' | 'resolved'
export type FusedTrend = 'rising' | 'stable' | 'falling'

export type FusedEvidence = {
  source: string
  signal: string
  value: string | number
  observedAt: number
  quality: number
}

export type CanonicalFusedEvent = {
  eventId: string
  eventType: string
  category: FusedEventCategory
  severity: FusedSeverity
  priority: FusedPriority
  lat: number
  lon: number
  region: string
  probability: number
  confidence: number
  impactScore: number
  status: FusedStatus
  trend: FusedTrend
  simulatedEvidence: FusedEvidence[]
  realWorldEvidence: FusedEvidence[]
  recommendation: string[]
  startedAt: number
  updatedAt: number
  expiresAt: number
}

export type FusedFilter = {
  region?: string
  category?: FusedEventCategory | 'all'
  severity?: FusedSeverity | 'all'
  minConfidence?: number
}
