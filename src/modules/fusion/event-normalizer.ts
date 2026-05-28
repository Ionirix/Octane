import type { NormalizedIntelBundle } from '@/modules/surveillance/intel'
import type { RealWorldSignal } from './realworld-feed-adapters'
import type { CanonicalFusedEvent, FusedEventCategory, FusedEvidence, FusedSeverity, FusedStatus, FusedTrend } from './types'

function categoryFromType(value: string): FusedEventCategory {
  const type = value.toLowerCase()
  if (type.includes('weather') || type.includes('storm')) return 'weather'
  if (type.includes('fire') || type.includes('wildfire')) return 'wildfire'
  if (type.includes('seismic') || type.includes('quake')) return 'seismic'
  if (type.includes('health') || type.includes('outbreak')) return 'publicHealth'
  if (type.includes('power') || type.includes('telecom') || type.includes('transport') || type.includes('outage')) return 'infrastructure'
  if (type.includes('conflict')) return 'conflict'
  if (type.includes('security') || type.includes('police')) return 'security'
  if (type.includes('automation') || type.includes('runtime')) return 'automation'
  return 'other'
}

function severityFromStatus(status: string, load: number): FusedSeverity {
  const normalized = status.toLowerCase()
  if (normalized.includes('offline') || normalized.includes('critical') || load >= 0.92) return 'EMERGENCY'
  if (normalized.includes('degraded') || normalized.includes('warn') || load >= 0.78) return 'CRITICAL'
  if (normalized.includes('active') || load >= 0.58) return 'WARNING'
  return 'INFO'
}

export type SimulatedSignal = {
  source: 'v7'
  eventId: string
  eventType: string
  category: FusedEventCategory
  severity: FusedSeverity
  status: FusedStatus
  trend: FusedTrend
  lat: number
  lon: number
  region: string
  startedAt: number
  updatedAt: number
  expiresAt: number
  baseProbability: number
  simulatedEvidence: FusedEvidence[]
}

export type ObservedSignal = {
  source: 'realworld'
  eventId: string
  eventType: string
  category: FusedEventCategory
  severity: FusedSeverity
  status: FusedStatus
  trend: FusedTrend
  lat: number
  lon: number
  region: string
  startedAt: number
  updatedAt: number
  expiresAt: number
  realEvidence: FusedEvidence[]
}

export function normalizeSimulatedSignals(bundle: NormalizedIntelBundle): SimulatedSignal[] {
  return bundle.events.map((event) => {
    const category = categoryFromType(event.label ?? event.id)
    const severity = severityFromStatus(event.status, event.load)
    const status: FusedStatus = event.status === 'offline' ? 'active' : 'emerging'
    const trend: FusedTrend = event.load >= 0.72 ? 'rising' : event.load <= 0.35 ? 'falling' : 'stable'

    return {
      source: 'v7',
      eventId: `sim-${event.id}`,
      eventType: event.label ?? event.type,
      category,
      severity,
      status,
      trend,
      lat: event.lat,
      lon: event.lon,
      region: typeof event.signals.region === 'string' ? event.signals.region : 'global',
      startedAt: event.updatedAt,
      updatedAt: event.updatedAt,
      expiresAt: event.expiresAt,
      baseProbability: Math.max(0.15, Math.min(0.99, (event.load * 0.8) + (severity === 'EMERGENCY' ? 0.15 : severity === 'CRITICAL' ? 0.08 : 0.02))),
      simulatedEvidence: [
        {
          source: 'v7:intel:events',
          signal: 'load',
          value: event.load,
          observedAt: event.updatedAt,
          quality: 0.82,
        },
        {
          source: 'v7:intel:events',
          signal: 'status',
          value: event.status,
          observedAt: event.updatedAt,
          quality: 0.78,
        },
      ],
    }
  })
}

export function normalizeRealWorldSignals(signals: RealWorldSignal[]): ObservedSignal[] {
  return signals.map((signal) => ({
    source: 'realworld',
    eventId: signal.id,
    eventType: signal.type,
    category: signal.category,
    severity: signal.severity,
    status: 'active',
    trend: 'stable',
    lat: signal.lat,
    lon: signal.lon,
    region: signal.region,
    startedAt: signal.observedAt,
    updatedAt: signal.observedAt,
    expiresAt: signal.observedAt + (20 * 60 * 1000),
    realEvidence: signal.evidence,
  }))
}

export function makeEventSkeleton(from: SimulatedSignal | ObservedSignal): Omit<CanonicalFusedEvent, 'priority' | 'probability' | 'confidence' | 'impactScore' | 'recommendation' | 'simulatedEvidence' | 'realWorldEvidence'> {
  return {
    eventId: from.eventId,
    eventType: from.eventType,
    category: from.category,
    severity: from.severity,
    lat: from.lat,
    lon: from.lon,
    region: from.region,
    status: from.status,
    trend: from.trend,
    startedAt: from.startedAt,
    updatedAt: from.updatedAt,
    expiresAt: from.expiresAt,
  }
}
