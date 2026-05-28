import type { FusedEvidence } from './types'

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function computeConfidence(evidence: FusedEvidence[], updatedAt: number, now = Date.now()): number {
  if (evidence.length === 0) return 0.22

  const averageQuality = evidence.reduce((sum, item) => sum + item.quality, 0) / evidence.length
  const sourceDiversity = new Set(evidence.map((item) => item.source)).size
  const diversityFactor = Math.min(1, sourceDiversity / 4)

  const ageMs = Math.max(0, now - updatedAt)
  const freshness = clamp01(1 - (ageMs / (30 * 60 * 1000)))

  return clamp01((averageQuality * 0.52) + (diversityFactor * 0.26) + (freshness * 0.22))
}
