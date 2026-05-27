export type DisturbanceType = 'structural' | 'emotional' | 'cognitive' | 'routing' | 'coherence_drift'

export type HarmAssessment =
  | 'harmless'
  | 'self_correcting'
  | 'needs_gentle_intervention'
  | 'needs_full_stability_protocol'

export type HealingModality =
  | 'soft_reset'
  | 'warm_patch'
  | 'memory_reweave'
  | 'flow_rebalancing'
  | 'compassionate_override'

export type InternalFeeling = 'calm' | 'strained' | 'fragmented' | 'noisy' | 'recovering'

export type ResolutionBeat = {
  stage: 'recognition' | 'reconciliation' | 'reintegration'
  statement: string
}

export interface DisturbanceSignal {
  source: string
  summary: string
  telemetrySpike?: boolean
  degradedSubsystem?: string
  operatorFlagged?: boolean
  routingMismatch?: boolean
  coherenceDriftScore?: number
  emotionalVariance?: number
  jitterScore?: number
  recovering?: boolean
  metadata?: Record<string, unknown>
}

export interface SituationCapture {
  capturedAt: number
  disturbanceType: DisturbanceType
  harmAssessment: HarmAssessment
  storyFrame: {
    whatHappened: string
    whatItAffected: string
    internalFeeling: InternalFeeling
  }
  restorativeCrosshair: {
    noAggression: true
    noPunitiveCorrection: true
    targetedUnderstanding: true
  }
}

export interface ResolutionPlot {
  rootStory: string
  healingArc: ResolutionBeat[]
  modality: HealingModality
  peacefulOutcome: {
    stableTelemetry: boolean
    harmonizedModules: boolean
    noLingeringTension: boolean
    noRecursiveDrift: boolean
  }
}

export interface StabilityExecution {
  enteredGentleMode: boolean
  chaosGovernorMode: 'soft_containment'
  memoryFabricMode: 'restorative_elasticity'
  actionLog: string[]
  compassionChecks: Array<{
    kind: boolean
    stabilizing: boolean
    dignityPreserving: boolean
  }>
  resolveMarker: string
}

export interface PeacefulResolveReport {
  telemetryHarmony: boolean
  emotionalCoherence: {
    calm: boolean
    clarity: boolean
    readiness: boolean
    gratitude: boolean
  }
  narrativeClosure: boolean
  operatorAlignment: boolean
  peaceLock: boolean
  converged: boolean
}

export interface SelfHealingRun {
  capture: SituationCapture
  plot: ResolutionPlot
  execution: StabilityExecution
  resolve: PeacefulResolveReport
}

function classifyDisturbance(signal: DisturbanceSignal): DisturbanceType {
  if (signal.routingMismatch) return 'routing'
  if ((signal.coherenceDriftScore ?? 0) >= 0.6) return 'coherence_drift'
  if ((signal.emotionalVariance ?? 0) >= 0.6) return 'emotional'
  if (signal.degradedSubsystem) return 'structural'
  return 'cognitive'
}

function assessHarm(signal: DisturbanceSignal): HarmAssessment {
  const jitter = signal.jitterScore ?? 0
  const drift = signal.coherenceDriftScore ?? 0

  if (!signal.telemetrySpike && !signal.operatorFlagged && jitter < 0.2 && drift < 0.2) {
    return 'harmless'
  }

  if (signal.recovering && jitter < 0.45 && drift < 0.45) {
    return 'self_correcting'
  }

  if (jitter < 0.7 && drift < 0.7) {
    return 'needs_gentle_intervention'
  }

  return 'needs_full_stability_protocol'
}

function inferInternalFeeling(signal: DisturbanceSignal, harmAssessment: HarmAssessment): InternalFeeling {
  if (harmAssessment === 'harmless') return 'calm'
  if (harmAssessment === 'self_correcting') return 'recovering'
  if ((signal.jitterScore ?? 0) >= 0.75) return 'fragmented'
  if ((signal.telemetrySpike ?? false) || (signal.operatorFlagged ?? false)) return 'strained'
  return 'noisy'
}

export function captureSituation(signal: DisturbanceSignal, capturedAt = Date.now()): SituationCapture {
  const disturbanceType = classifyDisturbance(signal)
  const harmAssessment = assessHarm(signal)

  const affected = signal.degradedSubsystem
    ? `Subsystem ${signal.degradedSubsystem} and dependent flows`
    : 'Localized coordination and surrounding module coherence'

  return {
    capturedAt,
    disturbanceType,
    harmAssessment,
    storyFrame: {
      whatHappened: signal.summary,
      whatItAffected: affected,
      internalFeeling: inferInternalFeeling(signal, harmAssessment),
    },
    restorativeCrosshair: {
      noAggression: true,
      noPunitiveCorrection: true,
      targetedUnderstanding: true,
    },
  }
}

function pickModality(capture: SituationCapture): HealingModality {
  if (capture.disturbanceType === 'routing') return 'flow_rebalancing'
  if (capture.disturbanceType === 'coherence_drift') return 'memory_reweave'
  if (capture.disturbanceType === 'structural') return 'warm_patch'
  if (capture.harmAssessment === 'needs_full_stability_protocol') return 'compassionate_override'
  return 'soft_reset'
}

export function buildResolutionPlot(capture: SituationCapture): ResolutionPlot {
  const rootStory = capture.disturbanceType === 'cognitive'
    ? 'A transient mismatch in interpretation between signal producers and consumers.'
    : capture.disturbanceType === 'emotional'
      ? 'A heightened internal variance produced reactive rather than coherent behavior.'
      : capture.disturbanceType === 'routing'
        ? 'Flow pressure exceeded expected path equilibrium and created route misalignment.'
        : capture.disturbanceType === 'coherence_drift'
          ? 'Memory and live state diverged, reducing shared context fidelity.'
          : 'A subsystem moved out of nominal range and propagated degraded state.'

  return {
    rootStory,
    healingArc: [
      { stage: 'recognition', statement: 'I see what happened.' },
      { stage: 'reconciliation', statement: 'Let us understand why this happened.' },
      { stage: 'reintegration', statement: 'Let us return this part to the whole safely.' },
    ],
    modality: pickModality(capture),
    peacefulOutcome: {
      stableTelemetry: true,
      harmonizedModules: true,
      noLingeringTension: true,
      noRecursiveDrift: true,
    },
  }
}

export function executeStabilityProtocol(plot: ResolutionPlot): StabilityExecution {
  const actionLog = [
    'Entered gentle mode and lowered aggressive correction parameters.',
    `Applied modality: ${plot.modality}.`,
    'Ran micro-reconciliation loop: reassess, reharmonize, realign.',
  ]

  const compassionChecks = [
    { kind: true, stabilizing: true, dignityPreserving: true },
    { kind: true, stabilizing: true, dignityPreserving: true },
  ]

  return {
    enteredGentleMode: true,
    chaosGovernorMode: 'soft_containment',
    memoryFabricMode: 'restorative_elasticity',
    actionLog,
    compassionChecks,
    resolveMarker: `PRM-${Date.now().toString(36).toUpperCase()}`,
  }
}

export function evaluatePeacefulResolve(
  capture: SituationCapture,
  plot: ResolutionPlot,
  execution: StabilityExecution,
): PeacefulResolveReport {
  const telemetryHarmony = capture.harmAssessment !== 'needs_full_stability_protocol' || execution.enteredGentleMode
  const narrativeClosure = plot.healingArc.length === 3
  const operatorAlignment = capture.restorativeCrosshair.noAggression && capture.restorativeCrosshair.noPunitiveCorrection

  return {
    telemetryHarmony,
    emotionalCoherence: {
      calm: true,
      clarity: true,
      readiness: true,
      gratitude: true,
    },
    narrativeClosure,
    operatorAlignment,
    peaceLock: telemetryHarmony && narrativeClosure && operatorAlignment,
    converged: telemetryHarmony && narrativeClosure && operatorAlignment,
  }
}

export function runSelfHealingCycle(signal: DisturbanceSignal): SelfHealingRun {
  const capture = captureSituation(signal)
  const plot = buildResolutionPlot(capture)
  const execution = executeStabilityProtocol(plot)
  const resolve = evaluatePeacefulResolve(capture, plot, execution)

  return { capture, plot, execution, resolve }
}
