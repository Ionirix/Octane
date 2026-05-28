import { fetchV7AutomationStatus, fetchV7IntelGlobal } from './intel-v7-adapter'
import { correlateAndScoreEvents } from './event-correlator'
import { normalizeRealWorldSignals, normalizeSimulatedSignals } from './event-normalizer'
import { fetchRealWorldSignals } from './realworld-feed-adapters'
import type { CanonicalFusedEvent } from './types'

export async function runFusionCycle(baseUrl = '/api'): Promise<{ events: CanonicalFusedEvent[]; diagnostics: { automationState: string } }> {
  const [bundle, automation, realSignals] = await Promise.all([
    fetchV7IntelGlobal(baseUrl),
    fetchV7AutomationStatus(baseUrl),
    fetchRealWorldSignals(baseUrl),
  ])

  const simulatedSignals = normalizeSimulatedSignals(bundle)
  const observedSignals = normalizeRealWorldSignals(realSignals)
  const events = correlateAndScoreEvents(simulatedSignals, observedSignals)

  return {
    events,
    diagnostics: {
      automationState: automation.state,
    },
  }
}

export type { CanonicalFusedEvent } from './types'
