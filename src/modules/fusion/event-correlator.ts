import { computeConfidence } from './confidence-engine'
import { computeImpactScore, computePriority, computeProbability } from './probability-scoring'
import { makeEventSkeleton, type ObservedSignal, type SimulatedSignal } from './event-normalizer'
import type { CanonicalFusedEvent, FusedEvidence } from './types'

function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const la1 = toRad(aLat)
  const la2 = toRad(bLat)

  const x = (Math.sin(dLat / 2) ** 2) + (Math.cos(la1) * Math.cos(la2) * (Math.sin(dLon / 2) ** 2))
  return 6371 * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)))
}

function recommendationFor(event: {
  category: string
  priority: string
  probability: number
  confidence: number
}): string[] {
  const items: string[] = [
    `Validate source trace and field telemetry for ${event.category}.`,
    `Probability ${Math.round(event.probability * 100)}% with confidence ${Math.round(event.confidence * 100)}%.`,
  ]

  if (event.priority === 'critical') {
    items.unshift('Escalate to human-in-the-loop confirmation before critical action dispatch.')
  }

  if (event.category === 'weather' || event.category === 'wildfire') {
    items.push('Prepare weather continuity playbook and route failover checks.')
  }

  if (event.category === 'security' || event.category === 'conflict') {
    items.push('Increase monitoring cadence and validate security incident chain-of-custody.')
  }

  return items
}

function mergeEvidence(simulated: FusedEvidence[], realWorld: FusedEvidence[]): FusedEvidence[] {
  return [...simulated, ...realWorld].sort((a, b) => b.observedAt - a.observedAt)
}

export function correlateAndScoreEvents(simulatedSignals: SimulatedSignal[], observedSignals: ObservedSignal[]): CanonicalFusedEvent[] {
  const usedObserved = new Set<string>()
  const fused: CanonicalFusedEvent[] = []

  simulatedSignals.forEach((simulated) => {
    const candidates = observedSignals
      .filter((observed) => observed.category === simulated.category)
      .map((observed) => ({
        observed,
        distanceKm: haversineKm(simulated.lat, simulated.lon, observed.lat, observed.lon),
        timeDeltaMs: Math.abs(simulated.updatedAt - observed.updatedAt),
      }))
      .filter((entry) => entry.distanceKm <= 1200 && entry.timeDeltaMs <= (3 * 60 * 60 * 1000))
      .sort((left, right) => (left.distanceKm + (left.timeDeltaMs / 60000)) - (right.distanceKm + (right.timeDeltaMs / 60000)))

    const best = candidates[0]
    if (best) {
      usedObserved.add(best.observed.eventId)
    }

    const realEvidence = best?.observed.realEvidence ?? []
    const simulatedEvidence = simulated.simulatedEvidence
    const mergedEvidence = mergeEvidence(simulatedEvidence, realEvidence)

    const realSignalStrength = Math.min(1, realEvidence.length === 0 ? 0.2 : 0.35 + (realEvidence.length * 0.2))
    const consistencyFactor = best ? Math.max(0.25, 1 - (best.distanceKm / 1200)) : 0.3
    const uncertaintyPenalty = realEvidence.length === 0 ? 0.18 : Math.max(0.04, 0.18 - (realEvidence.length * 0.03))

    const probability = computeProbability({
      baseSimProbability: simulated.baseProbability,
      realSignalStrength,
      consistencyFactor,
      uncertaintyPenalty,
    })

    const confidence = computeConfidence(mergedEvidence, Math.max(simulated.updatedAt, best?.observed.updatedAt ?? simulated.updatedAt))
    const impactScore = computeImpactScore({
      probability,
      severity: simulated.severity,
      exposure: simulated.category === 'weather' || simulated.category === 'wildfire' ? 0.92 : 0.68,
    })
    const priority = computePriority(probability, impactScore)

    const skeleton = makeEventSkeleton(simulated)
    fused.push({
      ...skeleton,
      probability,
      confidence,
      impactScore,
      priority,
      simulatedEvidence,
      realWorldEvidence: realEvidence,
      recommendation: recommendationFor({ category: simulated.category, priority, probability, confidence }),
    })
  })

  observedSignals
    .filter((observed) => !usedObserved.has(observed.eventId))
    .filter((observed) => !(Math.abs(observed.lat) < 0.01 && Math.abs(observed.lon) < 0.01))
    .forEach((observed) => {
      const skeleton = makeEventSkeleton(observed)
      const probability = 0.42
      const confidence = computeConfidence(observed.realEvidence, observed.updatedAt)
      const impactScore = computeImpactScore({ probability, severity: observed.severity, exposure: 0.6 })
      const priority = computePriority(probability, impactScore)

      fused.push({
        ...skeleton,
        probability,
        confidence,
        impactScore,
        priority,
        simulatedEvidence: [],
        realWorldEvidence: observed.realEvidence,
        recommendation: recommendationFor({ category: observed.category, priority, probability, confidence }),
      })
    })

  return fused
    .filter((event) => event.expiresAt > Date.now())
    .sort((left, right) => {
      const priorityRank = { critical: 4, high: 3, medium: 2, low: 1 }
      const priorityDiff = priorityRank[right.priority] - priorityRank[left.priority]
      if (priorityDiff !== 0) return priorityDiff
      const probabilityDiff = right.probability - left.probability
      if (probabilityDiff !== 0) return probabilityDiff
      return right.updatedAt - left.updatedAt
    })
}
