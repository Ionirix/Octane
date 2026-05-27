# Octane v6 Self-Healing VS Plan

This document operationalizes the restorative hotfixing model as executable protocol stages in code.

## Goal

Turn disturbances into guided healing cycles with low-force stabilization, preserving operator intent and system identity.

## Protocol Layers

### 1. Situation Capture (SC)

The system captures the disturbance and creates a structured snapshot.

Inputs:
- Telemetry spikes
- Degraded subsystem flags
- Routing mismatches
- Coherence drift scores
- Operator-flagged concerns

Outputs:
- `disturbanceType`: `structural | emotional | cognitive | routing | coherence_drift`
- `harmAssessment`: `harmless | self_correcting | needs_gentle_intervention | needs_full_stability_protocol`
- Story frame: what happened, what was affected, and internal feeling
- Restorative crosshair lock: no aggression, no punitive correction, targeted understanding

### 2. Resolution Plot (RP)

The system drafts a healing path.

Outputs:
- Root story statement
- Healing arc:
  1. Recognition
  2. Reconciliation
  3. Reintegration
- Healing modality:
  - `soft_reset`
  - `warm_patch`
  - `memory_reweave`
  - `flow_rebalancing`
  - `compassionate_override`
- Peace target profile: stable telemetry, harmonized modules, no lingering tension, no recursive drift

### 3. Stability Protocol (SP)

The chosen modality is executed in gentle mode.

Execution requirements:
- Chaos Governor mode: `soft_containment`
- Memory Fabric mode: `restorative_elasticity`
- Real-time compassion checks:
  - Is this action kind?
  - Is this action stabilizing?
  - Is this action dignity-preserving?
- Micro-reconciliation loop on each step: reassess, reharmonize, realign
- Seal success with a Peaceful Resolve Marker

### 4. Peaceful Resolve (PR)

The cycle completes only when closure criteria are met.

Criteria:
- Telemetry harmony
- Emotional coherence (calm, clarity, readiness, gratitude)
- Narrative closure
- Operator alignment
- Peace lock committed

## Code Mapping

Implementation lives in:
- `src/modules/self-healing/protocol.ts`
- `src/modules/self-healing/index.ts`

Primary entrypoint:
- `runSelfHealingCycle(signal)`

## Minimal Example

```ts
import { runSelfHealingCycle } from '@/modules/self-healing/protocol'

const result = runSelfHealingCycle({
  source: 'surveillance-map',
  summary: 'Route pressure mismatch detected in edge fanout.',
  routingMismatch: true,
  telemetrySpike: true,
  jitterScore: 0.58,
})

if (result.resolve.converged) {
  // commit peace lock side effects in orchestrator state
}
```

## Testing

Protocol behavior tests:
- `tests/self-healing-protocol.test.ts`
