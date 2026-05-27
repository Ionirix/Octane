import { describe, expect, it } from 'vitest'
import {
  buildResolutionPlot,
  captureSituation,
  runSelfHealingCycle,
  type DisturbanceSignal,
} from '../src/modules/self-healing/protocol.js'

describe('self-healing protocol', () => {
  it('classifies routing disturbance and selects flow rebalancing', () => {
    const signal: DisturbanceSignal = {
      source: 'surveillance-map',
      summary: 'Route pressure mismatch detected in edge fanout.',
      routingMismatch: true,
      telemetrySpike: true,
      jitterScore: 0.58,
    }

    const capture = captureSituation(signal, 1716825600000)
    const plot = buildResolutionPlot(capture)

    expect(capture.disturbanceType).toBe('routing')
    expect(plot.modality).toBe('flow_rebalancing')
  })

  it('marks low-noise signals as harmless', () => {
    const signal: DisturbanceSignal = {
      source: 'telemetry-loop',
      summary: 'Minor variance observed.',
      jitterScore: 0.1,
      coherenceDriftScore: 0.1,
      recovering: true,
    }

    const capture = captureSituation(signal)
    expect(capture.harmAssessment).toBe('harmless')
    expect(capture.storyFrame.internalFeeling).toBe('calm')
  })

  it('produces converged peaceful resolve for full cycle', () => {
    const signal: DisturbanceSignal = {
      source: 'memory-fabric',
      summary: 'Coherence drift exceeded threshold and state snapshots diverged.',
      coherenceDriftScore: 0.82,
      telemetrySpike: true,
      operatorFlagged: true,
      jitterScore: 0.73,
      degradedSubsystem: 'MemoryFabric',
    }

    const run = runSelfHealingCycle(signal)

    expect(run.capture.disturbanceType).toBe('coherence_drift')
    expect(run.plot.modality).toBe('memory_reweave')
    expect(run.execution.enteredGentleMode).toBe(true)
    expect(run.resolve.converged).toBe(true)
    expect(run.resolve.peaceLock).toBe(true)
  })
})
