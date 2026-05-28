import type { FusedPriority, FusedSeverity } from './types'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function severityWeight(severity: FusedSeverity): number {
  if (severity === 'EMERGENCY') return 1
  if (severity === 'CRITICAL') return 0.82
  if (severity === 'WARNING') return 0.58
  return 0.34
}

export function computeProbability(params: {
  baseSimProbability: number
  realSignalStrength: number
  consistencyFactor: number
  uncertaintyPenalty: number
}): number {
  const blended = (params.baseSimProbability * 0.5) + (params.realSignalStrength * 0.35) + (params.consistencyFactor * 0.15)
  return clamp01(blended - params.uncertaintyPenalty)
}

export function computeImpactScore(params: {
  probability: number
  severity: FusedSeverity
  exposure: number
}): number {
  const score = params.probability * severityWeight(params.severity) * clamp01(params.exposure)
  return clamp01(score)
}

export function computePriority(probability: number, impactScore: number): FusedPriority {
  if (probability >= 0.85 && impactScore >= 0.7) return 'critical'
  if (probability >= 0.65) return 'high'
  if (probability >= 0.4) return 'medium'
  return 'low'
}
